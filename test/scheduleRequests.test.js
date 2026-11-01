const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3');
const {registerStaffSchedule}=require('../has/server/staffSchedule'),{createEmployeeStore}=require('../has/server/employees'),{applyAttendanceToSchedule}=require('../has/server/scheduleRequests');
const DATE='2026-11-06',add=require('../has/public/schedule-summary').addDays;
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT)');
 const rows=[['one','Alice','Agent'],['two','Bob','Agent'],['three','Charlie','Agent'],['sup','Sue','Supervisor'],['test','Test','Agent'],['other','Outside','Agent']].map(([id,name,position],i)=>({id,name:id+' full name',nickname:name,eid:String(1000+i),position,station:'LAX',account:id==='other'?'CZ':'MU',loginId:id==='test'?'test@hm.com':''}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},app=express();app.use(express.json());const service=registerStaffSchedule(app,{now:()=>new Date('2026-10-29T18:00:00Z'),employees,profiles:{linked:u=>employees.get().employees.find(e=>e.id===u.uid)},authenticate:async req=>{if(!req.headers.authorization)throw Error('Sign in');return {uid:req.headers.authorization};}}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api'+path,{method:body?'POST':'GET',headers:{authorization:user,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const seed=(date,assignments)=>db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,0,?)').run(date,JSON.stringify({assignments,budget:61,dateColor:'#aabbcc',labels:['Holiday']}));
 const configure=async(id,keys,secondaryHours=0)=>{const config=(await request('sup','/requests/settings?period='+DATE)).data;return request('sup','/requests/settings',{revision:config.revision,employeeId:id,period:DATE,capabilities:keys||config.shifts.map(s=>s.key),secondaryHours,shiftHours:{'K|#ffff00':8,'TK|#dddddd':8}});};
 const submit=(user,type='trade',extra={})=>request(user,'/requests',{requestId:crypto.randomUUID(),type,date:DATE,note:'Private note',...(type==='trade'?{partnerId:'two'}:{}),...(type==='off'?{days:{[extra.date||DATE]:'X'}}:{}),...extra});
 await configure('one');await configure('two');return {db,employees,request,seed,configure,submit,read:service.read,base:'http://127.0.0.1:'+server.address().port};
}
const C={code:'C',color:'#99ff00'},F={code:'F',color:'#9999ff'},D={code:'D',color:'#ffff00'},X={code:'X',color:'#ffffff'},redA={code:'A',color:'#ff0000'};
test('peer confirmation atomically exchanges same-day shifts, increments revision once, and cannot run twice',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=await f.submit('one');assert.equal(r.status,200);assert.equal(r.data.status,'awaiting_partner');assert.equal(f.read(DATE).assignments.one.code,'C');
 assert.equal((await f.request('sup','/requests/'+r.data.id,{action:'approve'})).status,403);
 assert.equal((await f.request('two','/requests/'+r.data.id,{action:'confirm'})).data.status,'approved');assert.deepEqual(f.read(DATE).assignments,{one:F,two:C});assert.equal(f.read(DATE).revision,1);
 assert.equal((await f.request('two','/requests/'+r.data.id,{action:'confirm'})).status,409);
});
test('request visibility is limited to requester, addressed trade partner, and Supervisor+; pending is private',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one')).data;
 for(const user of ['one','two','sup']){const list=(await f.request(user,'/requests')).data;assert.equal(list.pending,1);assert(list.requests.some(item=>item.id===r.id));}
 const outsider=(await f.request('three','/requests')).data;assert.equal(outsider.pending,0);assert.equal(outsider.requests.length,0);assert.equal((await f.request('three','/requests/'+r.id,{action:'confirm'})).status,404);
 assert.equal((await f.request('one','/requests/settings')).status,403);assert.equal((await f.request('other','/requests')).status,403);
 const preview=(await f.request('sup','/requests?view=self')).data;assert.equal(preview.canManage,false);assert.equal(preview.requests.length,0);
});
test('six working days requires partner confirmation followed by supervisor approval',async t=>{
 const f=await fixture(t);for(let i=0;i<5;i++)f.seed(add(DATE,i),{one:C});f.seed(add(DATE,5),{one:C,two:F});const date=add(DATE,5),r=(await f.submit('one','trade',{date})).data;
 const confirmed=await f.request('two','/requests/'+r.id,{action:'confirm'});assert.equal(confirmed.data.status,'awaiting_supervisor');assert.match(confirmed.data.approvalReasons[0],/6 working days/);assert.equal(f.read(date).assignments.one.code,'C');
 assert.equal((await f.request('one','/requests/'+r.id,{action:'approve'})).status,403);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve'})).data.status,'approved');assert.equal(f.read(date).assignments.one.code,'F');
});
test('seven working days are rejected even for a supervisor',async t=>{
 const f=await fixture(t);for(let i=0;i<6;i++)f.seed(add(DATE,i),{one:C});const date=add(DATE,6);f.seed(date,{one:C,two:F});const r=await f.submit('one','trade',{date});assert.equal(r.status,400);assert.match(r.data.error,/seven working days/);assert.equal(f.read(date).assignments.one.code,'C');
});
test('second-account hours count toward the 40-hour approval threshold, and missing hours block a trade',async t=>{
 const f=await fixture(t);const raw=JSON.parse(f.db.prepare('SELECT data FROM pbb_employees').get().data);raw.employees[0].additionalAccounts=[{station:'LAX',account:'CX'}];f.db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify(raw));
 for(let i=1;i<5;i++)f.seed(add(DATE,i),{one:D});f.seed(DATE,{one:C,two:{code:'FL',color:'#3333ff'}});
 // A new week with no external-hour declaration must not be treated as zero.
 const config=(await f.request('sup','/requests/settings?period='+DATE)).data;delete config.people.one.secondaryHours[DATE];f.db.prepare('UPDATE schedule_request_settings SET data=?').run(JSON.stringify({people:config.people,hours:config.hours}));
 assert.match((await f.submit('one')).data.error,/second-account hours/);await f.configure('one',undefined,4);const r=(await f.submit('one')).data;
 const result=await f.request('two','/requests/'+r.id,{action:'confirm'});assert.equal(result.data.status,'awaiting_supervisor');assert.match(result.data.approvalReasons[0],/44 hours/);
});
test('Arrival has one skill for all colors and eligibility is checked again at confirmation',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:redA});await f.configure('one',['C']);assert.match((await f.submit('one')).data.error,/not qualified/);
 await f.configure('one',['C','A']);assert.equal((await f.request('sup','/requests/settings')).data.shifts.filter(s=>s.code==='A').length,1);const r=(await f.submit('one')).data;await f.configure('one',['C|#99ff00']);assert.equal((await f.request('two','/requests/'+r.id,{action:'confirm'})).status,400);assert.equal(f.read(DATE).assignments.one.code,'C');
});
test('stale schedules prevent both cells from changing and preserve the request for cancellation',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one')).data;f.seed(DATE,{one:D,two:F});assert.equal((await f.request('two','/requests/'+r.id,{action:'confirm'})).status,409);assert.deepEqual(f.read(DATE).assignments,{one:D,two:F});assert.equal((await f.request('one','/requests/'+r.id,{action:'cancel'})).data.status,'cancelled');
});
test('Request Off needs approval and renders an approved red X without altering other dates or employees',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one','off')).data;assert.equal((await f.request('two','/requests/'+r.id,{action:'approve'})).status,404);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',days:{[DATE]:'X'}})).data.status,'approved');assert.equal(f.read(DATE).assignments.one.approvedOff,true);assert.equal(f.read(DATE).assignments.one.code,'X');assert.deepEqual(f.read(DATE).assignments.two,F);
});
test('I Can Work requires a qualified supervisor-selected shift; approval cannot create seven working days',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:X});const r=(await f.submit('one','work')).data;assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve'})).status,400);await f.configure('one',['F|#9999ff']);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',shift:'C|#99ff00'})).status,400);
 for(let i=1;i<=6;i++)f.seed(add(DATE,i),{one:F});assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',shift:'F|#9999ff'})).status,400);f.seed(add(DATE,6),{one:X});assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',shift:'F|#9999ff'})).data.status,'approved');
});
test('submission retries are idempotent, dates and partner restrictions are enforced, and declines do not change shifts',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const body={requestId:crypto.randomUUID(),type:'trade',date:DATE,note:'',partnerId:'two'};const first=await f.request('one','/requests',body);assert.equal((await f.request('one','/requests',body)).data.id,first.data.id);assert.equal((await f.request('one','/requests',{...body,date:add(DATE,1)})).status,409);
 assert.equal((await f.request('two','/requests/'+first.data.id,{action:'decline'})).data.status,'declined');assert.deepEqual(f.read(DATE).assignments,{one:C,two:F});assert.equal((await f.submit('one','trade',{partnerId:'other'})).status,403);assert.equal((await f.submit('one','trade',{partnerId:'one'})).status,400);
});
test('settings protect against stale edits and require explicit finite weekly hours',async t=>{
 const f=await fixture(t),config=(await f.request('sup','/requests/settings?period='+DATE)).data,body={revision:config.revision,employeeId:'one',period:DATE,capabilities:[],secondaryHours:0};assert.equal((await f.request('one','/requests/settings',body)).status,403);assert.equal((await f.request('sup','/requests/settings',{...body,secondaryHours:-1})).status,400);assert.equal((await f.request('sup','/requests/settings',body)).status,200);assert.equal((await f.request('sup','/requests/settings',body)).status,409);
});
test('attendance Call Off / Sick updates only its employee/date, is idempotent, and late requests do not change shifts',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const record={type:'sick',date:DATE,employeeId:'one',reference:'REQ-EXAMPLE'};assert.equal(applyAttendanceToSchedule({...f,record}),true);assert.deepEqual(f.read(DATE).assignments.two,F);assert.equal(f.read(DATE).assignments.one.code,'CS');assert.equal(f.read(DATE).assignments.one.color,'#000000');const revision=f.read(DATE).revision;assert.equal(applyAttendanceToSchedule({...f,record}),false);assert.equal(f.read(DATE).revision,revision);assert.equal(applyAttendanceToSchedule({...f,record:{...record,type:'late',reference:'REQ-LATE'}}),false);
});
test('deleting date appearance clears color, labels and Short settings while preserving assignments',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=await f.request('sup','',{date:DATE,revision:0,dateColor:null,labels:[],shortRoles:[]});assert.equal(r.status,200);assert.equal(r.data.dateColor,null);assert.deepEqual(r.data.labels,[]);assert.deepEqual(r.data.assignments,{one:C,two:F});
});


