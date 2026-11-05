const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),{randomUUID}=require('node:crypto');
const {createNewAccessStore,registerNewAccess}=require('../has/server/newAccessRequests');
function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());
 const rows=[['bm','Business Manager','LAX','CI','bm@example.test'],['other','Business Manager','LAX','MU','other@example.test'],['sup','Supervisor','LAX','CI','sup@example.test'],['owner','President','HQ','HQ','lake@mu.com'],['admin','Agent','LAX','CI','tamsun10@gmail.com']].map(([id,position,station,account,loginId])=>({id,name:id.toUpperCase(),eid:'1001',position,station,account,loginId,additionalAccounts:[{station:'SFO',account:'MU'}]}));
 const employees={db,get:()=>({employees:rows})},profiles={linked:u=>rows.find(e=>e.id===u.uid)},users=Object.fromEntries(rows.map(e=>[e.id,{uid:e.id,email:e.loginId}]));
 const args={employees,profiles,now:()=>new Date('2026-10-26T12:00:00Z')},store=createNewAccessStore(args);
 const draft=()=>({requestId:randomUUID(),fields:{name:'NEW EMPLOYEE',eid:'001234',station:'LAX',account:'CI',email:'new@example.test'}});
 return {...args,rows,users,store,draft};
}
test('only a station Main Account Business Manager can submit, with the server binding station/account',t=>{
 const f=fixture(t);for(const id of ['sup','owner','admin']){assert.equal(f.store.list(f.users[id]).canCreate,false);assert.throws(()=>f.store.create(f.users[id],f.draft()),e=>e.status===403);}
 for(const scope of [{station:'SFO',account:'MU'},{station:'LAX',account:'MU'},{station:'HQ',account:'HQ'}])assert.throws(()=>f.store.create(f.users.bm,{...f.draft(),fields:{...f.draft().fields,...scope}}),e=>e.status===403);
 const draft=f.draft(),r=f.store.create(f.users.bm,draft);assert.equal(r.title,'LAX/CI Request New Access');assert.equal(r.employee.id,'bm');assert.equal(r.fields.eid,'001234');assert.equal(r.fields.email,'new@example.test');assert.equal(f.store.create(f.users.bm,draft).id,r.id);assert.equal(f.store.list(f.users.bm).requests.length,1);
 assert.throws(()=>f.store.create(f.users.bm,{...draft,fields:{...draft.fields,name:'CHANGED'}}),e=>e.status===409);
 assert.equal(f.employees.get().employees.length,5,'Submitting a request never creates an employee or login');
 f.rows[0].position='Agent';assert.equal(f.store.list(f.users.bm).canCreate,false);assert.throws(()=>f.store.create(f.users.bm,f.draft()),e=>e.status===403);
});
test('Lake approval returns to the original requester and completion is a separate durable step',t=>{
 const f=fixture(t),r=f.store.create(f.users.bm,f.draft());
 assert.equal(r.status,'pending');assert.equal(r.canComplete,false);assert.equal(f.store.list(f.users.owner).requests[0].canReview,true);
 assert.equal(f.store.list(f.users.other).requests.length,0);assert.equal(f.store.list(f.users.sup).requests.length,0);
 for(const id of ['other','sup','admin']){if(id==='admin')assert.equal(f.store.read(f.users[id],r.id).canReview,false);else assert.throws(()=>f.store.read(f.users[id],r.id),e=>e.status===404);assert.throws(()=>f.store.decide(f.users[id],r.id,{revision:1,action:'approve'}),e=>e.status===403);}
 assert.throws(()=>f.store.complete(f.users.bm,r.id,{revision:1}),e=>e.status===409);
 assert.throws(()=>f.store.decide(f.users.owner,r.id,{revision:0,action:'approve'}),e=>e.status===409);
 const approved=f.store.decide({...f.users.owner,email:'linked-google@example.test'},r.id,{revision:1,action:'approve',note:'Access ready'});
 assert.equal(approved.status,'approved');assert.equal(approved.completedAt,undefined);assert.equal(approved.canComplete,false);
 assert.throws(()=>f.store.complete(f.users.owner,r.id,{revision:2}),e=>e.status===403);
 assert.throws(()=>f.store.complete(f.users.other,r.id,{revision:2}),e=>e.status===403);
 const reopened=createNewAccessStore(f),mine=reopened.read(f.users.bm,r.id);assert.equal(mine.canComplete,true);assert.equal(mine.approvals[0].note,'Access ready');
 assert.throws(()=>reopened.complete(f.users.bm,r.id,{revision:1}),e=>e.status===409);
 f.rows[0].position='Agent';const done=reopened.complete(f.users.bm,r.id,{revision:2});assert.equal(done.status,'completed');assert.equal(done.canComplete,false);assert(done.completedAt);assert.deepEqual(done.history.map(h=>h.action),['submit','approve','complete']);
 assert.throws(()=>reopened.complete(f.users.bm,r.id,{revision:3}),e=>e.status===409);
});
test('invalid request fields and rejection paths do not prematurely complete a request',t=>{
 const f=fixture(t);for(const fields of [{name:''},{eid:'not-an-id'},{email:'bad username'},{email:'line\nbreak@example.test'}])assert.throws(()=>f.store.create(f.users.bm,{...f.draft(),fields:{...f.draft().fields,...fields}}));
 assert.equal(f.store.list(f.users.bm).requests.length,0);
 const r=f.store.create(f.users.bm,f.draft());assert.throws(()=>f.store.decide(f.users.owner,r.id,{revision:1,action:'reject'}));
 const rejected=f.store.decide({...f.users.owner,email:'nextweek1216@gmail.com'},r.id,{revision:1,action:'reject',note:'Check the EID'});assert.equal(rejected.status,'rejected');assert.equal(f.store.read(f.users.bm,r.id).canComplete,false);assert.throws(()=>f.store.complete(f.users.bm,r.id,{revision:2}),e=>e.status===409);
});
test('authenticated HTTP endpoints enforce cross-account and action permissions',async t=>{
 const f=fixture(t),app=express();const service=registerNewAccess(app,{...f,authenticate:async req=>{const u=f.users[req.headers.authorization?.replace('Bearer ','')];if(!u)throw Error('Sign in required');return u;}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.close();server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port+'/new-access-api',call=(id,path='',body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('unknown')).status,401);assert.equal((await call('sup','',f.draft())).status,403);
 const submitted=await call('bm','',f.draft());assert.equal(submitted.status,200);assert.equal(submitted.headers.get('cache-control'),'private, no-store');const r=await submitted.json();
 assert.equal((await call('other','/'+r.id)).status,404);assert.equal((await call('bm','/'+r.id+'/decision',{revision:1,action:'approve'})).status,403);
 assert.equal((await call('owner','/'+r.id+'/decision',{revision:1,action:'approve'})).status,200);
 assert.equal((await call('bm','/'+r.id+'/complete',{revision:2})).status,200);assert.equal(service.store.get(r.id).status,'completed');
});


test('new access accepts a preferred username without EID and retains email submissions',t=>{
 const f=fixture(t),draft=f.draft();delete draft.fields.eid;draft.fields.email='new.employee';const r=f.store.create(f.users.bm,draft);assert.equal(r.fields.email,'new.employee');assert.equal(r.fields.eid,undefined);assert.equal(f.store.create(f.users.bm,draft).id,r.id);
 for(const email of ['bad@','two names','<script>','bad@example'])assert.throws(()=>f.store.create(f.users.bm,{...f.draft(),fields:{...draft.fields,email}}));
});

test('requested Position is retained after approval without changing actual employee titles',t=>{const f=fixture(t),draft=f.draft();draft.fields.position='Supervisor';const request=f.store.create(f.users.bm,draft);assert.equal(request.fields.position,'Supervisor');assert.equal(f.store.decide(f.users.owner,request.id,{revision:1,action:'approve'}).fields.position,'Supervisor');for(const position of ['President','Business Manager','Invalid'])assert.throws(()=>f.store.create(f.users.bm,{...f.draft(),fields:{...f.draft().fields,position}}),error=>error.status===403);assert.equal(f.rows[0].position,'Business Manager');});

test('request views use current nickname and avatar without exposing login or contact fields',t=>{
 const f=fixture(t);f.db=f.employees.db;f.db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL)');f.rows[0].nickname='Lake';
 f.db.prepare('INSERT INTO employee_avatars VALUES(?,?)').run('bm','data:image/png;base64,AA==');
 const r=f.store.create(f.users.bm,f.draft());assert.equal(r.employee.name,'BM');assert.equal(r.employee.nickname,'Lake');assert.equal(r.employee.avatar,'data:image/png;base64,AA==');
 assert.equal(r.history[0].nickname,'Lake');assert.equal(r.history[0].avatar,r.employee.avatar);assert.equal(r.employee.loginId,undefined);assert.equal(r.employee.phone,undefined);
});

