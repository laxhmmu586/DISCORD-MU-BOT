const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../has/server/pbb'),items=require('../has/public/pbb-data'),groups=require('../has/server/pbbSignals');
for(const type of ['arrival','departure'])for(const first of ['driver','spotter'])test(`${type}: ${first} signs independently and last signature completes automatically`,()=>{
 const store=createStore(':memory:',{now:()=>new Date('2026-10-14T16:00:00Z')}),user={uid:'fixture'},strokes=[[[.1,.2],[.3,.5]]];
 try{
  const r=store.create({type,flightNo:'MU586',gate:'132',bridges:['L1']},user);
  for(const role of [first,first==='driver'?'spotter':'driver']){
   const signalIds=Object.values(groups[type]).flatMap(g=>g.items);
   for(const item of items[type].filter(x=>!x.hidden&&x.roles.includes(role)&&!signalIds.includes(x.id)))store.mutate(r.id,user,{action:'answer',role,itemId:item.id,value:'N'});
   assert.throws(()=>store.mutate(r.id,user,{action:'sign',role,name:'Fixture',strokes:[]}),/handwritten/);
   assert.equal(store.get(r.id).checklistDone?.[role],undefined);
   const signed=store.mutate(r.id,user,{action:'sign',role,name:'Fixture',strokes});
   assert.ok(signed.signatures[role]);assert.ok(signed.checklistDone[role]);
   for(const [phase,g] of Object.entries(groups[type]).filter(([,g])=>g.role===role)){assert.ok(signed.signals[phase]);for(const id of g.items)assert.equal(signed.answers[role][id],'Y');}
   assert.equal(!!signed.completedAt,role!==first);
   if(role===first)assert.equal(signed.signatures[first==='driver'?'spotter':'driver'],undefined);
  }
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