test('approve and deny create private persistent employee notifications with owner-only read receipts',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C});const off=(await f.submit('one','off')).data;await f.request('sup','/requests/'+off.id,{action:'approve',days:{[DATE]:'X'}});
 let inbox=(await f.request('one','/requests')).data;assert.equal(inbox.unread,1);assert.equal(inbox.notifications[0].action,'approved');assert.equal(f.read(DATE).assignments.one.color,'#ff0000');
 const notice=inbox.notifications[0];await f.request('three','/requests/notifications/read',{ids:[notice.id]});assert.equal((await f.request('one','/requests')).data.unread,1);
 await f.request('one','/requests/notifications/read',{ids:[notice.id]});assert.equal((await f.request('one','/requests')).data.unread,0);
 const work=(await f.submit('one','work')).data;await f.request('sup','/requests/'+work.id,{action:'decline'});inbox=(await f.request('one','/requests')).data;assert.equal(inbox.unread,1);assert.equal(inbox.notifications[0].action,'declined');assert.equal((await f.request('three','/requests')).data.notifications.length,0);
});


test('I Can Work is limited to X or no assignment, including server-side enforcement for sick/vacation/call-off',async t=>{
 const f=await fixture(t);for(const code of ['C','VAC','CS','CO','N']){f.seed(DATE,{one:{code,color:'#ffffff'}});const r=await f.submit('one','work');assert.equal(r.status,400);assert.match(r.data.error,/only for Rest/);}
 f.seed(DATE,{});assert.equal((await f.submit('one','work')).status,200);
});


