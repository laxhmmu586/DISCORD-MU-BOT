const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
process.env.CBS_SQLITE_PATH=':memory:';process.env.CBS_STORAGE='sqlite';
const storage=require('../cbsStorage'),drive=require('../googleDrive');
const {initialBaggageComment}=require('../cbsBaggageComments');

test('Baggage creation comments persist as ordinary CBS comments and legacy repair is idempotent',async()=>{
 const store=storage.local(),source=fs.readFileSync(require.resolve('../googleDrive'),'utf8');
 const headers=name=>vm.runInNewContext(source.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\]);'))[1]);
 store.importBook(storage.book,[{gid:523026916,title:'Onhand',rows:[headers('CBS_UNRESOLVED_BAGGAGE_HEADERS')]},{gid:1393047851,title:'Notload',rows:[headers('CBS_UNRESOLVED_BAGGAGE_HEADERS')]}]);
 store.importBook('1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ',[{gid:1340163844,title:'Baggage',rows:[headers('TEST_BAGGAGE_HEADERS')]}]);
 try{
  const created=await drive.appendTestBaggageRecord({bagTag:'MU369804',direction:'outbound',flight:'MU586',date:'2026-11-05',bagType:'Not load bags',status:'Not load bags',comment:'Unknown bags showing sp53 but never received',submittedBy:'Test Agent'});
  let row=(await drive.getCbsUnresolvedBaggageCases({forceRefresh:true}))[0];
  const comment=row.updateEvents.find(e=>e.key==='comment');
  assert.equal(comment.fields[0][1],created.record.comment);assert.equal(comment.by,'Test Agent');assert.equal(comment.at,created.record.submittedAt);
  // Simulate a pre-fix record: only the creation comment is missing.
  store.update(storage.book,"'Onhand'!R"+row.rowNumber,[[JSON.stringify([{key:'pvg',fields:[['PVG Filed','PVG123']]}])]]);
  // Invalidate the driver cache by using its force-refresh read.
  await drive.getCbsUnresolvedBaggageCases({forceRefresh:true,includeResolved:true});
  assert.deepEqual(await drive.backfillCbsBaggageComments(),{matched:1,updated:1,applied:false});
  assert.deepEqual(await drive.backfillCbsBaggageComments({apply:true}),{matched:1,updated:1,applied:true});
  assert.deepEqual(await drive.backfillCbsBaggageComments({apply:true}),{matched:1,updated:0,applied:true});
  row=(await drive.getCbsUnresolvedBaggageCases({forceRefresh:true}))[0];assert.equal(row.updateEvents.length,2);assert.equal(row.updateEvents[0].key,'pvg');assert.deepEqual(row.updateEvents[1],comment);
  assert.equal(initialBaggageComment({comment:'later',history:[{type:'Outbound created',details:{comment:''}}]}),null);
 }finally{store.db.close();}
});
