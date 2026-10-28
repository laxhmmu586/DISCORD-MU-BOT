const {allowed,canEdit,colors}=require('./staffSchedule');
const {localDate}=require('./etabAdvisory');
const CONTACTS=[['ATM','310 417 0710'],['LAWA CARROUSEL','310 646 9283*'],['TBIT CUSTOMS CONTROL','310 665 4550*'],['TBIT OPS','310 646 9378'],['DOOR ALRAM','424 646 8565'],['VANDELANDE','310 215 1218'],['CBP SECONDARY','310 568 7530'],['MU OFFICE','310 646 1525\n310 646 1849'],['LAWA ARRC','424 646 5292'],['TBITEC ESCALATORS','310 646 9076'],['LAWA MAINTERNANCE','424 646 9076'],['AIRPORT POLICE','424 646 7911'],['FIRST AID','310 215 6000'],['PARAMADIC','213 485 6180'],['PROSEGURE','310 930 4746'],['MU RESERVATION(LA)','626 583 1500'],['BUSINESS MANAGER','626 889 1216 (LAKE)']].map(([name,phone])=>({name,phone}));
const AUTO=new Set(['registration','eta','gate','pax','crew']);
const DEFAULTS={registration:null,eta:null,gate:null,pax:null,crew:null,aircraftType:'777-300',sta:'',rushBags:'',wchrBusiness:'',wchrEconomy:'',wchcBusiness:'',wchcEconomy:'',vip:'',um:'',avih:'',details:'',arrivalLead:'',announcement:'',carousel:'',phoneCall:'',jetBridge:'',finishEverything:'',gShift:'',blockTime:'',firstPax:'',lastPax:'',firstBag:'',lastBag:'',instructions:''};
const TIMES=new Set(['blockTime','firstPax','lastPax','firstBag','lastBag']);
const DUTIES=new Set(['arrivalLead','announcement','carousel','phoneCall','jetBridge','finishEverything','gShift']);
const fail=(text,status=400)=>{throw Object.assign(Error(text),{status});};
function identity(query){const date=query.date,flight=String(query.flight||'MU583').trim().toUpperCase();if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('Choose a valid date.');if(!/^MU\d{3,4}$/.test(flight))fail('Enter an MU flight number, for example MU583.');return {date,flight};}
function registerBriefing(app,{employees,profiles,authenticate=require('./pbbAuth').authenticate,etab,refreshRoster=async()=>null,buildPdf=require('./briefingPdf').buildBriefingPdf,now=()=>new Date()}={}){
 const db=employees.db;etab=etab||require('./briefingEtab').createBriefingEtab({db});
 db.exec('CREATE TABLE IF NOT EXISTS briefing_records(date TEXT NOT NULL,flight TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT,updated_by TEXT,PRIMARY KEY(date,flight));CREATE TABLE IF NOT EXISTS briefing_contacts(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS briefing_audit(id INTEGER PRIMARY KEY,date TEXT,flight TEXT,field TEXT NOT NULL,before_value TEXT,after_value TEXT,employee_id TEXT NOT NULL,at TEXT NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO briefing_contacts VALUES(1,0,?)').run(JSON.stringify(CONTACTS));
 db.exec('CREATE TABLE IF NOT EXISTS briefing_reports(id TEXT PRIMARY KEY,date TEXT NOT NULL,flight TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,created_name TEXT NOT NULL,snapshot TEXT NOT NULL,pdf BLOB NOT NULL,sha256 TEXT NOT NULL)');
 const record=({date,flight})=>{const row=db.prepare('SELECT * FROM briefing_records WHERE date=? AND flight=?').get(date,flight);return {date,flight,fields:{...DEFAULTS,...JSON.parse(row?.data||'{}')},updatedAt:row?.updated_at||null};};
 const contacts=()=>{const row=db.prepare('SELECT * FROM briefing_contacts WHERE id=1').get();return {revision:row.revision,rows:JSON.parse(row.data)};};
 const roster=date=>{if(date!==localDate(now()))return [];const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_schedule_days'").get();const day=exists?db.prepare('SELECT data FROM staff_schedule_days WHERE date=?').get(date):null,assignments=JSON.parse(day?.data||'{}').assignments||{},avatars=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='employee_avatars'").get();return employees.get().employees.filter(employee=>allowed(employee)&&assignments[employee.id]&&!['X','VAC','N','CS','CO'].includes(assignments[employee.id].code)).map(({id,name,nickname})=>({id,name,nickname:nickname||'',shift:assignments[id].code,shiftColor:assignments[id].color||colors[assignments[id].code]||'#eeeeee',avatar:avatars?db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?').get(id)?.data||'':''}));};
 const directory=()=>employees.get().employees.filter(allowed).map(({id,name,nickname})=>({id,name,nickname:nickname||'',avatar:db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='employee_avatars'").get()?db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?').get(id)?.data||'':''}));
 const assignedPeople=fields=>{const names=new Set([...DUTIES].map(field=>fields[field]).filter(Boolean)),avatars=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='employee_avatars'").get();return employees.get().employees.filter(employee=>allowed(employee)&&names.has(employee.name)).map(({id,name})=>({id,name,avatar:avatars?db.prepare('SELECT data FROM employee_avatars WHERE employee_id=?').get(id)?.data||'':''}));};
 const audit=(key,field,before,after,employeeId,at)=>db.prepare('INSERT INTO briefing_audit(date,flight,field,before_value,after_value,employee_id,at) VALUES(?,?,?,?,?,?,?)').run(key?.date||null,key?.flight||null,field,JSON.stringify(before),JSON.stringify(after),employeeId,at);
 const wrap=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Briefing could not be loaded or saved. Please retry.'});}};
 app.use('/briefing-api',async(req,res,next)=>{res.set('Cache-Control','private, no-store');let user;try{user=await authenticate(req);}catch{return res.status(401).json({error:'Sign in required.'});}const employee=profiles.linked(user);if(!allowed(employee))return res.status(403).json({error:'Briefing is available to eligible LAX / MU employees only.'});const manager=canEdit(user,employee),manage=manager&&req.query.view!=='employee';req.briefingAccess={employeeId:employee.id,name:employee.nickname||employee.name,canPreviewEmployee:manager,canEditBriefing:manage,canEditContacts:manage};next();});
 app.get('/briefing-api',wrap(async req=>{const key=identity(req.query),item=record(key);return {...item,assignedPeople:assignedPeople(item.fields),etab:await etab.read(key.date,key.flight),contacts:contacts(),canEditContacts:req.briefingAccess.canEditContacts,canClear:req.briefingAccess.canEditContacts,canEditBriefing:req.briefingAccess.canEditBriefing,canPreviewEmployee:req.briefingAccess.canPreviewEmployee};}));
 app.get('/briefing-api/roster',wrap(async req=>{if(!req.briefingAccess.canEditBriefing)fail('The working roster is available in manager view only.',403);const {date}=identity(req.query);await refreshRoster();return {date,employees:roster(date),directory:directory()};}));
 const reportView=row=>({id:row.id,date:row.date,flight:row.flight,generatedAt:row.created_at,generatedBy:row.created_name,sha256:row.sha256,filename:`Arrival-Briefing-${row.flight}-${row.date}-${row.id.slice(0,8)}.pdf`});
 app.get('/briefing-api/reports',wrap(req=>{const key=identity(req.query);return {reports:db.prepare('SELECT id,date,flight,created_at,created_name,sha256 FROM briefing_reports WHERE date=? AND flight=? ORDER BY created_at DESC,rowid DESC').all(key.date,key.flight).map(reportView)};}));
 app.post('/briefing-api/reports',wrap(async req=>{
  const access=req.briefingAccess;if(!access.canEditBriefing)fail('Only Supervisor and above can generate a report.',403);
  const key=identity(req.body||{}),source=await etab.read(key.date,key.flight),current=record(key);if(!req.body.expected||Object.keys(DEFAULTS).some(field=>req.body.expected[field]!==current.fields[field]))fail('The briefing changed. Reload before generating a report.',409);
  const crypto=require('node:crypto'),id=crypto.randomUUID(),generatedAt=now().toISOString(),snapshot={id,...key,generatedAt,generatedBy:access.name,fields:Object.fromEntries(Object.entries(current.fields).filter(([field])=>field!=='instructions').map(([field,value])=>[field,AUTO.has(field)&&value===null?(source.status==='available'?source[field]||'':''):value])),etab:source.status==='available'?source:null,updatedAt:current.updatedAt};
  const bytes=await buildPdf(snapshot);if(!Buffer.isBuffer(bytes)||bytes.subarray(0,5).toString()!=='%PDF-')fail('Report could not be generated.',500);const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  db.transaction(()=>{db.prepare('INSERT INTO briefing_reports VALUES(?,?,?,?,?,?,?,?,?)').run(id,key.date,key.flight,generatedAt,access.employeeId,access.name,JSON.stringify(snapshot),bytes,sha256);audit(key,'report',null,{id,sha256},access.employeeId,generatedAt);})();return reportView({id,date:key.date,flight:key.flight,created_at:generatedAt,created_name:access.name,sha256});
 }));
 app.get('/briefing-api/reports/:id/pdf',(req,res)=>{const row=db.prepare('SELECT pdf,id,date,flight FROM briefing_reports WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Report not found.'});res.set('Content-Disposition',`inline; filename="Arrival-Briefing-${row.flight}-${row.date}-${row.id.slice(0,8)}.pdf"`).type('application/pdf').send(row.pdf);});
 app.get('/briefing-api/reports/:id/preview',(req,res)=>{const row=db.prepare('SELECT snapshot FROM briefing_reports WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Report not found.'});res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'").type('text/html').send(require('./briefingPdf').renderBriefingReport(JSON.parse(row.snapshot)));});
 const save=db.transaction((body,access)=>{
  const key=identity(body),field=body.field;if(!Object.hasOwn(DEFAULTS,field))fail('Unknown briefing field.');let value=body.value;
  if(body.employeeId!==undefined){if(!DUTIES.has(field))fail('Employees can only be assigned to duty positions.');const employee=directory().find(employee=>employee.id===body.employeeId);if(!employee)fail('This employee is not on the working roster for this date.',409);value=employee.name;}
  if(!access.canEditBriefing&&!TIMES.has(field))fail('Employee view can edit Time Record only.',403);
  if(DUTIES.has(field)&&value&&body.employeeId===undefined)fail('Select an employee from the suggestions.');
  if(!(AUTO.has(field)&&value===null)&&(typeof value!=='string'||value.length>(['details','instructions'].includes(field)?5000:150)))fail('Invalid field value.');
  const current=record(key);if(body.previous!==current.fields[field])fail('This field was changed by another employee. Reload before editing it.',409);
  const at=now().toISOString();if(current.fields[field]!==value){audit(key,field,current.fields[field],value,access.employeeId,at);current.fields[field]=value;db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key.date,key.flight,JSON.stringify(current.fields),at,access.employeeId);}return record(key);
 });
 app.post('/briefing-api',wrap(req=>save(req.body||{},req.briefingAccess)));
 const assign=db.transaction((body,access)=>{
  if(!access.canEditBriefing)fail('Only Supervisor and above can change assignments.',403);
  const key=identity(body),from=body.fromField,to=body.toField;if((from!==null&&!DUTIES.has(from))||(to!==null&&!DUTIES.has(to))||(!from&&!to))fail('Choose a valid duty position.');
  const current=record(key);if(from&&body.fromValue!==current.fields[from]||to&&body.toValue!==current.fields[to])fail('This assignment changed. Reload before moving it.',409);
  const value=from?current.fields[from]:directory().find(person=>person.id===body.employeeId)?.name;
  if(!value)fail('This employee is not available for assignment.',409);
  if(from===to)return current;const changes={...(from?{[from]:''}:{}),...(to?{[to]:value}:{})},at=now().toISOString();
  for(const [field,value] of Object.entries(changes)){audit(key,field,current.fields[field],value,access.employeeId,at);current.fields[field]=value;}
  db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key.date,key.flight,JSON.stringify(current.fields),at,access.employeeId);return record(key);
 });
 app.post('/briefing-api/assign',wrap(req=>assign(req.body||{},req.briefingAccess)));
 const clear=db.transaction((body,access)=>{
  if(!access.canEditContacts)fail('Only Supervisor and above can clear a briefing.',403);
  const key=identity(body),current=record(key);if(!body.expected||Object.keys(DEFAULTS).some(field=>body.expected[field]!==current.fields[field]))fail('This briefing changed. Reload before clearing it.',409);
  const at=now().toISOString(),fields=Object.fromEntries(Object.keys(DEFAULTS).map(field=>[field,'']));
  audit(key,'clear',current.fields,fields,access.employeeId,at);
  db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key.date,key.flight,JSON.stringify(fields),at,access.employeeId);return record(key);
 });
 app.post('/briefing-api/clear',wrap(req=>clear(req.body||{},req.briefingAccess)));
 const saveContacts=db.transaction((body,access)=>{
  if(!access.canEditContacts)fail('Only Supervisor and above can edit contact information.',403);
  const current=contacts();if(body.revision!==current.revision)fail('Contact information changed. Reload before saving.',409);
  if(!Array.isArray(body.rows)||body.rows.length!==CONTACTS.length||body.rows.some((row,i)=>row?.name!==CONTACTS[i].name||typeof row.phone!=='string'||row.phone.length>150))fail('Invalid contact information.');
  const rows=body.rows.map(({name,phone})=>({name,phone:phone.trim()}));audit(null,'contacts',current.rows,rows,access.employeeId,now().toISOString());db.prepare('UPDATE briefing_contacts SET revision=revision+1,data=? WHERE id=1').run(JSON.stringify(rows));return contacts();
 });
 app.post('/briefing-api/contacts',wrap(req=>saveContacts(req.body||{},req.briefingAccess)));
}
module.exports={registerBriefing,CONTACTS,DEFAULTS,identity};
