const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerEmployees}=require('../has/server/employees');

test('linked Google Business Manager gets current own-account access without matching Original Login ID',async t=>{
 const Database=require('better-sqlite3'),{createEmployeeStore}=require('../has/server/employees'),{createProfileStore}=require('../has/server/employeeProfiles');
 const db=new Database(':memory:');const store=createEmployeeStore(db,{seed:[
  {id:'bm',name:'MANAGER',position:'Business Manager',station:'LAX',account:'CZ',eid:'1001',loginId:'original@example.test',attach:false,detach:false,spotter:false},
  {id:'agent',name:'AGENT',position:'Agent',station:'LAX',account:'CZ',eid:'1002',attach:false,detach:false,spotter:false},
  {id:'other',name:'OTHER',position:'Agent',station:'LAX',account:'MU',attach:false,detach:false,spotter:false}
 ]});
 const profiles=createProfileStore({...store,db}),user={uid:'linked-google',email:'personal@example.test',provider:'google.com',emailVerified:true};
 profiles.link(user,{revision:store.get().revision,eid:'1001'});
 const app=express();app.use(express.json());registerEmployees(app,{store,profiles,authenticate:async()=>user});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const url='http://127.0.0.1:'+server.address().port+'/employee-admin-api';
 const response=await fetch(url);assert.equal(response.status,200);const view=await response.json();assert.equal(view.access.employeeId,'bm');assert.deepEqual(view.employees.map(e=>e.id),['bm','agent']);
 const saved=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:view.revision,employees:[{...view.employees[1],nickname:'Edited by Google manager'}]})});assert.equal(saved.status,200);
  const supervisorDraft=store.get();supervisorDraft.employees.find(e=>e.id==='bm').position='Supervisor';store.save(supervisorDraft,{email:'lake@mu.com'});const add=await fetch(url+'/add-employee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:store.get().revision,station:'LAX',account:'CZ',name:'NEW AGENT'})});assert.equal(add.status,200);const added=store.get().employees.find(e=>e.name==='NEW AGENT');assert.equal(added.eid,'');assert.equal(added.phone,'');
 const draft=store.get();draft.employees.find(e=>e.id==='bm').position='Agent';store.save(draft,{email:'lake@mu.com'});assert.equal((await fetch(url)).status,403);
});
test('existing and Gmail employee administrators can read and save records; other accounts cannot',async t=>{
 const app=express();app.use(express.json());let saves=0,changes=0;
 registerEmployees(app,{authenticate:async req=>{const email=req.headers['x-test-email'];if(!email)throw Error('Sign in required');return {uid:'fixture',email};},store:{get:()=>({revision:1,employees:[]}),save:body=>{saves++;return body;}},onChange:()=>changes++});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});const url='http://127.0.0.1:'+server.address().port+'/employee-admin-api';
 assert.equal((await fetch(url)).status,401);
 for(const email of ['lake@mu.com','nextweek1216@gmail.com','tamsun10@gmail.com','NEXTWEEK1216@GMAIL.COM']){
  const headers={'x-test-email':email,'Content-Type':'application/json'};assert.equal((await fetch(url,{headers})).status,200,email+' read');assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({revision:1,employees:[]})})).status,200,email+' save');
 }
 for(const email of ['tamsun@hm.com','employee@gmail.com','nextweek1216@gmail.com.attacker.example','tamsun10+other@gmail.com']){
  const headers={'x-test-email':email,'Content-Type':'application/json'};assert.equal((await fetch(url,{headers})).status,403);assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,403);
 }
 assert.equal(saves,4);assert.equal(changes,4);
});
