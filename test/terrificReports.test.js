const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Database=require('better-sqlite3');
const {createEmployeeStore}=require('../employees'),{createProfileStore}=require('../employeeProfiles');
const {createTerrificStore,fields,stages}=require('../terrificReports');
function fixture(t){const db=new Database(':memory:');t.after(()=>db.close());const seed=['Agent','Lead','Supervisor',...stages,'Supervisor'].map((position,i)=>({id:'e'+i,name:'TEST '+i,eid:'00'+i,phone:'6265550100',position,email:`personal${i}@example.com`,loginId:`login${i}@example.com`,attach:false,detach:false,spotter:false}));const employees={...createEmployeeStore(db,{seed}),db},profiles=createProfileStore(employees),users=seed.map(e=>({uid:e.id,email:e.loginId,provider:'password'}));users.forEach(u=>profiles.status(u));return {employees,users,store:createTerrificStore({employees,profiles})};}
const body=()=>({id:crypto.randomUUID(),action:'save',fields:{reportDate:'2026-10-22',preparedBy:'Fictional Supervisor',account:'TEST',lines:{general:[{amount:'10',recipient:'Fictional Recipient',email:'test@example.com',reason:'Compliment',issuedBy:'Fictional Supervisor',account:'TEST',message:'Thank you'}]}}});
test('terrific visibility and draft ownership are enforced server-side',t=>{const {store,users}=fixture(t);for(const i of [0,1]){assert.throws(()=>store.list(users[i]),e=>e.status===403);assert.throws(()=>store.save(users[i],body()),e=>e.status===403);}let r=store.save(users[2],body());assert.equal(r.status,'draft');assert.equal(store.list(users[3]).reports.length,0);assert.throws(()=>store.save(users[7],{...body(),id:r.id,revision:r.revision}),e=>e.status===403);assert.throws(()=>store.save(users[2],{...body(),id:r.id,revision:0}),e=>e.status===409);assert.throws(()=>store.save(users[2],{id:r.id,revision:1,action:'submit',fields:{}}),/Complete/);});
test('terrific follows all four approved positions in order and preserves audit and template fields',t=>{const {store,users}=fixture(t);const b=body();let r=store.save(users[2],b);r=store.save(users[2],{...b,revision:r.revision,action:'submit'});assert.deepEqual(r.stages,stages);assert.throws(()=>store.decide(users[4],r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);for(let step=0;step<stages.length;step++){assert.equal(store.list(users[3+step]).reports[0].canReview,true);const revision=r.revision;r=store.decide(users[3+step],r.id,{revision,action:'approve',note:'Reviewed fictional case'});assert.equal(r.approvals.length,step+1);assert.throws(()=>store.decide(users[3+step],r.id,{revision,action:'approve'}),e=>e.status===403);}assert.equal(r.status,'approved');assert.equal(r.fields.totals.total,10);assert.equal(r.history.length,6);assert.throws(()=>store.save(users[2],{...b,revision:r.revision}),e=>e.status===403);});
test('rejection requires remarks and locks the rejected report',t=>{const {store,users}=fixture(t);let r=store.save(users[2],{...body(),action:'submit'});assert.throws(()=>store.decide(users[3],r.id,{revision:r.revision,action:'reject'}),/rejection reason/);r=store.decide(users[3],r.id,{revision:r.revision,action:'reject',note:'Missing supporting facts'});assert.equal(r.status,'rejected');assert.equal(store.list(users[2]).reports[0].approvals[0].note,'Missing supporting facts');assert.equal(store.list(users[4]).reports.length,0);});


test('Terrific validates template limits and Badge Coordinator cannot create',t=>{const {store,users}=fixture(t);assert.equal(store.list(users[6]).canCreate,false);assert.throws(()=>store.save(users[6],body()),e=>e.status===403);const b=body();b.fields.lines.general[0].message='x'.repeat(1501);assert.throws(()=>store.save(users[2],b),/1500/);});

test('requester can withdraw, edit, resubmit and delete; stale and other-user actions are denied',t=>{
 const {store,users}=fixture(t),b=body();let r=store.save(users[2],{...b,action:'submit'});
 assert.equal(r.canWithdraw,true);assert.equal(r.canDelete,true);
 assert.equal(store.list(users[3]).reports[0].canWithdraw,false);
 assert.throws(()=>store.lifecycle(users[3],r.id,{revision:r.revision,action:'withdraw'}),e=>e.status===403);
 assert.throws(()=>store.lifecycle(users[3],r.id,{revision:r.revision,action:'delete'}),e=>e.status===403);
 assert.throws(()=>store.lifecycle(users[2],r.id,{revision:0,action:'delete'}),e=>e.status===409);
 r=store.decide(users[3],r.id,{revision:r.revision,action:'approve'});const oldRevision=r.revision,original=r.fields;
 r=store.lifecycle(users[2],r.id,{revision:r.revision,action:'withdraw'});
 assert.equal(r.status,'draft');assert.deepEqual(r.fields,original);assert.deepEqual(r.approvals,[]);assert.equal(r.step,0);assert.equal(r.submittedAt,undefined);assert.equal(r.history.at(-1).approvals.length,1);
 assert.equal(store.list(users[3]).reports.length,0);assert.throws(()=>store.decide(users[4],r.id,{revision:oldRevision,action:'approve'}),e=>e.status===403);
 r=store.save(users[2],{...b,revision:r.revision,action:'save'});r=store.save(users[2],{...b,revision:r.revision,action:'submit'});assert.equal(r.status,'pending');assert.equal(r.step,0);
 const result=store.lifecycle(users[2],r.id,{revision:r.revision,action:'delete'});assert.equal(result.deleted,true);assert.equal(store.list(users[2]).reports.length,0);assert.throws(()=>store.read(users[2],r.id),e=>e.status===404);assert.throws(()=>store.save(users[2],{...b,revision:r.revision,action:'submit'}),e=>e.status===403);
});


test('return for revision goes to the previous reviewer, preserves audit, permits correction and reapproval',t=>{
 const {store,users}=fixture(t),b=body();let r=store.save(users[2],{...b,action:'submit'});
 assert.throws(()=>store.decide(users[3],r.id,{revision:r.revision,action:'return'}),/reason/);
 const original=r;r=store.decide(users[3],r.id,{revision:r.revision,action:'return',note:'Correct the report'});
 assert.equal(r.status,'draft');assert.equal(store.list(users[2]).reports[0].canEdit,true);assert.equal(r.history.at(-1).action,'Returned for revision');
 assert.throws(()=>store.save(users[2],{...b,revision:original.revision,action:'submit'}),e=>e.status===409);
 r=store.save(users[2],{...b,revision:r.revision,action:'submit'});
 r=store.decide(users[3],r.id,{revision:r.revision,action:'approve',note:'Initial check'});
 const approved=r;r=store.decide(users[4],r.id,{revision:r.revision,action:'return',note:'Previous reviewer must correct this'});
 assert.equal(r.step,0);assert.equal(r.status,'pending');assert.equal(r.returnedTo,users[3].uid);assert.equal(r.approvals.length,0);assert.equal(r.history.at(-1).approvals[0].note,'Initial check');
 const returned=store.list(users[3]).reports.find(x=>x.id===r.id);assert.equal(returned.canReview,true);assert.equal(returned.canEdit,true);
 assert.throws(()=>store.decide(users[4],r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);
 assert.throws(()=>store.save(users[2],{...b,revision:r.revision}),e=>e.status===403);
 r=store.save(users[3],{...b,revision:r.revision,action:'save'});assert.equal(r.employee.id,users[2].uid);assert.equal(r.step,0);assert.equal(r.status,'pending');
 assert.throws(()=>store.decide(users[3],r.id,{revision:approved.revision,action:'approve'}),e=>e.status===409);
 r=store.decide(users[3],r.id,{revision:r.revision,action:'approve',note:'Corrected'});assert.equal(r.step,1);assert.equal(store.list(users[4]).reports.find(x=>x.id===r.id).canReview,true);
});


test('transfer assigns the next node to a named person, records the operator and rejects invalid targets',t=>{
 const {store,users}=fixture(t);let r=store.save(users[2],{...body(),action:'submit'}),count=r.stages.length;
 for(const employeeId of ['missing',users[2].uid,users[3].uid])assert.throws(()=>store.decide(users[3],r.id,{revision:r.revision,action:'transfer',employeeId}),e=>e.status===400);
 const stale=r.revision;r=store.decide(users[3],r.id,{revision:r.revision,action:'transfer',employeeId:users[4].uid,note:'Please take this review'});
 assert.equal(r.status,'pending');assert.equal(r.step,1);assert.equal(r.stages.length,count);assert.equal(r.assignees[1],users[4].uid);assert.equal(r.approvals[0].action,'transfer');assert.equal(r.approvals[0].targetId,users[4].uid);
 assert.equal(store.list(users[4]).reports.find(x=>x.id===r.id).canReview,true);assert.equal(store.list(users[3]).reports.find(x=>x.id===r.id).canReview,false);
 assert.throws(()=>store.decide(users[4],r.id,{revision:stale,action:'approve'}),e=>e.status===409);
 r=store.decide(users[4],r.id,{revision:r.revision,action:'approve'});assert.equal(r.step,2);assert.equal(r.approvals[1].action,'approve');
});
