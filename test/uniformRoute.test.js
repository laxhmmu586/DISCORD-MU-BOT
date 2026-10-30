const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Database=require('better-sqlite3'),express=require('express');
const {createEmployeeStore}=require('../has/server/employees'),{createUniformStore,registerUniform}=require('../has/server/uniformRequests');
const routeTools=require('../has/server/uniformRoute');
function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());
 const seed=['Agent','Supervisor','Supervisor','Manager','Regional Manager','General Manager','President'].map((position,i)=>({id:'e'+i,name:'EXAMPLE '+i,position,eid:'100'+i,phone:'626-555-0100',email:'person'+i+'@example.test',companyEmail:'person'+i+'@company.test',loginId:'person'+i+'@login.test',attach:false,detach:false,spotter:false}));
 const employees={...createEmployeeStore(db,{seed}),db},profiles={linked:u=>employees.get().employees.find(e=>e.id===u.uid)},users=seed.map(e=>({uid:e.id,email:e.loginId}));
 const options={employees,profiles,now:()=>new Date('2026-10-22T03:00:00Z')};return {...options,users,db,store:createUniformStore(options)};
}
const body=()=>({workflowRevision:3,route:[{id:'template-3-0',position:'Supervisor'},{id:'template-3-1',position:'Manager',employeeId:'e3'}],requestId:crypto.randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i?'':'38',pieces:i?'':1,order:'',reusable:'',nonReusable:''}))});
const add=(position,employeeId)=>({id:crypto.randomUUID(),position,employeeId});
test('Manager is intermediate when higher stages follow, and templates support more than five stages',t=>{
 const {store,users}=fixture(t);store.saveWorkflow({email:'lake@mu.com'},{revision:store.workflow().revision,stages:['Supervisor','Manager','Regional Manager','General Manager','President','Supervisor']});
 const flow=store.workflow(),chosen=routeTools.template(flow);chosen[1].employeeId='e3';let r=store.create(users[0],{...body(),route:chosen,workflowRevision:flow.revision});for(const i of [1,3,4,5,6]){r=store.decide(users[i],r.id,{revision:r.revision,action:'approve'});assert.equal(r.status,'pending');}
 r=store.decide(users[2],r.id,{revision:r.revision,action:'approve'});assert.equal(r.status,'approved');assert.equal(r.manager.id,'e2');
});
test('requester selects named people before submission and only the assigned person may review',t=>{
 const {store,users}=fixture(t),data=store.list(users[0]),route=routeTools.template(data.workflow);route[0].employeeId='e2';route[0].position='Supervisor';route[1].employeeId='e3';route.push(add('Regional Manager','e4'));
 let r=store.create(users[0],{...body(),route,workflowRevision:data.workflow.revision});
 assert.deepEqual(r.nextApprovers.map(e=>e.id),['e2']);assert.throws(()=>store.decide(users[1],r.id,{revision:1,action:'approve'}),e=>e.status===403);
 r=store.decide(users[2],r.id,{revision:1,action:'approve'});r=store.decide(users[3],r.id,{revision:2,action:'approve'});assert.equal(r.status,'pending');r=store.decide(users[4],r.id,{revision:3,action:'approve'});assert.equal(r.status,'approved');
});
test('pending node edits preserve completed/default nodes, enforce ownership/revisions and record an audit trail',t=>{
 const {store,users}=fixture(t);let r=store.create(users[0],body());r=store.decide(users[1],r.id,{revision:1,action:'approve'});const original=routeTools.nodes(r);
 const bad=structuredClone(original);bad[0].employeeId='e2';assert.throws(()=>store.updateRoute(users[0],r.id,{revision:2,route:bad}),/Completed/);
 assert.throws(()=>store.updateRoute(users[0],r.id,{revision:2,route:original.slice(0,1)}),/default/);
 const edited=structuredClone(original);edited[1].employeeId='e2';edited[1].position='Supervisor';edited.push(add('Regional Manager','e4'));
 assert.throws(()=>store.updateRoute(users[3],r.id,{revision:2,route:edited}),e=>e.status===403);
 assert.throws(()=>store.updateRoute(users[0],r.id,{revision:1,route:edited}),e=>e.status===409);
 r=store.updateRoute(users[0],r.id,{revision:2,route:edited});assert.deepEqual(r.approvals.map(a=>a.employeeId),['e1']);assert.equal(r.routeHistory.length,1);assert.equal(r.routeHistory[0].name,'EXAMPLE 0');assert.equal(r.routeHistory[0].after[1].name,'EXAMPLE 2');assert.deepEqual(r.nextApprovers.map(e=>e.id),['e2']);assert.equal(store.list(users[3]).requests.length,0);
 r=store.decide(users[2],r.id,{revision:3,action:'approve'});r=store.decide(users[4],r.id,{revision:4,action:'approve'});assert.equal(r.status,'approved');assert.throws(()=>store.updateRoute(users[0],r.id,{revision:5,route:edited}),e=>e.status===409);
});
test('custom routes reject forged/deleted/duplicate people, removed defaults and stale templates',t=>{
 const {store,users}=fixture(t),route=routeTools.template(store.workflow());route[0].employeeId='missing';assert.throws(()=>store.create(users[0],{...body(),workflowRevision:store.workflow().revision,route}),/existing/);
 route[0].employeeId='e1';route[0].position='Supervisor';route[1].employeeId='e1';assert.throws(()=>store.create(users[0],{...body(),workflowRevision:store.workflow().revision,route}),/distinct/);
 route[1].employeeId='e3';assert.throws(()=>store.create(users[0],{...body(),workflowRevision:0,route}),e=>e.status===409);
 assert.throws(()=>store.create(users[0],{...body(),workflowRevision:store.workflow().revision,route:[route[0]]}),/default/);
});
test('route reassignment sends a fresh notification and revokes the old current approver',async t=>{
 const f=fixture(t),sent=[],app=express(),service=registerUniform(app,{...f,authenticate:async()=>f.users[0],notify:async(r,e)=>sent.push(e.id),send:async()=>{}});t.after(service.close);
 const route=routeTools.template(service.store.workflow());route[0].employeeId='e1';route[0].position='Supervisor';route[1].employeeId='e3';const r=service.store.create(f.users[0],{...body(),workflowRevision:service.store.workflow().revision,route});await service.notifyPending(r.id);await service.notifyPending(r.id);assert.deepEqual(sent,['e1']);
 const changed=routeTools.nodes(r);changed[0].employeeId='e2';service.store.updateRoute(f.users[0],r.id,{revision:1,route:changed});await service.notifyPending(r.id);assert.deepEqual(sent,['e1','e2']);assert.equal(service.store.canReview(service.store.get(r.id),f.employees.get().employees[1]),false);
});

test('withdrawal stops approval reminders and resubmission notifies the same approver again',async t=>{
 const f=fixture(t),sent=[],service=registerUniform(express(),{...f,authenticate:async()=>f.users[0],notify:async(r,e)=>sent.push(e.id),send:async()=>{}});t.after(service.close);
 const route=routeTools.template(service.store.workflow());route[0].employeeId='e1';route[0].position='Supervisor';route[1].employeeId='e3';const b={...body(),workflowRevision:service.store.workflow().revision,route};let r=service.store.create(f.users[0],b);await service.notifyPending(r.id);assert.deepEqual(sent,['e1']);
 r=service.store.lifecycle(f.users[0],r.id,{revision:r.revision,action:'withdraw'});await service.notifyPending(r.id);assert.deepEqual(sent,['e1']);
 r=service.store.create(f.users[0],{...b,revision:r.revision});await service.notifyPending(r.id);await service.notifyPending(r.id);assert.deepEqual(sent,['e1','e1']);
 service.store.lifecycle(f.users[0],r.id,{revision:r.revision,action:'delete'});await service.retry();assert.deepEqual(sent,['e1','e1']);
});
