const groups=require('./public/public/employee-account-groups');
const positions=require('./public/public/employee-positions');
const summary=require('./public/public/schedule-summary');
const {orderRoster}=require('./staffScheduleRoster');
const roles={K:'K',D:'Management',C:'Check-in',CL:'Check in + Lost and Found',FL:'Flight control + lost and found',F:'Flight Control',B:'Bag room',BL:'Bag room + Lost and Found',A:'Arrival',GS:'Gate Specialist',Q:'Arrival Card Assistant',EC:'Early Checkin',X:'Rest',VAC:'Vacation 🏖️'};
const colors={K:'#ffff00',D:'#ffff00',C:'#99ff00',CL:'#77933c',FL:'#3333ff',F:'#9999ff',B:'#66b3c2',BL:'#66b3c2',A:'#4f6200',GS:'#9371c7',Q:'#4b183c',EC:'#a9c48b',X:'#ffffff',VAC:'#fff2cc'};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const allowed=row=>Boolean(row&&groups.same(row,{station:'LAX',account:'MU'})&&!groups.isHeadquarter(row));
const canEdit=(user,row)=>['Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'].includes(positions.normalize(row.position));
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Choose a valid date.');return value;}
function registerStaffSchedule(app,{employees,profiles,authenticate=require('./pbbAuth').authenticate}){
 const db=employees.db;
 db.exec(`CREATE TABLE IF NOT EXISTS staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);`);
 const read=day=>{const row=db.prepare('SELECT * FROM staff_schedule_days WHERE date=?').get(day);const record=row?{date:day,revision:row.revision,...JSON.parse(row.data)}:{date:day,revision:0,assignments:{}};return {...record,budget:record.budget??61};};
 const roster=()=>orderRoster(employees.get().employees.filter(row=>row.name&&groups.belongs(row,{station:'LAX',account:'MU'})));
 const calculated=day=>({...day,planned:summary.dailyTotal(day,roster())});
 app.use('/staff-schedule-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');let user;try{user=await authenticate(req);}catch{return res.status(401).json({error:'Sign in required.'});}const row=profiles.linked(user);if(!allowed(row))return res.status(403).json({error:'Schedule is available only for LAX / MU.'});req.scheduleAccess={user,employeeId:row.id,canEdit:canEdit(user,row)};next();});
 app.get('/staff-schedule-api',(req,res)=>{try{const access=req.scheduleAccess,start=date(req.query.start),days=Array.from({length:14},(_,i)=>{const day=new Date(start+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+i);const record=read(day.toISOString().slice(0,10));return access.canEdit?calculated(record):{date:record.date,assignments:record.assignments[access.employeeId]?{[access.employeeId]:record.assignments[access.employeeId]}:{}};});const avatar=db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?');res.json({canEdit:access.canEdit,canViewAll:access.canEdit,roles,colors,...(access.canEdit?{dailyBudget:61}:{}),days,employees:roster().filter(row=>access.canEdit||row.id===access.employeeId).map(row=>({id:row.id,name:row.name,nickname:row.nickname,code:row.code||'',position:row.position,scheduleGroup:row.scheduleGroup,avatar:avatar.get(row.id)?.data||''}))});}catch(error){res.status(error.status||400).json({error:error.message});}});
 app.post('/staff-schedule-api/code',(req,res)=>{try{
  if(!req.scheduleAccess.canEdit)fail('Only schedule managers can edit employee codes.',403);
  const body=req.body||{};if(typeof body.code!=='string'||body.code.trim().length>40||/[\x00-\x1f\x7f]/.test(body.code))fail('Enter an employee code of up to 40 characters.');
  if(!roster().some(row=>row.id===body.employeeId))fail('Employee is not in LAX / MU.',403);
  const current=employees.get(),target=current.employees.find(row=>row.id===body.employeeId);if(body.currentCode!==(target.code||''))fail('Employee code changed. Refresh before saving.',409);
  const code=body.code.trim();employees.save({...current,employees:current.employees.map(row=>row.id===target.id?{...row,code}:row)},req.scheduleAccess.user);res.json({employeeId:target.id,code});
 }catch(error){res.status(error.status||400).json({error:error.message});}});
 const paste=db.transaction(body=>{
  if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>7000||!body.revisions||typeof body.revisions!=='object')fail('Select up to 7,000 schedule cells.');
  const ids=new Set(roster().map(row=>row.id)),days=new Map(),cells=new Set();
  for(const change of body.changes){
   if(!change||!ids.has(change.employeeId))fail('Employee is not in LAX / MU.');const key=date(change.date),cell=JSON.stringify([change.employeeId,key]);if(cells.has(cell))fail('Duplicate schedule cell.');cells.add(cell);
   if(change.code!==null&&(!Object.hasOwn(roles,change.code)||typeof change.color!=='string'||!/^#[0-9a-f]{6}$/i.test(change.color)))fail('Choose a valid duty and color.');
   if(!days.has(key)){if(days.size>=14)fail('Paste into no more than 14 dates at once.');const day=read(key);if(day.revision!==body.revisions[key])fail('Schedule changed. Refresh before pasting.',409);days.set(key,day);}
  }
  for(const change of body.changes){const day=days.get(change.date);if(change.code===null)delete day.assignments[change.employeeId];else day.assignments[change.employeeId]={code:change.code,color:change.color};}
  const result=[];for(const day of days.values()){day.revision++;db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,?,?)').run(day.date,day.revision,JSON.stringify({assignments:day.assignments,budget:day.budget}));result.push(calculated(day));}return {days:result};
 });
 app.post('/staff-schedule-api/paste',(req,res)=>{try{if(!req.scheduleAccess.canEdit)fail('Only schedule managers can paste assignments.',403);res.json(paste(req.body||{}));}catch(error){res.status(error.status||400).json({error:error.message});}});
 const save=db.transaction(body=>{
  const day=read(date(body.date));if(day.revision!==body.revision)fail('Schedule changed. Refresh before saving.',409);
  if(body.employeeId!==undefined){if(!roster().some(row=>row.id===body.employeeId))fail('Employee is not in LAX / MU.');if(!Object.hasOwn(roles,body.code)||typeof body.color!=='string'||!/^#[0-9a-f]{6}$/i.test(body.color))fail('Choose a valid duty and color.');day.assignments[body.employeeId]={code:body.code,color:body.color};}
  else if(Object.hasOwn(body,'budget')){if(typeof body.budget!=='number'||!Number.isFinite(body.budget)||body.budget<0||body.budget>100000)fail('Enter a valid daily budget.');day.budget=body.budget;}
  else fail('Choose an assignment or daily budget change. Daily Hour is calculated automatically.');
  day.revision++;db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,?,?)').run(day.date,day.revision,JSON.stringify({assignments:day.assignments,budget:day.budget}));return calculated(day);
 });
 app.post('/staff-schedule-api',(req,res)=>{try{if(!req.scheduleAccess.canEdit)fail('Only schedule managers can edit the schedule.',403);res.json(save(req.body||{}));}catch(error){res.status(error.status||400).json({error:error.message});}});
}
module.exports={registerStaffSchedule,allowed,canEdit,roles,colors};
