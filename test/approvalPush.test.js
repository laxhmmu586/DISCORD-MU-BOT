const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Database=require('better-sqlite3'),express=require('express');
const {createPushService,attachPush,registerPush}=require('../has/server/approvalPush');
const {createEmployeeStore}=require('../has/server/employees'),{createProfileStore}=require('../has/server/employeeProfiles');
function fixture(t){
 const db=new Database(':memory:');
 const seed=['Agent','Supervisor','Manager','Supervisor'].map((position,i)=>({id:'e'+i,name:'Person '+i,position,eid:'00'+i,phone:'6268891216',attach:false,detach:false,spotter:false,station:'LAX',account:i===3?'CZ':'MU',email:'person'+i+'@example.test',companyEmail:'person'+i+'@example.test',loginId:'person'+i+'@example.test'}));
 const employees={...createEmployeeStore(db,{seed}),db},profiles=createProfileStore(employees),users=seed.map(e=>({uid:e.id,email:e.loginId,provider:'password'}));users.forEach(u=>profiles.status(u));
 const sent=[],service=createPushService({db,env:{},send:async(token,payload)=>sent.push({token,payload})});
 const device=(uid,token)=>db.prepare('INSERT INTO notification_tokens VALUES(?,?,?,?,?,?,?,?,1)').run(token,uid,crypto.randomUUID(),token,'web','','now','now');
 t.after(()=>{service.close();db.close();});return {db,employees,profiles,users,sent,service,device};
}
const uniformBody=()=>({workflowRevision:3,route:[{id:'template-3-0',position:'Supervisor',employeeId:'e1'},{id:'template-3-1',position:'Manager',employeeId:'e2'}],requestId:crypto.randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i===0?'38':'',pieces:i===0?2:'',order:'',reusable:'',nonReusable:''}))});
test('real approval permissions, multi-device, stage progression, retries and restarts do not broadcast or duplicate',async t=>{
 const f=fixture(t),store=require('../has/server/uniformRequests').createUniformStore(f);
 attachPush(store,{db:f.db,source:'uniform',read:(u,id)=>store.read(u,id)});
 f.device('e1','supervisor-phone');f.device('e1','supervisor-desktop');f.device('e2','manager');f.device('e3','other-account');
 const body=uniformBody(),r=store.create(f.users[0],body);await f.service.flush();
 assert.deepEqual(f.sent.map(s=>s.token).sort(),['supervisor-desktop','supervisor-phone']);
 store.create(f.users[0],body);store.list(f.users[1]);await f.service.flush();assert.equal(f.sent.length,2);
 assert.throws(()=>store.decide(f.users[2],r.id,{revision:1,action:'approve'}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_push_outbox').get().n,1);
 store.decide(f.users[1],r.id,{revision:1,action:'approve'});await f.service.flush();assert.equal(f.sent[2].token,'manager');
 f.service.close();const restarted=createPushService({db:f.db,env:{},send:async()=>assert.fail('restart duplicated delivery')});attachPush(store,{db:f.db,source:'uniform',read:(u,id)=>store.read(u,id)});await restarted.flush();restarted.close();
});
test('outbox rolls back with failed writes; withdrawn/completed tasks are rechecked before sending',async t=>{
 const f=fixture(t),store=require('../has/server/uniformRequests').createUniformStore(f);attachPush(store,{db:f.db,source:'uniform',read:(u,id)=>store.read(u,id)});f.device('e1','supervisor');
 assert.throws(()=>f.db.transaction(()=>{store.create(f.users[0],uniformBody());throw Error('rollback');})());assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_push_outbox').get().n,0);
 const r=store.create(f.users[0],uniformBody());store.lifecycle(f.users[0],r.id,{revision:r.revision,action:'withdraw'});await f.service.flush();assert.equal(f.sent.length,0);
});
test('Read & Sign publishes only to assigned unsigned recipients, additions push once and retry stays quiet',async t=>{
 const f=fixture(t),store=require('../has/server/readSign').createReadSignStore(f);attachPush(store,{db:f.db,source:'read_sign',read:(u,id)=>store.read(u,id),methods:['publish','addRecipients'],kind:'read_sign'});
 f.device('e0','agent');f.device('e3','outside');
 const body={requestId:crypto.randomUUID(),subject:'New policy',memoNumber:'TEST',body:'Read this policy.',deadline:'2099-12-01T00:00:00Z',attachments:[]};
 const r=store.publish(f.users[1],body);store.publish(f.users[1],body);await f.service.flush();assert.deepEqual(f.sent.map(s=>s.token),['agent']);assert.equal(f.sent[0].payload.type,'read_sign_required');
 const data=f.employees.get();data.employees.push({...data.employees[0],id:'late',name:'LATE JOINER',eid:'999',email:'late@example.test',loginId:'late@example.test'});f.employees.save(data,{email:'lake@mu.com'});f.profiles.status({uid:'late',email:'late@example.test',provider:'password'});f.device('late','late-device');
 store.addRecipients(f.users[1],r.id,{employeeIds:['late']});store.addRecipients(f.users[1],r.id,{employeeIds:['late']});await f.service.flush();assert.deepEqual(f.sent.map(s=>s.token),['agent','late-device']);
});
test('invalid tokens are disabled and ambiguous delivery failures are not retried',async t=>{
 const f=fixture(t);f.service.close();let attempts=0;const service=createPushService({db:f.db,env:{},send:async()=>{attempts++;throw {response:{data:{error:{details:[{errorCode:'UNREGISTERED'}]}}}};}});service.resolvers.set('test',()=>({stage:'one'}));f.device('e1','expired');service.enqueue('test','request','one','e1',{type:'approval_required'});await service.flush();await service.flush();assert.equal(attempts,1);assert.equal(f.db.prepare('SELECT enabled FROM notification_tokens').get().enabled,0);service.close();
});
test('Schedule HTTP submission pushes only the current actual approval queue without refresh',async t=>{
 const f=fixture(t),app=express();app.use(express.json());const schedule=require('../has/server/staffSchedule').registerStaffSchedule(app,{employees:f.employees,profiles:f.profiles,authenticate:async req=>f.users.find(u=>u.uid===req.headers.authorization),now:()=>new Date('2026-10-31T18:00:00Z')});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{schedule.close();server.closeAllConnections();server.close();});
 f.device('e0','requester');f.device('e1','supervisor');f.device('e2','manager');f.device('e3','outside');
 f.db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-11-06',JSON.stringify({assignments:{e0:{code:'C',color:'#99ff00'}}}));
 const body={requestId:crypto.randomUUID(),type:'off',date:'2026-11-06',note:'',days:{'2026-11-06':'X'}},url='http://127.0.0.1:'+server.address().port+'/staff-schedule-api/requests';
 const submit=()=>fetch(url,{method:'POST',headers:{Authorization:'e0','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await submit()).status,200);await f.service.flush();assert.deepEqual(f.sent.map(s=>s.token).sort(),['manager','supervisor']);assert.equal(f.sent[0].payload.source,'schedule');await submit();await f.service.flush();assert.equal(f.sent.length,2);
});
test('device API binds tokens to authenticated user, preserves other devices and scopes logout',async t=>{
 const f=fixture(t);f.service.close();const app=express(),service=registerPush(app,{employees:f.employees,profiles:f.profiles,authenticate:async req=>{const u=f.users.find(u=>req.headers.authorization===u.uid);if(!u)throw Error('auth');return u;},env:{}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{service.close();server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const call=(uid,body)=>fetch(base+'/notification-api/device',{method:'POST',headers:{Authorization:uid,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const a={deviceId:crypto.randomUUID(),token:'a'.repeat(25)},b={deviceId:crypto.randomUUID(),token:'b'.repeat(25)};
 assert.equal((await call('bad',a)).status,401);await call('e1',{...a,uid:'e2'});await call('e1',b);await call('e1',a);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notification_tokens WHERE uid=?').get('e1').n,2);
 await call('e2',{deviceId:a.deviceId,enabled:false});assert.equal(f.db.prepare('SELECT SUM(enabled) n FROM notification_tokens').get().n,2);
 await call('e1',{deviceId:a.deviceId,enabled:false});assert.equal(f.db.prepare('SELECT SUM(enabled) n FROM notification_tokens').get().n,1);
});
