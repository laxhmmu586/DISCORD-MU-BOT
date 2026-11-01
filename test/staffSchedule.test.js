const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerStaffSchedule}=require('../has/server/staffSchedule'),{createEmployeeStore}=require('../has/server/employees');
async function fixture(t,options={}){
 const db=new Database(':memory:');db.exec('CREATE TABLE employee_avatars(employee_id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO employee_avatars VALUES(?,?)').run('agent','data:image/png;base64,photo');
 const rows=[['agent','Agent','LAX','MU'],['peer','Agent','LAX','MU'],['lead','Lead','LAX','MU'],['sup','Supervisor','LAX','MU'],['regional','Regional Manager','LAX','MU'],['other','Supervisor','LAX','CZ'],['station','Supervisor','SFO','MU']].map(([id,position,station,account],i)=>({id,name:id+' employee',eid:String(1000+i),code:'',position,station,account,attach:false,detach:false,spotter:false}));
 rows.push({id:'second',name:'Second account',eid:'2001',attach:false,detach:false,spotter:false,position:'Agent',station:'LAX',account:'CZ',additionalAccounts:[{station:'LAX',account:'MU'}]},{id:'third',name:'Third account',eid:'2002',attach:false,detach:false,spotter:false,position:'Agent',station:'SFO',account:'CZ',additionalAccounts:[{station:'SFO',account:'AA'},{station:'LAX',account:'MU'}]});rows.push(...['DEMO HAS','HAS OPS RAMP'].map((name,i)=>({id:'blocked'+i,name,eid:'999'+i,position:'Supervisor',station:'LAX',account:'MU',attach:false,detach:false,spotter:false})));
 const employees={...createEmployeeStore(db,{seed:rows}),db},app=express();app.use(express.json());const service=registerStaffSchedule(app,{...options,sync:false,employees,profiles:{linked:u=>employees.get().employees.find(e=>e.id===u.uid)},authenticate:async req=>{if(!req.headers.authorization)throw Error();return {uid:req.headers.authorization,email:'test@example.test'};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,body,start='2026-10-26',suffix='',schema='2')=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/staff-schedule-api'+suffix+(body?'':'?start='+start+(schema?'&schema='+schema:'')),{method:body?'POST':'GET',headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};return {request,employees,db};
}

test('Schedule undo restores a cleared duty exactly, survives reload, and cannot run twice',async t=>{
 const {request}=await fixture(t),date='2026-10-26',assignment={code:'CL',color:'#123456',remark:'Keep these details',displayLabel:'Training'};
 await request('sup',{date,revision:0,employeeId:'agent',...assignment});
 const cleared=await request('sup',{changes:[{date,employeeId:'agent',code:null}],revisions:{[date]:1}},undefined,'/paste');assert.equal(cleared.status,200);
 const token=cleared.data.undo.token;assert.equal((await request('sup')).data.undo.token,token);assert.equal((await request('agent')).data.undo,null);
 for(const user of ['agent','lead'])assert.equal((await request(user,{token},undefined,'/undo')).status,403);
 assert.equal((await request('other',{token},undefined,'/undo')).status,403);assert.equal((await request('regional',{token},undefined,'/undo')).status,409);
 const restored=await request('sup',{token},undefined,'/undo');assert.equal(restored.status,200);assert.deepEqual(restored.data.days[0].assignments.agent,assignment);assert.equal(restored.data.days[0].revision,3);assert.equal(restored.data.undo,null);
 assert.equal((await request('sup',{token},undefined,'/undo')).status,409);assert.equal((await request('sup')).data.undo,null);
});
test('undo follows actual Schedule editing permission, including grants and revocations',async t=>{
 const {request,db}=await fixture(t);assert.equal((await request('agent')).data.canEdit,false);
 db.prepare('INSERT OR REPLACE INTO employee_permission_overrides VALUES(?,?)').run('agent',JSON.stringify({'schedule.edit':true}));assert.equal((await request('agent')).data.canEdit,true);
 const changed=await request('agent',{date:'2026-10-26',revision:0,budget:70});assert.equal(changed.status,200);assert(changed.data.undo.token);
 db.prepare('INSERT OR REPLACE INTO employee_permission_overrides VALUES(?,?)').run('agent',JSON.stringify({'schedule.edit':false}));assert.equal((await request('agent')).data.undo,null);assert.equal((await request('agent',{token:changed.data.undo.token},undefined,'/undo')).status,403);
});
test('undo is latest-step only and batch conflict detection prevents every partial restore',async t=>{
 const {request}=await fixture(t),a='2026-10-26',b='2026-10-27';
 const first=await request('sup',{date:a,revision:0,employeeId:'agent',code:'C',color:'#99ff00'});
 const batch=await request('sup',{changes:[{date:a,employeeId:'agent',code:'G',color:'#9371c7'},{date:b,employeeId:'peer',code:'F',color:'#9999ff'}],revisions:{[a]:1,[b]:0}},undefined,'/paste');assert.equal(batch.status,200);
 assert.equal((await request('sup',{token:first.data.undo.token},undefined,'/undo')).status,409);
 await request('regional',{date:b,revision:1,employeeId:'peer',code:'B',color:'#66b3c2'});
 assert.equal((await request('sup',{token:batch.data.undo.token},undefined,'/undo')).status,409);const current=(await request('sup')).data;assert.equal(current.days[0].assignments.agent.code,'G');assert.equal(current.days[1].assignments.peer.code,'B');assert.equal(current.undo,null);
 const second=await request('sup',{changes:[{date:a,employeeId:'agent',code:null},{date:b,employeeId:'peer',code:null}],revisions:{[a]:2,[b]:2}},undefined,'/paste');const restored=await request('sup',{token:second.data.undo.token},undefined,'/undo');assert.equal(restored.status,200);assert.deepEqual(restored.data.days.map(day=>Object.values(day.assignments)[0].code),['G','B']);
});
test('undo restores budget, date appearance and shortage requirements together',async t=>{
 const {request}=await fixture(t),date='2026-10-26';let result=await request('sup',{date,revision:0,budget:70});result=await request('sup',{token:result.data.undo.token},undefined,'/undo');assert.equal(result.data.days[0].budget,61);
 await request('sup',{date,revision:2,dateColor:'#abcdef',labels:['Short'],shortRoles:[{code:'G',count:2}]});
 result=await request('sup',{date,revision:3,dateColor:null,labels:[],shortRoles:[]});result=await request('sup',{token:result.data.undo.token},undefined,'/undo');assert.equal(result.status,200);assert.equal(result.data.days[0].dateColor,'#abcdef');assert.deepEqual(result.data.days[0].labels,['Short']);assert.deepEqual(result.data.days[0].shortRoles,[{code:'G',count:2}]);
});
test('undo restores employee ordering and codes; adding a month clears the previous step',async t=>{
 const {request}=await fixture(t),before=(await request('sup')).data,ids=before.employees.map(person=>person.id);
 let changed=await request('sup',{employeeId:ids.at(-1),targetId:ids[0],placement:'before',revision:0},undefined,'/order');assert.equal(changed.status,200);assert.equal((await request('sup',{token:changed.data.undo.token},undefined,'/undo')).status,200);assert.deepEqual((await request('sup')).data.employees.map(person=>person.id),ids);
 changed=await request('sup',{employeeId:'agent',currentCode:'',code:'New code'},undefined,'/code');assert.equal((await request('sup',{token:changed.data.undo.token},undefined,'/undo')).status,200);assert.equal((await request('sup')).data.employees.find(person=>person.id==='agent').code,'');
 changed=await request('sup',{date:'2026-10-26',revision:0,budget:70});const current=(await request('sup')).data;const extended=await request('sup',{expectedEnd:current.horizon},undefined,'/months');assert.equal(extended.status,200);assert.equal(extended.data.undo,null);assert.equal((await request('sup',{token:changed.data.undo.token},undefined,'/undo')).status,409);
});
test('Schedule rules are shared, Supervisor+ editable, revision protected and independent of edit overrides',async t=>{
 const {request,db}=await fixture(t),policy=require('../has/server/scheduleRules');
 assert.equal((await request(null,null,undefined,'/rules')).status,401);
 for(const id of ['other','station'])assert.equal((await request(id,null,undefined,'/rules')).status,403);
 for(const id of ['agent','lead']){const response=await request(id,null,undefined,'/rules');assert.equal(response.status,200);assert.equal(response.data.canEdit,false);assert.equal((await request(id,{revision:0,rules:policy.defaults},undefined,'/rules')).status,403);}
 db.prepare('INSERT OR REPLACE INTO employee_permission_overrides VALUES(?,?)').run('agent',JSON.stringify({'schedule.edit':true}));assert.equal((await request('agent',{revision:0,rules:policy.defaults},undefined,'/rules')).status,403);
 const rules=policy.defaults.map(row=>({...row}));rules[0].body='Submit a call-off request at least 2 hours before your shift starts.';
 assert.equal((await request('sup',{revision:0,rules},undefined,'/rules')).status,200);
 const saved=(await request('agent',null,undefined,'/rules')).data;assert.deepEqual(saved.rules,rules);assert.equal(saved.revision,1);assert.equal(JSON.parse(db.prepare('SELECT data FROM staff_schedule_rules WHERE id=1').get().data).revision,1);
 assert.equal((await request('regional',{revision:0,rules},undefined,'/rules')).status,409);
 assert.equal((await request('sup',{revision:1,rules:[]},undefined,'/rules')).status,400);
 assert.equal((await request('regional',{revision:1,rules},undefined,'/rules')).status,200);
 assert(policy.canEdit({email:'nextweek1216@gmail.com'},{position:'Agent'}));assert(!policy.canEdit({email:'agent@example.test'},{position:'Agent'}));
});
test('all staff see same-account team assignments but only managers receive totals and budgets',async t=>{
 const {request}=await fixture(t);await request('sup',{date:'2026-10-26',revision:0,employeeId:'peer',code:'VAC',color:'#fff2cc'});
 for(const user of ['agent','lead']){const {data,status}=await request(user);assert.equal(status,200);assert.equal(data.canViewAll,true);assert.equal(data.canEdit,false);assert(data.employees.some(e=>e.id==='peer'));assert.equal(data.days[0].assignments.peer.code,'VAC');for(const key of ['planned','budget','revision'])assert.equal(data.days[0][key],undefined);assert.equal(data.dailyBudget,undefined);assert(!data.employees.some(e=>e.id==='station'));}
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
 const personal=(await request('agent')).data.employees.find(e=>e.id==='agent');assert.equal(personal.code,'24110');assert.equal(personal.eid,undefined);
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

test('employee preview keeps shared team visibility while removing manager totals and edit controls',async t=>{
 const {request}=await fixture(t),result=await request('sup',undefined,'2026-10-26&view=self');assert.equal(result.data.canViewAll,true);assert.equal(result.data.canEdit,false);assert(result.data.employees.some(e=>e.id==='peer'));assert.equal(result.data.days[0].budget,undefined);
});

test('Short date settings identify missing positions without revealing other employee assignments',async t=>{const {request}=await fixture(t),date='2099-01-01',body={date,revision:0,dateColor:'#fff2cc',labels:['Short'],shortRoles:[{code:'C',count:2},{code:'G',count:1}]};assert.equal((await request('sup',{...body,shortRoles:[]})).status,400);assert.equal((await request('sup',{...body,shortRoles:[{code:'X',count:1}]})).status,400);assert.equal((await request('agent',body)).status,403);assert.equal((await request('sup',body)).status,200);const employee=(await request('agent',null,date)).data;assert.deepEqual(employee.days[0].shortRoles,body.shortRoles);assert.equal(employee.days[0].revision,undefined);const unread=(await request('agent',null,date,'/announcements')).data.announcements;assert.equal(unread.length,1);assert.match(unread[0].body,/2 C.*1 G/);assert.match(unread[0].body,/Please check with your supervisor or click “I Can Work” on the schedule[.]$/);await request('agent',{id:unread[0].id},date,'/announcements/read');assert.equal((await request('agent',null,date,'/announcements')).data.announcements.length,0);assert.equal((await request('peer',null,date,'/announcements')).data.announcements.length,1);await request('sup',{...body,revision:1,shortRoles:[{code:'C',count:3}]});const changed=(await request('agent',null,date,'/announcements')).data.announcements;assert.equal(changed.length,1);assert.notEqual(changed[0].id,unread[0].id);assert.equal((await request('sup',{...body,revision:0})).status,409);});
test('only Supervisor+ publish announcements; Got it persists separately for each eligible employee',async t=>{const {request,db}=await fixture(t),body={date:'2026-10-28',title:'Team update',body:'Please check with BM.',durationHours:24};for(const user of ['agent','lead','other'])assert.equal((await request(user,body,undefined,'/announcements')).status,403);const created=await request('sup',body,undefined,'/announcements');assert.equal(created.status,200);assert.equal((await request('regional',{...body,title:''},undefined,'/announcements')).status,400);const first=(await request('agent',null,undefined,'/announcements')).data.announcements;assert.equal(first.length,1);assert.equal(first[0].title,'Team update');assert.equal((await request('agent',{id:first[0].id},undefined,'/announcements/read')).status,200);assert.equal((await request('agent',{id:first[0].id},undefined,'/announcements/read')).status,200);assert.equal((await request('agent',null,undefined,'/announcements')).data.announcements.length,0);assert.equal((await request('peer',null,undefined,'/announcements')).data.announcements.length,1);assert.equal((await request('agent',{id:'fake'},undefined,'/announcements/read')).status,404);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff_schedule_notice_reads').get().n,1);});

test('announcements require an expiry and can only be managed or deleted by Supervisor+',async t=>{const {request,db}=await fixture(t),body={date:'2026-10-28',title:'Expiry check',body:'Message',durationHours:1};assert.equal((await request('sup',{...body,durationHours:undefined},undefined,'/announcements')).status,400);const published=await request('sup',body,undefined,'/announcements'),id=published.data.id;assert.equal((await request('agent',null,undefined,'/announcements/manage')).status,403);assert.equal((await request('agent',{},undefined,'/announcements/'+id+'/delete')).status,403);const managed=(await request('sup',null,undefined,'/announcements/manage')).data.announcements;assert.equal(managed[0].id,id);assert(Date.parse(managed[0].expiresAt)>Date.now()+3500000);db.prepare('UPDATE staff_schedule_announcements SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',id);assert.equal((await request('agent',null,undefined,'/announcements')).data.announcements.length,0);assert.equal((await request('regional',{},undefined,'/announcements/'+id+'/delete')).status,200);assert.equal((await request('sup',null,undefined,'/announcements/manage')).data.announcements.length,0);});

test('announcement date expiry covers the selected Los Angeles day through DST changes',async t=>{const {expiryForDate}=require('../has/server/scheduleNotices');assert.equal(expiryForDate('2026-10-28'),'2026-10-29T06:59:59.999Z');assert.equal(expiryForDate('2026-11-01'),'2026-11-02T07:59:59.999Z');assert.equal(expiryForDate('2026-03-08'),'2026-03-09T06:59:59.999Z');const {request,db}=await fixture(t),body={date:'2026-10-28',title:'Through date',body:'Message',expiresOn:'2099-01-01'};assert.equal((await request('sup',{...body,expiresOn:'2000-01-01'},undefined,'/announcements')).status,400);const result=await request('sup',body,undefined,'/announcements');assert.equal(result.status,200);assert.equal(db.prepare('SELECT expires_at FROM staff_schedule_announcements WHERE id=?').get(result.data.id).expires_at,expiryForDate('2099-01-01'));});
test('Supervisor can persist arbitrary employee row order with stale and scope protection',async t=>{const {request,employees}=await fixture(t),before=(await request('sup')).data;assert.equal(before.rosterRevision,0);const target=before.employees[0].id,moving=before.employees.at(-1).id,body={employeeId:moving,targetId:target,placement:'before',revision:0};for(const user of ['agent','lead','other'])assert.equal((await request(user,body,undefined,'/order')).status,403);assert.equal((await request('sup',{...body,targetId:'missing'},undefined,'/order')).status,400);const snapshot=employees.get();assert.equal((await request('sup',body,undefined,'/order')).status,200);const after=(await request('sup')).data;assert.equal(after.employees[0].id,moving);assert.equal(after.rosterRevision,1);assert.deepEqual(employees.get(),snapshot);assert.equal((await request('sup',body,undefined,'/order')).status,409);assert.equal((await request('regional',{...body,revision:1,employeeId:target,targetId:moving,placement:'before'},undefined,'/order')).status,200);assert.equal((await request('agent')).data.rosterRevision,undefined);});

test('local schedule preserves legacy metadata and refuses to re-enable Sheet sync',async t=>{const {request,db}=await fixture(t);db.prepare('UPDATE staff_schedule_sync_settings SET data=? WHERE id=1').run(JSON.stringify({enabled:true,horizon:'2027-03-31'}));const result=await request('sup');assert.equal(result.data.sync.enabled,false);assert.equal(result.data.sync.state,'local');assert.equal(result.data.horizon,'2027-03-31');assert.equal((await request('sup',{enabled:true},undefined,'/sync')).status,410);assert.equal((await request('sup',{resolve:'sheet'},undefined,'/sync')).status,410);assert.equal((await request('sup',{date:'2026-10-26',revision:0,employeeId:'agent',code:'C',color:'#99ff00'})).status,200);assert.equal((await request('sup')).data.days[0].assignments.agent.code,'C');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='staff_schedule_sync_outbox'").get().n,0);});

test('team remarks persist, can be cleared, and validate length',async t=>{const {request}=await fixture(t),date='2026-10-26',body={date,revision:0,employeeId:'agent',code:'C',color:'#99ff00',remark:'Check passport'};assert.equal((await request('agent',body)).status,403);assert.equal((await request('sup',{...body,remark:'x'.repeat(1001)})).status,400);assert.equal((await request('sup',body)).status,200);assert.equal((await request('agent')).data.days[0].assignments.agent.remark,'Check passport');assert(JSON.stringify((await request('peer')).data).includes('Check passport'));assert.equal((await request('sup',{...body,revision:1,remark:undefined,color:'#ff0000'})).status,200);assert.equal((await request('agent')).data.days[0].assignments.agent.remark,'Check passport');assert.equal((await request('sup',{...body,revision:2,remark:''})).status,200);assert.equal((await request('agent')).data.days[0].assignments.agent.remark,undefined);});


test('test login/email identities are restored to Schedule for workflow testing',async t=>{
 const {request,db}=await fixture(t);
 for(const field of ['loginId','email','companyEmail']){
  db.prepare('UPDATE pbb_employees SET data=json_set(data,?,?) WHERE singleton=1').run('$.employees[1].'+field,'test@hm.com');
  db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,0,?)').run('2026-10-26',JSON.stringify({assignments:{peer:{code:'D',color:'#ffff00'}}}));
  const result=await request('sup');assert.equal(result.status,200);assert(result.data.employees.some(e=>e.id==='peer'));assert.equal(result.data.days[0].planned,8);
  assert.equal((await request('sup',{date:'2026-10-26',revision:0,employeeId:'peer',code:'D',color:'#ffff00'})).status,200);
  db.prepare('UPDATE pbb_employees SET data=json_set(data,?,?) WHERE singleton=1').run('$.employees[1].'+field,'');
 }
});


test('the explicit test identity can use Schedule even when its display name is DEMO HAS',async t=>{
 const {request,db}=await fixture(t),data=JSON.parse(db.prepare('SELECT data FROM pbb_employees').get().data);data.employees.find(e=>e.id==='blocked0').loginId='test@hm.com';db.prepare('UPDATE pbb_employees SET data=?').run(JSON.stringify(data));
 const result=await request('blocked0');assert.equal(result.status,200);assert(result.data.employees.some(e=>e.id==='blocked0'));assert.equal((await request('blocked1')).status,403);
 const {allowed}=require('../has/server/staffSchedule');assert.equal(allowed(data.employees.find(e=>e.id==='blocked0')),false,'Briefing shared eligibility does not gain the Schedule-only exception');
});

test('Short supports alternative headcounts and mode changes create a new unread notice',async t=>{
 const {request}=await fixture(t),date='2099-01-02',body={date,revision:0,dateColor:'#ffffff',labels:['Short'],shortRoleMode:'or',shortRoles:[{code:'C',count:1},{code:'A',count:1}]};
 assert.equal((await request('agent',body)).status,403);assert.equal((await request('sup',{...body,shortRoleMode:'xor'})).status,400);assert.equal((await request('sup',{...body,shortRoles:[{code:'C',count:1}]})).status,400);assert.equal((await request('sup',body)).status,200);
 const day=(await request('agent',null,date)).data.days[0];assert.equal(day.shortRoleMode,'or');assert.deepEqual(day.shortRoles,body.shortRoles);
 const first=(await request('agent',null,date,'/announcements')).data.announcements[0];assert.match(first.body,/We need either 1 C.* OR 1 A/);await request('agent',{id:first.id},date,'/announcements/read');
 const {shortRoleMode,...oldClient}=body;assert.equal((await request('sup',{...oldClient,revision:1,dateColor:'#eeeeee'})).status,200);assert.equal((await request('sup',null,date)).data.days[0].shortRoleMode,'or');assert.equal((await request('agent',null,date,'/announcements')).data.announcements.length,0);
 assert.equal((await request('sup',{...body,revision:2,shortRoleMode:'and'})).status,200);const changed=(await request('agent',null,date,'/announcements')).data.announcements[0];assert.notEqual(changed.id,first.id);assert(!changed.body.includes(' OR '));assert.equal((await request('sup',{...body,revision:1})).status,409);
 assert.equal((await request('sup',{...body,revision:3,labels:[],shortRoles:[]})).status,200);assert.equal((await request('sup',null,date)).data.days[0].shortRoleMode,'and');assert.equal((await request('agent',null,date,'/announcements')).data.announcements.length,0);
});


test('custom display text persists and excludes the original duty from coverage and estimated hours',async t=>{
 const {request}=await fixture(t),date='2026-10-26',base={date,employeeId:'agent',code:'C',color:'#00ff00'};
 const saved=await request('sup',{...base,revision:0});assert.equal(saved.status,200);const normal=saved.data.planned;
 const custom=await request('sup',{...base,revision:1,displayLabel:'EK',remark:'Custom duty'});assert.equal(custom.status,200);assert.equal(custom.data.planned,normal-4);assert.equal(custom.data.budget,61);
 assert.deepEqual(custom.data.assignments.agent,{code:'C',color:'#00ff00',displayLabel:'EK',remark:'Custom duty'});
 assert.equal((await request('agent')).data.days[0].assignments.agent.displayLabel,'EK');
 assert.equal((await request('agent',{...base,revision:2,displayLabel:'TI'})).status,403);
 assert.equal((await request('sup',{...base,revision:1,displayLabel:'TI'})).status,409);
 for(const displayLabel of [null,42,'x'.repeat(21),'CI\nTI'])assert.equal((await request('sup',{...base,revision:2,displayLabel})).status,400);
 const recolor=await request('sup',{...base,revision:2,color:'#ff0000'});assert.equal(recolor.data.assignments.agent.displayLabel,'EK');assert.equal(recolor.data.planned,normal-4);
 const pasted=await request('sup',{revisions:{[date]:3},changes:[{date,employeeId:'peer',code:'C',color:'#00ff00',displayLabel:'CI TI'}]},date,'/paste');assert.equal(pasted.status,200);
 assert.equal((await request('agent')).data.days[0].assignments.peer.displayLabel,'CI TI');
 const reset=await request('sup',{...base,revision:4,displayLabel:'C'});assert.equal(reset.data.assignments.agent.displayLabel,undefined);assert.equal(reset.data.planned,normal);
 const renamed=await request('sup',{...base,revision:5,displayLabel:'A'});assert.equal(renamed.data.planned,normal-4,'A custom label must not be reclassified as another counted duty');
 const cleared=await request('sup',{...base,revision:6,displayLabel:''});assert.equal(cleared.data.planned,normal);
});

test('MU membership in second and third accounts grants Schedule visibility',async t=>{const {request}=await fixture(t);for(const user of ['second','third']){const result=await request(user);assert.equal(result.status,200);assert.equal(result.data.canEdit,false);assert(result.data.employees.some(e=>e.id===user));assert.equal((await request(user,{date:'2026-10-26',revision:0,budget:100})).status,403);}});


test('standing Notice is durable, scoped, manager-only and rejects stale edits',async t=>{
 const {request,db}=await fixture(t),defaults=require('../has/server/scheduleStandingNotice').DEFAULT_NOTICE;
 const get=user=>request(user,undefined,undefined,'/notice');
 const post=(user,body)=>request(user,body,undefined,'/notice');
 for(const user of ['agent','lead','sup','regional']){const result=await get(user);assert.equal(result.status,200);assert.equal(result.data.notice.body,defaults);assert.equal(result.data.canEdit,['sup','regional'].includes(user));}
 for(const user of ['agent','lead'])assert.equal((await post(user,{body:'Unauthorized',revision:0})).status,403);
 for(const user of [null,'other','station']){assert.equal((await get(user)).status,user?403:401);assert.equal((await post(user,{body:'Unauthorized',revision:0})).status,user?403:401);}
 for(const body of [{body:'',revision:0},{body:'x'.repeat(4001),revision:0},{body:12,revision:0},{body:'valid',revision:-1},{body:'valid',revision:'0'}])assert.equal((await post('sup',body)).status,400);
 const saved=await post('sup',{body:'Updated **one month** reminder',revision:0});assert.equal(saved.status,200);assert.equal(saved.data.notice.revision,1);
 assert.equal((await post('regional',{body:'Stale change',revision:0})).status,409);
 assert.equal((await get('agent')).data.notice.body,'Updated **one month** reminder');
 assert.equal(db.prepare('SELECT updated_by FROM staff_schedule_standing_notice WHERE id=1').get().updated_by,'sup');
 assert.equal((await post('regional',{body:'Regional update',revision:1})).status,200);
 // Registering again against the saved database must never overwrite a customized notice.
 require('../has/server/scheduleStandingNotice').createScheduleStandingNotice({app:{get(){},post(){}},db,handler:fn=>fn,requireManager(){}});
 assert.equal((await get('agent')).data.notice.body,'Regional update');
});

test('homepage Today Team uses the current LA date and returns only working eligible staff',async t=>{
 const {request,db}=await fixture(t,{now:()=>new Date('2026-11-01T06:30:00Z')});
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-10-31',JSON.stringify({assignments:{agent:{code:'A'},peer:{code:'X'},lead:{code:'CS'},sup:{code:'C',color:'#99ff00'},regional:{code:'VAC'},other:{code:'C'},station:{code:'A'},second:{code:'B'},third:{code:'CO'},blocked0:{code:'C'}}}));
 assert.equal((await request(null,null,undefined,'/today-team')).status,401);assert.equal((await request('other',null,undefined,'/today-team')).status,403);
 const {data,status}=await request('agent',null,undefined,'/today-team');assert.equal(status,200);assert.equal(data.date,'2026-10-31');assert.deepEqual(data.employees.map(p=>p.id).sort(),['agent','second','sup']);assert.equal(data.employees.find(p=>p.id==='agent').avatar,'data:image/png;base64,photo');assert(data.employees.every(p=>!('eid' in p)&&!('email' in p)&&!('remark' in p)));assert(data.employees.every(p=>Object.hasOwn(p,'code')));
});

test('old GS cells are migrated to G and contribute to coverage, while cached clients can still save GS',async t=>{
 const {request,db}=await fixture(t);db.prepare('INSERT INTO staff_schedule_days VALUES(?,0,?)').run('2026-10-26',JSON.stringify({assignments:{agent:{code:'GS',color:'#9371c7',remark:'Gate'},peer:{code:'G',color:'#9371c7'}}}));
 require('../has/server/scheduleGateCode').migrateGateCode(db);
 const before=(await request('sup')).data;assert.equal(before.roles.G,'Gate Specialist');assert.equal(before.roles.GS,undefined);assert.equal(before.colors.GS,undefined);assert.equal(before.days[0].assignments.agent.code,'G');assert.equal(before.days[0].planned,8);
 const saved=await request('sup',{date:'2026-10-26',revision:1,employeeId:'agent',code:'GS',color:'#9371c7'});assert.equal(saved.status,200);assert.equal(saved.data.assignments.agent.code,'G');assert.equal(saved.data.planned,8);
});
