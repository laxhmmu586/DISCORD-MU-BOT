'use strict';
const crypto=require('node:crypto'),model=require('./expressModel'),pdf=require('./expressPdf');
const {fail}=model;
function createExpressConnections({db,etab,now=()=>new Date(),buildForm=pdf.form,buildPosters=pdf.posters,sendEmail}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS arrival_express_lists(date TEXT NOT NULL,flight TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(date,flight));
  CREATE TABLE IF NOT EXISTS arrival_express_previews(id TEXT PRIMARY KEY,date TEXT NOT NULL,flight TEXT NOT NULL,list_revision INTEGER NOT NULL,created_at TEXT NOT NULL,snapshot TEXT NOT NULL,pdf BLOB NOT NULL,sha256 TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS arrival_express_email(content_key TEXT PRIMARY KEY,preview_id TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL,message_id TEXT);`);
 const row=key=>db.prepare('SELECT * FROM arrival_express_lists WHERE date=? AND flight=?').get(key.date,key.flight);
 const source=async key=>{const value=await etab.read(key.date,key.flight);return {eta:model.eta(value.eta),etaSource:value.status,etaReceivedAt:value.receivedAt||null};};
 async function version(key){const item=row(key);return {date:key.date,flight:key.flight,revision:item?.revision||0,total:item?JSON.parse(item.data).length:0,...await source(key)};}
 async function read(key){const item=row(key);return {...await version(key),airline:model.AIRLINE,passengers:item?JSON.parse(item.data):[],updatedAt:item?.updated_at||null};}
 const save=db.transaction((key,body,access)=>{const current=row(key);if(body.revision!==(current?.revision||0))fail('The Express list changed. Reload before saving.',409);const passengers=model.passengers(body.passengers,key.flight);if(current&&JSON.stringify(passengers)===current.data)return {revision:current.revision,passengers,total:passengers.length,unchanged:true};const revision=(current?.revision||0)+1;db.prepare('INSERT INTO arrival_express_lists VALUES(?,?,?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key.date,key.flight,revision,JSON.stringify(passengers),now().toISOString(),access.employeeId);return {revision,passengers,total:passengers.length};});
 async function preview(key,expected){
  const state=await read(key);if(expected!==state.revision)fail('The Express list changed. Reload before creating the preview.',409);if(!state.total)fail('Add at least one passenger first.',422);if(!state.eta)fail('ETAB ETA is not available for this flight and date. Refresh ETAB before preparing the email.',422);
  const id=crypto.randomUUID(),email=model.mail({flight:key.flight,flightDate:key.date,count:state.total,eta:state.eta},now()),snapshot={...email,eta:state.eta,total:state.total,date:key.date,flight:key.flight,revision:state.revision,airline:model.AIRLINE},bytes=await buildForm({eta:state.eta,count:state.total}),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  db.prepare('INSERT INTO arrival_express_previews VALUES(?,?,?,?,?,?,?,?)').run(id,key.date,key.flight,state.revision,now().toISOString(),JSON.stringify(snapshot),bytes,hash);
  return {id,...snapshot,sha256:hash};
 }
 function getPreview(id){const item=db.prepare('SELECT * FROM arrival_express_previews WHERE id=?').get(id);if(!item)fail('This email preview is no longer available.',404);return {...item,snapshot:JSON.parse(item.snapshot)};}
 async function send(key,id){
  const item=getPreview(id),snapshot=item.snapshot;if(item.date!==key.date||item.flight!==key.flight)fail('Choose the matching flight and date.',409);
  const state=await read(key),fresh=model.mail({flight:key.flight,flightDate:key.date,count:state.total,eta:state.eta||snapshot.eta},now());
  if(state.revision!==item.list_revision||state.eta?.clock!==snapshot.eta.clock||fresh.sendDate!==snapshot.sendDate||now()-new Date(item.created_at)>30*60*1000)fail('The list, ETA or sending date changed. Open a new email preview.',409);
  const claim=db.transaction(()=>{const delivery=db.prepare('SELECT * FROM arrival_express_email WHERE content_key=?').get(snapshot.contentKey);if(delivery?.state==='sent')return delivery;if(delivery&&delivery.state!=='failed')fail('This email is already sending or its delivery is unconfirmed. Check Sent Mail before sending again.',409);db.prepare("INSERT INTO arrival_express_email VALUES(?,?,'sending',?,NULL) ON CONFLICT(content_key) DO UPDATE SET state='sending',preview_id=excluded.preview_id,updated_at=excluded.updated_at").run(snapshot.contentKey,id,now().toISOString());return null;})();
  if(claim)return {sent:true,alreadySent:true,messageId:claim.message_id};
  try{if(!sendEmail)throw Object.assign(Error('Email service is unavailable.'),{definitelyNotSent:true});const result=await sendEmail({...snapshot,pdfBuffer:Buffer.from(item.pdf)});if(!result?.id)throw Error('Email acknowledgement missing.');db.prepare("UPDATE arrival_express_email SET state='sent',message_id=?,updated_at=? WHERE content_key=?").run(result.id,now().toISOString(),snapshot.contentKey);return {sent:true,messageId:result.id};}
  catch(error){db.prepare('UPDATE arrival_express_email SET state=?,updated_at=? WHERE content_key=?').run(error.definitelyNotSent?'failed':'unknown',now().toISOString(),snapshot.contentKey);fail(error.definitelyNotSent?'The email was not sent. Please retry.':'Email delivery could not be confirmed. Check Sent Mail before retrying.',502);}
 }
 async function posters(key,expected){const state=await read(key);if(expected!==state.revision)fail('The list changed. Reload the print preview.',409);if(!state.total)fail('Add at least one passenger first.',422);return buildPosters(state.passengers);}
 return {read,version,save,preview,getPreview,send,posters};
}
function registerExpress(app,{db,etab,now,identity,canEdit,sendEmail,audit=()=>{},buildForm,buildPosters}){
 const store=createExpressConnections({db,etab,now,sendEmail,buildForm,buildPosters});
 const key=value=>{const result=identity(value);if(result.direction!=='arrival'||['MU586','MU578'].includes(result.flight))fail('Express is available for Arrival flights only.');return result;};
 const wrap=fn=>async(req,res)=>{try{const result=await fn(req,res);if(!res.headersSent)res.json(result);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Express could not be loaded or saved. Please retry.'});}};
 const edit=(req,k)=>{if(!canEdit(req,k))fail('Only the Arrival team or a briefing editor can update Express.',403);};
 app.get('/briefing-api/express',wrap(async req=>{const k=key(req.query);return {...await store.read(k),canEdit:canEdit(req,k)};}));
 app.get('/briefing-api/express/version',wrap(async req=>{const k=key(req.query);return {...await store.version(k),canEdit:canEdit(req,k)};}));
 app.post('/briefing-api/express',wrap(async req=>{const k=key(req.body||{});edit(req,k);const result=store.save(k,req.body,req.briefingAccess);if(!result.unchanged)audit(k,'express-list',null,{revision:result.revision,total:result.total},req.briefingAccess.employeeId,now().toISOString());return {...await store.read(k),canEdit:true};}));
 app.post('/briefing-api/express/preview',wrap(req=>{const k=key(req.body||{});edit(req,k);return store.preview(k,req.body.revision);}));
 app.get('/briefing-api/express/previews/:id/pdf',wrap((req,res)=>{const item=store.getPreview(req.params.id);res.type('application/pdf').set('Content-Disposition',`inline; filename="${item.snapshot.filename}"`).send(item.pdf);}));
 app.post('/briefing-api/express/send',wrap(async req=>{const k=key(req.body||{});edit(req,k);if(req.body.confirm!==true)fail('Preview the attachment and choose Send email.');const result=await store.send(k,req.body.previewId);if(!result.alreadySent)audit(k,'express-email',null,{previewId:req.body.previewId,messageId:result.messageId},req.briefingAccess.employeeId,now().toISOString());return result;}));
 app.post('/briefing-api/express/posters',wrap(async(req,res)=>{const k=key(req.body||{}),bytes=await store.posters(k,req.body.revision);res.type('application/pdf').set('Content-Disposition',`inline; filename="Express Posters ${k.flight} ${k.date}.pdf"`).send(bytes);}));
 return store;
}
module.exports={createExpressConnections,registerExpress};
