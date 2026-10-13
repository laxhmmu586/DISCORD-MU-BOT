const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createStore,registerPbb}=require('../pbb');
const user={uid:'test',email:'test@example.com'},info={type:'arrival',flightNo:'MU583',gate:'132',bridges:['L1']};
test('bridge restart clears answers, signatures and PDF, preserves other bridge/type/date and rejects stale requests',()=>{
 const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});
 try{
  let r=store.create(info,user);r=store.mutate(r.id,user,{action:'answer',role:'driver',itemId:'a3',value:'Y'});r.signatures.driver={name:'TEST DRIVER'};r.completedAt='2026-10-13T17:00:00Z';store.put(r);store.setPdf(r.id,Buffer.from('PDF'));
  const other=store.create({...info,bridges:['L2']},user),departure=store.create({...info,type:'departure'},user);
  assert.throws(()=>store.reset(r.id,{date:r.date,bridge:'L1',revision:r.revision-1}),/changed/);assert.throws(()=>store.reset(r.id,{date:'2026-10-14',bridge:'L1',revision:r.revision}),/today/);
  const legacy={...other,id:'legacy-shared',bridges:['L1','L3']};store.db.prepare('INSERT INTO pbb_records(id,data) VALUES (?,?)').run(legacy.id,JSON.stringify(legacy));
  const result=store.reset(r.id,{date:r.date,bridge:'L1',revision:r.revision});assert.deepEqual(result.deleted,[r.id]);assert.deepEqual(store.get(legacy.id).bridges,['L3']);assert.ok(store.get(other.id));assert.ok(store.get(departure.id));assert.equal(store.pdf(r.id),undefined);assert.throws(()=>store.get(r.id),/not found/);
  const fresh=store.create(info,user);assert.notEqual(fresh.id,r.id);assert.equal(fresh.answers.driver.a3,undefined);assert.deepEqual(fresh.signatures,{});
 }finally{store.db.close();}
});
test('reset API protects a concurrent save, notifies live participants and clears only the selected bridge',async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')}),integration=registerPbb(app,{store,employeeSeed:[],authenticate:async req=>{if(req.headers.authorization==='Bearer test')return user;throw Error('login');},gateService:{today:async()=>({flights:[]}),read:async()=>({status:'unavailable'})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const api=(url,body,token='test')=>fetch(base+url,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 try{
  const r=store.create(info,user),other=store.create({...info,bridges:['L2']},user),response=await api('/pbb-api/records/'+r.id+'/stream'),reader=response.body.getReader();await reader.read();
  const path='/pbb-api/records/'+r.id+'/reset';assert.equal((await api(path,{bridge:'L1',revision:r.revision},'bad')).status,401);assert.equal((await api(path,{bridge:'L2',revision:r.revision})).status,409);
  const changed=store.mutate(r.id,user,{action:'answer',role:'driver',itemId:'a3',value:'Y'});assert.equal((await api(path,{bridge:'L1',revision:r.revision})).status,409);
  assert.equal((await api(path,{bridge:'L1',revision:changed.revision})).status,200);
  let output='';for(let i=0;i<5&&!output.includes('event: reset');i++){const chunk=await reader.read();if(chunk.done)break;output+=new TextDecoder().decode(chunk.value);}assert.match(output,/event: reset/);await reader.cancel();assert.ok(store.get(other.id));assert.equal((await api('/pbb-api/records/'+r.id)).status,404);
 }finally{integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
});
