const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {createEmployeeStore,registerEmployees}=require('../has/server/employees');
test('PBB settings patch certificates only, enforce scope, dates and revisions, and reject ordinary employees',async t=>{
 const db=new Database(':memory:'),store=createEmployeeStore(db,{seed:[['sup','Supervisor','MU'],['agent','Agent','MU'],['foreign','Agent','CZ']].map(([id,position,account])=>({id,name:id.toUpperCase(),position,station:'LAX',account,loginId:id+'@example.test',attach:false,detach:false,spotter:false}))});
 const app=express();app.use(express.json());registerEmployees(app,{store,profiles:{linked:user=>store.get().employees.find(row=>row.id===user.uid)},authenticate:async req=>({uid:req.headers['x-user'],email:req.headers['x-user']+'@example.test'})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/employee-admin-api/pbb?station=LAX&account=MU',{method:body?'POST':'GET',headers:{'x-user':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 let view=(await request('sup')).data;assert.deepEqual(view.employees.map(row=>row.id),['sup','agent']);
 const body={revision:view.revision,id:'agent',pbbId:'1071',pbbExpiry:'2028-09-28',pbbMscId:'1071',pbbMscExpiry:'2028-03-30',position:'Business Manager',eid:'123821'};
 assert.equal((await request('agent',body)).status,403);assert.equal((await request('sup',{...body,id:'foreign'})).status,403);
 assert.equal((await request('sup',{...body,pbbExpiry:'2028-02-30'})).status,400);
 const saved=await request('sup',body);assert.equal(saved.status,200);assert.equal(saved.data.employees.find(row=>row.id==='agent').pbbMscId,'1071');
 assert.equal((await request('sup',body)).status,409);
 const employee=store.get().employees.find(row=>row.id==='agent');assert.equal(employee.position,'Agent');assert.equal(Object.hasOwn(employee,'eid'),false);
});
test('EID retirement scrubs existing rows and merged snapshots, survives reopen and discards imports',()=>{
 const db=new Database(':memory:');db.exec('CREATE TABLE pbb_employees(singleton INTEGER PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE employee_profile_merges(source_employee_id TEXT PRIMARY KEY,target_employee_id TEXT NOT NULL,source_snapshot TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL)');
 db.prepare('INSERT INTO pbb_employees VALUES(1,?)').run(JSON.stringify({revision:4,employees:[{id:'one',eid:'123821',name:'TEST',station:'LAX',account:'MU',attach:false,detach:false,spotter:false}]}));
 db.prepare('INSERT INTO employee_profile_merges VALUES(?,?,?,?,?)').run('old','one',JSON.stringify({id:'old',eid:'999'}),'test','2026-11-06');
 const store=createEmployeeStore(db,{seed:[]});assert.equal(store.get().revision,5);assert.equal(db.prepare('SELECT data FROM pbb_employees').get().data.includes('eid'),false);assert.equal(db.prepare('SELECT source_snapshot FROM employee_profile_merges').get().source_snapshot.includes('eid'),false);
 const data=store.get();data.employees[0].eid='777';store.save(data,{email:'lake@mu.com'});assert.equal(Object.hasOwn(createEmployeeStore(db,{seed:[]}).get().employees[0],'eid'),false);db.close();
});