test('team visibility excludes out-of-account legacy assignments and uses real Q work hours, not its zero budget weight',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,other:{code:'D',color:'#ffff00',remark:'Private outside-account note'}});
 const context=(await f.request('one','?schema=2&start='+DATE)).data;assert.equal(context.days[0].assignments.other,undefined);assert(!JSON.stringify(context).includes('Private outside-account note'));
 const config=(await f.request('sup','/requests/settings?period='+DATE)).data;assert.equal(config.shifts.find(s=>s.code==='Q').hours,4);
});


test('live schedule stream invalidates schedule and private request changes without exposing payloads, and revokes removed accounts',{timeout:10000},async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const controller=new AbortController();t.after(()=>controller.abort());
 const response=await fetch(f.base+'/staff-schedule-api/stream',{headers:{authorization:'one'},signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 const revision=async()=>{for(;;){const boundary=buffer.indexOf('\n\n');if(boundary>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(frame.startsWith('event: revision')){assert(!frame.includes('Private note'));return JSON.parse(frame.split('data: ')[1]).revision;}continue;}const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value);}};
 const first=await revision();const result=await f.request('sup','',{date:DATE,revision:0,employeeId:'two',code:'D',color:'#ffff00'});assert.equal(result.status,200);const second=await revision();assert.notEqual(first,second);
 await f.submit('one','off');assert.notEqual(await revision(),second);
 const data=JSON.parse(f.db.prepare('SELECT data FROM pbb_employees').get().data);data.employees.find(e=>e.id==='one').account='CZ';f.db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify(data));let ended=false;while(!ended)ended=(await reader.read()).done;assert(ended);
 assert.equal((await fetch(f.base+'/staff-schedule-api/stream')).status,401);
});


