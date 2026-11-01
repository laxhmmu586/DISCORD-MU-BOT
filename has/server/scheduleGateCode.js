// Rename the gate duty without changing employee IDs, remarks or request identities.
function normalize(value){
 if(Array.isArray(value))return value.map(normalize);
 if(!value||typeof value!=='object')return value;
 const result={...value};
 for(const [key,item] of Object.entries(result))result[key]=normalize(item);
 if(result.code==='GS')result.code='G';
 if(result.code==='G'&&result.displayLabel==='GS')result.displayLabel='G';
 if(Array.isArray(result.capabilities))result.capabilities=[...new Set(result.capabilities.map(code=>typeof code==='string'?code.replace(/^GS(?=\||$)/,'G'):code))];
 for(const field of ['hours','roleDefinitions'])if(result[field]&&Object.hasOwn(result[field],'GS')){if(!Object.hasOwn(result[field],'G'))result[field].G=result[field].GS;delete result[field].GS;}
 return result;
}
function migrateGateCode(db){
 db.transaction(()=>{
  for(const [table,key] of [['staff_schedule_days','date'],['staff_schedule_shortages','date'],['staff_schedule_sync_settings','id'],['schedule_request_settings','id'],['schedule_requests','id']]){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
   const revision=db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='revision');
   for(const row of db.prepare(`SELECT ${key},data FROM ${table}`).all()){
    const before=JSON.parse(row.data),after=normalize(before);
    if(JSON.stringify(before)!==JSON.stringify(after))db.prepare(`UPDATE ${table} SET data=?${revision?',revision=revision+1':''} WHERE ${key}=?`).run(JSON.stringify(after),row[key]);
   }
  }
 })();
}
module.exports={normalize,migrateGateCode};
