const {createSheetsTransport,key,SOURCE_URL}=require('./staffScheduleSheets');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function createScheduleSync({db,roster,read,put,setCodes,roles,colors,transport,env=process.env,now=()=>Date.now()}){
 db.exec(`CREATE TABLE IF NOT EXISTS staff_schedule_sync_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_schedule_sync_base(key TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_schedule_sync_outbox(key TEXT PRIMARY KEY,base TEXT,data TEXT NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_schedule_import_backup(date TEXT PRIMARY KEY,data TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO staff_schedule_sync_settings VALUES(1,?)').run(JSON.stringify({enabled:env.STAFF_SCHEDULE_SYNC_ENABLED!=='false'}));
 const settings=()=>JSON.parse(db.prepare('SELECT data FROM staff_schedule_sync_settings WHERE id=1').get().data);
 const update=patch=>{const value={...settings(),...patch};db.prepare('UPDATE staff_schedule_sync_settings SET data=? WHERE id=1').run(JSON.stringify(value));return value;};
 for(const [code,value] of Object.entries(settings().roleDefinitions||{}))if(/^[A-Z][A-Z0-9·/+ -]{0,7}$/.test(code)&&typeof value.label==='string'&&/^#[0-9a-f]{6}$/i.test(value.color)){roles[code]=value.label;colors[code]=value.color;}
 const backend=transport||createSheetsTransport({env});let snapshot=null,tail=Promise.resolve(),flushTimer=null,lastFlushAttempt=0,lastReadAttempt=0;
 const pending=()=>db.prepare('SELECT * FROM staff_schedule_sync_outbox ORDER BY key').all();
 const status=()=>{const s=settings(),jobs=pending(),conflicts=jobs.filter(j=>j.state==='conflict').length;return {enabled:s.enabled,sourceUrl:SOURCE_URL,state:!s.enabled?'disabled':conflicts?'conflict':s.error?'error':jobs.length||s.pendingEnd?'pending':s.unmatched?'partial':s.lastPulledAt?'synced':'connecting',queued:jobs.length,conflicts,warnings:s.unmatched||0,lastPulledAt:s.lastPulledAt||null,lastPushedAt:s.lastPushedAt||null,message:s.error||(s.unmatched?s.unmatched+' source employee rows or annotations need review. Check the current employee names and codes.':''),horizon:s.horizon||null};};
 const run=fn=>{const promise=tail.then(fn);tail=promise.catch(()=>{});return promise;};
 function queue(date,type,employeeId,value){if(!settings().enabled)return;const k=key(date,type,employeeId),old=db.prepare('SELECT base FROM staff_schedule_sync_outbox WHERE key=?').get(k),baseline=db.prepare('SELECT data FROM staff_schedule_sync_base WHERE key=?').get(k);db.prepare('INSERT OR REPLACE INTO staff_schedule_sync_outbox VALUES(?,?,?,?)').run(k,old?old.base:baseline?.data??null,JSON.stringify({key:k,date,type,employeeId,value}),'pending');}
 const apply=db.transaction(remote=>{
  const changed=new Map(),codes=[];
  for(const item of remote.items.values()){
   const job=db.prepare('SELECT * FROM staff_schedule_sync_outbox WHERE key=?').get(item.key),json=JSON.stringify(item.value);
   if(job&&equal(JSON.parse(job.data).value,item.value))db.prepare('DELETE FROM staff_schedule_sync_outbox WHERE key=?').run(item.key);
   else if(job){if(job.base!==null&&job.base!==json)db.prepare("UPDATE staff_schedule_sync_outbox SET state='conflict' WHERE key=?").run(item.key);db.prepare('INSERT OR REPLACE INTO staff_schedule_sync_base VALUES(?,?)').run(item.key,json);continue;}
   db.prepare('INSERT OR REPLACE INTO staff_schedule_sync_base VALUES(?,?)').run(item.key,json);
   if(item.type==='code'){codes.push({id:item.employeeId,code:item.value});continue;}
   const day=changed.get(item.date)||read(item.date);let differs=false;
   if(item.type==='assignment'){differs=!equal(day.assignments[item.employeeId]||null,item.value);if(item.value)day.assignments[item.employeeId]=item.value;else delete day.assignments[item.employeeId];}
   else if(item.type==='budget'){differs=day.budget!==item.value;day.budget=item.value;}
   else if(item.type==='meta'){differs=!equal({dateColor:day.dateColor||null,labels:day.labels||[]},item.value);Object.assign(day,item.value);}
   if(differs)changed.set(item.date,day);
  }
  for(const day of changed.values()){const original=db.prepare('SELECT data FROM staff_schedule_days WHERE date=?').get(day.date);if(original)db.prepare('INSERT OR IGNORE INTO staff_schedule_import_backup VALUES(?,?)').run(day.date,original.data);day.revision++;put(day);}
  if(codes.length)setCodes(codes);
 });
 async function refresh(force=false){const s=settings();if(!s.enabled)return status();if(!force&&lastReadAttempt&&now()-lastReadAttempt<60000)return status();lastReadAttempt=now();try{snapshot=await backend.read(roster(),roles,colors);apply(snapshot);update({lastPulledAt:now(),error:'',horizon:[s.horizon,snapshot.lastDate].filter(Boolean).sort().at(-1),unmatched:snapshot.warnings.length,roleDefinitions:Object.fromEntries(Object.entries(roles).map(([code,label])=>[code,{label,color:colors[code]||'#eeeeee'}]))});}catch(error){update({error:/403|permission|access denied/i.test(error.message)?'Google Sheet access denied. The existing schedule service account needs editor access.':'Google Sheet is unavailable. Website changes are kept and queued for retry.'});}return status();}
 async function flush(){if(!settings().enabled)return status();lastFlushAttempt=now();await refresh(true);if(!snapshot||settings().error)return status();try{
  const end=settings().pendingEnd;if(end&&end>snapshot.lastDate){await backend.addMonth(snapshot,end);await refresh(true);if(settings().error)return status();}if(end&&snapshot.lastDate>=end)update({pendingEnd:null});
  const jobs=pending();if(!jobs.length)return status();let conflict=false;
  for(const job of jobs){const item=snapshot.items.get(job.key),desired=JSON.parse(job.data);if(!item){update({error:'Some queued edits need matching employee rows or dates in Google Sheet.'});return status();}const blank=item.value===null||item.value===''||desired.type==='budget'&&item.value===61||desired.type==='meta'&&!item.value.labels?.length&&['#ffffff',null].includes(item.value.dateColor);
   if(job.state==='conflict'||(job.base===null?!blank:job.base!==JSON.stringify(item.value))){db.prepare("UPDATE staff_schedule_sync_outbox SET state='conflict' WHERE key=?").run(job.key);conflict=true;}}
  if(conflict){update({error:''});return status();}
  await backend.write(snapshot,jobs.map(job=>JSON.parse(job.data)));update({lastPushedAt:now(),error:''});await refresh(true);
 }catch(error){update({error:/formula/i.test(error.message)?'A Sheet formula protects a target cell. Resolve it before syncing.':'Sheet write did not complete. Website changes are queued for retry.'});}return status();}
 async function extend(end){update({horizon:end,...(settings().enabled?{pendingEnd:end}:{})});if(settings().enabled)await flush();return status();}
 async function configure(body){if(typeof body.enabled==='boolean')update({enabled:body.enabled,error:''});if(body.resolve==='sheet')db.prepare('DELETE FROM staff_schedule_sync_outbox').run();if(body.resolve==='website'){await refresh(true);for(const job of pending()){const item=snapshot?.items.get(job.key);if(item)db.prepare("UPDATE staff_schedule_sync_outbox SET base=?,state='pending' WHERE key=?").run(JSON.stringify(item.value),job.key);}}if(settings().enabled){await refresh(true);await flush();}return status();}
 function requestFlush(){if(!settings().enabled||flushTimer)return;const wait=Math.max(1500,10000-(now()-lastFlushAttempt),settings().error?60000-(now()-lastReadAttempt):0);flushTimer=setTimeout(()=>{flushTimer=null;run(()=>flush()).catch(()=>{});},wait);flushTimer.unref?.();}
 const timer=setInterval(()=>{if(settings().enabled)run(async()=>{await refresh();if(pending().length||settings().pendingEnd)await flush();}).catch(()=>{});},60000);timer.unref?.();
 return {run,queue,refresh,flush,status,extend,configure,settings,requestFlush,close:()=>{clearInterval(timer);if(flushTimer)clearTimeout(flushTimer);}};
}
module.exports={createScheduleSync};
