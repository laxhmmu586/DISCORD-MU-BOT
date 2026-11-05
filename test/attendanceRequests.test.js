const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {validate,createSqliteStorage,registerAttendance}=require('../attendanceRequests');
const employees={get:()=>({employees:[{id:'test-one',name:'Test Employee',email:'private@example.com',eid:'123',phone:'555',discordId:'123456789012345678'}]})};
const body={requestId:'11111111-1111-4111-8111-111111111111',employeeId:'test-one',type:'late',date:'2026-10-14',arrivalTime:'10:15',scheduledStart:'08:00',reason:'Traffic',note:''};
const record=()=>({...validate(body,employees),submittedAt:'2026-10-14T15:45:00Z'});
test('validation uses current employee name and rejects unknown employees, dates and times',()=>{assert.equal(validate({...body,employeeName:'Forged'},employees).employeeName,'Test Employee');for(const patch of [{employeeId:'missing'},{type:'x'},{date:'2026-02-30'},{arrivalTime:'24:00'},{reason:[]},{note:'x'.repeat(1001)},{requestId:'x'}])assert.throws(()=>validate({...body,...patch},employees));});
test('both request types reject absent, blank and whitespace-only reasons',()=>{for(const type of ['late','sick'])for(const reason of [undefined,'','   ','\n\t'])assert.throws(()=>validate({...body,type,reason},employees),/explain why|provide a reason/);assert.equal(validate({...body,reason:'  Traffic  '},employees).reason,'Traffic');});
test('scheduled start is discarded even when supplied by an older client',()=>{assert.equal(validate(body,employees).scheduledStart,'');assert.equal(validate({...body,scheduledStart:'invalid'},employees).scheduledStart,'');});
test('sick requests do not retain arrival or scheduled start',()=>{const r=validate({...body,type:'sick'},employees);assert.equal(r.arrivalTime,'');assert.equal(r.scheduledStart,'');});
test('SQLite saves both types, deduplicates retries and isolates employee history',()=>{
 const db=new Database(':memory:');try{
  const store=createSqliteStorage({db}),r=record();assert.equal(store.save(r).duplicate,false);
  assert.equal(store.save({...r,submittedAt:'later'}).record.submittedAt,r.submittedAt);
  assert.equal(store.save(r).duplicate,true);
  assert.throws(()=>store.save({...r,reason:'Changed'}),/already used/);
  const sick={...r,id:'second',reference:'REQ-SECOND',type:'sick',arrivalTime:''};assert.equal(store.save(sick).history.length,2);
  store.save({...r,id:'other',reference:'REQ-OTHER',employeeId:'other'});
  assert.equal(store.list(r.employeeId).length,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_delivery').get().n,3);
  assert.equal(createSqliteStorage({db}).list(r.employeeId).length,2);
 }finally{db.close();}
});
test('SQLite rolls back request and notification when schedule update fails',()=>{
 const db=new Database(':memory:');try{const store=createSqliteStorage({db,onSave:()=>{throw Error('schedule failed');}});
 assert.throws(()=>store.save(record()),/schedule failed/);assert.equal(store.list(body.employeeId).length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_delivery').get().n,0);
 }finally{db.close();}
});
test('SQLite recovers existing accepted requests from delivery ledger without resending',()=>{
 const db=new Database(':memory:');try{db.exec('CREATE TABLE attendance_delivery(reference TEXT PRIMARY KEY,data TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0)');
 const r=record();db.prepare('INSERT INTO attendance_delivery VALUES(?,?,1)').run(r.reference,JSON.stringify({record:r,history:[]}));
 const store=createSqliteStorage({db});assert.equal(store.list(r.employeeId).length,1);assert.equal(store.save(r).duplicate,true);assert.equal(db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);
 }finally{db.close();}
});
test('default API saves late and sick in SQLite without Google and retries only one notification',async t=>{
 let sends=0;const s=await server(t,{employees:{get:()=>({employees:[{...employees.get().employees[0],station:'LAX',account:'MU'}]})},storage:undefined,client:{channels:{fetch:async()=>({send:async()=>{sends++;}})}}});
 for(const patch of [{},{type:'sick',requestId:'22222222-2222-4222-8222-222222222222'}]){const payload={...body,...patch};assert.equal((await s.post(payload)).status,201);assert.equal((await s.post(payload)).status,200);}
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM attendance_requests').get().n,2);assert.equal(sends,2);assert.equal(s.db.prepare('SELECT revision FROM staff_schedule_days WHERE date=?').get(body.date).revision,1);
});
test('attendance history requires authentication and ignores a forged employee selection',async t=>{const s=await server(t,{authenticate:async req=>{if(req.headers.authorization!=='Bearer test')throw Error('no');return {uid:'one'};},profiles:{linked:u=>u.uid==='one'?{id:'test-one',name:'Test Employee'}:null},storage:{list:async id=>{assert.equal(id,'test-one');return [record()];}}});assert.equal((await s.get('/attendance-api/history')).status,401);const response=await fetch(s.base+'/attendance-api/history?employeeId=other',{headers:{Authorization:'Bearer test'}});assert.equal(response.status,200);assert.equal((await response.json()).records[0].employeeId,'test-one');});
async function server(t,overrides={}){const app=express();app.use(express.json());const db=new Database(':memory:');const service=registerAttendance(app,{employees,db,client:{channels:{fetch:async()=>({send:async()=>{}})}},storage:{save:async r=>({record:r,history:[r]})},renderCards:async()=>[],...overrides});const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));t.after(()=>{service.close();listener.close();db.close();});const base='http://127.0.0.1:'+listener.address().port;return{base,get:path=>fetch(base+path),post:b=>fetch(base+'/attendance-api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),db,service};}
test('public employee endpoint exposes only names and internal selection IDs',async t=>{const s=await server(t),r=await s.get('/attendance-api/employees');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(await r.json(),{employees:[{id:'test-one',name:'Test Employee'}]});});
test('public selection list prefers trimmed nicknames, preserves order and IDs, and falls back for missing nicknames',async t=>{
 const rows=[
  {id:'first',name:'First Full Name',nickname:'  Alex  ',email:'private@example.com'},
  {id:'second',name:'Second Full Name',nickname:'Alex'},
  {id:'third',name:'Third Full Name',nickname:'   '},
  {id:'fourth',name:'Fourth Full Name'},
  {id:'hidden',name:'',nickname:'No valid employee name'}
 ];
 const s=await server(t,{employees:{get:()=>({employees:rows})}});
 assert.deepEqual(await(await s.get('/attendance-api/employees')).json(),{employees:[
  {id:'first',name:'Alex'},{id:'second',name:'Alex'},{id:'third',name:'Third Full Name'},{id:'fourth',name:'Fourth Full Name'}
 ]});
 const saved=await(await s.post({...body,employeeId:'second',employeeName:'Alex'})).json();
 assert.equal(saved.record.employeeId,'second');
 assert.equal(saved.record.employeeName,'Second Full Name');
});
test('unavailable image dependencies cannot prevent employee API startup or SQLite saves',async t=>{
 const {spawnSync}=require('node:child_process');
 const result=spawnSync(process.execPath,['-e',`
 const assert=require('node:assert/strict'),Module=require('node:module'),express=require('express'),Database=require('better-sqlite3');
 const {registerAttendance}=require('./attendanceRequests');const original=Module._load;
 Module._load=function(id,...args){if(id==='./attendanceCards')throw Error('Image module unavailable');return original.call(this,id,...args);};
 const db=new Database(':memory:'),app=express();app.use(express.json());
 const service=registerAttendance(app,{db,employees:{get:()=>({employees:[{id:'test-one',name:'Full Name'}]})},storage:{save:async record=>({record,history:[]})},client:{}});
 const listener=app.listen(0,'127.0.0.1',async()=>{try{const base='http://127.0.0.1:'+listener.address().port;const r=await fetch(base+'/attendance-api/employees');assert.deepEqual(await r.json(),{employees:[{id:'test-one',name:'Full Name'}]});const saved=await fetch(base+'/attendance-api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})});assert.equal(saved.status,201);assert.equal((await saved.json()).notificationPending,true);assert.equal(db.prepare('SELECT sent FROM attendance_delivery').get().sent,0);}catch(e){console.error(e);process.exitCode=1;}finally{service.close();listener.close();db.close();}});
 `],{cwd:require('node:path').join(__dirname,'..'),encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
});
test('attendance immediately reflects saved admin employee changes including non-PBB staff',async t=>{
 const {createEmployeeStore,registerEmployees}=require('../has/server/employees');
 const db=new Database(':memory:'),store=createEmployeeStore(db,{seed:[{id:'one',name:'Original Employee',eid:'',discordId:'',attach:false,detach:false,spotter:false}]});
 const app=express();app.use(express.json());registerEmployees(app,{store,authenticate:async()=>({email:'lake@mu.com'})});
 const service=registerAttendance(app,{employees:store,db,storage:{},renderCards:async()=>[],client:{}});
 const listener=app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
 t.after(()=>{service.close();listener.close();db.close();});const base='http://127.0.0.1:'+listener.address().port;
 const admin=await(await fetch(base+'/employee-admin-api')).json();admin.employees[0].name='Updated Employee';admin.employees[0].nickname='Updated Nickname';admin.employees[0].email='private@example.com';
 admin.employees.push({id:'new',name:'New Employee',eid:'002',discordId:'',phone:'555',email:'other@example.com',attach:false,detach:false,spotter:false});
 assert.equal((await fetch(base+'/employee-admin-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(admin)})).status,200);
 assert.deepEqual(await(await fetch(base+'/attendance-api/employees')).json(),{employees:[{id:'one',name:'Updated Nickname'},{id:'new',name:'New Employee'}]});
});
test('Storage failure never reports success or sends Discord messages',async t=>{let sends=0;const s=await server(t,{storage:{save:async()=>{throw Error('database unavailable');}},client:{channels:{fetch:async()=>{sends++;}}}});const r=await s.post(body);assert.equal(r.status,503);assert.match((await r.json()).error,/save your request/);assert.equal(sends,0);});
test('invalid requests never reach storage',async t=>{let writes=0;const s=await server(t,{storage:{save:async()=>{writes++;}}});assert.equal((await s.post({...body,employeeId:'unknown'})).status,400);assert.equal(writes,0);});
test('saved request with failed Discord delivery keeps durable pending job',async t=>{const s=await server(t,{client:{channels:{fetch:async()=>{throw Error('Discord unavailable');}}}});const r=await s.post(body);assert.equal(r.status,201);assert.equal((await r.json()).notificationPending,true);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,0);});
test('retrying a saved request does not resend an already delivered notification',async t=>{let sends=0;const s=await server(t,{client:{channels:{fetch:async id=>{assert.equal(id,'1365021189998903418');return{send:async message=>{assert.deepEqual(message.allowedMentions,{parse:[],users:['123456789012345678']});sends++;}};}}}});await s.post(body);await s.post(body);assert.equal(sends,1);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);});
test('main request sends as one plain PNG attachment with employee mention',async t=>{
 let sends=0;const s=await server(t,{renderCards:require('../attendanceCards').renderCards,client:{channels:{fetch:async()=>({send:async message=>{sends++;assert.equal(message.content,'<@123456789012345678>');assert.equal(message.files.length,1);assert.equal(message.embeds,undefined);for(const file of message.files){assert.equal(file.attachment.subarray(1,4).toString(),'PNG');assert.ok(file.attachment.length>10000);}return{id:'test-png-message'};}})}}});
 const result=await s.post(body);assert.equal(result.status,201);assert.equal((await result.json()).notificationPending,false);assert.equal(sends,1);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);
});
test('image rendering failure sends three native cards and acknowledges delivery',async t=>{
 let sends=0;const s=await server(t,{renderCards:async()=>{throw Error('Cannot find module sharp');},client:{channels:{fetch:async id=>{assert.equal(id,'1365021189998903418');return {send:async message=>{sends++;assert.equal(message.files,undefined);assert.equal(message.embeds.length,1);assert.equal(message.embeds[0].title,'Coming Late');assert.equal(message.embeds[0].fields.find(f=>f.name==='Why?').value,'Traffic');assert.deepEqual(message.allowedMentions,{parse:[],users:['123456789012345678']});}};}}}});
 const r=await s.post(body);assert.equal(r.status,201);assert.equal((await r.json()).notificationPending,false);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);
 await s.post(body);assert.equal(sends,1);
});
test('fallback send permission failure remains pending and recovers on retry',async t=>{
 let fail=true,sends=0;const s=await server(t,{renderCards:async()=>{throw Error('Image unavailable');},client:{channels:{fetch:async()=>({send:async()=>{sends++;if(fail){const e=Error('Missing Permissions');e.code=50013;throw e;}}})}}});
 const r=await s.post(body);assert.equal((await r.json()).notificationPending,true);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,0);
 fail=false;await s.service.retryPending();assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);await s.service.retryPending();assert.equal(sends,2);
});
test('pending jobs from an earlier process recover without another submission',async()=>{
 const db=new Database(':memory:');db.exec('CREATE TABLE attendance_delivery (reference TEXT PRIMARY KEY, data TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)');const r=record();db.prepare('INSERT INTO attendance_delivery(reference,data) VALUES (?,?)').run(r.reference,JSON.stringify({record:r,history:[r]}));let sends=0;
 const service=registerAttendance(express(),{db,employees,storage:{save:()=>{throw Error('No new writes allowed');}},renderCards:async()=>{throw Error('Image unavailable');},client:{channels:{fetch:async()=>({send:async()=>{sends++;}})}}});
 try{await service.retryPending();assert.equal(sends,1);assert.equal(db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);await service.retryPending();assert.equal(sends,1);}finally{service.close();db.close();}
});
test('native fallback handles maximum reasons and notes within Discord embed limits',()=>{
 const {fallbackEmbeds}=require('../attendanceDiscord');const embeds=fallbackEmbeds({...record(),reason:'*'.repeat(1000),note:'_'.repeat(1000)},Array.from({length:30},()=>record()));let total=0;for(const embed of embeds){assert.ok((embed.description||'').length<=4096);total+=(embed.title||'').length+(embed.description||'').length+(embed.footer?.text||'').length;for(const field of embed.fields||[]){assert.ok(field.value.length<=1024);total+=field.name.length+field.value.length;}}assert.ok(total<=6000);
});
test('mentions use current admin Discord ID, ignoring IDs supplied by the browser',async t=>{
 const row={id:'test-one',name:'Test Employee',discordId:'222222222222222222'};let sent;
 const s=await server(t,{employees:{get:()=>({employees:[row]})},renderCards:async()=>[{name:'attendance-request.png',attachment:Buffer.from('image')}],client:{channels:{fetch:async()=>({send:async message=>{sent=message;}})}}});
 await s.post({...body,discordId:'999999999999999999'});assert.equal(sent.content,'<@222222222222222222>');assert.deepEqual(sent.allowedMentions,{parse:[],users:['222222222222222222']});
});

test('Discord cards use the current nickname while stored requests retain the employee name',async t=>{
 for(const nickname of ['  Vicky  ','   ']){
  const row={id:'test-one',name:'Test Employee',nickname,discordId:'222222222222222222'};let rendered;
  const s=await server(t,{employees:{get:()=>({employees:[row]})},renderCards:async record=>{rendered=record;return[{name:'attendance-request.png',attachment:Buffer.from('image')}];},client:{channels:{fetch:async()=>({send:async()=>{}})}}});
  const response=await s.post(body);const saved=await response.json();
  assert.equal(rendered.employeeName,nickname.trim()||'Test Employee');
  assert.equal(saved.record.employeeName,'Test Employee');
 }
});
test('missing or invalid admin Discord IDs produce no content or employee ping',async t=>{
 let sent;const s=await server(t,{employees:{get:()=>({employees:[{id:'test-one',name:'Test Employee',discordId:'@everyone'}]})},client:{channels:{fetch:async()=>({send:async message=>{sent=message;}})}}});
 await s.post(body);assert.equal(sent.content,undefined);assert.deepEqual(sent.allowedMentions,{parse:[],users:[]});
});
test('fallback contains only the main request and no monthly or policy embeds',()=>{const embeds=require('../attendanceDiscord').fallbackEmbeds(record(),[{date:'2026-10-14',type:'late'}]);assert.equal(embeds.length,1);assert.equal(embeds[0].title,'Coming Late');});


test('saved Call Off / Sick requests immediately update Schedule even when Discord delivery fails',async t=>{
 const s=await server(t,{client:{channels:{fetch:async()=>{throw Error('Offline fixture');}}}});
 const response=await s.post({...body,type:'sick'});assert.equal(response.status,201);const result=await response.json();assert.equal(result.notificationPending,true);
 const day=JSON.parse(s.db.prepare('SELECT data FROM staff_schedule_days WHERE date=?').get(body.date).data);assert.equal(day.assignments['test-one'].code,'CS');assert.equal(day.assignments['test-one'].color,'#000000');
 const revision=s.db.prepare('SELECT revision FROM staff_schedule_days WHERE date=?').get(body.date).revision;await s.post({...body,type:'sick'});assert.equal(s.db.prepare('SELECT revision FROM staff_schedule_days WHERE date=?').get(body.date).revision,revision);
});
