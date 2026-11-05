const test=require('node:test'),assert=require('node:assert/strict');
process.env.CBS_SQLITE_PATH=':memory:';process.env.CBS_STORAGE='sqlite';
const storage=require('../cbsStorage'),drive=require('../googleDrive');
test('flight corrections persist with audit history and preserve the case, rejecting stale edits and rolling back failed writes',async()=>{
 const store=storage.local(),now=new Date().toISOString();
 store.importBook(storage.book,[{gid:523026916,title:'Onhand',rows:[['Bag Tag'],['MU369804','Outbound','MU586',now.slice(0,10),'Not load bags','Not load bags','Office',now,'','','','','','Test Agent','','','',JSON.stringify([{key:'comment',fields:[['Comment','Original note']]}])]]}]);
 try{
  const result=await drive.correctCbsFlight(2,{oldFlight:'MU586',flightNumber:'mu 578',updatedBy:'Editor'});
  assert.equal(result.record.flightNumber,'MU578');
  let row=(await drive.getCbsUnresolvedBaggageCases({includeResolved:true,forceRefresh:true}))[0];
  assert.equal(row.flightNumber,'MU578');assert.equal(row.bagTag,'MU369804');assert.equal(row.status,'Not load bags');assert.equal(row.flightDate,now.slice(0,10));assert.equal(row.resolvedAt,'');
  assert.equal(row.updateEvents[0].fields[0][1],'Original note');assert.equal(row.updateEvents[1].by,'Editor');
  await assert.rejects(drive.correctCbsFlight(2,{oldFlight:'MU586',flightNumber:'MU583'}),e=>e.status===409);
  for(const value of ['bad','123456','MU','MU123456','<script>'])await assert.rejects(drive.correctCbsFlight(2,{oldFlight:'MU578',flightNumber:value}),e=>e.status===400);
  await assert.rejects(drive.correctCbsFlight(99,{oldFlight:'MU578',flightNumber:'MU583'}),e=>e.status===404);
  assert.equal((await drive.correctCbsFlight(2,{oldFlight:'MU578',flightNumber:'MU578'})).updated,false);
  const original=store.update.bind(store);store.update=(...args)=>{if(args[1].includes('!R2'))throw Error('disk failure');return original(...args);};
  await assert.rejects(drive.correctCbsFlight(2,{oldFlight:'MU578',flightNumber:'MU583'}),/disk failure/);store.update=original;
  row=(await drive.getCbsUnresolvedBaggageCases({includeResolved:true,forceRefresh:true}))[0];assert.equal(row.flightNumber,'MU578');assert.equal(row.updateEvents.length,2);
 }finally{store.db.close();}
});
