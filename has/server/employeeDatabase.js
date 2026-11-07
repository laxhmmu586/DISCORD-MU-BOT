const fs=require('node:fs'),path=require('node:path');
const {createEmployeeStore}=require('./employees');
function openEmployeeDatabase(legacyDb,{filename=process.env.PBB_EMPLOYEE_DB_PATH||(legacyDb.name===':memory:'?':memory:':path.join(path.dirname(legacyDb.name),'EP.DB')),seed,Database=require('better-sqlite3')}={}){
 if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new Database(filename);
 try{
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS pbb_employees (singleton INTEGER PRIMARY KEY CHECK(singleton=1), data TEXT NOT NULL)');
  if(!db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get()){
   const legacyTable=legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pbb_employees'").get();
   const legacy=legacyTable&&legacyDb.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get();
   if(legacy)db.prepare('INSERT OR IGNORE INTO pbb_employees(singleton,data) VALUES (1,?)').run(legacy.data);
  }
  const store=createEmployeeStore(db,{seed});
  // Clean the retired legacy copy too, so it cannot restore employee EIDs later.
  if(legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pbb_employees'").get()){
   const row=legacyDb.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get();
   if(row){
    const data=JSON.parse(row.data);data.employees=data.employees.map(({eid,...person})=>person);
    legacyDb.prepare('UPDATE pbb_employees SET data=? WHERE singleton=1').run(JSON.stringify(data));
   }
  }
  return {...store,db,close:()=>db.close()};
 }catch(error){db.close();throw error;}
}
module.exports={openEmployeeDatabase};
