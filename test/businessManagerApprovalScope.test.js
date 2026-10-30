const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),{randomUUID}=require('node:crypto');
const {createEmployeeStore}=require('../has/server/employees');
function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());
 const seed=[['requester','Supervisor','LAX','CI'],['local','Business Manager','LAX','CI'],['foreign','Business Manager','LAX','MU'],['station','Business Manager','SFO','CI'],['final','General Manager','LAX','CI']].map(([id,position,station,account],i)=>({id,position,station,account,name:id.toUpperCase(),eid:String(1000+i),phone:'6265550100',companyEmail:id+'@company.test',loginId:id+'@example.test',attach:false,detach:false,spotter:false,additionalAccounts:id==='foreign'?[{station:'LAX',account:'CI'}]:[]}));
 const employees={...createEmployeeStore(db,{seed}),db},profiles={linked:u=>employees.get().employees.find(e=>e.id===u.id)};
 return {db,employees,profiles,users:Object.fromEntries(seed.map(e=>[e.id,{id:e.id,email:e.loginId}]))};
}
test('Uniform draft and active nodes list only current Main Account Business Managers, including named-node validation',t=>{
 const f=fixture(t),store=require('../has/server/uniformRequests').createUniformStore(f),tools=require('../has/server/uniformRoute');
 assert.deepEqual(store.list(f.users.requester).approvalRoute[0].reviewers.map(e=>e.id),['local']);
 const body={requestId:randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i?'':'38',pieces:i?'':1,order:'',reusable:'',nonReusable:''}))},workflow=store.workflow(),route=tools.template(workflow);route[1].employeeId='final';route[1].position='General Manager';
 let r=store.create(f.users.requester,{...body,route,workflowRevision:workflow.revision});
 assert.deepEqual(r.nextApprovers.map(e=>e.id),['local']);assert.deepEqual(r.approvalRoute[0].reviewers.map(e=>e.id),['local']);
 for(const id of ['foreign','station']){assert.equal(store.list(f.users[id]).requests.length,0);assert.throws(()=>store.decide(f.users[id],r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);const forged=tools.nodes(r);forged[0].employeeId=id;assert.throws(()=>store.updateRoute(f.users.requester,r.id,{revision:r.revision,route:forged}),e=>e.status===403);}
 const forged=tools.nodes(r);forged[0].employeeId='foreign';forged[0].position='General Manager';assert.throws(()=>store.updateRoute(f.users.requester,r.id,{revision:r.revision,route:forged}),e=>e.status===403,'Renaming a node does not authorize a foreign Business Manager');
 const draft=f.employees.get();draft.employees.find(e=>e.id==='requester').account='MU';f.employees.save(draft,{email:'lake@mu.com'});
 assert.deepEqual(store.read(f.users.requester,r.id).nextApprovers.map(e=>e.id),['foreign']);assert.throws(()=>store.decide(f.users.local,r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);
 r=store.decide(f.users.foreign,r.id,{revision:r.revision,action:'approve'});assert.equal(r.step,1);
});
for(const [kind,create] of [['incident','createIncidentStore'],['expense','createExpenseStore'],['terrific','createTerrificStore']])test(kind+' Business Manager scope applies to draft names, active review and forged assignments',t=>{
 const f=fixture(t),store=require('../'+kind+'Reports')[create](f);
 assert.deepEqual(store.list(f.users.requester).approvalRoute[0].reviewers.map(e=>e.id),['local']);
 const fields=kind==='incident'?Object.fromEntries(Object.keys(require('../has/server/incidentReports').fields).map(k=>[k,/Date$/.test(k)?'2026-10-26':'Test report'])):kind==='expense'?{nameTitleDepartment:'Supervisor',reportDate:'2026-10-26',period:'October',departmentReason:'LAX / CI',expenseType:'Company Expense',currency:'USD',advance:'0',lines:{other:[{details:'Supplies',amount:'10'}]}}:{reportDate:'2026-10-26',preparedBy:'Supervisor',account:'CI',lines:{general:[{amount:'10',recipient:'Test Recipient',email:'test@example.test',issuedBy:'Supervisor',account:'CI',reason:'Service',message:'Thank you'}]}};
 const r=store.save(f.users.requester,{id:randomUUID(),action:'submit',fields});assert.deepEqual(r.approvalRoute[0].reviewers.map(e=>e.id),['local']);
 for(const id of ['foreign','station']){assert.equal(store.list(f.users[id]).reports.length,0);assert.throws(()=>store.decide(f.users[id],r.id,{revision:r.revision,action:'approve'}),e=>e.status===403);}
 const forged=require('../has/server/uniformRoute').nodes(r);forged[0].employeeId='foreign';assert.throws(()=>store.updateRoute(f.users.requester,r.id,{revision:r.revision,route:forged}),e=>e.status===403);
 assert.equal(store.decide(f.users.local,r.id,{revision:r.revision,action:'approve'}).step,1);
});
