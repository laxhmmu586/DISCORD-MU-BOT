const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../pbb'),items=require('../public/public/pbb-data');
test('hidden Departure door and barrier rows default to Yes for new and existing unsigned forms',()=>{
 const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')}),user={uid:'test'};
 try{
  let r=store.create({type:'departure',flightNo:'MU586',gate:'132',bridges:['L1']},user);
  for(const id of ['d1','d3','d12']){assert.equal(items.departure.find(x=>x.id===id).hidden,true);assert.equal(items.departure.find(x=>x.id===id).defaultValue,'Y');assert.equal(r.answers.driver[id],'Y');}
  delete r.answers.driver.d1;delete r.answers.driver.d12;r.answers.driver.d3='N';store.put(r);r=store.get(r.id);assert.equal(r.answers.driver.d1,'Y');assert.equal(r.answers.driver.d3,'Y');assert.equal(r.answers.driver.d12,'Y');
  store.mutate(r.id,user,{action:'claim',role:'driver'});const saved=JSON.parse(store.db.prepare('SELECT data FROM pbb_records WHERE id=?').get(r.id).data);assert.equal(saved.answers.driver.d1,'Y');assert.equal(saved.answers.driver.d3,'Y');
  assert.throws(()=>store.mutate(r.id,user,{action:'answer',role:'driver',itemId:'d3',value:'N'}),/not assigned/);
  r=store.get(r.id);r.signatures.driver={name:'TEST'};r.answers.driver.d3='N';store.put(r);assert.equal(store.get(r.id).answers.driver.d3,'N','already signed history stays immutable');
 }finally{store.db.close();}
});
