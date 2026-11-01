const fields=require('../public/briefing-fields');
const sections={counter:Object.keys(fields.defaults).filter(key=>/^counterA\d+(Number|Service)$/.test(key)),gate:fields.gate.map(([key])=>key+'Label')};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function createDepartureDefaults({db,audit,now=()=>new Date()}){
 db.exec('CREATE TABLE IF NOT EXISTS briefing_departure_defaults(section TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT,updated_by TEXT)');
 for(const [section,keys] of Object.entries(sections))db.prepare('INSERT OR IGNORE INTO briefing_departure_defaults VALUES(?,0,?,NULL,NULL)').run(section,JSON.stringify(Object.fromEntries(keys.map(key=>[key,fields.defaults[key]]))));
 function read(section){
  if(!Object.hasOwn(sections,section))fail('Choose Counter or Gate.');
  const row=db.prepare('SELECT * FROM briefing_departure_defaults WHERE section=?').get(section);
  return {section,revision:row.revision,values:JSON.parse(row.data),updatedAt:row.updated_at,updatedBy:row.updated_by};
 }
 const save=db.transaction((body,access)=>{
  const before=read(body.section),keys=sections[body.section],values=body.values;
  if(!values||Array.isArray(values)||typeof values!=='object'||Object.keys(values).length!==keys.length||keys.some(key=>typeof values[key]!=='string'||values[key].length>150)||Object.keys(values).some(key=>!keys.includes(key)))fail('Provide all position labels, up to 150 characters each. Employee assignments and times cannot be saved as defaults.');
  if(body.revision!==before.revision)fail('These defaults changed. Reopen the settings to review the latest version before saving.',409);
  const at=now().toISOString();db.prepare('UPDATE briefing_departure_defaults SET revision=revision+1,data=?,updated_at=?,updated_by=? WHERE section=?').run(JSON.stringify(values),at,access.name,body.section);
  for(const row of db.prepare('SELECT date,flight,data FROM briefing_records').all()){
   const stored=JSON.parse(row.data);if((stored.__direction||(['MU586','MU578'].includes(row.flight)?'departure':'arrival'))!=='departure')continue;
   for(const key of keys){audit({date:row.date,flight:row.flight},key,stored[key]??before.values[key],values[key],access.employeeId,at);stored[key]=values[key];}
   db.prepare('UPDATE briefing_records SET data=?,updated_at=?,updated_by=? WHERE date=? AND flight=?').run(JSON.stringify(stored),at,access.employeeId,row.date,row.flight);
  }
  audit(null,'departure-defaults',before,{section:body.section,values},access.employeeId,at);return read(body.section);
 });
 return {read,save,values:()=>({...read('counter').values,...read('gate').values})};
}
module.exports={createDepartureDefaults,sections};