test('reviewer can recall an unfinished review and edit the retained note; other people and stale callers cannot',t=>{
 const f=fixture(t),r=f.store.create(f.users.bm,f.draft());let review=f.store.decide(f.users.owner,r.id,{revision:1,action:'approve',note:'Written remark'});
 assert.equal(review.canRecall,true);assert.equal(review.history.at(-1).note,'Written remark');assert.equal(f.store.read(f.users.admin,r.id).canRecall,false);
 for(const user of [f.users.bm,f.users.admin])assert.throws(()=>f.store.recall(user,r.id,{revision:2}),e=>e.status===403);
 assert.throws(()=>f.store.recall(f.users.owner,r.id,{revision:1}),e=>e.status===409);
 review=f.store.recall(f.users.owner,r.id,{revision:2});assert.equal(review.status,'pending');assert.equal(review.canReview,true);assert.equal(review.reviewDraft.note,'Written remark');assert.equal(review.approvals.length,0);assert.equal(review.approvedAt,undefined);assert.equal(review.history.at(-1).previousReview.note,'Written remark');
 assert.equal(f.store.read(f.users.bm,r.id).reviewDraft,undefined);
 review=f.store.decide(f.users.owner,r.id,{revision:3,action:'approve',note:'Edited remark'});assert.equal(review.approvals[0].note,'Edited remark');assert.equal(review.reviewDraft,undefined);
 f.store.complete(f.users.bm,r.id,{revision:4});assert.equal(f.store.read(f.users.owner,r.id).canRecall,false);assert.throws(()=>f.store.recall(f.users.owner,r.id,{revision:5}),e=>e.status===409);
});
test('requester and System Admin can delete, but others and stale submissions cannot access or resurrect deleted requests',t=>{
 for(const who of ['bm','owner','admin']){const f=fixture(t),draft=f.draft(),r=f.store.create(f.users.bm,draft);
 assert.equal(f.store.read(f.users[who],r.id).canDelete,true);assert.throws(()=>f.store.lifecycle(f.users.sup,r.id,{revision:1,action:'delete'}),e=>e.status===403);
 assert.throws(()=>f.store.lifecycle(f.users[who],r.id,{revision:0,action:'delete'}),e=>e.status===409);
 assert.deepEqual(f.store.lifecycle(f.users[who],r.id,{revision:1,action:'delete'}),{id:r.id,deleted:true});
 assert.equal(f.store.list(f.users.owner).requests.length,0);assert.throws(()=>f.store.read(f.users.bm,r.id),e=>e.status===404);assert.throws(()=>f.store.create(f.users.bm,draft),e=>e.status===409);assert.equal(f.store.get(r.id).history.at(-1).action,'delete');}
});
test('approved requests auto-complete exactly seven days after approval once, with a System audit',t=>{
 const f=fixture(t);let instant=Date.parse('2026-11-01T12:00:00Z');const store=createNewAccessStore({...f,now:()=>new Date(instant)}),r=store.create(f.users.bm,f.draft());
 store.decide(f.users.owner,r.id,{revision:1,action:'approve',note:'Original'});
 instant+=7*86400000-1;assert.equal(store.autoComplete(),0);assert.equal(store.read(f.users.bm,r.id).status,'approved');
 instant++;assert.equal(store.autoComplete(),1);const done=store.read(f.users.bm,r.id);assert.equal(done.status,'completed');assert.equal(done.autoCompleted,true);assert.equal(done.canComplete,false);assert.equal(done.revision,3);assert.equal(done.history.at(-1).employeeId,'system');assert.equal(done.history.at(-1).name,'System');assert.equal(done.history.at(-1).action,'complete');assert.equal(store.autoComplete(),0);
 assert.throws(()=>store.complete(f.users.bm,r.id,{revision:2}),e=>e.status===409);
});
test('recall resets the completion deadline and restarted stores recover overdue requests',t=>{
 const f=fixture(t);let instant=Date.parse('2026-11-01T12:00:00Z');const now=()=>new Date(instant),store=createNewAccessStore({...f,now}),r=store.create(f.users.bm,f.draft());store.decide(f.users.owner,r.id,{revision:1,action:'approve'});
 instant+=6*86400000;store.recall(f.users.owner,r.id,{revision:2});assert.equal(store.read(f.users.bm,r.id).autoCompleteAt,null);store.decide(f.users.owner,r.id,{revision:3,action:'approve',note:'Reapproved'});
 instant+=86400000;assert.equal(store.autoComplete(),0);instant+=6*86400000;
 const restarted=createNewAccessStore({...f,now});assert.equal(restarted.list(f.users.bm).requests[0].status,'completed');assert.equal(restarted.autoComplete(),0);
 const pending=restarted.create(f.users.bm,f.draft());const rejected=restarted.create(f.users.bm,f.draft());restarted.decide(f.users.owner,rejected.id,{revision:1,action:'reject',note:'No'});instant+=20*86400000;assert.equal(restarted.autoComplete(),0);assert.equal(restarted.get(pending.id).status,'pending');assert.equal(restarted.get(rejected.id).status,'rejected');
});

