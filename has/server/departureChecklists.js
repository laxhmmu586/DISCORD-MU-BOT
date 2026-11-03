const {randomUUID}=require('node:crypto');
const model=require('../public/departure-checklist-model');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function registerDepartureChecklists(app,{db,audit,now,wrap}){
 const access=req=>{if(!req.briefingAccess.canEditDepartureDefaults)fail('Only Lead and above can use departure checklists.',403);};
 db.exec('CREATE TABLE IF NOT EXISTS briefing_checklist_templates(type TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT,updated_by TEXT)');
 for(const [type,def] of Object.entries(model.definitions))db.prepare('INSERT OR IGNORE INTO briefing_checklist_templates VALUES(?,0,?,NULL,NULL)').run(type,JSON.stringify(def));
 const template=type=>{if(typeof type!=='string')fail('Choose a checklist template.');const row=db.prepare('SELECT * FROM briefing_checklist_templates WHERE type=?').get(type);if(!row)fail('Checklist template not found.',404);return {...JSON.parse(row.data),revision:row.revision,updatedAt:row.updated_at,updatedBy:row.updated_by};};
 app.get('/briefing-api/checklists/templates',wrap(req=>{access(req);return {templates:db.prepare('SELECT type FROM briefing_checklist_templates ORDER BY rowid').all().map(({type})=>template(type))};}));
 app.post('/briefing-api/checklists/templates',wrap(req=>{access(req);return db.transaction(()=>{
  const body=req.body||{},creating=body.type===null,type=creating?'custom-'+randomUUID():body.type,before=creating?null:template(type),items=body.items;
  if(before&&body.revision!==before.revision)fail('This template changed. Close the editor and reopen the latest template.',409);
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>200||typeof body.subtitle!=='string'||body.subtitle.length>300)fail('Provide a template title and subtitle within their length limits.');
  if(!Array.isArray(items)||items.length<1||items.length>60||items.some(item=>!item||typeof item.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(item.id)||typeof item.zh!=='string'||typeof item.en!=='string'||!(item.zh.trim()||item.en.trim())||item.zh.length>2000||item.en.length>3000)||new Set(items.map(item=>item.id)).size!==items.length)fail('Provide 1–60 uniquely identified checklist items with text.');
  const name=body.name===undefined?before?.name:body.name;
  if(typeof name!=='string'||!name.trim()||name.length>80)fail('Provide a checklist name up to 80 characters.');
  const fields=body.fields===undefined?model.headerFields(before||{type}):body.fields;
  if(!Array.isArray(fields)||fields.length>24||fields.some(label=>typeof label!=='string'||!label.trim()||label.length>100))fail('Provide up to 24 header field names of 100 characters each.');
  const next={...(before||{type,source:'Custom template'}),name:name.trim(),fields:fields.map(label=>label.trim()),title:body.title,subtitle:body.subtitle,items:items.map(({id,zh,en})=>({id,zh,en}))},at=now().toISOString();
  if(creating)db.prepare('INSERT INTO briefing_checklist_templates VALUES(?,1,?,?,?)').run(type,JSON.stringify(next),at,req.briefingAccess.employeeId);
  else db.prepare('UPDATE briefing_checklist_templates SET revision=revision+1,data=?,updated_at=?,updated_by=? WHERE type=?').run(JSON.stringify(next),at,req.briefingAccess.employeeId,body.type);
  audit(null,'checklist-template',before,next,req.briefingAccess.employeeId,at);return template(type);
 })();}));
}
module.exports={registerDepartureChecklists};
