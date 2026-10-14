const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../pbb'),items=require('../public/public/pbb-data'),groups=require('../pbbSignals');
for(const type of ['arrival','departure'])test(type+' completion preserves explicit No on a visible signal question',()=>{
 const store=createStore(':memory:'),user={uid:'test'};
 try{
  const r=store.create({type,flightNo:'MU586',gate:'132',bridges:['L1']},user);
  for(const row of items[type].filter(x=>!x.hidden&&x.roles.includes('driver')))store.mutate(r.id,user,{action:'answer',role:'driver',itemId:row.id,value:'Y'});
  const id=type==='arrival'?'a14':'d7';store.mutate(r.id,user,{action:'answer',role:'driver',itemId:id,value:'N'});
  const done=store.mutate(r.id,user,{action:'checklist-done',role:'driver'});assert.equal(done.answers.driver[id],'N');assert.ok(done.checklistDone.driver);
 }finally{store.db.close();}
});
for(const type of ['arrival','departure'])test(type+' role done is independent, maps all original PDF rows and requires all visible questions',()=>{
 const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')}),user={uid:'test'};
 try{
  const r=store.create({type,flightNo:type==='arrival'?'MU583':'MU586',gate:'132',bridges:['L1']},user);
  assert.throws(()=>store.mutate(r.id,user,{action:'checklist-done',role:'driver'}),/questions first/);
  for(const role of ['driver','spotter']){
   const own=Object.entries(groups[type]).filter(([,g])=>g.role===role),ids=own.flatMap(([,g])=>g.items);
   for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)&&!ids.includes(x.id)))store.mutate(r.id,user,{action:'answer',role,itemId:item.id,value:'Y'});
   const done=store.mutate(r.id,user,{action:'checklist-done',role});assert.ok(done.checklistDone[role]);for(const [phase,g] of own){assert.ok(done.signals[phase]);for(const id of g.items)assert.equal(done.answers[role][id],'Y');}
   if(role==='driver')for(const g of Object.values(groups[type]).filter(g=>g.role==='spotter'))for(const id of g.items)assert.equal(done.answers.spotter[id],undefined);
  }
  const row=items[type].find(x=>!x.hidden&&x.roles.includes('driver')&&!Object.values(groups[type]).flatMap(g=>g.items).includes(x.id));
  const changed=store.mutate(r.id,user,{action:'answer',role:'driver',itemId:row.id,value:'N'});assert.equal(changed.checklistDone.driver,undefined);assert.ok(changed.checklistDone.spotter);for(const [phase,g] of Object.entries(groups[type]))if(g.role==='driver')assert.equal(changed.signals[phase],undefined);
  const done=store.mutate(r.id,user,{action:'checklist-done',role:'driver'});const signed=store.mutate(r.id,user,{action:'sign',role:'driver',name:'TEST DRIVER',eid:'00123',strokes:[[[.1,.2],[.3,.5],[.6,.1]]]});assert.ok(signed.signatures.driver);assert.equal(done.answers.driver[row.id],'N');
 }finally{store.db.close();}
});
