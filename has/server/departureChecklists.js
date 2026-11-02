const model=require('../public/departure-checklist-model');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function registerDepartureChecklists(app,{db,identity,audit,now,wrap}){
 db.exec('CREATE TABLE IF NOT EXISTS briefing_departure_checklists(id TEXT PRIMARY KEY,date TEXT NOT NULL,flight TEXT NOT NULL,type TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)');
 db.exec('CREATE INDEX IF NOT EXISTS briefing_departure_checklists_flight ON briefing_departure_checklists(date,flight)');
 const access=req=>{if(!req.briefingAccess.canEditDepartureDefaults)fail('Only Lead and above can use departure checklists.',403);};
 db.exec('CREATE TABLE IF NOT EXISTS briefing_checklist_templates(type TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT,updated_by TEXT)');
 for(const [type,def] of Object.entries(model.definitions))db.prepare('INSERT OR IGNORE INTO briefing_checklist_templates VALUES(?,0,?,NULL,NULL)').run(type,JSON.stringify(def));
 const template=type=>{if(!Object.hasOwn(model.definitions,type))fail('Choose AVIH or SERVICE DOG.');const row=db.prepare('SELECT * FROM briefing_checklist_templates WHERE type=?').get(type);return {...JSON.parse(row.data),revision:row.revision,updatedAt:row.updated_at,updatedBy:row.updated_by};};
 app.get('/briefing-api/checklists/templates',wrap(req=>{access(req);return {templates:Object.keys(model.definitions).map(template)};}));
 app.post('/briefing-api/checklists/templates',wrap(req=>{access(req);return db.transaction(()=>{
  const body=req.body||{},before=template(body.type),items=body.items;
  if(body.revision!==before.revision)fail('This template changed. Close the editor and reopen the latest template.',409);
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>200||typeof body.subtitle!=='string'||body.subtitle.length>300)fail('Provide a template title and subtitle within their length limits.');
  if(!Array.isArray(items)||items.length<1||items.length>60||items.some(item=>!item||typeof item.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(item.id)||typeof item.zh!=='string'||typeof item.en!=='string'||!(item.zh.trim()||item.en.trim())||item.zh.length>2000||item.en.length>3000)||new Set(items.map(item=>item.id)).size!==items.length)fail('Provide 1–60 uniquely identified checklist items with text.');
  const next={...before,title:body.title,subtitle:body.subtitle,items:items.map(({id,zh,en})=>({id,zh,en}))},at=now().toISOString();
  db.prepare('UPDATE briefing_checklist_templates SET revision=revision+1,data=?,updated_at=?,updated_by=? WHERE type=?').run(JSON.stringify(next),at,req.briefingAccess.employeeId,body.type);
  audit(null,'checklist-template',before,next,req.briefingAccess.employeeId,at);return template(body.type);
 })();}));
 const keyFor=query=>{const key=identity(query);if(key.direction!=='departure')fail('Checklists are available for Departure only.');return key;};
 const view=row=>({...JSON.parse(row.data),id:row.id,date:row.date,flight:row.flight,type:row.type,revision:row.revision,updatedAt:row.updated_at,updatedBy:row.updated_by});
 app.get('/briefing-api/checklists',wrap(req=>{access(req);const key=keyFor(req.query);return {forms:db.prepare('SELECT * FROM briefing_departure_checklists WHERE date=? AND flight=? ORDER BY updated_at DESC,id').all(key.date,key.flight).map(view)};}));
 const save=db.transaction((body,employee)=>{
  const key=keyFor(body),type=body.type;if(!Object.hasOwn(model.definitions,type))fail('Choose AVIH or SERVICE DOG.');
  if(typeof body.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id))fail('Invalid checklist ID.');
  if(!Number.isSafeInteger(body.revision)||body.revision<0)fail('Invalid checklist revision.');
  const values=body.values,keys=Object.keys(model.fields);
  if(!values||Array.isArray(values)||typeof values!=='object'||Object.keys(values).length!==keys.length||keys.some(key=>typeof values[key]!=='string'||values[key].length>(key==='notes'?2000:150))||Object.keys(values).some(key=>!keys.includes(key)))fail('Invalid checklist fields.');
  const row=db.prepare('SELECT * FROM briefing_departure_checklists WHERE id=?').get(body.id);
  const snapshot=row?JSON.parse(row.data).template:template(type);
  if(!row&&body.templateRevision!==snapshot.revision)fail('This template changed. Start a new checklist using the latest template.',409);
  if(!Array.isArray(body.checks)||body.checks.length!==snapshot.items.length||body.checks.some(value=>typeof value!=='boolean'))fail('Invalid checklist answers.');
  if(values.telegramMinutes&&!/^\d{1,3}$/.test(values.telegramMinutes))fail('Telegram minutes must be a whole number from 0 to 999.');
  if(row&&(row.date!==key.date||row.flight!==key.flight||row.type!==type))fail('Checklist does not belong to this flight and type.',409);
  if(body.revision!==(row?.revision||0))fail('This checklist changed. Reload the saved version before saving.',409);
  const data={template:snapshot,values:Object.fromEntries(keys.map(key=>[key,values[key]])),checks:[...body.checks]},at=now().toISOString();
  db.prepare('INSERT INTO briefing_departure_checklists VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(body.id,key.date,key.flight,type,(row?.revision||0)+1,JSON.stringify(data),at,employee.employeeId);
  audit(key,'departure-checklist',row?view(row):null,{id:body.id,type,...data},employee.employeeId,at);
  return view(db.prepare('SELECT * FROM briefing_departure_checklists WHERE id=?').get(body.id));
 });
 app.post('/briefing-api/checklists',wrap(req=>{access(req);return save(req.body||{},req.briefingAccess);}));
}
module.exports={registerDepartureChecklists};
