const model=require('../public/departure-checklist-model');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function registerDepartureChecklists(app,{db,audit,now,wrap}){
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
}
module.exports={registerDepartureChecklists};