test('return for revision restores the requester form, requires remarks and resubmits the same request safely',t=>{
 const f=fixture(t),draft=f.draft(),r=f.store.create(f.users.bm,draft);
 assert.throws(()=>f.store.decide(f.users.owner,r.id,{revision:1,action:'return',note:''}));
 const returned=f.store.decide(f.users.owner,r.id,{revision:1,action:'return',note:'Correct the requested title'});assert.equal(returned.status,'draft');assert.equal(returned.history.at(-1).note,'Correct the requested title');assert.equal(f.store.read(f.users.bm,r.id).canEdit,true);
 assert.throws(()=>f.store.create(f.users.bm,{...draft,revision:1}),e=>e.status===409);
 const resubmitted=f.store.create(f.users.bm,{...draft,revision:2,fields:{...draft.fields,name:'Corrected employee'}});assert.equal(resubmitted.id,r.id);assert.equal(resubmitted.status,'pending');assert.equal(resubmitted.fields.name,'Corrected employee');assert.equal(resubmitted.history.filter(event=>event.action==='submit').length,2);assert.equal(f.store.read(f.users.bm,r.id).canEdit,false);
});
test('new access HTTP supports recall and deletion with authenticated revision checks',async t=>{
 const f=fixture(t),app=express(),service=registerNewAccess(app,{...f,authenticate:async req=>{const user=f.users[req.headers.authorization];if(!user)throw Error('Sign in required');return user;}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.close();server.closeAllConnections();server.close();});
 const call=(user,path,body)=>fetch('http://127.0.0.1:'+server.address().port+'/new-access-api'+path,{method:'POST',headers:{authorization:user,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const r=service.store.create(f.users.bm,f.draft());await call('owner','/'+r.id+'/decision',{revision:1,action:'approve',note:'User text'});
 assert.equal((await call('bm','/'+r.id+'/recall',{revision:2})).status,403);assert.equal((await call('owner','/'+r.id+'/recall',{revision:2})).status,200);
 assert.equal((await call('admin','/'+r.id+'/lifecycle',{revision:3,action:'delete'})).status,200);assert.equal(service.store.get(r.id).status,'deleted');
});
