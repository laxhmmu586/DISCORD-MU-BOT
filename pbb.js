const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
const Database=require('better-sqlite3');
const items=require('./public/public/pbb-data');
const roles=['driver','spotter'];
const {StandardFontEmbedder,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const signalGroups=require('./pbbSignals');
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function validateInfo(b){
 if(!['arrival','departure'].includes(b.type))fail('Select checklist type');
 const flightNo=String(b.flightNo||'').trim().toUpperCase(),date=String(b.date||''),gate=String(b.gate||'').trim().toUpperCase(),blockTime=String(b.blockTime||'');
 if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!/^[A-Z0-9-]{1,20}$/.test(gate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(blockTime))fail('Valid flight, date, gate and block time are required');
 if(!Array.isArray(b.bridges)||!b.bridges.length||b.bridges.length>3||b.bridges.some(x=>!['L1','L2','L3'].includes(x)))fail('Select jet bridge L1, L2 or L3');
 return {type:b.type,flightNo,date,gate,blockTime,bridges:[...new Set(b.bridges)]};
}
function createStore(filename=process.env.PBB_DB_PATH||path.join(__dirname,'data/pbb.db'),{now=()=>new Date()}={}){
 if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new Database(filename);db.pragma('journal_mode = WAL');db.exec('CREATE TABLE IF NOT EXISTS pbb_records (id TEXT PRIMARY KEY, data TEXT NOT NULL, pdf BLOB)');
 const get=id=>{const row=db.prepare('SELECT data FROM pbb_records WHERE id=?').get(id);if(!row)fail('Checklist not found',404);const r=JSON.parse(row.data);if(r.type==='arrival'&&!r.completedAt)for(const role of roles)if(!r.signatures[role])r.answers[role].a1='Y';return r;};
 const put=r=>{db.prepare('UPDATE pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return r;};
 const mutate=db.transaction((id,user,body)=>{
  const r=get(id),role=body.role;if(!roles.includes(role))fail('Select driver or spotter');if(r.completedAt)fail('Completed checklist is locked',409);
  if(r.signatures[role])fail('Signed section is locked',409);
  if(r.owners[role]&&r.owners[role]!==user.uid)fail('This role belongs to another operator',403);
  if(r.owners[roles.find(x=>x!==role)]===user.uid)fail('Driver and spotter must be different operator sessions',403);
  if(body.action==='claim'){
   // Role ownership is reserved on the flight information page.
  }else if(body.action==='signal'){
   const groups=signalGroups[r.type],group=groups[body.phase];if(!group||group.role!==role)fail('This confirmation belongs to the other operator',403);
   if(group.after){const prior=groups[group.after];if(!r.signals?.[group.after]||prior.items.some(id=>r.answers[prior.role][id]!=='Y'))fail('Wait for '+group.after.toUpperCase()+' confirmation',409);}
   r.signals ||= {};r.signals[body.phase]={at:now().toISOString(),uid:user.uid,role};for(const id of group.items)r.answers[role][id]='Y';
  }else if(body.action==='answer'){
   const row=items[r.type].find(x=>x.id===body.itemId);if(!row||row.hidden||!row.roles.includes(role))fail('Item is not assigned to this role',403);
   if(!['Y','N','NA'].includes(body.value))fail('Select Y, N or N/A');r.answers[role][row.id]=body.value;
   // Editing a signal-related original row invalidates its aggregate confirmation.
   for(const [phase,group] of Object.entries(signalGroups[r.type]))if(group.items.includes(row.id)&&r.signals?.[phase])delete r.signals[phase];
   if(typeof body.note==='string')r.notes[role][row.id]=body.note.trim().slice(0,1000);
   if(body.value==='N'&&!r.notes[role][row.id])fail('Explain the N response before saving');
  }else if(body.action==='sign'){
   if(items[r.type].some(x=>x.roles.includes(role)&&!r.answers[role][x.id]))fail('Complete all assigned items first');
   for(const [phase,group] of Object.entries(signalGroups[r.type]))if(group.role===role&&group.items.every(id=>r.answers[role][id]==='Y')&&!r.signals?.[phase])fail('Confirm '+group.label+' in the shared operations panel');
   const name=String(body.name||'').trim();const strokes=body.strokes;try{employeeFont.encodeText(name);}catch{fail('Use the employee name in English spelling for the original PDF');}
   if(!name||name.length>100||!Array.isArray(strokes)||!strokes.length||strokes.length>100||strokes.flat().length>10000||strokes.some(s=>!Array.isArray(s)||s.length<2||s.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))))fail('Name and handwritten signature are required');
   r.signatures[role]={name,eid:String(body.eid||''),employeeId:body.employeeId,strokes,at:now().toISOString(),uid:user.uid};
  }else fail('Unknown operation');
  r.owners[role]=user.uid;r.revision++;r.updatedAt=now().toISOString();
  if(roles.every(x=>r.signatures[x]))r.completedAt=r.updatedAt;
  return put(r);
 });
 return {db,get,put,mutate,now,create:db.transaction((body,user)=>{const info=validateInfo({...body,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now())});const candidates=db.prepare("SELECT data FROM pbb_records WHERE json_extract(data,'$.flightNo')=? AND json_extract(data,'$.date')=? AND json_extract(data,'$.type')=? AND json_extract(data,'$.gate')=? AND json_extract(data,'$.completedAt') IS NULL ORDER BY rowid DESC").all(info.flightNo,info.date,info.type,info.gate).map(x=>JSON.parse(x.data));const active=candidates.find(r=>[...r.bridges].sort().join('|')===[...info.bridges].sort().join('|'));if(active)return active;const r={...info,id:crypto.randomUUID(),createdBy:user.uid,createdAt:now().toISOString(),updatedAt:now().toISOString(),revision:1,owners:{},answers:{driver:body.type==='arrival'?{a1:'Y',a2:'Y',a10:'NA'}:{d1:'Y'},spotter:body.type==='arrival'?{a1:'Y',a2:'Y'}:{}},notes:{driver:{},spotter:{}},signatures:{},delivery:{drive:{status:'pending'},discord:{status:'pending'}}};db.prepare('INSERT INTO pbb_records(id,data) VALUES (?,?)').run(r.id,JSON.stringify(r));return r;}),list(){return db.prepare('SELECT data FROM pbb_records ORDER BY rowid DESC LIMIT 100').all().map(x=>JSON.parse(x.data));},pdf(id){return db.prepare('SELECT pdf FROM pbb_records WHERE id=?').get(id)?.pdf;},setPdf(id,buffer){db.prepare('UPDATE pbb_records SET pdf=? WHERE id=?').run(buffer,id);}};
}
function registerPbb(app,{client,authenticate=require('./pbbAuth').authenticate,store=createStore(),buildPdf=require('./pbbPdf').buildPbbPdf,drive:providedDrive,gateService=require('./pbbEtab').createGateService(),employeeSeed}={}){
 const {google}=require('googleapis'),{Readable}=require('node:stream');
 const drive=providedDrive||google.drive({version:'v3',auth:new google.auth.GoogleAuth({credentials:{client_email:process.env.GOOGLE_CLIENT_EMAIL,private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/drive.file']})});
 const employees=require('./employees').createEmployeeStore(store.db,{seed:employeeSeed});
 require('./employees').registerEmployees(app,{store:employees,authenticate,onChange:()=>{for(const clients of streams.values())for(const res of clients)res.write(`event: employees\ndata: ${JSON.stringify(employees.options())}\n\n`);}});
 store.db.exec('CREATE TABLE IF NOT EXISTS pbb_guest_sessions (token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, expires INTEGER NOT NULL)');
 app.post('/pbb-api/session',(_req,res)=>{const token='pbb_guest_'+crypto.randomBytes(32).toString('hex'),uid='guest-'+crypto.randomUUID(),expires=Date.now()+86400000;store.db.prepare('DELETE FROM pbb_guest_sessions WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO pbb_guest_sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),uid,expires);res.set('Cache-Control','no-store').json({token,uid,expires});});
 const streams=new Map(),jobs=new Map();
 const presence=id=>{const clients=streams.get(id)||[];const online=new Set([...clients].map(res=>res.pbbUid)).size;for(const res of clients)res.write(`event: presence\ndata: ${JSON.stringify({online})}\n\n`);};
 const publish=r=>{for(const res of streams.get(r.id)||[])res.write(`event: state\ndata: ${JSON.stringify(r)}\n\n`);};
 const save=r=>{store.put(r);publish(r);};
 async function deliver(id){
  if(jobs.has(id))return jobs.get(id);
  const job=(async()=>{
   let r=store.get(id);if(!r.completedAt)return;
   let pdf=store.pdf(id);
   try{if(!pdf){pdf=await buildPdf(r);store.setPdf(id,pdf);}}catch(e){r.pdfError=e.message;save(r);return;}
   delete r.pdfError;
   const name=`JetBridge-${r.type}-${r.flightNo}-${r.date}-${id}.pdf`;
   if(r.delivery.drive.status!=='sent'){
    try{
     if(!r.delivery.drive.fileId){const generated=await drive.files.generateIds({count:1,space:'drive'});r.delivery.drive.fileId=generated.data.ids[0];save(r);}
     const fileId=r.delivery.drive.fileId;let exists=false;
     try{await drive.files.get({fileId,fields:'id',supportsAllDrives:true});exists=true;}catch(e){if(Number(e.code)!==404&&Number(e.response?.status)!==404)throw e;}
     if(!exists)await drive.files.create({requestBody:{id:fileId,name,parents:[process.env.PBB_DRIVE_FOLDER_ID||'1wMyB23ikaAnbkhJZcKBKBNujEeeY7Xsu']},media:{mimeType:'application/pdf',body:Readable.from(pdf)},fields:'id',supportsAllDrives:true});
     r.delivery.drive={status:'sent',fileId,url:`https://drive.google.com/file/d/${fileId}/view`};
    }catch(e){r.delivery.drive={...r.delivery.drive,status:'failed',error:e.message};}save(r);
   }
   if(r.delivery.discord.status!=='sent'){
    try{const channel=await client.channels.fetch(process.env.PBB_DISCORD_CHANNEL_ID||'1559561919826890852');if(!channel?.isTextBased())throw new Error('Discord channel is unavailable');
     const sent=await channel.send({content:`Jet Bridge ${r.type.toUpperCase()} | ${r.flightNo} | ${r.date} | Gate ${r.gate}\nDriver: ${r.signatures.driver.name} ✓ | Spotter: ${r.signatures.spotter.name} ✓\nRecord: ${id}`,files:[{attachment:pdf,name}],nonce:crypto.createHash('sha256').update(id).digest('hex').slice(0,24),enforceNonce:true});r.delivery.discord={status:'sent',messageId:sent.id};
    }catch(e){r.delivery.discord={status:'failed',error:e.message};}save(r);
   }
  })().finally(()=>jobs.delete(id));jobs.set(id,job);return job;
 }
 app.use('/pbb-api',async(req,res,next)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(token.startsWith('pbb_guest_')){const session=store.db.prepare('SELECT uid,expires FROM pbb_guest_sessions WHERE token_hash=?').get(crypto.createHash('sha256').update(token).digest('hex'));if(!session||session.expires<Date.now())throw Error('Expired session');req.pbbUser={uid:session.uid,email:''};}else req.pbbUser=await authenticate(req);next();}catch{res.status(401).json({error:'Sign in required or sign-in verification unavailable'});}});
 const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({error:e.message});}};
 app.get('/pbb-api/gate',route(async(req,res)=>{const flightNo=String(req.query.flightNo||'').toUpperCase(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(store.now());if(!/^[A-Z]{2}\d{1,4}$/.test(flightNo)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))fail('Valid flight and date required');res.json(await gateService.read(flightNo,date));}));
 app.get('/pbb-api/employees',(_req,res)=>res.json(employees.options()));
 app.get('/pbb-api/records',route((req,res)=>res.json(store.list())));
 app.post('/pbb-api/records',route((req,res)=>{let r=store.create(req.body,req.pbbUser);if(req.body.role)r=store.mutate(r.id,req.pbbUser,{action:'claim',role:req.body.role});publish(r);res.status(201).json(r);}));
 app.get('/pbb-api/records/:id',route((req,res)=>res.json(store.get(req.params.id))));
 app.post('/pbb-api/records/:id',route(async(req,res)=>{const body={...req.body};if(body.action==='sign'){const employee=employees.eligible(body.role,body.employeeId);if(!employee)fail('Select an employee authorized for this role');const existing=store.get(req.params.id);if(Object.values(existing.signatures).some(s=>s.employeeId===employee.id))fail('Driver and spotter must be different employees');body.name=employee.name;body.eid=employee.eid;}const r=store.mutate(req.params.id,req.pbbUser,body);publish(r);res.json(r);if(r.completedAt)void deliver(r.id);}));
 app.post('/pbb-api/records/:id/retry',route((req,res)=>{const r=store.get(req.params.id);if(!r.completedAt)fail('Both signatures required',409);void deliver(r.id);res.status(202).json(r);}));
 app.get('/pbb-api/records/:id/pdf',route((req,res)=>{const r=store.get(req.params.id);if(!r.completedAt)fail('Both signatures required',409);const pdf=store.pdf(r.id);if(!pdf)fail('PDF is generating. Please retry.',409);res.setHeader('Content-Disposition',`attachment; filename="JetBridge-${r.type}-${r.flightNo}-${r.date}.pdf"`);res.type('pdf').send(pdf);}));
 app.get('/pbb-api/records/:id/stream',route((req,res)=>{
  const r=store.get(req.params.id);res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  res.pbbUid=req.pbbUser.uid;if(!streams.has(r.id))streams.set(r.id,new Set());streams.get(r.id).add(res);res.write(`event: state\ndata: ${JSON.stringify(r)}\n\n`);presence(r.id);
  const timer=setInterval(()=>res.write(': keep-alive\n\n'),15000);timer.unref();res.on('close',()=>{clearInterval(timer);streams.get(r.id)?.delete(res);if(!streams.get(r.id)?.size)streams.delete(r.id);else presence(r.id);});
 }));
 // Retry interrupted work after restart; completed delivery targets are skipped.
 for(const r of store.list())if(r.completedAt&&(r.delivery.drive.status!=='sent'||r.delivery.discord.status!=='sent'))void deliver(r.id);
 return {store,employees,deliver,close(){for(const clients of streams.values())for(const res of clients)res.end();}};
}
module.exports={createStore,registerPbb,validateInfo};

