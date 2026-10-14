const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {validate,createSheetsStorage,registerAttendance,HEADERS}=require('../attendanceRequests');
const employees={get:()=>({employees:[{id:'test-one',name:'Test Employee',email:'private@example.com',eid:'123',phone:'555',discordId:'123456789012345678'}]})};
const body={requestId:'11111111-1111-4111-8111-111111111111',employeeId:'test-one',type:'late',date:'2026-10-14',arrivalTime:'10:15',scheduledStart:'08:00',reason:'Traffic',note:''};
const record=()=>({...validate(body,employees),submittedAt:'2026-10-14T15:45:00Z'});
function mockSheets(headers=[]){let rows=headers.length?[headers]:[],appends=0,updates=0;return{rows:()=>rows,appends:()=>appends,updates:()=>updates,spreadsheets:{get:async args=>{assert.equal(args.spreadsheetId,'12tZLWvQin1bhbWvALdnlAxkR0iD_6ScUVWEnL6IziDY');return{data:{sheets:[{properties:{sheetId:999,title:'Wrong tab'}},{properties:{sheetId:580541604,title:"Attendance's"}}]}};},values:{get:async()=>({data:{values:structuredClone(rows)}}),update:async args=>{assert.match(args.range,/^'Attendance''s'!A1:/);rows[0]=args.requestBody.values[0];updates++;},append:async args=>{assert.equal(args.valueInputOption,'RAW');assert.match(args.range,/^'Attendance''s'!/);rows.push(...args.requestBody.values);appends++;}}}};}
test('validation uses current employee name and rejects unknown employees, dates and times',()=>{assert.equal(validate({...body,employeeName:'Forged'},employees).employeeName,'Test Employee');for(const patch of [{employeeId:'missing'},{type:'x'},{date:'2026-02-30'},{arrivalTime:'24:00'},{reason:[]},{note:'x'.repeat(1001)},{requestId:'x'}])assert.throws(()=>validate({...body,...patch},employees));});
test('both request types reject absent, blank and whitespace-only reasons',()=>{for(const type of ['late','sick'])for(const reason of [undefined,'','   ','\n\t'])assert.throws(()=>validate({...body,type,reason},employees),/explain why|provide a reason/);assert.equal(validate({...body,reason:'  Traffic  '},employees).reason,'Traffic');});
test('scheduled start is discarded even when supplied by an older client',()=>{assert.equal(validate(body,employees).scheduledStart,'');assert.equal(validate({...body,scheduledStart:'invalid'},employees).scheduledStart,'');});
test('sick requests do not retain arrival or scheduled start',()=>{const r=validate({...body,type:'sick'},employees);assert.equal(r.arrivalTime,'');assert.equal(r.scheduledStart,'');});
test('Sheets initializes an empty target and concurrent retries append once',async()=>{const sheets=mockSheets(),store=createSheetsStorage({sheets}),r=record();const saved=await Promise.all([store.save(r),store.save({...r,submittedAt:'2026-10-14T16:00:00Z'})]);assert.equal(sheets.appends(),1);assert.equal(sheets.updates(),1);assert.equal(saved[1].record.submittedAt,r.submittedAt);assert.equal(saved[1].duplicate,true);assert.equal(saved[1].history.length,1);assert.deepEqual(sheets.rows()[0],HEADERS);});
test('Sheets preserves Google Form column order and stores formula-like text as RAW',async()=>{const sheets=mockSheets(['Why?','Name','Custom column','Call Type']),store=createSheetsStorage({sheets});const r={...record(),reason:'=HYPERLINK("bad")'};await store.save(r);assert.equal(sheets.rows()[1][0],r.reason);assert.equal(sheets.rows()[1][1],'Test Employee');assert.equal(sheets.rows()[1][2],'');});
test('a narrow worksheet is expanded before writing new metadata columns',async()=>{
 const sheets=mockSheets(['Timestamp','Name','Call Type']);let expanded=false;
 sheets.spreadsheets.get=async()=>({data:{sheets:[{properties:{sheetId:580541604,title:"Attendance's",gridProperties:{columnCount:3}}}]}});
 const read=sheets.spreadsheets.values.get;sheets.spreadsheets.values.get=async args=>{assert.equal(args.range,"'Attendance''s'!A:C");return read(args);};
 sheets.spreadsheets.batchUpdate=async args=>{assert.deepEqual(args.requestBody.requests,[{appendDimension:{sheetId:580541604,dimension:'COLUMNS',length:9}}]);expanded=true;};
 const update=sheets.spreadsheets.values.update;sheets.spreadsheets.values.update=async args=>{assert.equal(expanded,true);return update(args);};
 await createSheetsStorage({sheets}).save(record());assert.equal(sheets.appends(),1);
});
test('same request UUID cannot silently change employee, date or details',async()=>{const sheets=mockSheets(),store=createSheetsStorage({sheets}),r=record();await store.save(r);await assert.rejects(store.save({...r,date:'2026-10-15',reference:r.reference.replace('20261014','20261015')}),/already used/);await assert.rejects(store.save({...r,reason:'Changed'}),/already used/);assert.equal(sheets.appends(),1);});
test('monthly history includes only the selected employee and month',async()=>{const sheets=mockSheets(),store=createSheetsStorage({sheets}),r=record();await store.save({...r,id:'previous',reference:'REQ-PREVIOUS',date:'2026-09-30'});await store.save({...r,id:'other',reference:'REQ-OTHER',employeeId:'other'});const result=await store.save(r);assert.equal(result.history.length,1);});
async function server(t,overrides={}){const app=express();app.use(express.json());const db=new Database(':memory:');const service=registerAttendance(app,{employees,db,client:{channels:{fetch:async()=>({send:async()=>{}})}},storage:{save:async r=>({record:r,history:[r]})},renderCards:async()=>[],...overrides});const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));t.after(()=>{service.close();listener.close();db.close();});const base='http://127.0.0.1:'+listener.address().port;return{get:path=>fetch(base+path),post:b=>fetch(base+'/attendance-api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),db,service};}
test('public employee endpoint exposes only names and internal selection IDs',async t=>{const s=await server(t),r=await s.get('/attendance-api/employees');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(await r.json(),{employees:[{id:'test-one',name:'Test Employee'}]});});
test('unavailable image dependencies cannot prevent employee API startup or Sheets saves',async t=>{
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
 const {createEmployeeStore,registerEmployees}=require('../employees');
 const db=new Database(':memory:'),store=createEmployeeStore(db,{seed:[{id:'one',name:'Original Employee',eid:'',discordId:'',attach:false,detach:false,spotter:false}]});
 const app=express();app.use(express.json());registerEmployees(app,{store,authenticate:async()=>({email:'lake@mu.com'})});
 const service=registerAttendance(app,{employees:store,db,storage:{},renderCards:async()=>[],client:{}});
 const listener=app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
 t.after(()=>{service.close();listener.close();db.close();});const base='http://127.0.0.1:'+listener.address().port;
 const admin=await(await fetch(base+'/employee-admin-api')).json();admin.employees[0].name='Updated Employee';admin.employees[0].email='private@example.com';
 admin.employees.push({id:'new',name:'New Employee',eid:'002',discordId:'',phone:'555',email:'other@example.com',attach:false,detach:false,spotter:false});
 assert.equal((await fetch(base+'/employee-admin-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(admin)})).status,200);
 assert.deepEqual(await(await fetch(base+'/attendance-api/employees')).json(),{employees:[{id:'one',name:'Updated Employee'},{id:'new',name:'New Employee'}]});
});
test('Sheets failure never reports success or sends Discord messages',async t=>{let sends=0;const s=await server(t,{storage:{save:async()=>{throw Error('credentials unavailable');}},client:{channels:{fetch:async()=>{sends++;}}}});const r=await s.post(body);assert.equal(r.status,503);assert.match((await r.json()).error,/Google Sheets/);assert.equal(sends,0);});
test('invalid requests never reach storage',async t=>{let writes=0;const s=await server(t,{storage:{save:async()=>{writes++;}}});assert.equal((await s.post({...body,employeeId:'unknown'})).status,400);assert.equal(writes,0);});
test('saved request with failed Discord delivery keeps durable pending job',async t=>{const s=await server(t,{client:{channels:{fetch:async()=>{throw Error('Discord unavailable');}}}});const r=await s.post(body);assert.equal(r.status,201);assert.equal((await r.json()).notificationPending,true);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,0);});
test('retrying a saved request does not resend an already delivered notification',async t=>{let sends=0;const s=await server(t,{client:{channels:{fetch:async id=>{assert.equal(id,'1365021189998903418');return{send:async message=>{assert.deepEqual(message.allowedMentions,{parse:[]});sends++;}};}}}});await s.post(body);await s.post(body);assert.equal(sends,1);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);});
test('PNG cards use separate image embeds with the requested submission heading',async t=>{
 let sends=0;const s=await server(t,{renderCards:require('../attendanceCards').renderCards,client:{channels:{fetch:async()=>({send:async message=>{sends++;assert.equal(message.content,'📋 Request Submission');assert.equal(message.files.length,3);assert.deepEqual(message.embeds,message.files.map(file=>({image:{url:'attachment://'+file.name}})));for(const file of message.files){assert.equal(file.attachment.subarray(1,4).toString(),'PNG');assert.ok(file.attachment.length>10000);}return{id:'test-png-message'};}})}}});
 const result=await s.post(body);assert.equal(result.status,201);assert.equal((await result.json()).notificationPending,false);assert.equal(sends,1);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);
});
test('image rendering failure sends three native cards and acknowledges delivery',async t=>{
 let sends=0;const s=await server(t,{renderCards:async()=>{throw Error('Cannot find module sharp');},client:{channels:{fetch:async id=>{assert.equal(id,'1365021189998903418');return {send:async message=>{sends++;assert.equal(message.files,undefined);assert.equal(message.embeds.length,3);assert.equal(message.embeds[0].title,'Coming Late');assert.equal(message.embeds[0].fields.find(f=>f.name==='Why?').value,'Traffic');assert.match(message.embeds[1].description,/2026-10-14/);assert.match(message.embeds[2].description,/6.7.21/);assert.deepEqual(message.allowedMentions,{parse:[]});}};}}}});
 const r=await s.post(body);assert.equal(r.status,201);assert.equal((await r.json()).notificationPending,false);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);
 await s.post(body);assert.equal(sends,1);
});
test('fallback send permission failure remains pending and recovers on retry',async t=>{
 let fail=true,sends=0;const s=await server(t,{renderCards:async()=>{throw Error('Image unavailable');},client:{channels:{fetch:async()=>({send:async()=>{sends++;if(fail){const e=Error('Missing Permissions');e.code=50013;throw e;}}})}}});
 const r=await s.post(body);assert.equal((await r.json()).notificationPending,true);assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,0);
 fail=false;await s.service.retryPending();assert.equal(s.db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);await s.service.retryPending();assert.equal(sends,2);
});
test('pending jobs from an earlier process recover without another Sheets submission',async()=>{
 const db=new Database(':memory:');db.exec('CREATE TABLE attendance_delivery (reference TEXT PRIMARY KEY, data TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)');const r=record();db.prepare('INSERT INTO attendance_delivery(reference,data) VALUES (?,?)').run(r.reference,JSON.stringify({record:r,history:[r]}));let sends=0;
 const service=registerAttendance(express(),{db,employees,storage:{save:()=>{throw Error('No new Sheets writes allowed');}},renderCards:async()=>{throw Error('Image unavailable');},client:{channels:{fetch:async()=>({send:async()=>{sends++;}})}}});
 try{await service.retryPending();assert.equal(sends,1);assert.equal(db.prepare('SELECT sent FROM attendance_delivery').get().sent,1);await service.retryPending();assert.equal(sends,1);}finally{service.close();db.close();}
});
test('native fallback handles maximum reasons and notes within Discord embed limits',()=>{
 const {fallbackEmbeds}=require('../attendanceDiscord');const embeds=fallbackEmbeds({...record(),reason:'*'.repeat(1000),note:'_'.repeat(1000)},Array.from({length:30},()=>record()));let total=0;for(const embed of embeds){assert.ok((embed.description||'').length<=4096);total+=(embed.title||'').length+(embed.description||'').length+(embed.footer?.text||'').length;for(const field of embed.fields||[]){assert.ok(field.value.length<=1024);total+=field.name.length+field.value.length;}}assert.ok(total<=6000);
});
test('Discord request, monthly and policy images render as PNG with escaped input',async()=>{const {renderCards}=require('../attendanceCards');const files=await renderCards({...record(),employeeName:'Test <Employee> & Co',reason:'<script> & "reason"',note:'x'.repeat(200)},[record()]);assert.equal(files.length,3);for(const f of files){assert.equal(f.attachment.subarray(1,4).toString(),'PNG');assert.ok(f.attachment.length>1000);}});
