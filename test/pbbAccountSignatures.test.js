const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createStore,registerPbb}=require('../pbb'),items=require('../public/public/pbb-data');
const strokes=[[[.1,.2],[.3,.5],[.6,.1]]];
test('account signatures use canonical identity, block impersonation and unlinked sessions, and scope the ramp exception to Arrival Spotter',async()=>{
 const app=express();app.use(express.json());
 const users={driver:{uid:'driver',email:'driver@example.com',provider:'password'},spotter:{uid:'spotter',email:'spotter@example.com',provider:'password'},unlinked:{uid:'unlinked',email:'unlinked@example.com'}};
 const seed=[{id:'driver',name:'CANONICAL DRIVER',nickname:'Nickname',eid:'00123',loginId:users.driver.email,attach:true,detach:true,spotter:true},{id:'spotter',name:'CANONICAL SPOTTER',eid:'00456',loginId:users.spotter.email,attach:false,detach:false,spotter:true}];
 const store=createStore(':memory:',{now:()=>new Date('2026-10-21T16:00Z')});
 const integration=registerPbb(app,{store,employeeSeed:seed,authenticate:async req=>{const user=users[req.headers.authorization?.slice(7)];if(!user)throw Error('login');return user;},buildPdf:async()=>Buffer.from('%PDF fixture'),drive:{files:{generateIds:async()=>({data:{ids:['fixture']}}),get:async()=>({})}},client:{channels:{fetch:async()=>({isTextBased:()=>true,send:async()=>({id:'fixture'})})}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const api=(url,who,body)=>fetch(base+url,{headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const ready=(type,role,who)=>{const r=store.create({type,flightNo:'MU583',gate:'132',bridges:['L1']},users[who]);store.mutate(r.id,users[who],{action:'claim',role});for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)))store.mutate(r.id,users[who],{action:'answer',role,itemId:item.id,value:'Y'});return r;};
 const sign=(r,who,role,extra={})=>api('/pbb-api/records/'+r.id,who,{action:'sign',role,strokes,...extra});
 try{
  assert.deepEqual(await(await api('/pbb-api/signing-employee','driver')).json(),{id:'driver'});
  for(const [type,role,who] of [['arrival','driver','driver'],['departure','driver','driver'],['departure','spotter','spotter']]){
   const r=ready(type,role,who);
   assert.equal((await sign(r,who,role,{employeeId:who==='driver'?'spotter':'driver'})).status,403);
   assert.equal((await sign(r,who,role,{employeeId:'has-ops-ramp',type:'arrival'})).status,403);
   assert.equal((await sign(r,who,role,{name:'Forged name',eid:'999'})).status,200);
   const saved=store.get(r.id).signatures[role];assert.equal(saved.employeeId,who);assert.equal(saved.name,seed.find(e=>e.id===who).name);assert.equal(saved.eid,seed.find(e=>e.id===who).eid);assert.equal(saved.uid,who);
   store.reset(r.id,{date:r.date,bridge:'L1',revision:store.get(r.id).revision});
  }
  const r=ready('arrival','spotter','unlinked');assert.equal((await sign(r,'unlinked','spotter',{employeeId:'has-ops-ramp'})).status,200);assert.equal(store.get(r.id).signatures.spotter.name,'HAS OPS RAMP');
  store.reset(r.id,{date:r.date,bridge:'L1',revision:store.get(r.id).revision});
  const u=ready('departure','driver','unlinked');assert.equal((await sign(u,'unlinked','driver',{employeeId:'driver'})).status,403);
  const guest=await(await fetch(base+'/pbb-api/session',{method:'POST'})).json();assert.equal((await sign(u,guest.token,'driver',{employeeId:'driver'})).status,403);assert.equal(store.get(u.id).signatures.driver,undefined);
 }finally{integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();integration.employees.close();}
});
