const exists=(db,table)=>!!db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table);
const normal=value=>String(value||'').trim().toLowerCase();
function people(db){return exists(db,'pbb_employees')?JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data).employees:[];}
function targetId(db,id){if(!exists(db,'employee_profile_merges'))return id;const seen=new Set();let next;while(!seen.has(id)&&(next=db.prepare('SELECT target_employee_id FROM employee_profile_merges WHERE source_employee_id=?').get(id))){seen.add(id);id=next.target_employee_id;}return id;}
function blocked(db,user){
 const id=(exists(db,'employee_accounts')&&db.prepare('SELECT employee_id FROM employee_accounts WHERE uid=?').get(user.uid)?.employee_id)||(exists(db,'employee_account_status_users')&&db.prepare('SELECT employee_id FROM employee_account_status_users WHERE uid=?').get(user.uid)?.employee_id);
 return people(db).some(row=>(id&&row.id===targetId(db,id)||normal(user.email)&&[normal(row.loginId),normal(row.email)].includes(normal(user.email)))&&(row.accountDisabled||Number.isFinite(user.authTime)&&row.accountAuthAfter&&user.authTime<row.accountAuthAfter));
}
function createAccountStatus({store,directory,onChange=()=>{}}){
 const db=store.db;db.exec('CREATE TABLE IF NOT EXISTS employee_account_status_users(uid TEXT PRIMARY KEY,employee_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS employee_account_status_audit(id INTEGER PRIMARY KEY,employee_id TEXT NOT NULL,disabled INTEGER NOT NULL,pending INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL)');
 const write=db.transaction((id,disabled,pending,actor)=>{
  const data=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data),row=data.employees.find(row=>row.id===id);if(!row)throw Error('Employee no longer exists.');
  row.accountDisabled=disabled;row.accountStatusPending=pending;if(disabled)row.accountAuthAfter=Math.max(row.accountAuthAfter||0,Math.ceil(Date.now()/1000));data.revision++;data.updatedAt=new Date().toISOString();data.updatedBy=actor;
  db.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(data));db.prepare('INSERT INTO employee_account_status_audit(employee_id,disabled,pending,actor,at) VALUES(?,?,?,?,?)').run(id,disabled?1:0,pending?1:0,actor,data.updatedAt);
 });
 const busy=new Set();
 async function change(row,disabled,actor){
  if(busy.has(row.id))throw Object.assign(Error('Account status is already updating. Please retry.'),{status:409});busy.add(row.id);try{
  // Fail closed before any remote operation. A failed Firebase call leaves a retryable local block.
  write(row.id,true,true,actor);try{onChange();}catch{};
  const linked=exists(db,'employee_accounts')?db.prepare('SELECT uid,employee_id FROM employee_accounts').all().filter(link=>targetId(db,link.employee_id)===row.id).map(link=>link.uid):[];
  for(const uid of linked){db.prepare('INSERT OR REPLACE INTO employee_account_status_users VALUES(?,?)').run(uid,row.id);require('./pbbAuth').disconnectUser(uid);}
  if(exists(db,'notification_tokens'))for(const uid of linked)db.prepare('UPDATE notification_tokens SET enabled=0 WHERE uid=?').run(uid);
  if(exists(db,'approval_push_outbox'))for(const uid of linked)db.prepare("UPDATE approval_push_outbox SET status='suppressed' WHERE uid=? AND status='pending'").run(uid);
  try{
   const emails=[normal(row.loginId),normal(row.email)].filter(Boolean),remote=(await directory.list(true)).filter(user=>linked.includes(user.uid)||emails.includes(normal(user.email)));
   const uids=[...new Set([...linked,...remote.map(user=>user.uid)])];
   for(const uid of uids){db.prepare('INSERT OR REPLACE INTO employee_account_status_users VALUES(?,?)').run(uid,row.id);if(exists(db,'notification_tokens'))db.prepare('UPDATE notification_tokens SET enabled=0 WHERE uid=?').run(uid);if(exists(db,'approval_push_outbox'))db.prepare("UPDATE approval_push_outbox SET status='suppressed' WHERE uid=? AND status='pending'").run(uid);await directory.setDisabled(uid,disabled);require('./pbbAuth').disconnectUser(uid);}
   write(row.id,disabled,false,actor);try{onChange();}catch{}
  }catch(error){throw Object.assign(Error('Account access is blocked locally. Firebase synchronization failed; retry the account switch.'),{status:502});}
  }finally{busy.delete(row.id);}
 }
 return {change};
}
module.exports={blocked,createAccountStatus};
