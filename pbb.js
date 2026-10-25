const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
const Database=require('better-sqlite3');
const items=require('./public/public/pbb-data');
const roles=['driver','spotter'];
const {StandardFontEmbedder,StandardFonts}=require('./vendor/pdf-lib/pdf-lib');
const employeeFont=StandardFontEmbedder.for(StandardFonts.Helvetica);
const signalGroups=require('./pbbSignals');
function discordMessage(r){
 const line=value=>String(value??'').replace(/\s+/g,' ').trim();
 return [
  `Jet Bridge ${line(r.type).toUpperCase()} | ${line(r.flightNo)} | ${line(r.date)} |`,
  `Gate ${line(r.gate)} | ${r.bridges.map(line).join(' / ')}`,
  `Driver: ${line(r.signatures.driver.name)} ✓`,
  `Spotter: ${line(r.signatures.spotter.name)} ✓`
 ].join('\n');
}
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function validateInfo(b){
 if(!['arrival','departure'].includes(b.type))fail('Select checklist type');
 const flightNo=String(b.flightNo||'').trim().toUpperCase(),date=String(b.date||''),gate=String(b.gate||'').trim().toUpperCase(),blockTime='';
 if(!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flightNo)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!/^[A-Z0-9-]{1,20}$/.test(gate))fail('Valid flight, date and gate are required');
 if(!Array.isArray(b.bridges)||b.bridges.length!==1||!['L1','L2','L3'].includes(b.bridges[0]))fail('Select one jet bridge: L1, L2 or L3');
 return {type:b.type,flightNo,date,gate,blockTime,bridges:[...new Set(b.bridges)]};
}
function pdfFilename(r){return `JetBridge-${r.type}-${r.flightNo}-${r.date}-${r.bridges.join('-')}.pdf`;}
function createStore(filename=process.env.PBB_DB_PATH||path.join(__dirname,'data/pbb.db'),{now=()=>new Date()}={}){
 if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new Database(filename);db.pragma('journal_mode = WAL');db.exec('CREATE TABLE IF NOT EXISTS pbb_records (id TEXT PRIMARY KEY, data TEXT NOT NULL, pdf BLOB)');
 const get=id=>{const row=db.prepare('SELECT data FROM pbb_records WHERE id=?').get(id);if(!row)fail('Checklist not found',404);const r=JSON.parse(row.data);if(r.type==='arrival'&&!r.completedAt)for(const role of roles)if(!r.signatures[role]){r.answers[role].a1='Y';if(role==='driver')r.answers[role].a5='Y';}if(r.type==='departure'&&!r.completedAt&&!r.signatures.driver){r.answers.driver.d12='Y';}return r;};
 const put=r=>{db.prepare('UPDATE pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return r;};
 const mutate=db.transaction((id,user,body)=>{
  const r=get(id),role=body.role;if(!roles.includes(role))fail('Select driver or spotter');if(r.completedAt)fail('Completed checklist is locked',409);
  if(r.signatures[role])fail('Signed section is locked',409);

  if(body.action==='claim'){
   // Continue the same shared role; its saved answers survive operator changes.
   }else if(body.action==='checklist-done'){
   const groups=Object.entries(signalGroups[r.type]).filter(([,g])=>g.role===role),signalIds=groups.flatMap(([,g])=>g.items);
   if(items[r.type].some(x=>!x.hidden&&x.roles.includes(role)&&!signalIds.includes(x.id)&&!r.answers[role][x.id]))fail('Complete all checklist questions first');
   const confirmation={at:now().toISOString(),uid:user.uid,role};r.checklistDone ||= {};r.checklistDone[role]=confirmation;r.signals ||= {};
   for(const [phase,group] of groups){r.signals[phase]=confirmation;for(const id of group.items)r.answers[role][id] ||= 'Y';}
  }else if(body.action==='signal'){
   const groups=signalGroups[r.type],group=groups[body.phase];if(!group||group.role!==role)fail('This confirmation belongs to the other operator',403);
   if(group.after){const prior=groups[group.after];if(!r.signals?.[group.after]||prior.items.some(id=>r.answers[prior.role][id]!=='Y'))fail('Wait for '+group.after.toUpperCase()+' confirmation',409);}
   r.signals ||= {};r.signals[body.phase]={at:now().toISOString(),uid:user.uid,role};for(const id of group.items)r.answers[role][id]='Y';
  }else if(body.action==='answer'){
   const row=items[r.type].find(x=>x.id===body.itemId);if(!row||row.hidden||!row.roles.includes(role))fail('Item is not assigned to this role',403);
   if(!['Y','N','NA'].includes(body.value))fail('Select Y, N or N/A');r.answers[role][row.id]=body.value;
   // Editing a signal-related original row invalidates its aggregate confirmation.
   for(const [phase,group] of Object.entries(signalGroups[r.type]))if(group.items.includes(row.id)&&r.signals?.[phase])delete r.signals[phase];
   if(r.checklistDone?.[role]){delete r.checklistDone[role];for(const [phase,g] of Object.entries(signalGroups[r.type]))if(g.role===role)delete r.signals?.[phase];}
   if(typeof body.note==='string')r.notes[role][row.id]=body.note.trim().slice(0,1000);
  }else if(body.action==='sign'){
   const groups=Object.entries(signalGroups[r.type]).filter(([,g])=>g.role===role),signalIds=groups.flatMap(([,g])=>g.items);
   if(items[r.type].some(x=>!x.hidden&&x.roles.includes(role)&&!signalIds.includes(x.id)&&!r.answers[role][x.id]))fail('Complete all assigned items first');
   const name=String(body.name||'').trim();const strokes=body.strokes;try{employeeFont.encodeText(name);}catch{fail('Use the employee name in English spelling for the original PDF');}
   if(!name||name.length>100||!Array.isArray(strokes)||!strokes.length||strokes.length>100||strokes.flat().length>10000||strokes.some(s=>!Array.isArray(s)||s.length<2||s.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))))fail('Name and handwritten signature are required');
   // Confirm and sign this role atomically, independent of the peer.
   const confirmation={at:now().toISOString(),uid:user.uid,role};r.checklistDone ||= {};r.checklistDone[role]=confirmation;r.signals ||= {};
   for(const [phase,group] of groups){r.signals[phase]=confirmation;for(const itemId of group.items)r.answers[role][itemId]='Y';}
   r.signatures[role]={name,eid:String(body.eid||''),employeeId:body.employeeId,strokes,at:now().toISOString(),uid:user.uid};
  }else fail('Unknown operation');
  r.participants ||= {driver:[],spotter:[]};if(!r.participants[role].includes(user.uid))r.participants[role].push(user.uid);r.owners[role]=user.uid;r.revision++;r.updatedAt=now().toISOString();
  if(roles.every(x=>r.signatures[x]))r.completedAt=r.updatedAt;
  return put(r);
 });
 const reset=db.transaction((id,{date,bridge,revision})=>{
  const selected=get(id);if(selected.date!==date||!selected.bridges.includes(bridge))fail('Only today’s selected bridge can be restarted',409);
  if(selected.revision!==revision)fail('Checklist changed. Refresh before restarting.',409);
  const deleted=[],updated=[];
  for(const row of db.prepare("SELECT id,data FROM pbb_records WHERE json_extract(data,'$.date')=? AND json_extract(data,'$.type')=?").all(date,selected.type)){
   const r=JSON.parse(row.data);if(!r.bridges.includes(bridge))continue;
   if(r.bridges.length>1){r.bridges=r.bridges.filter(b=>b!==bridge);r.revision++;r.updatedAt=now().toISOString();put(r);updated.push(r);}else{db.prepare('DELETE FROM pbb_records WHERE id=?').run(r.id);deleted.push(r.id);}
  }
  return {bridge,type:selected.type,deleted,updated};
 });
 return {db,get,put,mutate,now,reset,create:db.transaction((body,user)=>{const info=validateInfo({...body,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now())});const candidates=db.prepare("SELECT data FROM pbb_records WHERE json_extract(data,'$.date')=? AND json_extract(data,'$.type')=? ORDER BY (json_extract(data,'$.completedAt') IS NOT NULL) DESC, rowid ASC").all(info.date,info.type).map(x=>JSON.parse(x.data));const active=candidates.find(r=>r.bridges.includes(info.bridges[0]));if(active)return get(active.id);const r={...info,id:crypto.randomUUID(),createdBy:user.uid,createdAt:now().toISOString(),updatedAt:now().toISOString(),revision:1,owners:{},answers:{driver:body.type==='arrival'?{a1:'Y',a2:'Y',a5:'Y',a10:'NA'}:{d12:'Y'},spotter:body.type==='arrival'?{a1:'Y',a2:'Y'}:{}},notes:{driver:{},spotter:{}},signatures:{},delivery:{drive:{status:'pending'},discord:{status:'pending'}}};db.prepare('INSERT INTO pbb_records(id,data) VALUES (?,?)').run(r.id,JSON.stringify(r));return r;}),day(date,type){return db.prepare("SELECT data FROM pbb_records WHERE json_extract(data,'$.date')=? AND json_extract(data,'$.type')=? ORDER BY rowid DESC").all(date,type).map(x=>JSON.parse(x.data));},list(){return db.prepare('SELECT data FROM pbb_records ORDER BY rowid DESC LIMIT 100').all().map(x=>JSON.parse(x.data));},pdf(id){return db.prepare('SELECT pdf FROM pbb_records WHERE id=?').get(id)?.pdf;},setPdf(id,buffer){db.prepare('UPDATE pbb_records SET pdf=? WHERE id=?').run(buffer,id);}};
}
function registerPbb(app,{client,authenticate=require('./pbbAuth').authenticate,store=createStore(),buildPdf=require('./pbbPdf').buildPbbPdf,drive:providedDrive,gateService=require('./pbbFlights').createFlightService(),employeeSeed}={}){
 const {Readable}=require('node:stream'),{createPbbDrive,driveError}=require('./pbbDrive');
 const drive=providedDrive||createPbbDrive();
 const employees=require('./employeeDatabase').openEmployeeDatabase(store.db,{seed:employeeSeed});
 const profiles=require('./employeeProfiles').registerProfiles(app,{employees,authenticate,onChange:()=>{for(const clients of streams.values())for(const res of clients)res.write(`event: employees\ndata: ${JSON.stringify(employees.options())}\n\n`);}});
 require('./uniformRequests').registerUniform(app,{employees,profiles,authenticate});
 const hasReportService=require('./hasReports').registerHasReports(app,{employees,profiles,authenticate});
 require('./incidentReports').registerIncidentReports(app,{employees,profiles,authenticate});
 require('./expenseReports').registerExpenseReports(app,{employees,profiles,authenticate});
 require('./terrificReports').registerTerrificReports(app,{employees,profiles,authenticate});
 const readSignService=require('./readSign').registerReadSign(app,{employees,profiles,authenticate});
 require('./employees').registerEmployees(app,{store:employees,authenticate,onChange:()=>{for(const clients of streams.values())for(const res of clients)res.write(`event: employees\ndata: ${JSON.stringify(employees.options())}\n\n`);}});
 store.db.exec('CREATE TABLE IF NOT EXISTS pbb_guest_sessions (token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, expires INTEGER NOT NULL)');
 app.post('/pbb-api/session',(_req,res)=>{const token='pbb_guest_'+crypto.randomBytes(32).toString('hex'),uid='guest-'+crypto.randomUUID(),expires=Date.now()+86400000;store.db.prepare('DELETE FROM pbb_guest_sessions WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO pbb_guest_sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),uid,expires);res.set('Cache-Control','no-store').json({token,uid,expires});});
 const streams=new Map(),jobs=new Map(),lobbyStreams=new Set();
 const hasPbbService=require('./hasPbb').registerHasPbb(app,{store,employees,profiles,authenticate,drive,client});
 const presence=id=>{const clients=streams.get(id)||[];const online=new Set([...clients].map(res=>res.pbbUid)).size;for(const res of clients)res.write(`event: presence\ndata: ${JSON.stringify({online})}\n\n`);};
 const currentDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(store.now());
 const activeRooms=(flightNo,type,date=currentDate())=>store.day(date,type).map(r=>({id:r.id,flightNo:r.flightNo,type:r.type,gate:r.gate,bridges:r.bridges,revision:r.revision,completedAt:r.completedAt,driver:{uid:r.owners.driver||null,joined:!!r.owners.driver,signed:!!r.signatures.driver},spotter:{uid:r.owners.spotter||null,joined:!!r.owners.spotter,signed:!!r.signatures.spotter}}));
 const publishRooms=()=>{for(const sub of lobbyStreams)sub.res.write(`event: rooms\ndata: ${JSON.stringify(activeRooms(sub.flightNo,sub.type))}\n\n`);};
 const publish=r=>{for(const res of streams.get(r.id)||[])res.write(`event: state\ndata: ${JSON.stringify(r)}\n\n`);publishRooms();};

 const save=r=>{r.revision++;store.put(r);publish(r);};
 async function deliver(id){
  if(jobs.has(id))return jobs.get(id);
  const job=(async()=>{
   let r=store.get(id);if(!r.completedAt)return;
   let pdf=store.pdf(id);
   try{if(!pdf){pdf=await buildPdf(r);store.setPdf(id,pdf);}}catch(e){r.pdfError=e.message;save(r);return;}
   delete r.pdfError;
   const name=pdfFilename(r);
   if(r.delivery.drive.status!=='sent'){
    try{
     const folderId=process.env.PBB_DRIVE_FOLDER_ID||'1wMyB23ikaAnbkhJZcKBKBNujEeeY7Xsu';if(drive.validateFolder)await drive.validateFolder(folderId);
     if(!r.delivery.drive.fileId){const generated=await drive.files.generateIds({count:1,space:'drive'});r.delivery.drive.fileId=generated.data.ids[0];save(r);}
     const fileId=r.delivery.drive.fileId;let exists=false;
     try{await drive.files.get({fileId,fields:'id',supportsAllDrives:true});exists=true;}catch(e){if(Number(e.code)!==404&&Number(e.response?.status)!==404)throw e;}
     if(!exists)await drive.files.create({requestBody:{id:fileId,name,parents:[folderId]},media:{mimeType:'application/pdf',body:Readable.from(pdf)},fields:'id',supportsAllDrives:true});
     r.delivery.drive={status:'sent',fileId,url:`https://drive.google.com/file/d/${fileId}/view`};
    }catch(e){r.delivery.drive={...r.delivery.drive,status:'failed',error:driveError(e)};}save(r);
   }
   if(r.delivery.discord.status!=='sent'){
    try{const channel=await client.channels.fetch(process.env.PBB_DISCORD_CHANNEL_ID||'1559561919826890852');if(!channel?.isTextBased())throw new Error('Discord channel is unavailable');
     const sent=await channel.send({content:discordMessage(r),files:[{attachment:pdf,name}],nonce:crypto.createHash('sha256').update(id).digest('hex').slice(0,24),enforceNonce:true});r.delivery.discord={status:'sent',messageId:sent.id};
    }catch(e){r.delivery.discord={status:'failed',error:e.message};}save(r);
   }
  })().finally(()=>jobs.delete(id));jobs.set(id,job);return job;
 }
 app.use('/pbb-api',async(req,res,next)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(token.startsWith('pbb_guest_')){const session=store.db.prepare('SELECT uid,expires FROM pbb_guest_sessions WHERE token_hash=?').get(crypto.createHash('sha256').update(token).digest('hex'));if(!session||session.expires<Date.now())throw Error('Expired session');req.pbbUser={uid:session.uid,email:''};}else req.pbbUser=await authenticate(req);next();}catch{res.status(401).json({error:'Sign in required or sign-in verification unavailable'});}});
 const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({error:e.message});}};
 app.get('/pbb-api/active',route((req,res)=>res.json(activeRooms(String(req.query.flightNo||'').toUpperCase(),String(req.query.type||'')))));
 app.get('/pbb-api/active/stream',route((req,res)=>{
  const flightNo=String(req.query.flightNo||'').toUpperCase(),type=String(req.query.type||'');if(!['arrival','departure'].includes(type))fail('Valid flight and checklist type required');
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();const sub={res,flightNo,type};lobbyStreams.add(sub);res.write(`event: rooms\ndata: ${JSON.stringify(activeRooms(flightNo,type))}\n\n`);const timer=setInterval(()=>res.write(': keep-alive\n\n'),15000);timer.unref();res.on('close',()=>{clearInterval(timer);lobbyStreams.delete(sub);});
 }));
 app.get('/pbb-api/gate',route(async(req,res)=>{const flightNo=String(req.query.flightNo||'').toUpperCase(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(store.now());if(!/^[A-Z]{2}\d{1,4}$/.test(flightNo)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))fail('Valid flight and date required');res.json(await gateService.read(flightNo,date));}));
 app.get('/pbb-api/today',route(async(req,res)=>{const type=String(req.query.type||'');if(!['arrival','departure'].includes(type))fail('Select checklist type');res.set('Cache-Control','no-store').json(await gateService.today(currentDate(),type));}));
 const accountEmployee=user=>{profiles.status(user);return profiles.linked(user);};
 app.get('/pbb-api/signing-employee',route((req,res)=>{const employee=accountEmployee(req.pbbUser);res.set('Cache-Control','private, no-store').json(employee?{id:employee.id}:null);}));
 app.get('/pbb-api/employees',(_req,res)=>res.json(employees.options()));
 app.get('/pbb-api/records',route((req,res)=>res.json(store.list())));
 app.post('/pbb-api/records',route(async(req,res)=>{if(!['arrival','departure'].includes(req.body.type))fail('Select checklist type');if(req.body.role&&!roles.includes(req.body.role))fail('Select driver or spotter');const today=await gateService.today(currentDate(),req.body.type);const flight=today.flights?.find(f=>f.flightNo===String(req.body.flightNo||'').toUpperCase());if(!flight||!flight.gate)fail('Today’s flight or gate is unavailable. Refresh the flight list.',409);let r=store.create({...req.body,flightNo:flight.flightNo,gate:flight.gate},req.pbbUser);if(req.body.role&&!r.completedAt&&!r.signatures[req.body.role])r=store.mutate(r.id,req.pbbUser,{action:'claim',role:req.body.role});publish(r);res.status(201).json(r);}));
 app.get('/pbb-api/records/:id',route((req,res)=>res.json(store.get(req.params.id))));
 app.post('/pbb-api/records/:id',route(async(req,res)=>{
  const body={...req.body};
  if(body.action==='sign'){
   const existing=store.get(req.params.id),arrivalSpotter=existing.type==='arrival'&&body.role==='spotter';
   const linked=arrivalSpotter?null:accountEmployee(req.pbbUser);
   if(!arrivalSpotter&&!linked)fail('Link your employee account in My Profile before signing.',403);
   const employee=arrivalSpotter&&body.employeeId==='has-ops-ramp'
    ?{id:'has-ops-ramp',name:'HAS OPS RAMP',eid:''}
    :employees.eligible(body.role,arrivalSpotter?body.employeeId:linked.id,existing.type);
   if(!employee)fail('Your account is not authorized for this role');
   if(!arrivalSpotter&&body.employeeId&&body.employeeId!==employee.id)fail('Sign using your current account.',403);
   if(Object.values(existing.signatures).some(s=>s.employeeId===employee.id))fail('Driver and spotter must be different employees');
   body.employeeId=employee.id;body.name=employee.name;body.eid=employee.eid;
  }
  const r=store.mutate(req.params.id,req.pbbUser,body);publish(r);res.json(r);if(r.completedAt)void deliver(r.id);
 }));
 app.post('/pbb-api/records/:id/reset',route((req,res)=>{
  const selected=store.get(req.params.id),bridge=String(req.body.bridge||'');if(!['L1','L2','L3'].includes(bridge))fail('Select a valid bridge');
  if(store.day(currentDate(),selected.type).some(r=>r.bridges.includes(bridge)&&jobs.has(r.id)))fail('PDF delivery is still running. Try restarting again shortly.',409);
  const result=store.reset(selected.id,{date:currentDate(),bridge,revision:req.body.revision});
  for(const id of result.deleted)for(const client of [...(streams.get(id)||[])]){client.write('event: reset\ndata: '+JSON.stringify({type:result.type,bridge})+'\n\n');client.end();}
  for(const r of result.updated)publish(r);publishRooms();res.json({bridge,type:result.type,cleared:result.deleted.length+result.updated.length});
 }));
 app.post('/pbb-api/records/:id/retry',route((req,res)=>{const r=store.get(req.params.id);if(!r.completedAt)fail('Both signatures required',409);void deliver(r.id);res.status(202).json(r);}));
 app.get('/pbb-api/records/:id/pdf',route((req,res)=>{const r=store.get(req.params.id);if(!r.completedAt)fail('Both signatures required',409);const pdf=store.pdf(r.id);if(!pdf)fail('PDF is generating. Please retry.',409);res.setHeader('Content-Disposition',`attachment; filename="${pdfFilename(r)}"`);res.type('pdf').send(pdf);}));
 app.get('/pbb-api/records/:id/stream',route((req,res)=>{
  const r=store.get(req.params.id);res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  res.pbbUid=req.pbbUser.uid;if(!streams.has(r.id))streams.set(r.id,new Set());streams.get(r.id).add(res);res.write(`event: state\ndata: ${JSON.stringify(r)}\n\n`);presence(r.id);
  const timer=setInterval(()=>res.write(': keep-alive\n\n'),15000);timer.unref();res.on('close',()=>{clearInterval(timer);streams.get(r.id)?.delete(res);if(!streams.get(r.id)?.size)streams.delete(r.id);else presence(r.id);});
 }));
 // Retry interrupted work after restart; completed delivery targets are skipped.
 for(const r of store.list())if(r.completedAt&&(r.delivery.drive.status!=='sent'||r.delivery.discord.status!=='sent'))void deliver(r.id);
 return {store,employees,profiles,deliver,startWheelchairMail:()=>hasReportService.startWheelchairMail(),close(){hasReportService.close();hasPbbService.close();readSignService.close();for(const sub of lobbyStreams)sub.res.end();for(const clients of streams.values())for(const res of clients)res.end();}};
}
module.exports={createStore,registerPbb,validateInfo,discordMessage};