test('legacy color-specific skills merge into per-duty skills without changing weekly hours, and skill-only saves need no week',async t=>{
 const f=await fixture(t),legacy={people:{one:{capabilities:['A|#4f6200','A|#ff0000','C|#00ff00'],secondaryHours:{[DATE]:12}}},hours:{'F|#9999ff':6,'F|#6699ee':8}};
 f.db.prepare('UPDATE schedule_request_settings SET data=? WHERE id=1').run(JSON.stringify(legacy));
 const {roles,colors}=require('../has/server/staffSchedule');require('../has/server/scheduleRequests').createScheduleRequests({db:f.db,employees:f.employees,roster:()=>f.employees.get().employees,read:f.read,put:()=>{},roles,colors,today:()=>DATE});
 let config=(await f.request('sup','/requests/settings?period='+DATE)).data;assert.deepEqual(config.people.one.capabilities,['A','C']);assert.equal(config.people.one.secondaryHours[DATE],12);assert.equal(config.hours.F,8);
 const saved=await f.request('sup','/requests/settings',{revision:config.revision,employeeId:'one',capabilities:['F','B']});assert.equal(saved.status,200);config=saved.data;assert.deepEqual(config.people.one.capabilities,['F','B']);assert.equal(config.people.one.secondaryHours[DATE],12);
 assert.equal((await f.request('one','/requests/settings',{revision:config.revision,employeeId:'one',capabilities:['F']})).status,403);
});


test('request inbox retains three days of resolved results while preserving pending requests and audit data',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one','off')).data;await f.request('sup','/requests/'+r.id,{action:'decline'});
 const old=JSON.parse(f.db.prepare('SELECT data FROM schedule_requests WHERE id=?').get(r.id).data);old.updatedAt='2026-10-20T00:00:00Z';f.db.prepare('UPDATE schedule_requests SET data=? WHERE id=?').run(JSON.stringify(old),r.id);f.db.prepare('UPDATE schedule_request_notifications SET at=? WHERE request_id=?').run('2026-10-20T00:00:00Z',r.id);
 const pending=(await f.submit('one','trade')).data;const data=JSON.parse(f.db.prepare('SELECT data FROM schedule_requests WHERE id=?').get(pending.id).data);data.createdAt='2026-10-20T00:00:00Z';f.db.prepare('UPDATE schedule_requests SET data=? WHERE id=?').run(JSON.stringify(data),pending.id);
 const list=(await f.request('one','/requests')).data;assert(!list.requests.some(row=>row.id===r.id));assert(list.requests.some(row=>row.id===pending.id));assert.equal(list.unread,0);assert(f.db.prepare('SELECT 1 FROM schedule_requests WHERE id=?').get(r.id));
});
test('recurring second-account total needs no week, is supervisor-only and counts in every future period',async t=>{
 const f=await fixture(t),initial=(await f.request('sup','/requests/settings')).data;
 const body={revision:initial.revision,employeeId:'one',secondaryWeeklyHours:36};
 assert.equal((await f.request('one','/requests/settings',body)).status,403);
 for(const value of [-1,169,'8',null])assert.equal((await f.request('sup','/requests/settings',{...body,secondaryWeeklyHours:value})).status,400);
 const saved=await f.request('sup','/requests/settings',body);assert.equal(saved.status,200);assert.equal(saved.data.people.one.secondaryWeeklyHours,36);assert.deepEqual(saved.data.people.one.capabilities,initial.people.one.capabilities);
 assert.equal((await f.request('sup','/requests/settings',body)).status,409);
 for(const date of [DATE,add(DATE,7)]){f.seed(date,{one:C,two:F});const r=await f.submit('one','trade',{date});assert.equal(r.status,200);const confirmed=await f.request('two','/requests/'+r.data.id,{action:'confirm'});assert.equal(confirmed.data.status,'awaiting_supervisor');assert.match(confirmed.data.approvalReasons.join(' '),/42 hours/);assert.deepEqual(f.read(date).assignments,{one:C,two:F});}
 const config=(await f.request('sup','/requests/settings')).data;const zero=await f.request('sup','/requests/settings',{revision:config.revision,employeeId:'one',secondaryWeeklyHours:0});assert.equal(zero.status,200);assert.equal(zero.data.people.one.secondaryWeeklyHours,0);
});

