const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Database=require('better-sqlite3');
const {createEmployeeStore}=require('../has/server/employees'),tools=require('../has/server/uniformRoute');
function setup(t){const db=new Database(':memory:');t.after(()=>db.close());const seed=['Supervisor','Business Manager','General Manager','Regional Manager','President','Accounting','Badge Coordinator'].map((position,i)=>({id:'route-'+i,position,name:'FICTIONAL '+i,eid:'100'+i,phone:'6265550100',companyEmail:'fiction'+i+'@company.test',loginId:'fiction'+i+'@login.test',attach:false,detach:false,spotter:false})),employees={...createEmployeeStore(db,{seed}),db},profiles={linked:u=>employees.get().employees.find(e=>e.id===u.id)};return {db,employees,profiles,users:seed};}
const uniformBody=()=>({requestId:crypto.randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i?'':'38',pieces:i?'':1,order:'',reusable:'',nonReusable:''}))});
test('uniform requires a named next approver after Business Manager, retains legacy pending records and permits changed future positions',t=>{
 const f=setup(t),store=require('../has/server/uniformRequests').createUniformStore(f),flow=store.workflow(),route=tools.template(flow);
 assert.equal(flow.stages[0],'Business Manager');assert.equal(route[1].selectionRequired,true);assert.throws(()=>store.create(f.users[0],uniformBody()),/Select the next/);
 route[1].employeeId=f.users[3].id;route[1].position='Regional Manager';let r=store.create(f.users[0],{...uniformBody(),route,workflowRevision:flow.revision});assert.deepEqual(r.nextApprovers.map(e=>e.id),[f.users[1].id]);
 r=store.decide(f.users[1],r.id,{revision:r.revision,action:'approve'});assert.deepEqual(r.nextApprovers.map(e=>e.id),[f.users[3].id]);assert.throws(()=>store.decide(f.users[2],r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);
 const next=tools.nodes(r);next[1].employeeId=f.users[4].id;next[1].position='President';r=store.updateRoute(f.users[0],r.id,{revision:r.revision,route:next});assert.equal(r.approvals.length,1);assert.equal(r.routeHistory.length,1);
 const bad=tools.nodes(r);bad[0].position='General Manager';assert.throws(()=>store.updateRoute(f.users[0],r.id,{revision:r.revision,route:bad}),/Completed/);
 r=store.decide(f.users[4],r.id,{revision:r.revision,action:'approve'});assert.equal(r.status,'approved');assert.equal(r.manager.id,f.users[4].id);
 const legacy={...r,id:crypto.randomUUID(),status:'pending',step:0,approvals:[],stages:['Supervisor','Manager'],revision:1};delete legacy.nodeIds;delete legacy.assignees;delete legacy.selectionNodeIds;delete legacy.requiredNodeIds;f.db.prepare('INSERT INTO uniform_requests(id,data) VALUES(?,?)').run(legacy.id,JSON.stringify(legacy));assert(store.canReview(store.get(legacy.id),f.users[0]));
});
for(const [kind,create] of [['incident','createIncidentStore'],['expense','createExpenseStore'],['terrific','createTerrificStore']])test(kind+' nodes persist on drafts and submission; future edits lock approvals and enforce ownership',t=>{
 const f=setup(t),store=require('../'+kind+'Reports')[create](f),id=crypto.randomUUID();let route=store.list(f.users[0]).approvalRoute.map(({id,position})=>({id,position}));route[0].position='Regional Manager';route[0].employeeId=f.users[3].id;
 let r=store.save(f.users[0],{id,action:'save',fields:{},route});assert.equal(r.assignees[0],f.users[3].id);assert.equal(r.stages[0],'Regional Manager');
 const fields=kind==='incident'?Object.fromEntries(Object.keys(require('../has/server/incidentReports').fields).map(k=>[k,/Date$/.test(k)?'2026-10-22':'Fictional case'])):kind==='expense'?{nameTitleDepartment:'Fictional Supervisor',reportDate:'2026-10-22',period:'October 2026',departmentReason:'Fictional expense',expenseType:'Company Expense',currency:'USD',advance:'10',lines:{other:[{details:'Fictional supplies',amount:'25.50',companyCard:'5.50'}]}}:{reportDate:'2026-10-22',preparedBy:'Fictional Supervisor',account:'TEST',lines:{general:[{amount:'10',recipient:'Fictional Recipient',email:'test@example.test',reason:'Compliment',issuedBy:'Fictional Supervisor',account:'TEST',message:'Thank you'}]}};
 r=store.save(f.users[0],{id,revision:r.revision,action:'submit',fields});assert.equal(r.assignees[0],f.users[3].id);
 assert.equal(store.list(f.users[3]).reports[0].canReview,true);assert.throws(()=>store.decide(f.users[1],id,{revision:r.revision,action:'approve'}),e=>e.status===403);
 r=store.decide(f.users[3],id,{revision:r.revision,action:'approve'});route=tools.nodes(r);route[1].position='President';route[1].employeeId=f.users[4].id;route.splice(2,0,{id:crypto.randomUUID(),position:'General Manager',employeeId:f.users[2].id});
 assert.throws(()=>store.updateRoute(f.users[1],id,{revision:r.revision,route}),e=>e.status===403);assert.throws(()=>store.updateRoute(f.users[0],id,{revision:0,route}),e=>e.status===409);
 r=store.updateRoute(f.users[0],id,{revision:r.revision,route});assert.equal(r.approvals.length,1);assert.equal(r.routeHistory.length,1);assert.equal(r.stages.length,route.length);assert.equal(store.list(f.users[4]).reports[0].canReview,true);
 route[0].employeeId=f.users[1].id;assert.throws(()=>store.updateRoute(f.users[0],id,{revision:r.revision,route}),/Completed/);
 const future=tools.nodes(r);future[1].employeeId='missing';assert.throws(()=>store.updateRoute(f.users[0],id,{revision:r.revision,route:future}),/existing/);
});


test('uniform transfer inserts a named next reviewer and a returned reviewer can correct and reapprove',t=>{
 const f=setup(t),store=require('../has/server/uniformRequests').createUniformStore(f),flow=store.workflow(),route=tools.template(flow),b=uniformBody();route[1].employeeId=f.users[3].id;route[1].position=f.users[3].position;
 let r=store.create(f.users[0],{...b,route,workflowRevision:flow.revision});
 r=store.decide(f.users[1],r.id,{revision:r.revision,action:'transfer',employeeId:f.users[2].id,note:'Please review'});assert.equal(r.step,1);assert.equal(r.assignees[1],f.users[2].id);assert.equal(r.stages.length,3);assert.equal(r.approvals[0].action,'transfer');
 assert.throws(()=>store.decide(f.users[2],r.id,{revision:r.revision,action:'return'}),/reason/);
 r=store.decide(f.users[2],r.id,{revision:r.revision,action:'return',note:'Please correct the quantities'});assert.equal(r.step,0);assert.equal(store.read(f.users[1],r.id).canEdit,true);
 r=store.create(f.users[1],{...b,revision:r.revision,reason:'size'});assert.equal(r.reason,'size');assert.equal(r.employee.id,f.users[0].id);assert.equal(r.status,'pending');assert.equal(r.step,0);
 r=store.decide(f.users[1],r.id,{revision:r.revision,action:'approve'});assert.equal(r.step,1);assert.equal(store.read(f.users[2],r.id).canReview,true);
});
