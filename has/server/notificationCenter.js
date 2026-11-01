const crypto=require('node:crypto');
const groups=require('../public/employee-account-groups'),positions=require('../public/employee-positions');
const accessPolicy=require('./notificationAccess'),scheduleTime=require('./notificationSchedule');
const catalog=[
 {key:'schedule_approval',label:'Schedule approvals',description:'Request Off, I Can Work and Trade Shift approvals'},
 {key:'report_time',label:'Report Time approvals',description:'Time and punch correction approvals'},
 {key:'schedule_announcement',label:'Schedule announcements',description:'New announcements published in Schedule'},
 {key:'read_sign',label:'Read & Sign',description:'Documents requiring a signature'},
 {key:'has_approval',label:'HAS request approvals',description:'Uniform, New Access, Incident, Expense and Terrific requests'},
 {key:'reminder',label:'Scheduled reminders',description:'Weekly reports, monthly reports, timecard close and custom reminders'}
];
const categories=['weekly_report','monthly_report','timecard_close','custom'];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const scopeKey=scope=>JSON.stringify([scope.type,scope.station||'',scope.account||'']);
function createNotificationCenter({db,employees,profiles,push,now=()=>new Date()}){
 db.exec(`CREATE TABLE IF NOT EXISTS hr_notification_reminders(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,next_at TEXT,enabled INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS hr_notification_policies(scope_key TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS hr_notification_runs(reminder_id TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(reminder_id,due_at));
 CREATE TABLE IF NOT EXISTS hr_notification_messages(id TEXT PRIMARY KEY,uid TEXT NOT NULL,reminder_id TEXT NOT NULL,due_at TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL,read_at TEXT,UNIQUE(uid,reminder_id,due_at));
 CREATE INDEX IF NOT EXISTS hr_notification_due ON hr_notification_reminders(enabled,next_at);
 CREATE INDEX IF NOT EXISTS hr_notification_inbox ON hr_notification_messages(uid,at);
 CREATE TABLE IF NOT EXISTS hr_notification_audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL);`);
 const accounts=()=>employees.get().accounts||[];
 const access=user=>accessPolicy.accessFor(user,profiles.linked(user));
 const requireScope=(user,scope)=>{const a=access(user);if(!accessPolicy.canManage(a,scope))fail('You cannot manage notifications for this scope.',403);return a;};
 function validateScope(value){
  if(!value||!['company','station','account'].includes(value.type))fail('Choose Company wide, Station or Account.');
  const result={type:value.type};
  if(value.type!=='company'){if(typeof value.station!=='string'||!accounts().some(a=>a.station===value.station))fail('Choose an existing station.');result.station=value.station;}
  if(value.type==='account'){if(typeof value.account!=='string'||!accounts().some(a=>a.station===result.station&&a.account===value.account))fail('Choose an existing account.');result.account=value.account;}
  return result;
 }
 function validatePositions(value){if(!Array.isArray(value)||value.length>positions.positions.length||value.some(p=>!positions.valid(p)))fail('Choose valid recipient positions.');return [...new Set(value.map(positions.normalize))];}
 const audit=(user,action,data)=>db.prepare('INSERT INTO hr_notification_audit(actor,action,data,at) VALUES(?,?,?,?)').run(user.uid,action,JSON.stringify(data),now().toISOString());
 const read=id=>{const row=db.prepare('SELECT * FROM hr_notification_reminders WHERE id=?').get(id);if(!row)fail('Reminder not found.',404);return {...JSON.parse(row.data),revision:row.revision,nextAt:row.next_at,enabled:!!row.enabled};};
 const eligible=(employee,r)=>accessPolicy.matches(employee,r.scope)&&(!r.positions.length||r.positions.includes(positions.normalize(employee.position)));
 function context(user){
  const a=access(user);if(!a)fail('Notification management requires a company administrator, station manager or Business Manager.',403);
  const choices=accounts().filter(s=>accessPolicy.canManage(a,{type:'account',...s})).map(({station,account})=>({station,account}));
  return {access:a,accounts:choices,catalog,positions:positions.selectablePositions,categories,canManageHR:require('./employees').ADMIN_EMAILS.has(String(user.email||'').toLowerCase())||['Business Manager','Supervisor'].includes(positions.normalize(profiles.linked(user)?.position))};
 }
 function getPolicy(scope){const row=db.prepare('SELECT * FROM hr_notification_policies WHERE scope_key=?').get(scopeKey(scope));return {revision:row?.revision||0,settings:row?JSON.parse(row.data):{}};}
 function scopesFor(scope){return [{type:'company'},...(scope.type!=='company'?[{type:'station',station:scope.station}]:[]),...(scope.type==='account'?[scope]:[])];}
 function list(user,scope){scope=validateScope(scope);requireScope(user,scope);const policy=getPolicy(scope);return {scope,...policy,inherited:scopesFor(scope).slice(0,-1).map(s=>({scope:s,...getPolicy(s)})),reminders:db.prepare('SELECT id FROM hr_notification_reminders ORDER BY rowid DESC').all().map(r=>read(r.id)).filter(r=>scopeKey(r.scope)===scopeKey(scope))};}
 const savePolicy=db.transaction((user,body)=>{
  const scope=validateScope(body.scope);requireScope(user,scope);const current=getPolicy(scope);if(body.revision!==current.revision)fail('Notification settings changed. Reload before saving.',409);
  if(!body.settings||Array.isArray(body.settings)||typeof body.settings!=='object'||Object.keys(body.settings).some(k=>!catalog.some(c=>c.key===k)))fail('Choose valid notification settings.');
  const settings={};for(const [key,value] of Object.entries(body.settings)){if(typeof value?.enabled!=='boolean')fail('Choose On or Off for each notification.');settings[key]={enabled:value.enabled,positions:validatePositions(value.positions)};}
  db.prepare('INSERT OR REPLACE INTO hr_notification_policies VALUES(?,?,?)').run(scopeKey(scope),current.revision+1,JSON.stringify(settings));audit(user,'policy',{scope,settings});return list(user,scope);
 });
 const save=db.transaction((user,body)=>{
  const scope=validateScope(body.scope);requireScope(user,scope);let previous;
  if(body.id){previous=read(body.id);requireScope(user,previous.scope);if(body.revision!==previous.revision)fail('Reminder changed. Reload before saving.',409);}
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.body!=='string'||!body.body.trim()||body.body.length>1000)fail('Enter a title and message (up to 120 and 1,000 characters).');
  if(!categories.includes(body.category)||typeof body.enabled!=='boolean')fail('Choose a reminder category and On or Off.');
  const schedule=scheduleTime.validate(body.schedule),nextAt=scheduleTime.nextOccurrence(schedule,now());if(body.enabled&&!nextAt)fail('Choose a future reminder date and time.');
  const r={id:previous?.id||crypto.randomUUID(),title:body.title.trim(),body:body.body.trim(),category:body.category,scope,positions:validatePositions(body.positions),schedule,createdAt:previous?.createdAt||now().toISOString(),createdBy:previous?.createdBy||user.uid,updatedAt:now().toISOString()};
  db.prepare('INSERT OR REPLACE INTO hr_notification_reminders VALUES(?,?,?,?,?)').run(r.id,(previous?.revision||0)+1,JSON.stringify(r),body.enabled?nextAt:null,Number(body.enabled));audit(user,previous?'update':'create',r);return read(r.id);
 });
 const toggle=db.transaction((user,id,body)=>{const r=read(id);requireScope(user,r.scope);if(r.revision!==body.revision)fail('Reminder changed. Reload before saving.',409);if(typeof body.enabled!=='boolean')fail('Choose On or Off.');const next=body.enabled?scheduleTime.nextOccurrence(r.schedule,now()):null;if(body.enabled&&!next)fail('Choose a new future date before enabling this reminder.');db.prepare('UPDATE hr_notification_reminders SET enabled=?,revision=revision+1,next_at=? WHERE id=?').run(Number(body.enabled),next,id);audit(user,'toggle',{id,enabled:body.enabled});return read(id);});
 const remove=db.transaction((user,id,body)=>{const r=read(id);requireScope(user,r.scope);if(r.revision!==body.revision)fail('Reminder changed. Reload before deleting.',409);db.prepare('DELETE FROM hr_notification_reminders WHERE id=?').run(id);audit(user,'delete',{id});return {deleted:true};});
 function policyAllows(uid,payload){
  const employee=profiles.linked({uid,email:'',provider:db.prepare('SELECT provider FROM employee_accounts WHERE uid=?').get(uid)?.provider});if(!employee)return false;
  const key=payload.notificationKey||(payload.source==='schedule_announcement'?'schedule_announcement':payload.source==='schedule'?'schedule_approval':payload.source==='read_sign'?'read_sign':payload.source==='hr_reminder'?'reminder':'has_approval');
  const scope=payload.station&&payload.account?{type:'account',station:payload.station,account:payload.account}:payload.station?{type:'station',station:payload.station}:{type:'account',...groups.scope(employee)};
  return scopesFor(scope).every(s=>{const setting=getPolicy(s).settings[key];return !setting||setting.enabled&&(!setting.positions.length||setting.positions.includes(positions.normalize(employee.position)));});
 }
 const resolve=(uid,jobId)=>{const [id,due]=jobId.split('|');let r;try{r=read(id);}catch{return null;}const run=db.prepare('SELECT created_at FROM hr_notification_runs WHERE reminder_id=? AND due_at=?').get(id,due);if(!r.enabled||!run||+now()-Date.parse(run.created_at)>86400000)return null;const employee=profiles.linked({uid,email:'',provider:db.prepare('SELECT provider FROM employee_accounts WHERE uid=?').get(uid)?.provider});return eligible(employee,r)?{stage:r.revision+':'+due}:null;};
 function messages(user){const employee=profiles.linked(user);return {messages:db.prepare('SELECT id,reminder_id,title,body,at,read_at AS readAt FROM hr_notification_messages WHERE uid=? AND at>=? ORDER BY at DESC LIMIT 100').all(user.uid,new Date(+now()-30*86400000).toISOString()).filter(row=>{try{return eligible(employee,read(row.reminder_id));}catch{return false;}}).map(({reminder_id,...row})=>({...row,url:'/home'}))};}
 const readMessages=db.transaction((user,body)=>{if(!Array.isArray(body.ids)||body.ids.length>100||body.ids.some(id=>typeof id!=='string'))fail('Choose valid notifications.');for(const id of body.ids)db.prepare('UPDATE hr_notification_messages SET read_at=? WHERE id=? AND uid=?').run(now().toISOString(),id,user.uid);return messages(user);});
 if(push){push.resolvers.set('hr_reminder',resolve);push.filters.set('hr_notification_policy',policyAllows);}
 function tick(){if(!push)return;db.transaction(()=>{
  for(const row of db.prepare('SELECT id,next_at FROM hr_notification_reminders WHERE enabled=1 AND next_at<=? ORDER BY next_at LIMIT 100').all(now().toISOString())){
   const r=read(row.id),due=row.next_at,at=now().toISOString(),fresh=+now()-Date.parse(due)<=86400000;
   const inserted=db.prepare('INSERT OR IGNORE INTO hr_notification_runs VALUES(?,?,?,?)').run(r.id,due,fresh?'queued':'skipped',at).changes;
   if(inserted&&fresh)for(const {uid} of db.prepare('SELECT uid FROM employee_accounts').all()){
    const account=db.prepare('SELECT provider FROM employee_accounts WHERE uid=?').get(uid),employee=profiles.linked({uid,email:'',provider:account.provider});if(!eligible(employee,r))continue;
    db.prepare('INSERT OR IGNORE INTO hr_notification_messages VALUES(?,?,?,?,?,?,?,NULL)').run(crypto.randomUUID(),uid,r.id,due,r.title,r.body,at);
    const recipientScope=groups.memberships(employee).find(s=>s.station===r.scope.station)||groups.scope(employee);
    push.enqueue('hr_reminder',r.id+'|'+due,r.revision+':'+due,uid,{type:'hr_reminder',source:'hr_reminder',notificationKey:'reminder',requestId:r.id+'|'+due,approvalStage:r.revision+':'+due,title:r.title,body:r.body,url:'/home',station:r.scope.station||recipientScope.station||'',account:r.scope.account||recipientScope.account||''});
   }
   db.prepare('UPDATE hr_notification_reminders SET next_at=? WHERE id=?').run(scheduleTime.nextOccurrence(r.schedule,now()),r.id);
  }
 })();}
 return {context,list,save,savePolicy,toggle,remove,tick,policyAllows,read,messages,readMessages};
}
function registerNotificationCenter(app,{employees,profiles,authenticate,push,now,intervalMs=30000}){
 const store=createNotificationCenter({db:employees.db,employees,profiles,push,now});
 app.use('/notification-admin-api',require('express').json({limit:'24kb'}),async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.notificationUser=await authenticate(req);}catch{return res.status(401).json({error:'Sign in required.'});}try{store.context(req.notificationUser);next();}catch(e){res.status(e.status||403).json({error:e.message});}});
 const handle=fn=>(req,res)=>{try{res.json(fn(req));}catch(e){res.status(e.status||400).json({error:e.message});}};
 app.use('/notification-api/messages',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.pushUser=req.pushUser||await authenticate(req);}catch{return res.status(401).json({error:'Sign in required.'});}if(!profiles.linked(req.pushUser))return res.status(403).json({error:'Link your employee profile first.'});next();});
 app.get('/notification-api/messages',handle(req=>store.messages(req.pushUser)));
 app.post('/notification-api/messages/read',handle(req=>store.readMessages(req.pushUser,req.body)));
 app.get('/notification-admin-api/context',handle(req=>store.context(req.notificationUser)));
 app.get('/notification-admin-api',handle(req=>store.list(req.notificationUser,{type:req.query.type,station:req.query.station,account:req.query.account})));
 app.post('/notification-admin-api/policy',handle(req=>store.savePolicy(req.notificationUser,req.body)));
 app.post('/notification-admin-api/reminders',handle(req=>store.save(req.notificationUser,req.body)));
 app.post('/notification-admin-api/reminders/:id/toggle',handle(req=>store.toggle(req.notificationUser,req.params.id,req.body)));
 app.post('/notification-admin-api/reminders/:id/delete',handle(req=>store.remove(req.notificationUser,req.params.id,req.body)));
 const timer=intervalMs?setInterval(()=>{try{store.tick();}catch{console.error('Scheduled notification processing failed');}},intervalMs):null;timer?.unref();
 return {...store,close(){clearInterval(timer);push?.filters.delete('hr_notification_policy');push?.resolvers.delete('hr_reminder');}};
}
module.exports={createNotificationCenter,registerNotificationCenter,catalog};
