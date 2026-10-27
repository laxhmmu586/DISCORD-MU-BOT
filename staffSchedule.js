const groups=require('./public/public/employee-account-groups');
const positions=require('./public/public/employee-positions');
const roles={K:'K',D:'D',C:'Check-in',CL:'Check in + Lost and Found',FL:'Flight control + lost and found',F:'Flight Control',B:'Bag room',BL:'BL',A:'Arrival',Q:'Arrival Card Assistant',EC:'Early Checkin',X:'Rest',VAC:'Vacation 🏖️'};
const colors={K:'#ffff00',D:'#ffff00',C:'#99ff00',CL:'#77933c',FL:'#3333ff',F:'#9999ff',B:'#66b3c2',BL:'#66b3c2',A:'#4f6200',Q:'#4b183c',EC:'#a9c48b',X:'#ffffff',VAC:'#fff2cc'};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const allowed=row=>Boolean(row&&groups.same(row,{station:'LAX',account:'MU'})&&!groups.isHeadquarter(row));
const canEdit=(user,row)=>['Supervisor','Senior Supervisor','Duty Manager','Business Manager','Airport Operations Manager','Airport Manager','Interim General Manager','General Manager','Regional Manager'].includes(positions.normalize(row.position));
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Choose a valid date.');return value;}
function registerStaffSchedule(app,{employees,profiles,authenticate=require('./pbbAuth').authenticate}){
 const db=employees.db;
 db.exec(`CREATE TABLE IF NOT EXISTS staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);`);
 const read=day=>{const row=db.prepare('SELECT * FROM staff_schedule_days WHERE date=?').get(day);return row?{date:day,revision:row.revision,...JSON.parse(row.data)}:{date:day,revision:0,assignments:{},planned:null};};
 const roster=()=>employees.get().employees.filter(row=>row.name&&groups.belongs(row,{station:'LAX',account:'MU'}));
 app.use('/staff-schedule-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');let user;try{user=await authenticate(req);}catch{return res.status(401).json({error:'Sign in required.'});}const row=profiles.linked(user);if(!allowed(row))return res.status(403).json({error:'Schedule is available only for LAX / MU.'});req.scheduleAccess={user,employeeId:row.id,canEdit:canEdit(user,row)};next();});
 app.get('/staff-schedule-api',(req,res)=>{try{const access=req.scheduleAccess,start=date(req.query.start),days=Array.from({length:14},(_,i)=>{const day=new Date(start+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+i);const record=read(day.toISOString().slice(0,10));return access.canEdit?record:{date:record.date,assignments:record.assignments[access.employeeId]?{[access.employeeId]:record.assignments[access.employeeId]}:{}};});const avatar=db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?');res.json({canEdit:access.canEdit,canViewAll:access.canEdit,roles,colors,...(access.canEdit?{dailyBudget:61}:{}),days,employees:roster().filter(row=>access.canEdit||row.id===access.employeeId).map(row=>({id:row.id,name:row.name,nickname:row.nickname,eid:row.eid,position:row.position,avatar:avatar.get(row.id)?.data||''}))});}catch(error){res.status(error.status||400).json({error:error.message});}});
 const save=db.transaction(body=>{
  const day=read(date(body.date));if(day.revision!==body.revision)fail('Schedule changed. Refresh before saving.',409);
  if(body.employeeId!==undefined){if(!roster().some(row=>row.id===body.employeeId))fail('Employee is not in LAX / MU.');if(!Object.hasOwn(roles,body.code)||typeof body.color!=='string'||!/^#[0-9a-f]{6}$/i.test(body.color))fail('Choose a valid duty and color.');day.assignments[body.employeeId]={code:body.code,color:body.color};}
  else if(Object.hasOwn(body,'planned')){if(body.planned!==null&&(typeof body.planned!=='number'||!Number.isFinite(body.planned)||body.planned<0||body.planned>100000))fail('Enter a valid daily estimate.');day.planned=body.planned;}
  else fail('Choose a schedule change.');
  day.revision++;db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,?,?)').run(day.date,day.revision,JSON.stringify({assignments:day.assignments,planned:day.planned}));return day;
 });
 app.post('/staff-schedule-api',(req,res)=>{try{if(!req.scheduleAccess.canEdit)fail('Only schedule managers can edit the schedule.',403);res.json(save(req.body||{}));}catch(error){res.status(error.status||400).json({error:error.message});}});
}
module.exports={registerStaffSchedule,allowed,canEdit,roles,colors};
