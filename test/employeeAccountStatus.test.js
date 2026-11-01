const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),express=require('express');
const {createEmployeeStore,registerEmployees}=require('../has/server/employees'),{createProfileStore}=require('../has/server/employeeProfiles');
async function fixture(t){
 const db=new Database(':memory:'),store=createEmployeeStore(db,{seed:[['owner','Manager','MU'],['sup','Supervisor','MU'],['agent','Agent','MU'],['other','Agent','EK']].map(([id,position,account])=>({id,name:id+' person',eid:id==='agent'?'123':'',station:'LAX',account,position,loginId:id==='owner'?'lake@mu.com':id+'@example.test',attach:true,detach:true,spotter:true}))}),profiles=createProfileStore(store),calls=[];let fail=false;
 for(const uid of ['first','second'])db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run(uid,'agent','password','now');
 const directory={list:async()=>[{uid:'email-only',email:'agent@example.test'}],setDisabled:async(uid,disabled)=>{calls.push({uid,disabled});if(fail)throw Error('Firebase unavailable');}};
 const app=express();app.use(express.json());registerEmployees(app,{store,profiles,firebaseDirectory:directory,authenticate:async req=>{const uid=req.headers['x-user'];if(!uid)throw Error('Sign in');return {uid,email:uid==='owner'?'lake@mu.com':uid+'@example.test'};}});
 const briefing=require('../has/server/briefing').registerBriefing(app,{employees:store,profiles,authenticate:async req=>({uid:req.headers['x-user']}),etab:{read:async()=>({status:'unavailable'})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/employee-admin-api/organization'+path,{headers:{'x-user':user,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const change=(disabled,user='owner',id='agent',revision=store.get().revision)=>request(user,'/account-status',{id,disabled,revision});
 return {db,store,profiles,calls,request,change,briefing,setFail:value=>fail=value};
}
test('disable applies to all Firebase identities, roster choices, old sessions and pending push; HR retains the profile',async t=>{
 const f=await fixture(t),push=require('../has/server/approvalPush').createPushService({db:f.db,send:async()=>assert.fail('Disabled user must receive no push')});t.after(()=>push.close());
 f.db.prepare('INSERT INTO notification_tokens VALUES(?,?,?,?,?,?,?,?,?)').run('token','first','device','token','web','','now','now',1);push.resolvers.set('fixture',()=>({stage:'ready'}));push.enqueue('fixture','request','ready','first',{title:'hidden'});
 f.db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?)').run('2026-11-01','MU586',JSON.stringify({__direction:'departure',counterA59:'agent person\nsup person'}),'now','owner');const result=await f.change(true);assert.equal(result.status,200);assert.deepEqual(f.calls.map(x=>x.uid).sort(),['email-only','first','second']);assert(f.calls.every(x=>x.disabled));
 assert.equal(f.briefing.record({date:'2026-11-01',flight:'MU586'}).fields.counterA59,'sup person');assert.equal(f.store.get().employees.some(row=>row.id==='agent'),false);assert.equal(f.store.options().some(row=>row.id==='agent'),false);assert.equal(f.store.getAll().employees.find(row=>row.id==='agent').accountDisabled,true);assert.equal(result.data.employees.find(row=>row.id==='agent').accountDisabled,true);
 assert.equal(f.profiles.linked({uid:'first'}),undefined);assert.throws(()=>f.profiles.status({uid:'first',email:'agent@example.test',provider:'password'}),/disabled/);
 const status=require('../has/server/employeeAccountStatus');assert.equal(status.blocked(f.db,{uid:'first'}),true);assert.equal(status.blocked(f.db,{uid:'email-only'}),true);assert.equal(status.blocked(f.db,{uid:'unknown',email:'agent@example.test'}),true);
 assert.equal(f.db.prepare('SELECT enabled FROM notification_tokens').get().enabled,0);await push.flush();assert.equal(f.db.prepare('SELECT status FROM approval_push_outbox').get().status,'suppressed');
 // The central sender also blocks newly queued work even if a device is accidentally enabled.
 f.db.prepare('UPDATE notification_tokens SET enabled=1').run();push.enqueue('fixture','later','ready','first',{});await push.flush();assert.equal(f.db.prepare("SELECT status FROM approval_push_outbox WHERE request_id='later'").get().status,'suppressed');
 const edited=f.store.get();edited.employees.find(row=>row.id==='sup').nickname='Supervisor';f.store.save(edited,{email:'lake@mu.com'});assert(f.store.getAll().employees.find(row=>row.id==='agent').accountDisabled);
 assert.equal((await f.change(false)).status,200);assert(f.store.get().employees.some(row=>row.id==='agent'));assert.equal(status.blocked(f.db,{uid:'first',authTime:1}),true);assert.equal(status.blocked(f.db,{uid:'first',authTime:Math.ceil(Date.now()/1000)+5}),false);
});
test('account status enforces hierarchy, self protection, validation and revision checks',async t=>{
 const f=await fixture(t);assert.equal((await f.change(true,'agent')).status,403);assert.equal((await f.change(true,'sup','other')).status,403);assert.equal((await f.change(true,'owner','owner')).status,403);assert.equal((await f.change('yes')).status,400);assert.equal((await f.change(true,'owner','agent',0)).status,409);assert.equal(f.calls.length,0);
 assert.equal((await f.change(true,'sup')).status,200);
});
test('Firebase failure leaves access blocked with a persisted retry state; retry restores synchronization',async t=>{
 const f=await fixture(t);f.setFail(true);assert.equal((await f.change(true)).status,502);assert.equal(f.store.get().employees.some(row=>row.id==='agent'),false);let row=(await f.request('owner')).data.employees.find(row=>row.id==='agent');assert.equal(row.accountStatusPending,true);
 f.setFail(false);assert.equal((await f.change(true)).status,200);row=(await f.request('owner')).data.employees.find(row=>row.id==='agent');assert.equal(row.accountStatusPending,false);assert.equal(row.accountDisabled,true);
});
test('Firebase account update disables sign-in and revokes previous sessions using validSince',async()=>{
 const calls=[],directory=require('../has/server/firebaseDirectory').createFirebaseDirectory({client:{request:async request=>{calls.push(request);return {data:{}};}}});await directory.setDisabled('uid',true);assert.equal(calls[0].data.disableUser,true);assert.equal(calls[0].data.localId,'uid');assert(Number(calls[0].data.validSince)>0);assert.match(calls[0].url,/accounts:update$/);
});

test('disabled canonical employees cannot reappear through merged aliases or linked alias identities',async t=>{
 const f=await fixture(t),data=f.store.get(),agent=data.employees.find(row=>row.id==='agent');data.employees.push({...agent,id:'alias',name:'Alias person',loginId:'alias@example.test'});f.store.save(data,{email:'lake@mu.com'});
 f.db.prepare('INSERT INTO employee_profile_merges VALUES(?,?,?,?,?)').run('alias','agent',JSON.stringify(agent),'owner','now');f.db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run('alias-uid','alias','password','now');assert.equal((await f.change(true)).status,200);assert(!f.store.get().employees.some(row=>['agent','alias'].includes(row.id)));assert(require('../has/server/employeeAccountStatus').blocked(f.db,{uid:'alias-uid'}));assert(f.calls.some(call=>call.uid==='alias-uid'&&call.disabled));
});
