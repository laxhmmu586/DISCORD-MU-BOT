const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('better-sqlite3');
const {openEmployeeDatabase}=require('../employeeDatabase');
test('EP.DB migrates employee metadata once and retains later changes after reopening',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'employee-db-'));
 const legacy=new Database(path.join(folder,'pbb.db'));
 const snapshot={revision:7,updatedAt:'2026-10-13T10:00:00Z',updatedBy:'lake@mu.com',employees:[{id:'one',code:'001',name:'Test Employee',eid:'00123',phone:'+1 555 1234567',email:'test@example.com',discordId:'',driver:true,spotter:false}]};
 legacy.exec('CREATE TABLE pbb_employees (singleton INTEGER PRIMARY KEY, data TEXT NOT NULL)');
 legacy.prepare('INSERT INTO pbb_employees VALUES (1,?)').run(JSON.stringify(snapshot));
 let store=openEmployeeDatabase(legacy,{seed:[]});
 assert.equal(path.basename(store.db.name),'EP.DB');assert.deepEqual(store.get(),{...snapshot,revision:8,employees:snapshot.employees.map(({driver,...row})=>({...row,station:'LAX',account:'MU',attach:driver,detach:driver}))});
 const change=store.get();change.employees[0].code='002';change.employees[0].detach=false;const saved=store.save(change,{email:'lake@mu.com'});store.close();
 store=openEmployeeDatabase(legacy,{seed:[]});assert.deepEqual(store.get(),saved);assert.deepEqual(JSON.parse(legacy.prepare('SELECT data FROM pbb_employees').get().data),snapshot);
 store.close();legacy.close();
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
});
test('new EP.DB seeds employees and keeps checklist tables out of the database',()=>{
 const legacy=new Database(':memory:');const store=openEmployeeDatabase(legacy,{filename:':memory:',seed:[{id:'one',name:'Test',driver:false,spotter:false}]});
 assert.equal(store.get().employees.length,1);assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE name='pbb_records'").get(),undefined);
 store.close();legacy.close();
});
