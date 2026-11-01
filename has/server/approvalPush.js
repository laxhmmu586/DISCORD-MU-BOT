const crypto=require('node:crypto');
const services=new WeakMap();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createPushService({db,env=process.env,send}){
 db.exec(`CREATE TABLE IF NOT EXISTS notification_tokens(token_id TEXT PRIMARY KEY,uid TEXT NOT NULL,device_id TEXT NOT NULL,token TEXT NOT NULL,platform TEXT, user_agent TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,enabled INTEGER NOT NULL,UNIQUE(device_id));
 CREATE TABLE IF NOT EXISTS approval_push_outbox(event_key TEXT PRIMARY KEY,source TEXT NOT NULL,request_id TEXT NOT NULL,stage TEXT NOT NULL,uid TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,error TEXT);
 CREATE TABLE IF NOT EXISTS approval_push_delivery(event_key TEXT NOT NULL,token_id TEXT NOT NULL,status TEXT NOT NULL,error TEXT,PRIMARY KEY(event_key,token_id));`);
 const resolvers=new Map();let running=false,client;
 const configured=()=>Boolean(env.FCM_VAPID_PUBLIC_KEY&&env.FCM_VAPID_PUBLIC_KEY!=='PASTE_YOUR_FIREBASE_WEB_PUSH_PUBLIC_KEY_HERE');
 const transmit=send|| (async(token,data)=>{
  if(!client){const {google}=require('googleapis');client=await new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/firebase.messaging']}).getClient();}
  return client.request({url:'https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID||'china-eastern')+'/messages:send',method:'POST',data:{message:require('./pushMessage').messageForDevice(token,data)},timeout:15000,retry:false});
 });
 function enqueue(source,id,stage,uid,payload){db.prepare('INSERT OR IGNORE INTO approval_push_outbox(event_key,source,request_id,stage,uid,payload,created_at) VALUES(?,?,?,?,?,?,?)').run(hash(JSON.stringify([source,id,stage,uid])),source,id,stage,uid,JSON.stringify(payload),new Date().toISOString());}
 async function flush(){if(running||(!send&&!configured()))return;running=true;try{
  for(const job of db.prepare("SELECT * FROM approval_push_outbox WHERE status='pending' ORDER BY rowid LIMIT 100").all()){
   const resolve=resolvers.get(job.source);if(!resolve)continue;
   let current;try{current=resolve(job.uid,job.request_id);}catch{current=null;}
   if(!current||current.stage!==job.stage){db.prepare("UPDATE approval_push_outbox SET status='obsolete' WHERE event_key=?").run(job.event_key);continue;}
   for(const device of db.prepare('SELECT * FROM notification_tokens WHERE uid=? AND enabled=1').all(job.uid)){
    // Claim before sending: an ambiguous network response must never cause a duplicate.
    if(!db.prepare("INSERT OR IGNORE INTO approval_push_delivery VALUES(?,?,'sending',NULL)").run(job.event_key,device.token_id).changes)continue;
    try{await transmit(device.token,JSON.parse(job.payload));db.prepare("UPDATE approval_push_delivery SET status='sent' WHERE event_key=? AND token_id=?").run(job.event_key,device.token_id);}
    catch(error){const code=error.response?.data?.error?.details?.find(d=>d.errorCode)?.errorCode;if(code==='UNREGISTERED')db.prepare('UPDATE notification_tokens SET enabled=0 WHERE token_id=?').run(device.token_id);const detail=String(code||error.response?.status||'send-failed');db.prepare("UPDATE approval_push_delivery SET status='failed',error=? WHERE event_key=? AND token_id=?").run(detail,job.event_key,device.token_id);}
   }
   db.prepare("UPDATE approval_push_outbox SET status='processed' WHERE event_key=?").run(job.event_key);
  }
 }finally{running=false;}}
 const service={db,resolvers,enqueue,flush,configured,close(){clearInterval(timer);services.delete(db);}};
 const timer=setInterval(()=>flush().catch(()=>console.error('Approval push processing failed')),5000);timer.unref();services.set(db,service);return service;
}
function registerPush(app,{employees,profiles,authenticate,env=process.env}){
 const service=createPushService({db:employees.db,env}),db=employees.db;
 app.use('/notification-api',require('express').json({limit:'8kb'}),async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.pushUser=await authenticate(req);if(!profiles.linked(req.pushUser))return res.status(403).json({error:'Link your employee profile first.'});next();}catch{res.status(401).json({error:'Sign in required.'});}});
 app.get('/notification-api/config',(req,res)=>res.json({vapidKey:env.FCM_VAPID_PUBLIC_KEY||'',configured:service.configured()}));
 app.get('/notification-api/device',(req,res)=>{
  const deviceId=req.query.deviceId;
  if(typeof deviceId!=='string'||!/^[a-f0-9-]{36}$/i.test(deviceId))return res.status(400).json({error:'Invalid notification device.'});
  const row=db.prepare('SELECT enabled FROM notification_tokens WHERE uid=? AND device_id=?').get(req.pushUser.uid,deviceId);
  res.json({registered:Boolean(row),enabled:row?.enabled===1});
 });
 app.post('/notification-api/device',(req,res)=>{
  const {deviceId,token,enabled=true,platform,userAgent}=req.body||{};
  if(typeof deviceId!=='string'||!/^[a-f0-9-]{36}$/i.test(deviceId)||(enabled!==false&&(typeof token!=='string'||token.length<20||token.length>4096)))return res.status(400).json({error:'Invalid notification device.'});
  if(enabled===false){db.prepare('UPDATE notification_tokens SET enabled=0,updated_at=? WHERE uid=? AND device_id=?').run(new Date().toISOString(),req.pushUser.uid,deviceId);return res.json({ok:true});}
  const at=new Date().toISOString();db.transaction(()=>{db.prepare('DELETE FROM notification_tokens WHERE device_id=? AND token_id<>?').run(deviceId,hash(token));db.prepare('INSERT INTO notification_tokens VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(token_id) DO UPDATE SET uid=excluded.uid,device_id=excluded.device_id,platform=excluded.platform,user_agent=excluded.user_agent,updated_at=excluded.updated_at,enabled=1').run(hash(token),req.pushUser.uid,deviceId,token,String(platform||'web').slice(0,100),String(userAgent||'').slice(0,500),at,at);})();res.json({ok:true});
 });return service;
}
// Wrap only successful mutations, with the outbox insert in the same outer transaction.
// Reuse each store's own authenticated read/view for the actual responsibility check.
function attachPush(store,{db,source,read,methods=['create','save','decide','updateRoute','lifecycle'],kind='approval',name=source}){
 const service=services.get(db);if(!service)return store;
 const resolve=(uid,id)=>{
  const account=db.prepare('SELECT * FROM employee_accounts WHERE uid=?').get(uid);if(!account)return null;
  const r=read({uid,email:'',provider:account.provider},id,account.employee_id);
  if(kind==='read_sign')return r.required&&!r.mySignedAt?{stage:'published',r}:null;
  if(source==='schedule'&&r.canReceiveNotification)return {stage:'notified',r};
  if(!r.canReview&&!r.canApprove&&!r.canConfirm)return null;
  return {stage:JSON.stringify([r.status,r.nodeIds?.[r.step]||r.step||r.status,r.submittedAt||r.createdAt,(r.history||[]).filter(h=>['Returned for revision','Withdrawn to draft'].includes(h.action)).length]),r};
 };
 service.resolvers.set(source,resolve);
 for(const method of methods){if(typeof store[method]!=='function')continue;const original=store[method];store[method]=(...args)=>{
  const result=db.transaction(()=>{const result=original(...args);if(!result?.id)return result;
   for(const {uid} of db.prepare('SELECT uid FROM employee_accounts').all()){
    let current;try{current=resolve(uid,result.id);}catch{continue;}if(!current)continue;
    const r=current.r,requester=r.employeeName||r.employee?.name||'An employee',requestType=({off:'Request Off',work:'I Can Work',trade:'Trade Shift',timesheet:'Report Time'})[r.type]||name;
    service.enqueue(source,r.id,current.stage,uid,{type:r.canReceiveNotification?'schedule_notification':kind==='read_sign'?'read_sign_required':'approval_required',source:kind==='read_sign'?'read_sign':source==='schedule'?'schedule':'has_form',requestId:r.id,approvalStage:current.stage,title:r.canReceiveNotification?({report_time:'Report time',forgot_punch:'Forgot punch',forgot_punch_meal:'Forgot punch meal',request_fix_time:'Request fix time',cross_account_call_in:'Cross-Account Call-In'}[r.category]||'Report Time'):kind==='read_sign'?'Read & Sign Required':source==='schedule'?'Approval Required':'New Approval Request',body:r.canReceiveNotification?requester+' submitted a timesheet notification for '+r.date+'. No approval required.':kind==='read_sign'?r.subject:requester+' submitted a '+requestType+(r.date?' for '+r.date:'')+'.',url:kind==='read_sign'?'/read-sign':source==='schedule'?'/schedule':'/has-form'});
   }return result;})();
  setImmediate(()=>{if(db.open)service.flush().catch(()=>console.error('Approval push processing failed'));});return result;
 };}return store;
}
module.exports={createPushService,registerPush,attachPush,getPushService:db=>services.get(db)};