test('Trade Shift rejects unscheduled and nonworking days for either participant',async t=>{
 const f=await fixture(t);
 for(const assignment of [null,X,{code:'CS',color:'#000000'},{code:'VAC',color:'#ffffff'},{code:'N',color:'#000000'},{code:'CO',color:'#dddddd'}]){for(const requester of [true,false]){f.seed(DATE,requester?{...(assignment?{one:assignment}:{}),two:F}:{one:C,...(assignment?{two:assignment}:{})});const result=await f.submit('one');assert.equal(result.status,400);assert.match(result.data.error,/scheduled working shift/);const options=(await f.request('one','/requests/trade-options?date='+DATE)).data;assert.equal(options.employees.find(p=>p.id==='two').eligible,false);}}
});

test('picker and request catalogs use the dominant saved duty color without rewriting custom cells',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:{code:'C',color:'#00ff00'},two:{code:'C',color:'#00ff00'},three:C});f.seed(add(DATE,1),{one:{code:'A',color:'#274e13'},two:{code:'A',color:'#274e13'},three:redA});
 const data=(await f.request('sup','?start='+DATE+'&schema=2')).data,config=(await f.request('sup','/requests/settings')).data;
 assert.equal(data.colors.C,'#00ff00');assert.equal(data.colors.A,'#274e13');assert.equal(config.shifts.find(s=>s.code==='C').color,data.colors.C);assert.equal(config.shifts.find(s=>s.code==='A').color,data.colors.A);assert.equal(data.colors.CS,'#000000');assert.equal(f.read(DATE).assignments.three.color,C.color);assert.equal(f.read(add(DATE,1)).assignments.three.color,redA.color);
});

test('C and Q exchange based on incoming duty skills, independent of their current duty',async t=>{
 const f=await fixture(t),Q={code:'Q',color:'#4b183c'};f.seed(DATE,{one:C,two:Q});await f.configure('one',['Q']);await f.configure('two',['C']);const options=(await f.request('one','/requests/trade-options?date='+DATE)).data.employees;assert.equal(options.find(p=>p.id==='two').eligible,true);assert.equal(options.find(p=>p.id==='two').requiresSupervisorApproval,false);const r=await f.submit('one');assert.equal(r.status,200);const confirmed=await f.request('two','/requests/'+r.data.id,{action:'confirm'});assert.equal(confirmed.data.status,'approved');assert.deepEqual(f.read(DATE).assignments,{one:Q,two:C});
});
test('C and either color A need peer confirmation then one Supervisor approval',async t=>{
 const f=await fixture(t);await f.configure('one',['A']);await f.configure('two',['C']);for(const [i,color] of ['#ff0000','#274e13'].entries()){const date=add(DATE,i),A={code:'A',color};f.seed(date,{one:C,two:A});const option=(await f.request('one','/requests/trade-options?date='+date)).data.employees.find(p=>p.id==='two');assert.equal(option.eligible,true);assert.equal(option.requiresSupervisorApproval,true);const r=await f.submit('one','trade',{date});assert.equal(r.status,200);assert.equal((await f.request('sup','/requests/'+r.data.id,{action:'approve'})).status,403);const peer=await f.request('two','/requests/'+r.data.id,{action:'confirm'});assert.equal(peer.data.status,'awaiting_supervisor');assert.match(peer.data.approvalReasons.join(' '),/Arrival/);assert.deepEqual(f.read(date).assignments,{one:C,two:A});assert.equal((await f.request('three','/requests/'+r.data.id,{action:'approve'})).status,404);const approved=await f.request('sup','/requests/'+r.data.id,{action:'approve'});assert.equal(approved.data.status,'approved');assert.deepEqual(f.read(date).assignments,{one:A,two:C});assert.equal((await f.request('sup','/requests/'+r.data.id,{action:'approve'})).status,409);}
});
test('A trade approval rechecks both qualifications and any Supervisor can finish it once',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:redA,two:C});await f.configure('one',['C']);await f.configure('two',['A']);const r=(await f.submit('one')).data;assert.equal((await f.request('two','/requests/'+r.id,{action:'confirm'})).data.status,'awaiting_supervisor');await f.configure('two',[]);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve'})).status,400);assert.deepEqual(f.read(DATE).assignments,{one:redA,two:C});await f.configure('two',['A']);const data=JSON.parse(f.db.prepare('SELECT data FROM pbb_employees').get().data);data.employees.find(p=>p.id==='three').position='Supervisor';f.db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify(data));assert.equal((await f.request('three','/requests/'+r.id,{action:'approve'})).data.status,'approved');assert.equal(f.read(DATE).assignments.two.code,'A');assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM schedule_request_audit WHERE request_id=? AND action='applied'").get(r.id).n,1);
});

