const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),express=require('express'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {createEmployeeStore}=require('../has/server/employees'),{createProfileStore}=require('../has/server/employeeProfiles');
const {createPushService}=require('../has/server/approvalPush'),{registerStaffSchedule}=require('../has/server/staffSchedule');
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const seed=[['agent','Agent','LAX','MU'],['sup','Supervisor','LAX','MU'],['outside','Agent','LAX','CZ'],['station','Agent','SFO','MU'],['blocked','Agent','LAX','MU']].map(([id,position,station,account])=>({id,name:id==='blocked'?'DEMO HAS':id,eid:id,position,station,account,loginId:id+'@example.test',attach:false,detach:false,spotter:false}));
 const employees={...createEmployeeStore(db,{seed}),db},profiles=createProfileStore(employees),users=seed.map(row=>({uid:row.id,email:row.loginId,provider:'password'}));users.forEach(user=>profiles.status(user));
 const sent=[],push=createPushService({db,env:{},send:async(token,payload)=>sent.push({token,payload})});
 const device=(uid,token,enabled=1)=>db.prepare('INSERT INTO notification_tokens VALUES(?,?,?,?,?,?,?,?,?)').run(token,uid,crypto.randomUUID(),token,'web','','now','now',enabled);
 device('agent','phone');device('agent','desktop');device('sup','supervisor');device('outside','outside');device('station','station');device('blocked','blocked');device('agent','disabled',0);
 const app=express();app.use(express.json());const schedule=registerStaffSchedule(app,{employees,profiles,authenticate:async req=>{const user=users.find(u=>u.uid===req.headers.authorization);if(!user)throw Error('No user');return user;}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{schedule.close();push.close();server.closeAllConnections();server.close();db.close();});
 const post=async(user,body,suffix='')=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api/announcements'+suffix,{method:'POST',headers:{authorization:user,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 return {db,push,sent,post,request:async(path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api'+path,{headers:{authorization:'sup','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}};
}
const announcement=()=>({title:'New team announcement',body:'Please check tomorrow’s schedule.',date:'2026-10-31',durationHours:24});
test('successful announcements push once per enabled eligible device; invalid and unauthorized writes stay quiet',async t=>{
 const f=await fixture(t);
 assert.equal((await f.post('agent',announcement())).status,403);
 assert.equal((await f.post('sup',{...announcement(),body:''})).status,400);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_push_outbox').get().n,0);
 const created=await f.post('sup',announcement());assert.equal(created.status,200);
 await f.push.flush();await f.push.flush();
 assert.deepEqual(f.sent.map(s=>s.token).sort(),['desktop','phone','supervisor']);
 for(const {payload} of f.sent){assert.equal(payload.type,'schedule_announcement');assert.equal(payload.requestId,created.data.id);assert.equal(payload.url,'/schedule');assert.equal(payload.title,announcement().title);assert.equal(payload.body,announcement().body);}
});
test('delivery rechecks expiry, deletion and current Schedule eligibility',async t=>{
 const f=await fixture(t);const original=f.push.flush;f.push.flush=async()=>{};
 const first=await f.post('sup',announcement());
 f.db.prepare('UPDATE staff_schedule_announcements SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00Z',first.data.id);
 const second=await f.post('sup',announcement());await f.post('sup',{},'/'+second.data.id+'/delete');
 const third=await f.post('sup',announcement());
 f.db.prepare('DELETE FROM employee_accounts WHERE uid=?').run('agent');
 await original();assert.deepEqual(f.sent.map(s=>s.token),['supervisor']);assert.equal(f.sent[0].payload.requestId,third.data.id);
});
test('a queue write failure rolls back the announcement and all recipient jobs',async t=>{
 const f=await fixture(t);
 f.db.exec("CREATE TRIGGER reject_push BEFORE INSERT ON approval_push_outbox BEGIN SELECT RAISE(ABORT,'queue unavailable'); END;");
 assert.equal((await f.post('sup',announcement())).status,400);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM staff_schedule_announcements').get().n,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_push_outbox').get().n,0);
 assert.equal(f.sent.length,0);
});
test('service worker displays an announcement and routes its click to Schedule',async()=>{
 const listeners={},notifications=[],opened=[];
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/public/firebase-messaging-sw.js'),'utf8'),{URL,self:{addEventListener:(name,fn)=>listeners[name]=fn,location:{origin:'https://www.mufcapp.net'},registration:{showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}});
 let job;listeners.push({data:{json:()=>({data:{type:'schedule_announcement',title:'Notice',body:'Read it',url:'/schedule',source:'schedule_announcement',requestId:'one',approvalStage:'published'}})},waitUntil:value=>job=value});await job;
 assert.equal(notifications.length,1);assert.equal(notifications[0].options.data.url,'/schedule');
 listeners.notificationclick({notification:{data:notifications[0].options.data,close(){}},waitUntil:value=>job=value});await job;assert.deepEqual(opened,['https://www.mufcapp.net/schedule']);
});

test('Short date appearance pushes scoped announcements once, updates headcounts, and cancels removed shortages',async t=>{
 const f=await fixture(t),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());
 const month=date.slice(0,7);let state=await f.request('?month='+month);assert.equal(state.status,200);
 const day=state.data.days.find(day=>day.date===date);assert(day);
 const original=f.push.flush;f.push.flush=async()=>{};
 const appearance={date,revision:day.revision,dateColor:null,labels:['Short'],shortRoles:[{code:'C',count:1}],shortRoleMode:'and'};
 let saved=await f.request('',appearance);assert.equal(saved.status,200);await original();
 assert.deepEqual(f.sent.map(s=>s.token).sort(),['desktop','phone','supervisor']);assert.match(f.sent[0].payload.body,/We need 1 C .*LAX \/ MU/);assert.equal(f.sent[0].payload.title,'You have a new announcement');
 appearance.revision=saved.data.revision;saved=await f.request('',appearance);assert.equal(saved.status,200);await original();assert.equal(f.sent.length,3);
 appearance.revision=saved.data.revision;appearance.shortRoles=[{code:'C',count:2}];saved=await f.request('',appearance);assert.equal(saved.status,200);
 appearance.revision=saved.data.revision;appearance.labels=[];assert.equal((await f.request('',appearance)).status,200);await original();assert.equal(f.sent.length,3);
});
