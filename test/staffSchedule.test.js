const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerStaffSchedule}=require('../staffSchedule'),{createEmployeeStore}=require('../employees');
async function fixture(t){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO employee_avatars VALUES(?,?)').run('agent','data:image/png;base64,photo');
 const rows=[['agent','Agent','LAX','MU'],['peer','Agent','LAX','MU'],['lead','Lead','LAX','MU'],['sup','Supervisor','LAX','MU'],['regional','Regional Manager','LAX','MU'],['other','Supervisor','LAX','CZ'],['station','Supervisor','SFO','MU']].map(([id,position,station,account],i)=>({id,name:id+' employee',eid:String(1000+i),code:'',position,station,account,attach:false,detach:false,spotter:false}));
 rows[5].additionalAccounts=[{station:'LAX',account:'MU'}];rows.push(...['DEMO HAS','HAS OPS RAMP'].map((name,i)=>({id:'blocked'+i,name,eid:'999'+i,position:'Supervisor',station:'LAX',account:'MU',attach:false,detach:false,spotter:false})));
 const employees={...createEmployeeStore(db,{seed:rows}),db},app=express();app.use(express.json());const service=registerStaffSchedule(app,{sync:false,employees,profiles:{linked:u=>employees.get().employees.find(e=>e.id===u.uid)},authenticate:async req=>{if(!req.headers.authorization)throw Error();return {uid:req.headers.authorization,email:'test@example.test'};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,body,start='2026-10-26',suffix='',schema='2')=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api'+suffix+(body?'':'?start='+start+(schema?'&schema='+schema:'')),{method:body?'POST':'GET',headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};return {request,employees,db};
}
test('ordinary staff and Leads receive only their own assignments and photo, with no team totals or budgets',async t=>{
 const {request}=await fixture(t);await request('sup',{date:'2026-10-26',revision:0,employeeId:'peer',code:'VAC',color:'#fff2cc'});await request('sup',{date:'2026-10-26',revision:1,employeeId:'agent',code:'X',color:'#ffffff'});await request('sup',{date:'2026-10-26',revision:2,budget:62});
 for(const user of ['agent','lead']){const {data,status}=await request(user);assert.equal(status,200);assert.equal(data.canViewAll,false);assert.deepEqual(data.employees.map(e=>e.id),[user]);for(const key of ['planned','budget','revision'])assert.equal(data.days[0][key],undefined);assert.equal(data.dailyBudget,undefined);assert(!JSON.stringify(data).includes('peer employee'));assert(!data.days[0].assignments.peer);if(user==='agent'){assert.equal(data.days[0].assignments.agent.code,'X');assert.equal(data.employees[0].avatar,'data:image/png;base64,photo');}}
});
test('Supervisor/global edits persist, reject stale versions, and recalculate Daily Hour independently of budget',async t=>{
 const {request}=await fixture(t);for(const role of ['sup','regional']){const result=await request(role);assert.equal(result.data.canViewAll,true);assert.equal(result.data.dailyBudget,61);assert(result.data.employees.length>1);assert.equal(result.data.days[0].planned,0);assert.equal(result.data.days[0].budget,61);}
 const body={date:'2026-10-26',revision:0,employeeId:'agent',code:'CL',color:'#123456'};assert.equal((await request('sup',body)).data.planned,8);assert.equal((await request('sup',body)).status,409);assert.deepEqual((await request('sup')).data.days[0].assignments.agent,{code:'CL',color:'#123456'});
 assert.equal((await request('sup',{date:'2026-10-26',revision:1,budget:65})).status,200);const day=(await request('sup')).data.days[0];assert.equal(day.planned,8);assert.equal(day.budget,65);
 assert.equal((await request('sup',{date:day.date,revision:2,employeeId:'peer',code:'GS',color:'#9371c7'})).data.planned,12);
});
test('other stations/accounts and anonymous callers cannot read or write; own-schedule users cannot edit',async t=>{
 const {request}=await fixture(t);for(const user of ['other','station',null]){const code=user?403:401;assert.equal((await request(user)).status,code);assert.equal((await request(user,{date:'2026-10-26',revision:0,employeeId:'agent',code:'F',color:'#9999ff'})).status,code);}
 for(const user of ['agent','lead']){assert.equal((await request(user,{date:'2026-10-26',revision:0,budget:62})).status,403);assert.equal((await request(user,{employeeId:'peer',code:'1',currentCode:''},undefined,'/code')).status,403);}
});
test('code editor updates the existing hidden code field while preserving EID and protecting stale edits',async t=>{
 const {request,employees}=await fixture(t),before=employees.get().employees.find(e=>e.id==='agent');
 const body={employeeId:'agent',code:' 24110 ',currentCode:'',eid:'99999',name:'Wrong name'};assert.equal((await request('sup',body,undefined,'/code')).status,200);
 const after=employees.get().employees.find(e=>e.id==='agent');assert.equal(after.code,'24110');assert.equal(after.eid,before.eid);assert.equal(after.name,before.name);assert.equal((await request('sup',body,undefined,'/code')).status,409);
 const personal=(await request('agent')).data.employees[0];assert.equal(personal.code,'24110');assert.equal(personal.eid,undefined);
 assert.equal((await request('sup',{employeeId:'station',code:'1',currentCode:''},undefined,'/code')).status,403);
 for(const code of ['x'.repeat(41),'line\nbreak',null])assert.equal((await request('sup',{employeeId:'agent',code,currentCode:'24110'},undefined,'/code')).status,400);
});
test('invalid dates, duties, colors and budgets cannot enter the schedule; manual Daily Hour is rejected',async t=>{
 const {request,db}=await fixture(t);assert.equal((await request('sup',undefined,'2026-02-30')).status,400);const base={date:'2026-10-26',revision:0,employeeId:'agent',code:'F',color:'#9999ff'};for(const change of [{code:'bad'},{color:'red'},{employeeId:'station'},{date:'2026-02-30'}])assert.equal((await request('sup',{...base,...change})).status,400);
 for(const budget of [-1,'61',100001,null])assert.equal((await request('sup',{date:'2026-10-26',revision:0,budget})).status,400);
 assert.equal((await request('sup',{date:'2026-10-26',revision:0,planned:999})).status,400);assert.equal((await request('sup')).data.days[0].revision,0);
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,?,?)').run('2026-10-26',1,JSON.stringify({assignments:{},planned:999}));const legacy=(await request('sup')).data.days[0];assert.equal(legacy.planned,0);assert.equal(legacy.budget,61);
});
test('range pastes are atomic, scoped and revision checked; blank pastes clear cells and totals recalculate',async t=>{
 const {request}=await fixture(t),a='2026-10-26',b='2026-10-27',body={revisions:{[a]:0,[b]:0},changes:[{date:a,employeeId:'agent',code:'D',color:'#123456'},{date:b,employeeId:'peer',code:'F',color:'#9999ff'}]};
 assert.equal((await request('agent',body,undefined,'/paste')).status,403);
 const invalid={...body,changes:[body.changes[0],{...body.changes[1],code:'invalid'}]};assert.equal((await request('sup',invalid,undefined,'/paste')).status,400);assert.equal((await request('sup')).data.days[0].revision,0);
 const saved=await request('sup',body,undefined,'/paste');assert.equal(saved.status,200);assert.deepEqual(saved.data.days.map(day=>day.planned),[8,6]);assert.equal((await request('sup',body,undefined,'/paste')).status,409);
 const conflict={...body,revisions:{[a]:1,[b]:0},changes:[{...body.changes[0],code:'CL'},body.changes[1]]};assert.equal((await request('sup',conflict,undefined,'/paste')).status,409);assert.equal((await request('sup')).data.days[0].assignments.agent.code,'D');
 assert.equal((await request('sup',{revisions:{[a]:1},changes:[{date:a,employeeId:'agent',code:null}]},undefined,'/paste')).data.days[0].planned,0);
});
test('excluded service accounts cannot access any schedule and never appear in the team roster',async t=>{const {request}=await fixture(t);const context=(await request('sup')).data;assert(!context.employees.some(e=>e.id.startsWith('blocked')));for(const id of ['blocked0','blocked1'])assert.equal((await request(id)).status,403);});
test('partial live periods retain folded days in Friday–Thursday statistics; history is bounded to one month',async t=>{
 const {request}=await fixture(t);await request('sup',{date:'2026-10-23',revision:0,employeeId:'agent',code:'D',color:'#ffff00'});await request('sup',{date:'2026-10-27',revision:0,employeeId:'agent',code:'C',color:'#99ff00'});
 const live=(await request('sup',undefined,'2026-10-27')).data;assert.equal(live.days[0].date,'2026-10-27');assert.equal(live.periods[0].start,'2026-10-23');assert.equal(live.periods[0].total,52);assert.equal(live.periods[0].budget,427);
 const history=(await request('sup',undefined,'2026-10-27&month=2026-10')).data;assert.equal(history.days.length,31);assert.equal(history.days[0].date,'2026-10-01');assert.equal(history.days.at(-1).date,'2026-10-31');const personal=(await request('agent',undefined,'2026-10-27&month=2026-10')).data;assert.equal(personal.periods,undefined);assert.equal(personal.days[0].budget,undefined);
});
test('date appearance is editable only by managers and visible without team totals to individual employees',async t=>{
 const {request}=await fixture(t),body={date:'2026-10-27',revision:0,dateColor:'#aaffaa',labels:['Holiday','Double pay']};assert.equal((await request('agent',body)).status,403);assert.equal((await request('sup',body)).status,200);const own=(await request('agent',undefined,'2026-10-27')).data.days[0];assert.equal(own.dateColor,'#aaffaa');assert.deepEqual(own.labels,['Holiday','Double pay']);assert.equal(own.planned,undefined);
});
test('months extend the live horizon one calendar month at a time, including a year boundary',async t=>{
 const {request}=await fixture(t),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let context=(await request('sup',undefined,today)).data;
 assert.equal((await request('agent',{expectedEnd:context.horizon},undefined,'/months')).status,403);
 for(let i=0;i<3;i++){const previous=context.horizon,result=await request('sup',{expectedEnd:previous},undefined,'/months');assert.equal(result.status,200);assert(result.data.end>previous);context=(await request('sup',undefined,today)).data;assert.equal(context.days[0].date,today);assert.equal(context.days.at(-1).date,result.data.end);assert.equal((await request('sup',{expectedEnd:previous},undefined,'/months')).status,409);}
});

test('legacy cached clients cap at fourteen dates; updated clients retain future months',async t=>{const {request,db}=await fixture(t);db.prepare('UPDATE staff_schedule_sync_settings SET data=? WHERE id=1').run(JSON.stringify({enabled:false,horizon:'2027-04-08'}));for(const user of ['sup','agent']){const old=(await request(user,undefined,'2026-10-27','',null)).data,current=(await request(user)).data;assert.equal(old.days.length,14);assert.equal(old.horizon,'2027-04-08');assert(current.days.length>150);assert.equal(current.days.at(-1).date,'2027-04-08');}});