test('trade options omit identical no-op shifts but retain qualified different duties',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:C});assert.equal((await f.request('one','/requests/trade-options?date='+DATE)).data.employees.find(p=>p.id==='two').eligible,false);assert.equal((await f.submit('one')).status,400);f.seed(DATE,{one:C,two:{code:'Q',color:'#4b183c'}});assert.equal((await f.request('one','/requests/trade-options?date='+DATE)).data.employees.find(p=>p.id==='two').eligible,true);
});


test('revision checks share the initial snapshot token, stay unchanged when idle and require schedule access',async t=>{
 const f=await fixture(t);
 f.seed(DATE,{one:C,two:F});const snapshot=(await f.request('one')).data;
 const check=()=>f.request('one','/revision');
 const first=await check();assert.equal(first.status,200);assert.deepEqual(first.data,{revision:snapshot.liveRevision});
 assert.deepEqual((await check()).data,first.data);
 assert.equal((await f.submit('one','off')).status,200);
 const next=await check();assert.notEqual(next.data.revision,first.data.revision);assert.deepEqual(Object.keys(next.data),['revision']);
 assert.deepEqual((await check()).data,next.data);
 assert.equal((await fetch(f.base+'/staff-schedule-api/revision')).status,401);
});

for(const category of ['report_time','forgot_punch','forgot_punch_meal','request_fix_time','cross_account_call_in'])test(category+' reports accept past dates, remain private, and notify supervisors without approval or changing duties',async t=>{
 const f=await fixture(t);const date='2026-10-20';f.seed(date,{one:C});
 const body={requestId:crypto.randomUUID(),type:'timesheet',date,category,note:category==='cross_account_call_in'?'Called in to support CZ, 09:00–13:00':'Meal ended at 13:30'};
 const first=await f.request('one','/requests',body);assert.equal(first.status,200);assert.equal(first.data.status,'notified');assert.equal(first.data.category,category);
 assert.equal((await f.request('one','/requests',body)).data.id,first.data.id);
 assert.equal((await f.request('one','/requests',{...body,category:'invalid'})).status,409);
 assert.equal((await f.request('three','/requests')).data.requests.length,0);
 assert.equal((await f.request('three','/requests/'+first.data.id,{action:'approve'})).status,404);
 assert.equal((await f.request('one','/requests/'+first.data.id,{action:'approve'})).status,409);
 const manager=(await f.request('sup','/requests')).data;assert.equal(manager.requests[0].canApprove,false);assert.equal(manager.requests[0].category,category);
 assert.equal((await f.request('sup','/requests/'+first.data.id,{action:'approve'})).status,409);assert.deepEqual(f.read(date).assignments,{one:C});
 assert.equal((await f.request('sup','/requests/'+first.data.id,{action:'approve'})).status,409);
 const inbox=(await f.request('sup','/requests')).data;assert.equal(inbox.notifications[0].type,'timesheet');assert.equal(inbox.notifications[0].action,'notified');assert.equal(inbox.unread,1);assert.equal(inbox.pending,0);
});
test('timesheet options and reasons are validated, and reports coexist with schedule requests',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C});await f.submit('one','off');
 for(const extra of [{category:'invalid'},{note:'   '},{date:'2026-02-30'}])assert.equal((await f.submit('one','timesheet',{category:'report_time',...extra})).status,400);
 const result=await f.submit('one','timesheet',{category:'request_fix_time'});assert.equal(result.status,200);
 assert.equal((await f.request('sup','/requests/'+result.data.id,{action:'decline'})).status,409);assert.deepEqual(f.read(DATE).assignments,{one:C});
 assert.equal((await f.request('sup','/requests')).data.notifications[0].type,'timesheet');
});

