const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),crypto=require('node:crypto'),express=require('express');
const {createEmployeeStore}=require('../has/server/employees'),{createProfileStore}=require('../has/server/employeeProfiles'),{createPushService}=require('../has/server/approvalPush');
const {createNotificationCenter,registerNotificationCenter}=require('../has/server/notificationCenter'),time=require('../has/server/notificationSchedule');
function fixture(t){
 const db=new Database(':memory:');
 const rows=[['owner','Business Manager','LAX','MU','lake@mu.com'],['gm','General Manager','LAX','MU'],['bm','Business Manager','LAX','MU'],['cz','Business Manager','LAX','CZ'],['sup','Supervisor','LAX','MU'],['agent','Agent','LAX','MU'],['sfo','Business Manager','SFO','MU']].map(([id,position,station,account,email])=>({id,name:id,position,station,account,eid:id,loginId:email||id+'@example.test',attach:false,detach:false,spotter:false}));
 rows.push({id:'extra',name:'Second account person',position:'Agent',station:'SFO',account:'CZ',additionalAccounts:[{station:'LAX',account:'MU'}],eid:'extra',loginId:'extra@example.test'});
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles=createProfileStore(employees),users=Object.fromEntries(rows.map(row=>[row.id,{uid:row.id,email:row.loginId,provider:'password'}]));Object.values(users).forEach(user=>profiles.status(user));
 let at=new Date('2026-11-01T17:00:00Z');const sent=[],push=createPushService({db,env:{},send:async(token,payload)=>sent.push({token,payload})});
 for(const user of Object.values(users))db.prepare('INSERT INTO notification_tokens VALUES(?,?,?,?,?,?,?,?,1)').run(user.uid,user.uid,crypto.randomUUID(),user.uid,'web','','now','now');
 const store=createNotificationCenter({db,employees,profiles,push,now:()=>at});t.after(()=>{push.close();db.close();});return {db,employees,profiles,users,push,store,sent,now:()=>at,setTime:value=>at=new Date(value)};
}
const MU={type:'account',station:'LAX',account:'MU'},CZ={type:'account',station:'LAX',account:'CZ'},LAX={type:'station',station:'LAX'},COMPANY={type:'company'};
const reminder=(scope=MU,extra={})=>({scope,title:'Weekly report',body:'Please submit your weekly report.',category:'weekly_report',positions:['Supervisor'],enabled:true,schedule:{frequency:'once',date:'2026-11-01',time:'09:01',timeZone:'America/Los_Angeles'},...extra});
test('company, station and Business Manager authority cannot be widened with a forged scope',t=>{
 const f=fixture(t);assert.equal(f.store.context(f.users.owner).access.level,'company');assert.equal(f.store.context(f.users.gm).access.level,'station');assert.equal(f.store.context(f.users.bm).access.level,'account');
 for(const user of ['sup','agent'])assert.throws(()=>f.store.context(f.users[user]),{status:403});
 for(const scope of [COMPANY,LAX,CZ,{type:'account',station:'SFO',account:'MU'}])assert.throws(()=>f.store.save(f.users.bm,reminder(scope)),{status:403});
 assert.throws(()=>f.store.save(f.users.gm,reminder(COMPANY)),{status:403});assert.throws(()=>f.store.save(f.users.gm,reminder({type:'account',station:'SFO',account:'MU'})),{status:403});
 for(const [user,scope] of [['owner',COMPANY],['gm',LAX],['bm',MU]]){const r=f.store.save(f.users[user],reminder(scope));assert.equal(f.store.list(f.users[user],scope).reminders[0].id,r.id);}
 assert.equal(f.store.list(f.users.cz,CZ).reminders.length,0);
});
test('scope and role targeting include secondary memberships and skip opted-out devices',async t=>{
 const f=fixture(t);f.db.prepare('UPDATE notification_tokens SET enabled=0 WHERE uid=?').run('agent');
 const r=f.store.save(f.users.bm,reminder(MU,{positions:['Agent']}));f.setTime('2026-11-01T17:01:01Z');f.store.tick();await f.push.flush();
 assert.deepEqual(f.sent.map(s=>s.token),['extra']);assert.equal(f.sent[0].payload.type,'hr_reminder');assert.equal(f.sent[0].payload.url,'/home');
 f.store.tick();await f.push.flush();assert.equal(f.sent.length,1);assert.equal(f.store.read(r.id).nextAt,null);
});
test('recurring reminders survive restart state and skip duplicate occurrences and stale backlog',async t=>{
 const f=fixture(t),r=f.store.save(f.users.bm,reminder(MU,{schedule:{frequency:'daily',time:'09:01',timeZone:'America/Los_Angeles'}}));
 f.setTime('2026-11-01T17:01:01Z');f.store.tick();await f.push.flush();assert.equal(f.sent.length,1);const restarted=createNotificationCenter({db:f.db,employees:f.employees,profiles:f.profiles,push:f.push,now:f.now});restarted.tick();await f.push.flush();assert.equal(f.sent.length,1);
 f.setTime('2026-11-02T17:01:01Z');restarted.tick();await f.push.flush();assert.equal(f.sent.length,2);
 f.setTime('2026-11-10T17:01:01Z');restarted.tick();await f.push.flush();assert.equal(f.sent.length,2);assert.equal(restarted.read(r.id).nextAt,'2026-11-11T17:01:00.000Z');
});
test('off switches and deletion suppress queued notifications without changing the reminder audience',async t=>{
 const f=fixture(t),r=f.store.save(f.users.bm,reminder());f.setTime('2026-11-01T17:01:01Z');f.store.tick();f.store.toggle(f.users.bm,r.id,{revision:r.revision,enabled:false});await f.push.flush();assert.equal(f.sent.length,0);
 const next=f.store.save(f.users.bm,reminder(MU,{schedule:{frequency:'once',date:'2026-11-02',time:'09:01',timeZone:'America/Los_Angeles'}}));f.setTime('2026-11-02T17:01:01Z');f.store.tick();f.store.remove(f.users.bm,next.id,{revision:next.revision});await f.push.flush();assert.equal(f.sent.length,0);
});
test('revision checks, reminder dates and recipient position validation reject invalid mutations',t=>{
 const f=fixture(t),r=f.store.save(f.users.bm,reminder());assert.throws(()=>f.store.save(f.users.bm,{...reminder(),id:r.id,revision:0}),{status:409});assert.throws(()=>f.store.remove(f.users.cz,r.id,{revision:r.revision}),{status:403});
 for(const extra of [{title:''},{body:''},{positions:['Invented role']},{schedule:{frequency:'once',date:'2020-01-01',time:'09:00',timeZone:'UTC'}},{schedule:{frequency:'weekly',weekdays:[],time:'09:00',timeZone:'UTC'}}])assert.throws(()=>f.store.save(f.users.bm,reminder(MU,extra)),{status:400});
 assert.throws(()=>f.store.savePolicy(f.users.bm,{scope:MU,revision:1,settings:{}}),{status:409});
});
test('company and station policies are inherited; account switches filter the current approval queue without granting permissions',async t=>{
 const f=fixture(t);f.store.savePolicy(f.users.owner,{scope:COMPANY,revision:0,settings:{report_time:{enabled:false,positions:[]}}});
 f.store.savePolicy(f.users.bm,{scope:MU,revision:0,settings:{report_time:{enabled:true,positions:['Supervisor']}}});
 assert.equal(f.store.policyAllows('sup',{source:'schedule',notificationKey:'report_time',station:'LAX',account:'MU'}),false);
 f.store.savePolicy(f.users.owner,{scope:COMPANY,revision:1,settings:{report_time:{enabled:true,positions:[]}}});
 assert.equal(f.store.policyAllows('sup',{source:'schedule',notificationKey:'report_time',station:'LAX',account:'MU'}),true);assert.equal(f.store.policyAllows('bm',{source:'schedule',notificationKey:'report_time',station:'LAX',account:'MU'}),false);
 f.push.resolvers.set('test',()=>({stage:'pending'}));f.push.enqueue('test','one','pending','bm',{notificationKey:'report_time',station:'LAX',account:'MU'});await f.push.flush();assert.equal(f.sent.length,0);assert.equal(f.db.prepare("SELECT status FROM approval_push_outbox WHERE source='test'").get().status,'suppressed');
});
test('scheduled reminders are suppressed by the account reminder switch',async t=>{
 const f=fixture(t);f.store.savePolicy(f.users.bm,{scope:MU,revision:0,settings:{reminder:{enabled:false,positions:[]}}});f.store.save(f.users.bm,reminder());f.setTime('2026-11-01T17:01:01Z');f.store.tick();await f.push.flush();assert.equal(f.sent.length,0);
});
test('reminder inbox stays private, counts unviewed messages and enforces owner-only read receipts',async t=>{
 const f=fixture(t);f.store.save(f.users.bm,reminder());f.setTime('2026-11-01T17:01:01Z');f.store.tick();await f.push.flush();
 const inbox=f.store.messages(f.users.sup);assert.equal(inbox.messages.length,1);assert.equal(inbox.messages[0].readAt,null);assert.equal(f.store.messages(f.users.agent).messages.length,0);
 f.store.readMessages(f.users.agent,{ids:[inbox.messages[0].id]});assert.equal(f.store.messages(f.users.sup).messages[0].readAt,null);
 assert.ok(f.store.readMessages(f.users.sup,{ids:[inbox.messages[0].id]}).messages[0].readAt);
});
test('daily, weekly, monthly and date reminders follow local time across DST and short months',()=>{
 const base={timeZone:'America/Los_Angeles',time:'09:00'};
 assert.equal(time.nextOccurrence({...base,frequency:'weekly',weekdays:[1]},'2026-10-31T18:00:00Z'),'2026-11-02T17:00:00.000Z');
 assert.equal(time.nextOccurrence({...base,frequency:'monthly',day:31},'2027-02-01T00:00:00Z'),'2027-02-28T17:00:00.000Z');
 assert.equal(new Date(time.wallTime('2026-03-08','02:30','America/Los_Angeles')).toISOString(),'2026-03-08T10:00:00.000Z');
 assert.equal(time.nextOccurrence({...base,time:'01:30',frequency:'daily'},'2026-11-01T08:31:00Z'),'2026-11-02T09:30:00.000Z');
 assert.equal(time.nextOccurrence({...base,frequency:'once',date:'2026-10-01'},'2026-11-01T00:00:00Z'),null);
});
test('headquarters notifications can target the HQ station as well as company-wide audiences',()=>{
 const policy=require('../has/server/notificationAccess'),employee={position:'HR Manager',station:'HQ',account:'HQ'};
 assert.ok(policy.matches(employee,{type:'station',station:'HQ'}));assert.ok(policy.matches(employee,COMPANY));assert.equal(policy.matches(employee,LAX),false);
});
test('management HTTP endpoints require sign-in and deny unmanaged scopes',async t=>{
 const f=fixture(t),app=express();const service=registerNotificationCenter(app,{employees:f.employees,profiles:f.profiles,push:f.push,intervalMs:0,now:f.now,authenticate:async req=>{const user=f.users[req.headers.authorization];if(!user)throw Error('No auth');return user;}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();});
 const call=(user,path)=>fetch('http://127.0.0.1:'+server.address().port+'/notification-admin-api'+path,{headers:user?{Authorization:user}:{}});
 assert.equal((await call(null,'/context')).status,401);assert.equal((await call('agent','/context')).status,403);assert.equal((await call('bm','?type=account&station=LAX&account=CZ')).status,403);assert.equal((await call('bm','/context')).status,200);
 const inboxUrl='http://127.0.0.1:'+server.address().port+'/notification-api/messages';assert.equal((await fetch(inboxUrl)).status,401);assert.equal((await fetch(inboxUrl,{headers:{Authorization:'agent'}})).status,200);
});
test('station managers get the HR notification entry without gaining personnel administration',async t=>{
 const f=fixture(t),app=express();app.use(express.json());
 require('../has/server/employees').registerEmployees(app,{store:f.employees,profiles:f.profiles,authenticate:async req=>{const user=f.users[req.headers.authorization];if(!user)throw Error('No auth');return user;}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port+'/employee-admin-api';const response=await fetch(base+'/access',{headers:{Authorization:'gm'}});assert.equal(response.status,200);assert.equal((await response.json()).notificationOnly,true);
 assert.equal((await fetch(base+'/organization',{headers:{Authorization:'gm'}})).status,403);assert.equal((await fetch(base+'/access',{headers:{Authorization:'agent'}})).status,403);
});
