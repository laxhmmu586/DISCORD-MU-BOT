const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createStore,registerPbb}=require('../pbb'),{createEmployeeStore}=require('../employees'),items=require('../public/public/pbb-data');
const admin={uid:'admin',email:'lake@mu.com'},operator={uid:'operator',email:'operator@example.com'};
const seed=[{id:'attach',name:'ATTACH ONLY',eid:'00123',attach:true,detach:false,spotter:false},{id:'detach',name:'DETACH ONLY',eid:'00456',attach:false,detach:true,spotter:false},{id:'legacy',name:'LEGACY DRIVER',eid:'',driver:true,spotter:false},{id:'spotter',name:'SPOTTER',eid:'',driver:false,spotter:true}];
test('legacy driver migrates to two independent flags, explicit false wins and invalid flags fail',()=>{
 const records=createStore(':memory:'),employees=createEmployeeStore(records.db,{seed});
 try{
  let data=employees.get();assert.equal(data.employees[2].attach,true);assert.equal(data.employees[2].detach,true);assert.equal(data.employees[2].driver,undefined);
  Object.assign(data.employees[2],{attach:false,driver:true});employees.save(data,admin);
  assert.equal(employees.eligible('driver','legacy','arrival'),undefined);assert.equal(employees.eligible('driver','legacy','departure').id,'legacy');
  for(const type of ['arrival','departure'])assert.equal(employees.eligible('spotter','spotter',type).id,'spotter');
  for(const field of ['attach','detach'])for(const value of ['true',null,1]){data=employees.get();data.employees[0][field]=value;assert.throws(()=>employees.save(data,admin),/Check employee/);}
  data=employees.get();data.employees[0].name='';assert.throws(()=>employees.save(data,admin),/Check employee/);
  assert.equal(employees.options()[0].discordId,undefined);
 }finally{records.db.close();}
});
test('signature API uses saved checklist type, rejects opposite permission and immediately enforces revocation',async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});
 const integration=registerPbb(app,{store,employeeSeed:seed,authenticate:async req=>req.headers.authorization==='Bearer admin'?admin:operator,gateService:{read:async()=>({status:'unavailable'})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const api=(url,body)=>fetch(base+url,{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  for(const [type,allowed,denied] of [['arrival','attach','detach'],['departure','detach','attach']]){
   const r=store.create({type,flightNo:'MU583',gate:'132',bridges:['L2'],blockTime:'09:05'},admin);
   for(const role of ['driver','spotter']){store.mutate(r.id,admin,{action:'claim',role});for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)))store.mutate(r.id,admin,{action:'answer',role,itemId:item.id,value:'Y'});}
   for(const [phase,role] of [['ready','driver'],['safe','spotter'],['go','driver']])if(type==='departure'||phase!=='ready')store.mutate(r.id,admin,{action:'signal',role,phase});
   const sign=employeeId=>api('/pbb-api/records/'+r.id,{action:'sign',role:'driver',employeeId,type:type==='arrival'?'departure':'arrival',strokes:[[[.1,.2],[.3,.5],[.6,.1]]]});
   assert.equal((await sign(denied)).status,400);assert.equal(store.get(r.id).signatures.driver,undefined);
   let data=await(await fetch(base+'/employee-admin-api',{headers:{Authorization:'Bearer admin'}})).json();data.employees.find(e=>e.id===allowed)[type==='arrival'?'attach':'detach']=false;
   assert.equal((await api('/employee-admin-api',data)).status,200);assert.equal((await sign(allowed)).status,400);
   data=await(await fetch(base+'/employee-admin-api',{headers:{Authorization:'Bearer admin'}})).json();data.employees.find(e=>e.id===allowed)[type==='arrival'?'attach':'detach']=true;
   assert.equal((await api('/employee-admin-api',data)).status,200);assert.equal((await sign(allowed)).status,200);assert.equal(store.get(r.id).signatures.driver.eid,type==='arrival'?'00123':'00456');
  }
 }finally{integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
});
