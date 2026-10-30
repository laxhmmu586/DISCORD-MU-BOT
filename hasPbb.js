const crypto=require('node:crypto');
const items=require('./public/public/has-pbb-data');
const terminalLicense=require('./public/public/pbb-terminal-license');
const employeeAccounts=require('./public/public/employee-account-groups');
const employeePositions=require('./public/public/employee-positions');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function registerHasPbb(app,{store,employees,profiles,authenticate,client,buildPdf=require('./hasPbbPdf').buildHasPbbPdf,sendProblemEmail}){
 const db=store.db,streams=new Set(),jobs=new Map(),gateEpoch=crypto.randomUUID();let gateRevision=0;
 db.exec('CREATE TABLE IF NOT EXISTS has_pbb_records(id TEXT PRIMARY KEY, station TEXT NOT NULL, account TEXT NOT NULL, date TEXT NOT NULL, flight TEXT NOT NULL, bridge TEXT NOT NULL, data TEXT NOT NULL, pdf BLOB, UNIQUE(station,account,date,flight,bridge))');
 db.exec('CREATE TABLE IF NOT EXISTS has_pbb_flights(station TEXT NOT NULL, account TEXT NOT NULL, flight TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(station,account,flight))');
 db.exec('CREATE TABLE IF NOT EXISTS has_pbb_gates(station TEXT NOT NULL,account TEXT NOT NULL,flight TEXT NOT NULL,data TEXT NOT NULL,expires TEXT NOT NULL,PRIMARY KEY(station,account,flight))');
 db.exec('CREATE TABLE IF NOT EXISTS has_pbb_schedule(singleton INTEGER PRIMARY KEY CHECK(singleton=1),data TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO has_pbb_schedule VALUES(1,?)').run(JSON.stringify({revision:1,pairs:[]}));
 const schedule=()=>JSON.parse(db.prepare('SELECT data FROM has_pbb_schedule WHERE singleton=1').get().data);
 const gateLocks=e=>{db.prepare('DELETE FROM has_pbb_gates WHERE expires<=?').run(store.now().toISOString());return db.prepare('SELECT data FROM has_pbb_gates WHERE station=? AND account=?').all(e.station,e.account).map(row=>JSON.parse(row.data));};
 const defaultFlights=e=>db.prepare('SELECT flight FROM has_pbb_flights WHERE station=? AND account=? ORDER BY flight').all(e.station,e.account).map(r=>r.flight);
 const scopedSchedule=e=>schedule().pairs.filter(pair=>pair.station===e.station&&pair.account===e.account);
 const requireManager=e=>{if(e.position!=='Manager')fail('Only a Manager can add or delete default flights.',403);};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(store.now());
 const get=id=>{const row=db.prepare('SELECT data FROM has_pbb_records WHERE id=?').get(id);if(!row)fail('Checklist not found',404);return JSON.parse(row.data);};
 const put=r=>{db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return r;};
 const problemMail=require('./hasPbbProblemMail').createProblemMailer({db,employees,now:()=>store.now(),...(sendProblemEmail?{sendEmail:sendProblemEmail}:{})});
 const same=(a,b)=>a.station===b.station&&a.account===b.account;
 const isOps=row=>employeeAccounts.same(row,{station:'LAX',account:'OPS'});
 const accounts=row=>[...new Map((isOps(row)?employees.get().accounts.filter(a=>!employeeAccounts.isHeadquarter(a)):[employeeAccounts.scope(row),...(row.additionalAccounts||[]).map(employeeAccounts.scope)]).map(scope=>[employeeAccounts.key(scope),scope])).values()];
 function employee(user,scope){profiles.status(user);const row=profiles.linked(user);if(!row)fail('Link your employee account in My Profile first.',403);if(scope?.station!==undefined||scope?.account!==undefined){if(typeof scope.station!=='string'||typeof scope.account!=='string'||!scope.station.trim()||!scope.account.trim())fail('Select a station and account.',400);const selected=accounts(row).find(a=>employeeAccounts.same(a,employeeAccounts.scope(scope)));if(!selected)fail('You are not assigned to this station/account.',403);return {...row,...selected};}return row;}
 const dashboard=user=>String(user.email||'').trim().toLowerCase()==='lake@mu.com';
 const configEditor=user=>['Supervisor','Business Manager'].includes(employeePositions.normalize(profiles.linked(user)?.position));
 const globalDashboard=user=>['lake@mu.com','demo@hm.com'].includes(String(user.email||'').trim().toLowerCase());
 const businessManager=user=>employeePositions.normalize(profiles.linked(user)?.position)==='Business Manager';
 const dashboardViewer=user=>globalDashboard(user)||businessManager(user);
 function roleCheck(e,role,date=today(),gate){
  if(!['driver','spotter'].includes(role))fail('Select Driver or Spotter');
  if(role==='driver'&&!(gate===undefined?terminalLicense.any(e,date):terminalLicense.valid(terminalLicense.forGate(e,gate),date)))fail('A valid '+(gate!==undefined&&e.station==='LAX'?(terminalLicense.terminal(e.station,gate)||'recognized LAX gate')+' ':'')+'PBB ID and unexpired qualification are required. Cannot drive PBB.',403);

 }
 const list=e=>db.prepare('SELECT data FROM has_pbb_records WHERE station=? AND account=? AND date=? ORDER BY flight,bridge').all(e.station,e.account,today()).map(x=>JSON.parse(x.data));
 function authorized(req,id){const r=get(id);if(!same(req.hasEmployee,r))fail('This checklist belongs to another station/account.',403);return r;}
 function publish(r){for(const s of streams){try{const current=employee(s.user,s.scope);if(!same(current,s.scope)){s.res.end();continue;}if(s.id?s.id===r.id:same(current,r))s.res.write(`event: state\ndata: ${JSON.stringify(s.id?r:list(current))}\n\n`);}catch{s.res.end();}}}
 const stamp=()=>store.now().toISOString();
 const gateState=e=>({gateLocks:gateLocks(e),serverTime:stamp(),gateEpoch,gateRevision});
 function publishGates(e){gateRevision++;const state=gateState(e);for(const s of streams){try{const current=employee(s.user,s.scope);if(!same(current,s.scope)){s.res.end();continue;}if(same(current,e))s.res.write(`event: gates\ndata: ${JSON.stringify(state)}\n\n`);}catch{s.res.end();}}return state;}
 async function deliver(id){
  const initial=get(id),generation=initial.resetToken||'',jobKey=id+':'+generation;
  if(jobs.has(jobKey))return jobs.get(jobKey);
  const current=()=>{const r=get(id);return (r.resetToken||'')===generation&&!!r.completedAt;};
  const job=(async()=>{
   let r=get(id);const notifyDiscord=r.station==='LAX'&&r.account==='MU'&&!!client;if(!r.completedAt||r.delivery.status==='ready'&&(!notifyDiscord||r.discordDelivery?.status==='sent'))return;let pdf;
   try{
    pdf=db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(id).pdf;
    if(!pdf){pdf=await buildPdf(r);if(!current())return;db.prepare('UPDATE has_pbb_records SET pdf=? WHERE id=?').run(pdf,id);}
    r.delivery={status:'ready'};
   }catch(e){r.delivery={status:'failed',error:e.message};}
   if(!current())return;
   // PDFs stay in the local database; successful Discord notifications are never resent.
   if(notifyDiscord&&r.discordDelivery?.status!=='sent'){
    r.discordDelivery={status:'pending'};put(r);
    try{
     if(!pdf)throw Error('PDF is still generating. Retry delivery.');
     const channel=await client.channels.fetch('1559561919826890852');if(!current())return;
     if(!channel?.isTextBased())throw Error('Discord channel is unavailable');
     const line=value=>String(value??'').replace(/\s+/g,' ').trim();
     const content=[`Jet Bridge ${line(r.type).toUpperCase()} | ${line(r.flightNo)} | ${line(r.date)} |`,`Gate ${line(r.gate)} | ${line(r.bridge)}`,`Driver: ${line(r.signatures.driver.name)} ✓`,`Spotter: ${line(r.signatures.spotter.name)} ✓`].join('\n');
     const sent=await channel.send({content,files:[{attachment:pdf,name:require('./public/public/download-filename')(r.type,r)}],allowedMentions:{parse:[]},nonce:crypto.createHash('sha256').update('has-pbb:'+id+':'+generation).digest('hex').slice(0,24),enforceNonce:true});
     if(!current())return;r.discordDelivery={status:'sent',messageId:sent.id,channelId:'1559561919826890852'};
    }catch(error){r.discordDelivery={status:'failed',error:error.message};}
   }
   if(!current())return;
   r.revision++;put(r);publish(r);
  })().finally(()=>jobs.delete(jobKey));jobs.set(jobKey,job);return job;
 }
 // Expiry is measured from this checklist generation, never extended by answers.
 function pruneIncomplete(){
  const cutoff=store.now().getTime()-60*60*1000,expired=db.prepare('SELECT id,data FROM has_pbb_records').all().filter(row=>{const r=JSON.parse(row.data);return !r.completedAt&&Date.parse(r.resetAt||r.createdAt)<=cutoff;});
  for(const row of expired){
   db.prepare('DELETE FROM has_pbb_records WHERE id=?').run(row.id);
   for(const sub of streams)if(sub.id===row.id){sub.res.write(`event: expired\ndata: ${JSON.stringify({id:row.id})}\n\n`);sub.res.end();streams.delete(sub);}
  }
  const scopes=new Map(expired.map(row=>{const r=JSON.parse(row.data);return [JSON.stringify([r.station,r.account]),r];}));
  for(const r of scopes.values())publish(r);
  return expired.length;
 }
 pruneIncomplete();
 const cleanupTimer=setInterval(pruneIncomplete,30000);cleanupTimer.unref();
 app.use('/has-pbb-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.hasUser=await authenticate(req);if(req.path.startsWith('/dashboard')){if(!(req.path==='/dashboard/config'?(dashboard(req.hasUser)||configEditor(req.hasUser)):(req.path==='/dashboard'||/^\/dashboard\/records\/[^/]+\/pdf$/.test(req.path))&&req.method==='GET'?dashboardViewer(req.hasUser):dashboard(req.hasUser)))fail('Dashboard access denied.',403);}else req.hasEmployee=employee(req.hasUser,req.query);pruneIncomplete();next();}catch(e){res.status(e.status||401).json({error:e.message});}});
 const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({error:e.message});}};
 const configScopes=user=>employeePositions.normalize(profiles.linked(user)?.position)==='Business Manager'?[employeeAccounts.scope(employee(user))]:accounts(employee(user));
 const requestedConfigScopes=(user,query={})=>{
  if(query.station===undefined&&query.account===undefined)return dashboard(user)?null:configScopes(user);
  const selected=employeeAccounts.scope(employee(user,query));
  if(!dashboard(user)&&!configScopes(user).some(scope=>same(scope,selected)))fail('You can only configure your own station and accounts.',403);
  return [selected];
 };
 const configView=(user,data=schedule(),query)=>{const scopes=requestedConfigScopes(user,query);return scopes?{...data,scopes,pairs:data.pairs.filter(pair=>scopes.some(scope=>same(scope,pair)))}:data;};
 app.get('/has-pbb-api/dashboard/config',route((req,res)=>res.json(configView(req.hasUser,schedule(),req.query))));
 const saveSchedule=db.transaction((body,user)=>{const current=schedule();if(body.revision!==current.revision)fail('Schedule changed. Reload Config before saving.',409);if(!Array.isArray(body.pairs)||body.pairs.length>200)fail('Enter up to 200 flight pairs.');const inbound=new Set(),outbound=new Set(),ids=new Set();
  const pairs=body.pairs.map(row=>{const station=String(row.station||'').trim().toUpperCase(),account=String(row.account||'').trim().toUpperCase(),id=String(row.id||crypto.randomUUID());if(!/^[A-Z0-9-]{2,20}$/.test(station)||!/^[A-Z0-9-]{1,20}$/.test(account)||!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id))fail('Check stations, accounts and unique flight pairs.');ids.add(id);
   const leg=(value,seen)=>{const flightNo=String(value?.flightNo||'').trim().toUpperCase(),days=value?.days;if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||!Array.isArray(days)||!days.length||days.length>7||new Set(days).size!==days.length||days.some(n=>!Number.isInteger(n)||n<1||n>7))fail('Each Inbound and Outbound needs a flight number and at least one operating day.');const key=[station,account,flightNo].join('/');if(seen.has(key))fail('Duplicate flight in this station/account.');seen.add(key);return {flightNo,days:[...days].sort((a,b)=>a-b)};};return {id,station,account,...(station==='LAX'&&row.opsArrivalSpotter===true?{opsArrivalSpotter:true}:{}),inbound:leg(row.inbound,inbound),outbound:leg(row.outbound,outbound)};
  });const next={revision:current.revision+1,pairs,updatedAt:stamp(),updatedBy:user.email};db.prepare('UPDATE has_pbb_schedule SET data=? WHERE singleton=1').run(JSON.stringify(next));return next;
 });
 const saveScopedSchedule=db.transaction((body,user,query)=>{
  const scopes=requestedConfigScopes(user,query);
  if(!scopes)return saveSchedule(body,user);
  if(!dashboard(user)&&!configEditor(user))fail('Config access denied.',403);
  const current=schedule();if(!Array.isArray(body.pairs))fail('Enter flight pairs.');
  const own=pair=>scopes.some(scope=>same(scope,employeeAccounts.scope(pair)));
  if(body.pairs.some(pair=>!own(pair)||current.pairs.some(old=>old.id===pair.id&&!own(old))))fail('You can only configure your own station and accounts.',403);
  const saved=saveSchedule({...body,pairs:[...current.pairs.filter(pair=>!own(pair)),...body.pairs]},user);return configView(user,saved,query);
 });
 app.post('/has-pbb-api/dashboard/config',route((req,res)=>{
  const saved=saveScopedSchedule(req.body,req.hasUser,req.query);
  for(const row of db.prepare('SELECT data FROM has_pbb_records WHERE date=?').all(today())){
   const r=JSON.parse(row.data);
   if(!r.completedAt&&req.body.pairs.some(pair=>same(employeeAccounts.scope(pair),r)&&pair.inbound.flightNo===r.flightNo)&&opsArrival(r)&&r.signatures.spotter?.source!=='configured-ops-arrival'){
    applyOpsArrival(r);r.revision++;r.updatedAt=stamp();put(r);publish(r);
   }
  }
  res.json(saved);
 }));
 app.get('/has-pbb-api/context',route((req,res)=>{const e=req.hasEmployee;res.json({allAccountAccess:isOps(profiles.linked(req.hasUser)),accounts:accounts(profiles.linked(req.hasUser)),employee:{id:e.id,name:e.name,eid:e.eid,station:e.station,account:e.account,pbbId:e.pbbId||'',pbbExpiry:e.pbbExpiry||'',pbbMscId:e.pbbMscId||'',pbbMscExpiry:e.pbbMscExpiry||'',driver:terminalLicense.any(e,today()),spotter:true},date:today(),dashboard:dashboardViewer(req.hasUser),canConfigure:dashboard(req.hasUser)||configEditor(req.hasUser)&&(employeePositions.normalize(profiles.linked(req.hasUser)?.position)!=='Business Manager'||same(e,employeeAccounts.scope(profiles.linked(req.hasUser)))),canManageFlights:e.position==='Manager',defaultFlights:defaultFlights(e),flightSchedule:scopedSchedule(e),...gateState(e)});}));
 app.post('/has-pbb-api/gate',route((req,res)=>{
  const e=req.hasEmployee;roleCheck(e,req.body.role);const flightNo=String(req.body.flightNo||'').trim().toUpperCase(),gate=String(req.body.gate||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||! /^[A-Z0-9-]{1,20}$/.test(gate))fail('Confirm flight and gate number.');
  roleCheck(e,req.body.role,today(),gate);
  const existing=gateLocks(e).find(g=>g.flightNo===flightNo);if(existing&&existing.gate!==gate)fail('Gate number is locked. Clear gate number before changing it.',409);
  const lock=existing||{flightNo,gate,confirmedAt:stamp(),expiresAt:new Date(store.now().getTime()+2*60*60*1000).toISOString()};
  if(!existing)db.prepare('INSERT INTO has_pbb_gates(station,account,flight,data,expires) VALUES(?,?,?,?,?)').run(e.station,e.account,flightNo,JSON.stringify(lock),lock.expiresAt);
  res.json(publishGates(e));
 }));
 app.post('/has-pbb-api/gate/clear',route((req,res)=>{
  const e=req.hasEmployee;db.prepare('DELETE FROM has_pbb_gates WHERE station=? AND account=? AND flight=?').run(e.station,e.account,String(req.body.flightNo||'').trim().toUpperCase());res.json(publishGates(e));
 }));
 app.get('/has-pbb-api/flights',route((req,res)=>res.json(defaultFlights(req.hasEmployee))));
 app.post('/has-pbb-api/flights',route((req,res)=>{
  const e=req.hasEmployee;requireManager(e);const flight=String(req.body.flightNo||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flight))fail('Enter a valid flight number.');
  db.prepare('INSERT OR IGNORE INTO has_pbb_flights(station,account,flight,created_by,created_at) VALUES(?,?,?,?,?)').run(e.station,e.account,flight,e.id,stamp());res.json(defaultFlights(e));
 }));
 app.post('/has-pbb-api/flights/:flightNo/delete',route((req,res)=>{
  const e=req.hasEmployee;requireManager(e);db.prepare('DELETE FROM has_pbb_flights WHERE station=? AND account=? AND flight=?').run(e.station,e.account,String(req.params.flightNo).toUpperCase());res.json(defaultFlights(e));
 }));
 app.get('/has-pbb-api/records',route((req,res)=>res.json(list(req.hasEmployee))));
 function opsArrival(r){return r.station==='LAX'&&r.type==='arrival'&&schedule().pairs.some(p=>same(p,r)&&p.inbound.flightNo===r.flightNo&&p.opsArrivalSpotter);}
 function requireManualRole(r,role){if(role==='spotter'&&opsArrival(r))fail('Arrival Spotter is completed and locked by LAX/OPS configuration.',403);}
 function applyOpsArrival(r){
  const pair=schedule().pairs.find(p=>p.station===r.station&&p.account===r.account&&p.inbound.flightNo===r.flightNo);
  if(r.station!=='LAX'||r.type!=='arrival'||!pair?.opsArrivalSpotter)return r;
  for(const item of items.filter(x=>(x.type||'arrival')==='arrival'&&x.role==='spotter'))for(const id of [item.id,...(item.linkedAnswers||[])])r.answers.spotter[id]=true;
  r.ready.spotter=true;r.owners.spotter='has-ops-ramp';
  r.signatures.spotter={employeeId:'has-ops-ramp',name:'HAS OPS RAMP',eid:'',strokes:[],typedSignature:'HAS OPS RAMP',at:stamp(),source:'configured-ops-arrival',configuredBy:schedule().updatedBy};
  return r;
 }
 app.post('/has-pbb-api/records',route((req,res)=>{
  const e=req.hasEmployee;roleCheck(e,req.body.role);
  const type=req.body.type||'arrival';if(!['arrival','departure'].includes(type))fail('Invalid operation');const flightNo=String(req.body.flightNo||'').trim().toUpperCase(),flightKey=flightNo+(type==='departure'?'|departure':''),gate=String(req.body.gate||'').trim().toUpperCase(),bridge=req.body.bridge,date=today();
  if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||! /^[A-Z0-9-]{1,20}$/.test(gate)||!['L1','L2','L3'].includes(bridge))fail('Confirm flight, gate number and L1/L2/L3.');
  roleCheck(e,req.body.role,date,gate);
  requireManualRole({station:e.station,account:e.account,flightNo,type},req.body.role);
  const heldGate=gateLocks(e).find(g=>g.flightNo===flightNo);if(heldGate&&heldGate.gate!==gate)fail('Gate number is locked. Clear gate number before changing it.',409);
  const create=db.transaction(()=>{const old=db.prepare('SELECT id FROM has_pbb_records WHERE station=? AND account=? AND date=? AND flight=? AND bridge=?').get(e.station,e.account,date,flightKey,bridge);if(old){const previous=get(old.id);if(previous.gate===gate){if(heldGate&&!previous.completedAt&&previous.gateConfirmedAt!==heldGate.confirmedAt){previous.gateConfirmedAt=heldGate.confirmedAt;previous.revision++;previous.updatedAt=stamp();put(previous);}if(!previous.completedAt&&opsArrival(previous)&&previous.signatures.spotter?.source!=='configured-ops-arrival'){applyOpsArrival(previous);previous.revision++;previous.updatedAt=stamp();put(previous);}return previous;}
    const r={id:previous.id,station:e.station,account:e.account,date,flightNo,gate,bridge,type,gateConfirmedAt:heldGate?.confirmedAt||null,revision:previous.revision+1,createdAt:stamp(),updatedAt:stamp(),createdBy:e.id,resetAt:stamp(),resetToken:crypto.randomUUID(),answers:{driver:{},spotter:{}},ready:{driver:null,spotter:null},owners:{},signatures:{},delivery:{status:'pending'}};
    applyOpsArrival(r);db.prepare('UPDATE has_pbb_records SET data=?,pdf=NULL WHERE id=?').run(JSON.stringify(r),r.id);return r;}
   const r={id:crypto.randomUUID(),station:e.station,account:e.account,date,flightNo,gate,bridge,type,gateConfirmedAt:heldGate?.confirmedAt||null,revision:1,createdAt:stamp(),updatedAt:stamp(),createdBy:e.id,answers:{driver:{},spotter:{}},ready:{driver:null,spotter:null},owners:{},signatures:{},delivery:{status:'pending'}};
   applyOpsArrival(r);db.prepare('INSERT INTO has_pbb_records(id,station,account,date,flight,bridge,data) VALUES(?,?,?,?,?,?,?)').run(r.id,e.station,e.account,date,flightKey,bridge,JSON.stringify(r));return r;
  });const r=create();publish(r);res.status(201).json(r);
 }));
 app.get('/has-pbb-api/records/:id',route((req,res)=>res.json(authorized(req,req.params.id))));
 const resetRecord=db.transaction(req=>{
  const previous=authorized(req,req.params.id),e=req.hasEmployee;roleCheck(e,req.body.role);requireManualRole(previous,req.body.role);
  if(previous.date!==today())fail('This checklist is from a previous day.',409);
  if(req.body.revision!==previous.revision)fail('Checklist changed. Review the latest shared state before resetting.',409);
  const r={id:previous.id,station:previous.station,account:previous.account,date:previous.date,flightNo:previous.flightNo,gate:previous.gate,bridge:previous.bridge,type:previous.type,gateConfirmedAt:previous.gateConfirmedAt||null,revision:previous.revision+1,createdAt:previous.createdAt,createdBy:previous.createdBy,updatedAt:stamp(),resetAt:stamp(),resetBy:e.id,resetToken:crypto.randomUUID(),answers:{driver:{},spotter:{}},ready:{driver:null,spotter:null},owners:{},signatures:{},delivery:{status:'pending'}};
  applyOpsArrival(r);db.prepare('UPDATE has_pbb_records SET data=?,pdf=NULL WHERE id=?').run(JSON.stringify(r),r.id);return r;
 });
 app.post('/has-pbb-api/records/:id/reset',route((req,res)=>{const r=resetRecord(req);publish(r);res.json(r);}));
 const mutate=db.transaction((req)=>{
  const r=authorized(req,req.params.id),b=req.body,e=req.hasEmployee,role=b.role;roleCheck(e,role,today(),r.gate);requireManualRole(r,role);
  if(r.completedAt)fail('Submitted checklist is locked.',409);
  if(r.date!==today())fail('This checklist is from a previous day.',409);
  if(b.revision!==r.revision)fail('Checklist changed. Review the latest shared state.',409);
  if(r.owners[role]&&r.owners[role]!==e.id)fail('This role is already assigned to another employee.',403);
  if(r.owners[role==='driver'?'spotter':'driver']===e.id)fail('Driver and Spotter must be different employees.',403);
  if(r.signatures[role]&&b.action!=='ready')fail('Your signed section is locked.',409);
  if(b.action==='answer'){
   const item=items.find(x=>x.id===b.itemId&&x.role===role&&(x.type||'arrival')===r.type);if(!item||typeof b.value!=='boolean')fail('Invalid checklist answer');
   if(item.phase==='after'&&!r.dockedAt||item.phase==='pre'&&r.movingAt||item.phase==='movement'&&(!r.movingAt||r.dockedAt))fail('This checklist phase is locked.',409);
   if(!b.value){if(!b.evidence||typeof b.evidence.reason!=='string'||!b.evidence.reason.trim()||b.evidence.reason.length>2000||!b.evidence.photo)fail('Photo and reason are required for a NO answer.');r.evidence||={};r.evidence[role]||={};if(b.evidence.reportId!==undefined&&!/^[a-zA-Z0-9-]{1,80}$/.test(b.evidence.reportId))fail('Invalid problem report.');r.evidence[role][item.id]={reportId:b.evidence.reportId||crypto.randomUUID(),reason:b.evidence.reason.trim(),photo:b.evidence.photo,employeeId:e.id,name:e.name,at:stamp()};}
   else if(r.evidence?.[role]?.[item.id])r.evidence[role][item.id].resolvedAt=stamp();
   for(const id of [item.id,...(item.linkedAnswers||[])])r.answers[role][id]=b.value;
   if(!b.value)problemMail.enqueue(r,role,item.id);
   if(item.phase==='pre'){r.ready[role]=null;delete r.signatures[role];}
  }else if(b.action==='ready'){
   if(r.movingAt)fail('Movement has started. Ready state is locked.',409);
   if(typeof b.value!=='boolean')fail('Select Ready or Not ready');
   if(b.value&&items.some(x=>(x.type||'arrival')===r.type&&x.role===role&&x.phase==='pre'&&!r.answers[role][x.id]))fail('Complete pre-movement checks first.');
   r.ready[role]=b.value;delete r.signatures[role];
  }else if(b.action==='move'){
   if(role!=='driver'||r.movingAt||r.ready.driver!==true||r.ready.spotter!==true)fail('Wait for both Ready confirmations.',409);
   r.movingAt=stamp();r.driverQualification=terminalLicense.forGate(e,r.gate);
  }else if(b.action==='dock'){
   if(role!=='driver'||!r.movingAt||r.dockedAt)fail('Start movement first.',409);
   if(r.type!=='departure'&&r.answers.driver.floor!==true)fail('Confirm the bridge floor position before completing docking.',409);r.dockedAt=stamp();
  }else if(b.action==='sign'){
   if(items.some(x=>(x.type||'arrival')===r.type&&x.role===role&&(role==='driver'||x.phase==='pre')&&!r.answers[role][x.id])||r.ready[role]!==true||role==='driver'&&!r.dockedAt)fail('Complete your checks before signing.');
   const strokes=b.strokes;if(!Array.isArray(strokes)||!strokes.length||strokes.length>100||strokes.some(s=>!Array.isArray(s)||s.length<2)||strokes.flat().length>10000||strokes.flat().some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))fail('Handwritten signature required.');
   r.signatures[role]={employeeId:e.id,name:e.name,eid:e.eid,uid:req.hasUser.uid,strokes,at:stamp(),...(role==='driver'?{pbbId:terminalLicense.forGate(e,r.gate).id,pbbExpiry:terminalLicense.forGate(e,r.gate).expiry,pbbTerminal:terminalLicense.forGate(e,r.gate).terminal}:{})};
   if(r.signatures.driver&&r.signatures.spotter){r.completedAt=stamp();if(r.station==='LAX'&&r.account==='MU')r.discordDelivery={status:'pending'};}
  }else fail('Unknown action');
  r.owners[role]=e.id;r.updatedAt=stamp();r.revision++;return put(r);
 });
 app.post('/has-pbb-api/records/:id',route(async(req,res)=>{if(req.body.action==='answer'&&req.body.value===false){authorized(req,req.params.id);const photo=req.body.evidence?.photo;if(typeof photo!=='string'||photo.length>1400000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))fail('A valid problem photo is required.');try{const bytes=await require('sharp')(Buffer.from(photo.split(',')[1],'base64'),{limitInputPixels:16000000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toBuffer();if(bytes.length>1024*1024)fail('Photo is too large.');req.body.evidence.photo='data:image/jpeg;base64,'+bytes.toString('base64');}catch{fail('Choose a valid problem photo.');}}const r=mutate(req);publish(r);res.json(r);if(req.body.action==='answer'&&req.body.value===false)void problemMail.tick().catch(()=>{});if(r.completedAt)void deliver(r.id);}));
 app.post('/has-pbb-api/records/:id/retry',route((req,res)=>{const r=authorized(req,req.params.id);if(!r.completedAt)fail('Checklist is not submitted.',409);void deliver(r.id);res.status(202).json(r);}));
 const sendPdf=async(req,res,r,authorize)=>{
  if(!r.completedAt)fail('Checklist is not submitted.',409);const generation=r.resetToken||'';
  if(!db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf)await deliver(r.id);
  const latest=authorize();if(!latest.completedAt||(latest.resetToken||'')!==generation)fail('Checklist changed. Reload before downloading.',409);
  const pdf=db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf;if(!pdf)fail('PDF is not ready. Please retry.',409);
  res.type('pdf').set('Content-Disposition',require('./public/public/download-filename').disposition(latest.type,latest)).send(pdf);
 };
 app.get('/has-pbb-api/records/:id/pdf',route((req,res)=>sendPdf(req,res,authorized(req,req.params.id),()=>authorized(req,req.params.id))));
 app.get('/has-pbb-api/dashboard/records/:id/pdf',route((req,res)=>{
  const authorize=()=>{const r=get(req.params.id);if(employeeAccounts.isHeadquarter(r)||!globalDashboard(req.hasUser)&&(!businessManager(req.hasUser)||!same(employeeAccounts.scope(employee(req.hasUser)),r)))fail('You can only download your Main Account PDFs.',403);return r;};
  return sendPdf(req,res,authorize(),authorize);
 }));
 app.get('/has-pbb-api/stream',route((req,res)=>{
  const id=String(req.query.id||'');if(id)authorized(req,id);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const sub={res,id,user:req.hasUser,scope:req.hasEmployee};streams.add(sub);res.write(`event: state\ndata: ${JSON.stringify(id?get(id):list(req.hasEmployee))}\n\n`);
  res.write(`event: gates\ndata: ${JSON.stringify(gateState(req.hasEmployee))}\n\n`);
  const timer=setInterval(()=>{try{if(!same(employee(sub.user,sub.scope),sub.scope))return res.end();res.write(': keep-alive\n\n');}catch{res.end();}},15000);timer.unref();res.on('close',()=>{clearInterval(timer);streams.delete(sub);});
 }));
 app.get('/has-pbb-api/dashboard',route((req,res)=>{
  // Resolve Main Account from the linked profile, never from client filters or additional accounts.
  const allowed=globalDashboard(req.hasUser)?null:employeeAccounts.scope(employee(req.hasUser));
  const visible=scope=>!employeeAccounts.isHeadquarter(scope)&&(!allowed||same(allowed,scope));
  const end=String(req.query.end||today());if(!validDate(end))fail('Select a valid end date.');
  const start=String(req.query.start||new Date(Date.parse(end)-6*86400000).toISOString().slice(0,10));
  if(!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>92)fail('Select a date range of up to 93 days.');
  const station=String(req.query.station||'ALL').toUpperCase(),account=String(req.query.account||'ALL').toUpperCase();
  if(allowed&&((station!=='ALL'&&station!==allowed.station)||(account!=='ALL'&&account!==allowed.account)))fail('You can only view your Main Account dashboard.',403);
  const rows=db.prepare("SELECT data FROM has_pbb_records WHERE (?='ALL' OR station=?) AND (?='ALL' OR account=?) AND date>=? AND date<=? ORDER BY date,station,account,flight,bridge").all(station,station,account,account,start,end).map(x=>JSON.parse(x.data)).filter(visible);
  const configured=schedule().pairs.filter(visible);
  const scopes=[...configured,...employees.get().employees,...db.prepare('SELECT DISTINCT station,account FROM has_pbb_records').all()].map(e=>({station:e.station,account:e.account})).filter(visible).filter((e,i,a)=>a.findIndex(x=>same(x,e))===i);
  const selectedScopes=scopes.filter(s=>(station==='ALL'||s.station===station)&&(account==='ALL'||s.account===account));
  const flightIdentity=r=>[r.station,r.account,r.date,r.type||'arrival',r.flightNo].join('/');
  const isScheduled=r=>{const weekday=new Date(r.date+'T12:00:00Z').getUTCDay()||7;return configured.some(pair=>{const leg=pair[(r.type||'arrival')==='departure'?'outbound':'inbound'];return same(pair,r)&&leg.flightNo===r.flightNo&&leg.days.includes(weekday);});};
  const counts=all=>{const done=all.filter(r=>r.completedAt);return {submittedFlights:new Set(done.map(flightIdentity)).size,coveredFlights:new Set(done.filter(isScheduled).map(flightIdentity)).size,submittedChecklists:done.length,pending:all.filter(r=>!r.completedAt).length};};
  const expected=(date,scope)=>{const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7;return configured.filter(pair=>same(pair,scope)).reduce((n,pair)=>n+Number(pair.inbound.days.includes(weekday))+Number(pair.outbound.days.includes(weekday)),0);};
  const daily=[];for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000){const date=new Date(d).toISOString().slice(0,10);daily.push({date,expectedFlights:selectedScopes.reduce((n,s)=>n+expected(date,s),0),...counts(rows.filter(r=>r.date===date))});}
  const byScope=selectedScopes.map(s=>({...s,weeklyArrivals:configured.filter(pair=>same(pair,s)).reduce((n,pair)=>n+pair.inbound.days.length,0),weeklyDepartures:configured.filter(pair=>same(pair,s)).reduce((n,pair)=>n+pair.outbound.days.length,0),expectedFlights:daily.reduce((n,d)=>n+expected(d.date,s),0),...counts(rows.filter(r=>same(r,s)))}));
  res.json({station,account,start,end,daily,scopes,byScope,records:rows.map(({answers,signatures,evidence,...r})=>({...r,operators:Object.fromEntries(Object.entries(signatures).map(([role,s])=>[role,s.name]))}))});
 }));
 for(const row of db.prepare('SELECT id,data FROM has_pbb_records').all()){const r=JSON.parse(row.data);if(r.completedAt&&(r.delivery.status!=='ready'||r.station==='LAX'&&r.account==='MU'&&['pending','failed'].includes(r.discordDelivery?.status)))void deliver(row.id);}
 return {deliver,get,pruneIncomplete,flushProblemMail:problemMail.tick,close(){problemMail.close();clearInterval(cleanupTimer);for(const s of streams)s.res.end();}};
}
module.exports={registerHasPbb};
