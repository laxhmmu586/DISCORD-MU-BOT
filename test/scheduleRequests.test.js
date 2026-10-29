const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3');
const {registerStaffSchedule}=require('../staffSchedule'),{createEmployeeStore}=require('../employees'),{applyAttendanceToSchedule}=require('../scheduleRequests');
const DATE='2026-11-06',add=require('../public/public/schedule-summary').addDays;
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT)');
 const rows=[['one','Alice','Agent'],['two','Bob','Agent'],['three','Charlie','Agent'],['sup','Sue','Supervisor'],['test','Test','Agent'],['other','Outside','Agent']].map(([id,name,position],i)=>({id,name:id+' full name',nickname:name,eid:String(1000+i),position,station:'LAX',account:id==='other'?'CZ':'MU',loginId:id==='test'?'test@hm.com':''}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},app=express();app.use(express.json());const service=registerStaffSchedule(app,{now:()=>new Date('2026-10-29T18:00:00Z'),employees,profiles:{linked:u=>employees.get().employees.find(e=>e.id===u.uid)},authenticate:async req=>{if(!req.headers.authorization)throw Error('Sign in');return {uid:req.headers.authorization};}}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api'+path,{method:body?'POST':'GET',headers:{authorization:user,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const seed=(date,assignments)=>db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,0,?)').run(date,JSON.stringify({assignments,budget:61,dateColor:'#aabbcc',labels:['Holiday']}));
 const configure=async(id,keys,secondaryHours=0)=>{const config=(await request('sup','/requests/settings?period='+DATE)).data;return request('sup','/requests/settings',{revision:config.revision,employeeId:id,period:DATE,capabilities:keys||config.shifts.map(s=>s.key),secondaryHours,shiftHours:{'K|#ffff00':8,'TK|#dddddd':8}});};
 const submit=(user,type='trade',extra={})=>request(user,'/requests',{requestId:crypto.randomUUID(),type,date:DATE,note:'Private note',...(type==='trade'?{partnerId:'two'}:{}),...extra});
 await configure('one');await configure('two');return {db,employees,request,seed,configure,submit,read:service.read};
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
 const f=await fixture(t);for(let i=0;i<5;i++)f.seed(add(DATE,i),{one:C});f.seed(add(DATE,5),{one:X,two:F});const date=add(DATE,5),r=(await f.submit('one','trade',{date})).data;
 const confirmed=await f.request('two','/requests/'+r.id,{action:'confirm'});assert.equal(confirmed.data.status,'awaiting_supervisor');assert.match(confirmed.data.approvalReasons[0],/6 working days/);assert.equal(f.read(date).assignments.one.code,'X');
 assert.equal((await f.request('one','/requests/'+r.id,{action:'approve'})).status,403);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve'})).data.status,'approved');assert.equal(f.read(date).assignments.one.code,'F');
});
test('seven working days are rejected even for a supervisor',async t=>{
 const f=await fixture(t);for(let i=0;i<6;i++)f.seed(add(DATE,i),{one:C});const date=add(DATE,6);f.seed(date,{one:X,two:F});const r=await f.submit('one','trade',{date});assert.equal(r.status,400);assert.match(r.data.error,/seven working days/);assert.equal(f.read(date).assignments.one.code,'X');
});
test('second-account hours count toward the 40-hour approval threshold, and missing hours block a trade',async t=>{
 const f=await fixture(t);const raw=JSON.parse(f.db.prepare('SELECT data FROM pbb_employees').get().data);raw.employees[0].additionalAccounts=[{station:'LAX',account:'CX'}];f.db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify(raw));
 for(let i=1;i<5;i++)f.seed(add(DATE,i),{one:D});f.seed(DATE,{one:C,two:{code:'FL',color:'#3333ff'}});
 // A new week with no external-hour declaration must not be treated as zero.
 const config=(await f.request('sup','/requests/settings?period='+DATE)).data;delete config.people.one.secondaryHours[DATE];f.db.prepare('UPDATE schedule_request_settings SET data=?').run(JSON.stringify({people:config.people,hours:config.hours}));
 assert.match((await f.submit('one')).data.error,/second-account hours/);await f.configure('one',undefined,4);const r=(await f.submit('one')).data;
 const result=await f.request('two','/requests/'+r.id,{action:'confirm'});assert.equal(result.data.status,'awaiting_supervisor');assert.match(result.data.approvalReasons[0],/44 hours/);
});
test('red and green Arrival are distinct qualifications and eligibility is checked again at confirmation',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:redA});await f.configure('one',['C|#99ff00','A|#4f6200']);assert.match((await f.submit('one')).data.error,/not qualified/);
 await f.configure('one',['C|#99ff00','A|#ff0000']);const r=(await f.submit('one')).data;await f.configure('one',['C|#99ff00']);assert.equal((await f.request('two','/requests/'+r.id,{action:'confirm'})).status,400);assert.equal(f.read(DATE).assignments.one.code,'C');
});
test('stale schedules prevent both cells from changing and preserve the request for cancellation',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one')).data;f.seed(DATE,{one:D,two:F});assert.equal((await f.request('two','/requests/'+r.id,{action:'confirm'})).status,409);assert.deepEqual(f.read(DATE).assignments,{one:D,two:F});assert.equal((await f.request('one','/requests/'+r.id,{action:'cancel'})).data.status,'cancelled');
});
test('Request Off needs approval and renders an approved red X without altering other dates or employees',async t=>{
 const f=await fixture(t);f.seed(DATE,{one:C,two:F});const r=(await f.submit('one','off')).data;assert.equal((await f.request('two','/requests/'+r.id,{action:'approve'})).status,404);assert.equal((await f.request('sup','/requests/'+r.id,{action:'approve'})).data.status,'approved');assert.equal(f.read(DATE).assignments.one.approvedOff,true);assert.equal(f.read(DATE).assignments.one.code,'X');assert.deepEqual(f.read(DATE).assignments.two,F);
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
 const f=await fixture(t);f.seed(DATE,{one:C});const off=(await f.submit('one','off')).data;await f.request('sup','/requests/'+off.id,{action:'approve'});
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
