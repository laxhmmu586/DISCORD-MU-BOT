const crypto=require('node:crypto');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
function createScheduleUndo({db,read,put,notices,employees}){
 db.exec('CREATE TABLE IF NOT EXISTS staff_schedule_undo(owner TEXT PRIMARY KEY,token TEXT NOT NULL,data TEXT NOT NULL)');
 const owner=access=>JSON.stringify([access.user.uid,access.employeeId]);
 const get=access=>db.prepare('SELECT token,data FROM staff_schedule_undo WHERE owner=?').get(owner(access));
 const clear=access=>db.prepare('DELETE FROM staff_schedule_undo WHERE owner=?').run(owner(access));
 function snapshot(target){
  if(target.kind==='days')return target.dates.map(read);
  if(target.kind==='order'){const row=db.prepare('SELECT revision,data FROM staff_schedule_roster_order WHERE id=1').get();return {revision:row.revision,ids:JSON.parse(row.data)};}
  const employee=employees.get().employees.find(person=>person.id===target.employeeId);
  if(!employee)fail('This employee is no longer available. Refresh the schedule.');
  return {code:employee.code||''};
 }
 function status(access){
  if(!access.canEdit)return null;
  const row=get(access);if(!row)return null;
  const entry=JSON.parse(row.data);
  try{if(!equal(snapshot(entry.target),entry.after))return null;}catch{return null;}
  return {token:row.token,label:entry.label};
 }
 const record=db.transaction((access,target,label,change)=>{
  const before=snapshot(target),value=change(),after=snapshot(target),token=crypto.randomUUID();
  db.prepare('INSERT OR REPLACE INTO staff_schedule_undo VALUES(?,?,?)').run(owner(access),token,JSON.stringify({target,label,before,after}));
  return {value,undo:{token,label}};
 });
 const restore=db.transaction((access,token)=>{
  const row=get(access);if(!row||typeof token!=='string'||row.token!==token)fail('There is no matching change to undo. Refresh the schedule.');
  const entry=JSON.parse(row.data),current=snapshot(entry.target);
  if(!equal(current,entry.after))fail('The affected schedule has changed since your last edit. Refresh before making another change.');
  if(entry.target.kind==='days'){
   for(let i=0;i<entry.before.length;i++){
    const day={...entry.before[i],revision:current[i].revision+1};
    put(day);notices.setShortages(day.date,day.shortRoles||[],day.shortRoleMode||'and');
   }
  }else if(entry.target.kind==='order')db.prepare('UPDATE staff_schedule_roster_order SET revision=revision+1,data=? WHERE id=1').run(JSON.stringify(entry.before.ids));
  else{
   const all=employees.get();employees.save({...all,employees:all.employees.map(person=>person.id===entry.target.employeeId?{...person,code:entry.before.code}:person)},access.user);
  }
  clear(access);
  return {dates:entry.target.dates||[],label:entry.label};
 });
 return {record,restore,status,clear};
}
module.exports={createScheduleUndo};