test('Request Off ranges keep applicant choices, require a second review and atomically apply mixed X/VAC days',async t=>{
 const f=await fixture(t),end=add(DATE,2),days={[DATE]:'X',[add(DATE,1)]:'VAC',[end]:'X'};f.seed(DATE,{one:C,two:F});f.seed(add(DATE,1),{one:D});
 const body={requestId:crypto.randomUUID(),type:'off',date:DATE,endDate:end,note:'Family trip; CTO on Saturday',days};
 const created=await f.request('one','/requests',body);assert.equal(created.status,200);assert.deepEqual(created.data.requestedDays,days);assert.equal(created.data.endDate,end);
 assert.equal((await f.request('one','/requests',body)).data.id,created.data.id);
 assert.equal((await f.request('one','/requests',{...body,days:{...days,[DATE]:'VAC'}})).status,409);
 assert.equal((await f.request('sup','/requests/'+created.data.id,{action:'approve'})).status,400);
 assert.equal((await f.request('sup','/requests/'+created.data.id,{action:'approve',days:{[DATE]:'X'}})).status,400);assert.deepEqual(f.read(DATE).assignments,{one:C,two:F});
 const result=await f.request('sup','/requests/'+created.data.id,{action:'approve',days});assert.equal(result.data.status,'approved');assert.deepEqual(result.data.approvedDays,days);
 for(const [date,code] of Object.entries(days)){assert.equal(f.read(date).assignments.one.code,code);assert.equal(f.read(date).assignments.one.approvedOff,true);}assert.deepEqual(f.read(DATE).assignments.two,F);
 assert.equal((await f.request('one','/requests')).data.notifications[0].endDate,end);
});
test('Request Off validates range choices, blocks overlaps, and rolls back every day when one snapshot is stale',async t=>{
 const f=await fixture(t),end=add(DATE,1),days={[DATE]:'X',[end]:'VAC'};f.seed(DATE,{one:C});f.seed(end,{one:D});
 for(const extra of [{days:{}},{days:{...days,[end]:'CTO'}},{endDate:add(DATE,-1)},{endDate:add(DATE,367)}])assert.equal((await f.submit('one','off',{endDate:end,days,...extra})).status,400);
 const r=(await f.submit('one','off',{endDate:end,days})).data;
 assert.equal((await f.submit('one','off',{date:end})).status,409);
 f.seed(end,{one:F});assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',days})).status,409);assert.deepEqual(f.read(DATE).assignments,{one:C});assert.deepEqual(f.read(end).assignments,{one:F});
 assert.equal((await f.request('one','/requests/'+r.id,{action:'cancel'})).data.status,'cancelled');assert.deepEqual(f.read(DATE).assignments,{one:C});
});
test('all Supervisors can review Request Off even without schedule editing; delegated Agents cannot approve it',async t=>{
 const f=await fixture(t);const current=f.employees.get();f.db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify({...current,employees:current.employees.map(p=>p.id==='sup'?{...p,permissionOverrides:{'schedule.edit':false}}:p.id==='three'?{...p,permissionOverrides:{'schedule.edit':true}}:p)}));
 f.seed(DATE,{one:C});const r=(await f.submit('one','off')).data;
 assert.equal((await f.request('sup','/requests')).data.requests.find(p=>p.id===r.id).canApprove,true);
 assert([403,404].includes((await f.request('three','/requests/'+r.id,{action:'approve',days:{[DATE]:'X'}})).status));
 assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve',days:{[DATE]:'VAC'}})).data.status,'approved');assert.equal(f.read(DATE).assignments.one.code,'VAC');
});
