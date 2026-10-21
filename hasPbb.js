const crypto=require('node:crypto');
const items=require('./public/public/has-pbb-data');
const {hasPbbLicense}=require('./employees');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function registerHasPbb(app,{store,employees,profiles,authenticate,drive,buildPdf=require('./hasPbbPdf').buildHasPbbPdf}){
 const db=store.db,streams=new Set(),jobs=new Map();
 db.exec('CREATE TABLE IF NOT EXISTS has_pbb_records(id TEXT PRIMARY KEY, station TEXT NOT NULL, account TEXT NOT NULL, date TEXT NOT NULL, flight TEXT NOT NULL, bridge TEXT NOT NULL, data TEXT NOT NULL, pdf BLOB, UNIQUE(station,account,date,flight,bridge))');
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(store.now());
 const get=id=>{const row=db.prepare('SELECT data FROM has_pbb_records WHERE id=?').get(id);if(!row)fail('Checklist not found',404);return JSON.parse(row.data);};
 const put=r=>{db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return r;};
 const same=(a,b)=>a.station===b.station&&a.account===b.account;
 function employee(user){profiles.status(user);const row=profiles.linked(user);if(!row)fail('Link your employee account in My Profile first.',403);return row;}
 const dashboard=user=>String(user.email||'').trim().toLowerCase()==='lake@mu.com';
 function roleCheck(e,role,date=today()){
  if(!['driver','spotter'].includes(role))fail('Select Driver or Spotter');
  if(role==='driver'&&(!e.attach||!hasPbbLicense(e,date)))fail('A valid PBB ID and unexpired qualification are required. Cannot drive PBB.',403);
  if(role==='spotter'&&!e.spotter)fail('Spotter qualification required.',403);
 }
 const list=e=>db.prepare('SELECT data FROM has_pbb_records WHERE station=? AND account=? AND date=? ORDER BY flight,bridge').all(e.station,e.account,today()).map(x=>JSON.parse(x.data));
 function authorized(req,id){const r=get(id);if(!same(req.hasEmployee,r))fail('This checklist belongs to another station/account.',403);return r;}
 function publish(r){for(const s of streams){try{const current=employee(s.user);if(!same(current,s.scope)){s.res.end();continue;}if(s.id?s.id===r.id:same(current,r))s.res.write(`event: state\ndata: ${JSON.stringify(s.id?r:list(current))}\n\n`);}catch{s.res.end();}}}
 const stamp=()=>store.now().toISOString();
 async function deliver(id){
  if(jobs.has(id))return jobs.get(id);
  const job=(async()=>{
   let r=get(id);if(!r.completedAt||r.delivery.status==='sent')return;
   try{
    let pdf=db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(id).pdf;
    if(!pdf){pdf=await buildPdf(r);db.prepare('UPDATE has_pbb_records SET pdf=? WHERE id=?').run(pdf,id);}
    const folderId=process.env.HAS_PBB_DRIVE_FOLDER_ID||process.env.PBB_DRIVE_FOLDER_ID||'1wMyB23ikaAnbkhJZcKBKBNujEeeY7Xsu';
    if(drive.validateFolder)await drive.validateFolder(folderId);
    if(!r.delivery.fileId){const generated=await drive.files.generateIds({count:1,space:'drive'});r.delivery.fileId=generated.data.ids[0];put(r);}
    const fileId=r.delivery.fileId;let exists=false;
    try{await drive.files.get({fileId,fields:'id',supportsAllDrives:true});exists=true;}catch(e){if(Number(e.code)!==404&&Number(e.response?.status)!==404)throw e;}
    if(!exists)await drive.files.create({requestBody:{id:fileId,name:`HAS-PBB-${r.station}-${r.account}-${r.date}-${r.flightNo}-${r.bridge}.pdf`,parents:[folderId]},media:{mimeType:'application/pdf',body:require('node:stream').Readable.from(pdf)},fields:'id',supportsAllDrives:true});
    r.delivery={status:'sent',fileId,url:`https://drive.google.com/file/d/${fileId}/view`};
   }catch(e){r.delivery={...r.delivery,status:'failed',error:require('./pbbDrive').driveError(e)};}
   r.revision++;put(r);publish(r);
  })().finally(()=>jobs.delete(id));jobs.set(id,job);return job;
 }
 app.use('/has-pbb-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{req.hasUser=await authenticate(req);if(req.path.startsWith('/dashboard')){if(!dashboard(req.hasUser))fail('Dashboard access is restricted to lake@mu.com.',403);}else req.hasEmployee=employee(req.hasUser);next();}catch(e){res.status(e.status||401).json({error:e.message});}});
 const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({error:e.message});}};
 app.get('/has-pbb-api/context',route((req,res)=>{const e=req.hasEmployee;res.json({employee:{id:e.id,name:e.name,eid:e.eid,station:e.station,account:e.account,pbbId:e.pbbId||'',pbbExpiry:e.pbbExpiry||'',driver:!!e.attach&&hasPbbLicense(e,today()),spotter:e.spotter},date:today(),dashboard:dashboard(req.hasUser)});}));
 app.get('/has-pbb-api/records',route((req,res)=>res.json(list(req.hasEmployee))));
 app.post('/has-pbb-api/records',route((req,res)=>{
  const e=req.hasEmployee;roleCheck(e,req.body.role);
  const flightNo=String(req.body.flightNo||'').trim().toUpperCase(),gate=String(req.body.gate||'').trim().toUpperCase(),bridge=req.body.bridge,date=today();
  if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||! /^[A-Z0-9-]{1,20}$/.test(gate)||!['L1','L2','L3'].includes(bridge))fail('Confirm flight, gate number and L1/L2/L3.');
  const create=db.transaction(()=>{const old=db.prepare('SELECT id FROM has_pbb_records WHERE station=? AND account=? AND date=? AND flight=? AND bridge=?').get(e.station,e.account,date,flightNo,bridge);if(old){const r=get(old.id);if(r.gate!==gate)fail('Gate differs from the shared checklist. Confirm the saved gate before joining.',409);return r;}
   const r={id:crypto.randomUUID(),station:e.station,account:e.account,date,flightNo,gate,bridge,type:'arrival',revision:1,createdAt:stamp(),updatedAt:stamp(),createdBy:e.id,answers:{driver:{},spotter:{}},ready:{driver:null,spotter:null},owners:{},signatures:{},delivery:{status:'pending'}};
   db.prepare('INSERT INTO has_pbb_records(id,station,account,date,flight,bridge,data) VALUES(?,?,?,?,?,?,?)').run(r.id,e.station,e.account,date,flightNo,bridge,JSON.stringify(r));return r;
  });const r=create();publish(r);res.status(201).json(r);
 }));
 app.get('/has-pbb-api/records/:id',route((req,res)=>res.json(authorized(req,req.params.id))));
 const mutate=db.transaction((req)=>{
  const r=authorized(req,req.params.id),b=req.body,e=req.hasEmployee,role=b.role;roleCheck(e,role);
  if(r.completedAt)fail('Submitted checklist is locked.',409);
  if(r.date!==today())fail('This checklist is from a previous day.',409);
  if(b.revision!==r.revision)fail('Checklist changed. Review the latest shared state.',409);
  if(r.owners[role]&&r.owners[role]!==e.id)fail('This role is already assigned to another employee.',403);
  if(r.owners[role==='driver'?'spotter':'driver']===e.id)fail('Driver and Spotter must be different employees.',403);
  if(r.signatures[role]&&b.action!=='ready')fail('Your signed section is locked.',409);
  if(b.action==='answer'){
   const item=items.find(x=>x.id===b.itemId&&x.role===role);if(!item||typeof b.value!=='boolean')fail('Invalid checklist answer');
   if(item.phase==='after'&&!r.dockedAt||item.phase==='pre'&&r.movingAt||item.phase==='movement'&&(!r.movingAt||r.dockedAt))fail('This checklist phase is locked.',409);
   r.answers[role][item.id]=b.value;
   if(item.phase==='pre'){r.ready[role]=null;delete r.signatures[role];}
  }else if(b.action==='ready'){
   if(r.movingAt)fail('Movement has started. Ready state is locked.',409);
   if(typeof b.value!=='boolean')fail('Select Ready or Not ready');
   if(b.value&&items.some(x=>x.role===role&&x.phase==='pre'&&!r.answers[role][x.id]))fail('Complete pre-movement checks first.');
   r.ready[role]=b.value;delete r.signatures[role];
  }else if(b.action==='move'){
   if(role!=='driver'||r.movingAt||r.ready.driver!==true||r.ready.spotter!==true||!r.signatures.spotter)fail('Wait for both Ready confirmations and the Spotter signature.',409);
   r.movingAt=stamp();r.driverQualification={id:e.pbbId,expiry:e.pbbExpiry};
  }else if(b.action==='dock'){
   if(role!=='driver'||!r.movingAt||r.dockedAt)fail('Start movement first.',409);
   if(r.answers.driver.floor!==true)fail('Confirm the bridge floor position before completing docking.',409);r.dockedAt=stamp();
  }else if(b.action==='sign'){
   if(items.some(x=>x.role===role&&(role==='driver'||x.phase==='pre')&&!r.answers[role][x.id])||r.ready[role]!==true||role==='driver'&&!r.dockedAt)fail('Complete your checks before signing.');
   const strokes=b.strokes;if(!Array.isArray(strokes)||!strokes.length||strokes.length>100||strokes.some(s=>!Array.isArray(s)||s.length<2)||strokes.flat().length>10000||strokes.flat().some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))fail('Handwritten signature required.');
   r.signatures[role]={employeeId:e.id,name:e.name,eid:e.eid,uid:req.hasUser.uid,strokes,at:stamp(),...(role==='driver'?{pbbId:e.pbbId,pbbExpiry:e.pbbExpiry}:{})};
   if(r.signatures.driver&&r.signatures.spotter)r.completedAt=stamp();
  }else fail('Unknown action');
  r.owners[role]=e.id;r.updatedAt=stamp();r.revision++;return put(r);
 });
 app.post('/has-pbb-api/records/:id',route((req,res)=>{const r=mutate(req);publish(r);res.json(r);if(r.completedAt)void deliver(r.id);}));
 app.post('/has-pbb-api/records/:id/retry',route((req,res)=>{const r=authorized(req,req.params.id);if(!r.completedAt)fail('Checklist is not submitted.',409);void deliver(r.id);res.status(202).json(r);}));
 app.get('/has-pbb-api/records/:id/pdf',route((req,res)=>{const r=authorized(req,req.params.id);if(!r.completedAt)fail('Checklist is not submitted.',409);const pdf=db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf;if(!pdf)fail('PDF is still generating.',409);res.type('pdf').attachment(`HAS-PBB-${r.date}-${r.flightNo}-${r.bridge}.pdf`).send(pdf);}));
 app.get('/has-pbb-api/stream',route((req,res)=>{
  const id=String(req.query.id||'');if(id)authorized(req,id);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const sub={res,id,user:req.hasUser,scope:req.hasEmployee};streams.add(sub);res.write(`event: state\ndata: ${JSON.stringify(id?get(id):list(req.hasEmployee))}\n\n`);
  const timer=setInterval(()=>{try{if(!same(employee(sub.user),sub.scope))return res.end();res.write(': keep-alive\n\n');}catch{res.end();}},15000);timer.unref();res.on('close',()=>{clearInterval(timer);streams.delete(sub);});
 }));
 app.get('/has-pbb-api/dashboard',route((req,res)=>{
  const end=String(req.query.end||today());if(!validDate(end))fail('Select a valid end date.');
  const start=String(req.query.start||new Date(Date.parse(end)-6*86400000).toISOString().slice(0,10));
  if(!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>92)fail('Select a date range of up to 93 days.');
  const station=String(req.query.station||'ALL').toUpperCase(),account=String(req.query.account||'ALL').toUpperCase();
  const rows=db.prepare("SELECT data FROM has_pbb_records WHERE (?='ALL' OR station=?) AND (?='ALL' OR account=?) AND date>=? AND date<=? ORDER BY date,station,account,flight,bridge").all(station,station,account,account,start,end).map(x=>JSON.parse(x.data));
  const scopes=[...employees.get().employees,...db.prepare('SELECT DISTINCT station,account FROM has_pbb_records').all()].map(e=>({station:e.station,account:e.account})).filter((e,i,a)=>a.findIndex(x=>same(x,e))===i);
  const selectedScopes=scopes.filter(s=>(station==='ALL'||s.station===station)&&(account==='ALL'||s.account===account));
  const counts=all=>{const done=all.filter(r=>r.completedAt);return {submittedFlights:new Set(done.map(r=>[r.station,r.account,r.date,r.flightNo].join('/'))).size,submittedChecklists:done.length,driveSaved:done.filter(r=>r.delivery.status==='sent').length,pending:all.filter(r=>!r.completedAt).length};};
  const daily=[];for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000){const date=new Date(d).toISOString().slice(0,10);daily.push({date,expectedFlights:selectedScopes.length,...counts(rows.filter(r=>r.date===date))});}
  const byScope=selectedScopes.map(s=>({...s,expectedFlights:daily.length,...counts(rows.filter(r=>same(r,s)))}));
  res.json({station,account,start,end,daily,scopes,byScope,records:rows.map(({answers,signatures,...r})=>({...r,operators:Object.fromEntries(Object.entries(signatures).map(([role,s])=>[role,s.name]))}))});
 }));
 for(const row of db.prepare('SELECT id,data FROM has_pbb_records').all()){const r=JSON.parse(row.data);if(r.completedAt&&r.delivery.status!=='sent')void deliver(row.id);}
 return {deliver,get,close(){for(const s of streams)s.res.end();}};
}
module.exports={registerHasPbb};
