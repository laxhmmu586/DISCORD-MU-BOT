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
 for(const id of ['other','sup','admin']){assert.throws(()=>f.store.read(f.users[id],r.id),e=>e.status===404);assert.throws(()=>f.store.decide(f.users[id],r.id,{revision:1,action:'approve'}),e=>e.status===403);}
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
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
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
