const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = require('../boardingContext');
const { matchMuFlight, parseEmergencyBoardScan } = require('../cbsScanParser');
const drive = fs.readFileSync(require.resolve('../googleDrive'), 'utf8').replace(/\r\n/g, '\n');
function harness() {
  const tables = new Map([[0,[[]]],[409569001,[[]]],[640376113,[[]]],[1102230555,[[]]]]);
  const writes=[], gids=[];
  const ctx = vm.createContext({ ...context, Date, setTimeout, clearTimeout,
    CBS_SCAN_SHEET_ID:'boarding', EMERGENCY_BOARD_SHEET_ID:'boarding', EMERGENCY_BOARD_SHEET_GID:1102230555,
    CBS_SCAN_HEADERS:['BN','Seat','Flight','Raw Scan','Scanned At'],
    CBS_SCAN_INFANT_HEADERS:['Infant BN','Infant Seat','Infant Flight','Infant Raw Scan','Infant Scanned At'],
    escapeSheetTitle:x=>x, cbsScanSheetsCall: fn => Promise.resolve().then(context.bindBoardingOperation(fn)),
    resolveSheetTitleByGid: async (_,gid) => { await new Promise(r=>setTimeout(r,5)); gids.push(gid); return String(gid); },
    sheets:{ spreadsheets:{ values:{
      get: async ({range})=>({data:{values:structuredClone(tables.get(Number(range.split('!')[0])))}}),
      batchUpdate: async ({requestBody})=>{ for(const update of requestBody.data) write(update); },
      update: async data=>write({range:data.range,values:data.requestBody.values}),
      clear: async ({range})=>write({range,values:[['','']]})
    }, batchUpdate: async value=>{writes.push(value);}, get:async()=>({data:{}}) }}
  });
  function write({range,values}) {
    writes.push({range,values});
    const [,gid,col,row] = range.match(/^(\d+)!([A-Z]+)(\d+)/);
    const start=[...col].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
    const table=tables.get(Number(gid));
    values.forEach((cells,index)=>{
      const i=Number(row)-1+index; while(table.length<=i)table.push([]);
      cells.forEach((cell,j)=>table[i][start+j]=cell);
    });
  }
  vm.runInContext(`let emergencyBoardSheetTitle='', emergencyBoardSheetTitlePending=null, emergencyBoardSheetCache={loadedAt:0,rows:[]}, emergencyBoardAppendPending=[], emergencyBoardAppendTimer=null, emergencyBoardAppendRunning=false;`,ctx);
  const start=drive.indexOf('async function getCbsScanSheetTitle('),end=drive.indexOf('async function getRecordScanSheetTitle(');
  vm.runInContext(drive.slice(start,end),ctx);
  for(const flight of Object.keys(context.SHEETS)) context.runWithBoardingFlight(flight,()=>Object.assign(context.boardingState(),{nbrdKnown:null,nbrdVersion:0,nbrdSyncedKey:null,nbrdPendingKey:null,nbrdPendingPromise:null,boardCache:null,boardPending:null,cbsScanSheetTitle:'',cbsScanSheetTitlePending:null,cbsScanSheetCache:{loadedAt:0,rows:[]},cbsScanAppendPending:[],cbsScanAppendTimer:null,cbsScanAppendRunning:false}));
  return {ctx,tables,writes,gids};
}
test('all three flight barcodes are supported, while arrivals are rejected',()=>{
  for(const flight of ['586','9586','578']){
    assert.equal(matchMuFlight(`LAXPVGMU${flight.padStart(4,'0')}281`).supported,true);
    assert.equal(parseEmergencyBoardScan(`MU${flight}|BN014`).flight,flight.padStart(4,'0'));
  }
  for(const flight of ['583','577']) assert.equal(matchMuFlight(`MU${flight}`).supported,false);
});
test('a missing destination tab fails instead of falling back to another flight sheet',async()=>{
  const {ctx}=harness();ctx.resolveSheetTitleByGid=async()=>'';
  await context.runWithBoardingFlight('MU578',()=>assert.rejects(ctx.getCbsScanSheetTitle(),/worksheet missing for MU578/));
});
test('queued Sheets operations retain their submitting flight when drained by another flight',async()=>{
  const callbacks=Object.keys(context.SHEETS).map(flight=>context.runWithBoardingFlight(flight,()=>context.bindBoardingOperation(()=>context.boardingSheetGid())));
  const results=await context.runWithBoardingFlight('MU578',()=>Promise.all(callbacks.map(fn=>Promise.resolve().then(fn))));
  assert.deepEqual(results,Object.values(context.SHEETS));
});
test('simultaneous ordinary scans with the same BN use three isolated tabs and caches',async()=>{
  const {ctx,tables,gids,writes}=harness();
  const result=await Promise.all(Object.keys(context.SHEETS).map(flight=>context.runWithBoardingFlight(flight,()=>ctx.appendCbsScanRecord({flight,bn:'14',seat:'35J'}))));
  assert.equal(result.length,3);
  assert.deepEqual(new Set(gids),new Set(Object.values(context.SHEETS)));
  for(const [flight,gid] of Object.entries(context.SHEETS)) assert.equal(tables.get(gid)[1][2],flight);
  assert.equal(writes.filter(w=>/!A2:E2$/.test(w.range)).length,3);
  await context.runWithBoardingFlight('MU578',()=>assert.rejects(ctx.appendCbsScanRecord({flight:'MU586',bn:'15'}),{code:'WRONG_FLIGHT'}));
  await context.runWithBoardingFlight('MU578',()=>assert.rejects(ctx.appendCbsScanRecord({flight:'MU578',bn:'14'}),{code:'DUPLICATE_BN'}));
});
test('shared emergency sheet isolates adult/infant duplicates, NBRD replacement, reads and mirrored deletion',async()=>{
  const {ctx,tables,writes}=harness();
  const flights=Object.keys(context.SHEETS);
  await Promise.all(flights.map(flight=>context.runWithBoardingFlight(flight,()=>ctx.appendEmergencyBoardNbrdBns([{bn:'20',detail:flight+' check'}],{replace:true}))));
  assert.equal(tables.get(1102230555).slice(1).filter(r=>r[11]).length,3);
  for(const flight of flights) {
    await context.runWithBoardingFlight(flight,()=>assert.rejects(ctx.appendEmergencyBoardRecord({flight,bn:'20'}),err=>err.code==='NBRD_MESSAGE'&&err.detail===flight+' check'));
  }
  const result=await Promise.all(flights.flatMap(flight=>[false,true].map(isInfant=>context.runWithBoardingFlight(flight,()=>ctx.appendEmergencyBoardRecord({flight,bn:'14',seat:isInfant?'INF':'35J',isInfant})))));
  assert.equal(result.length,6);
  await context.runWithBoardingFlight('MU9586',()=>assert.rejects(ctx.appendEmergencyBoardRecord({flight:'9586',bn:'14'}),{code:'DUPLICATE_BN'}));
  await context.runWithBoardingFlight('MU9586',()=>ctx.appendEmergencyBoardNbrdBns([],{replace:true}));
  assert.equal(tables.get(1102230555).slice(1).filter(r=>r[11]).length,2);
  for(const flight of flights){
    const rows=await context.runWithBoardingFlight(flight,()=>ctx.getEmergencyBoardRecords());
    assert.equal(rows.filter(r=>r.bn).length,1); assert.equal(rows.filter(r=>r.infantBn).length,1);
    assert.ok(rows.every(r=>(!r.flight||r.flight===flight)&&(!r.infantFlight||r.infantFlight===flight)));
    assert.equal(rows.filter(r=>r.nbrdBn).length,flight==='MU9586'?0:1);
  }
  await context.runWithBoardingFlight('MU578',()=>ctx.appendCbsScanNbrdBns([{bn:'20',detail:'regular'}],{replace:true}));
  await context.runWithBoardingFlight('MU578',()=>ctx.deleteCkinNbrdFromBothSheets('20'));
  assert.equal(tables.get(640376113).slice(1).filter(r=>r[11]).length,1);
  assert.equal(tables.get(640376113).slice(1).find(r=>r[11])[18],'RESOLVED');
  assert.equal(tables.get(1102230555).slice(1).filter(r=>r[11]).length,1);
  assert.match(tables.get(1102230555).slice(1).find(r=>r[11])[12],/^\[MU586\]/);
  const before=writes.length;
  await context.runWithBoardingFlight('MU578',()=>assert.rejects(ctx.setEmergencyBoardRecordsEntered([2],true),/selected flight/));
  assert.equal(writes.length,before);
});

test('ordinary batch combines NBRD deltas and adult/infant scans without touching unchanged slots', async()=>{
  const {ctx,tables,writes}=harness();
  const headers=['BN','Seat','Flight','Raw Scan','Scanned At','','','','','','','NBRD BN','CKIN NBRD Detail','Infant BN','Infant Seat','Infant Flight','Infant Raw Scan','Infant Scanned At'];
  const existing=[[],[],[]];existing[0][11]='010';existing[0][12]='keep';existing[1][11]='020';existing[1][12]='remove';existing[2][11]='030';existing[2][12]='old';
  tables.set(0,[headers,...existing]);
  Object.assign(context.boardingState(),{nbrdVersion:0,nbrdSyncedKey:null,nbrdPendingKey:null,nbrdPendingPromise:null,boardCache:null,boardPending:null});
  let reads=0,batches=0;
  const get=ctx.sheets.spreadsheets.values.get,write=ctx.sheets.spreadsheets.values.batchUpdate;
  ctx.sheets.spreadsheets.values.get=async args=>{reads++;return get(args);};
  ctx.sheets.spreadsheets.values.batchUpdate=async args=>{batches++;return write(args);};
  const sync=ctx.appendCbsScanNbrdBns([{bn:'10',detail:'keep'},{bn:'30',detail:'new'},{bn:'40',detail:'added'}],{replace:true,version:2});
  const duplicateSync=ctx.appendCbsScanNbrdBns([{bn:'40',detail:'added'},{bn:'30',detail:'new'},{bn:'10',detail:'keep'}],{replace:true,version:2});
  const blocked=ctx.appendCbsScanRecord({flight:'MU586',bn:'40',seat:'10A'}).catch(e=>e);
  const resolved=ctx.resolveCbsScanNbrdBn('20');
  const released=ctx.appendCbsScanRecord({flight:'MU586',bn:'20',seat:'10B'});
  const infant=ctx.appendCbsScanRecord({flight:'MU586',bn:'21',seat:'INF',isInfant:true});
  const duplicate=ctx.appendCbsScanRecord({flight:'MU586',bn:'20',seat:'10B'}).catch(e=>e);
  await Promise.all([sync,duplicateSync,resolved,released,infant]);
  assert.equal((await blocked).code,'NBRD_MESSAGE');assert.equal((await duplicate).code,'DUPLICATE_BN');
  assert.equal(reads,1);assert.equal(batches,1);
  assert.ok(!writes.some(w=>w.range.includes('!L2:M2')),'unchanged slot is not written');
  assert.equal(tables.get(0)[1][11],'010');assert.equal(tables.get(0)[2][11],'020');assert.equal(tables.get(0)[2][18],'RESOLVED');assert.equal(tables.get(0)[3][12],'new');assert.equal(tables.get(0)[4][11],'040');
  await ctx.appendCbsScanNbrdBns([{bn:'10',detail:'keep'},{bn:'30',detail:'new'},{bn:'40',detail:'added'}],{replace:true,version:2});
  assert.equal(reads,1,'already committed snapshot uses no read');
  assert.equal((await ctx.appendCbsScanNbrdBns([],{replace:true,version:1})).stale,true);
  await ctx.deleteCbsScanNbrdBn(5,'40');
  assert.equal(tables.get(0)[4][11],'040');
  assert.equal(tables.get(0)[4][18],'RESOLVED');
  assert.equal(tables.get(1102230555).length,1,'ordinary NBRD never mirrors to emergency');
});

test('three board viewers share one records read and one entered-color read, then invalidate on mutation',async()=>{
  const {ctx,tables}=harness();
  Object.assign(context.boardingState(),{boardCache:null,boardPending:null,rowsPending:null,cbsScanSheetCache:{loadedAt:0,rows:[]}});
  const headers=['BN','Seat','Flight','Raw Scan','Scanned At','','','','','','','NBRD BN','CKIN NBRD Detail','Infant BN','Infant Seat','Infant Flight','Infant Raw Scan','Infant Scanned At'];
  tables.set(0,[headers,['001','10A','MU586']]);
  let reads=0,colors=0;const get=ctx.sheets.spreadsheets.values.get;
  ctx.sheets.spreadsheets.values.get=async args=>{reads++;await new Promise(r=>setTimeout(r,5));return get(args);};
  ctx.sheets.spreadsheets.get=async()=>{colors++;return {data:{sheets:[{data:[{rowData:[{values:[{userEnteredFormat:{backgroundColor:{red:.91,green:.97,blue:.93}}}]}]}]}]}};};
  const results=await Promise.all([ctx.getCbsScanRecords(),ctx.getCbsScanRecords(),ctx.getCbsScanRecords()]);
  assert.equal(reads,1);assert.equal(colors,1);assert.equal(results[0][0].entered,true);
  await ctx.getCbsScanRecords();assert.equal(colors,1);
  await ctx.setCbsScanRecordsEntered([2],false);await ctx.getCbsScanRecords();assert.equal(colors,2);
});

test('retained NBRD updates details without removing entries, unchanged updates skip batches, confirmed Board is atomic',async()=>{
  const {ctx,tables}=harness();
  await ctx.appendCbsScanNbrdBns([{bn:'70',detail:'VISA'},{bn:'71',detail:'SEAT CHANGE'}],{replace:true,version:10});
  await ctx.appendCbsScanNbrdBns([{bn:'70',detail:'RE-SWIPE'}],{replace:true,version:11});
  assert.equal(tables.get(0)[1][12],'RE-SWIPE');assert.equal(tables.get(0)[2][11],'071');
  const before=ctx.sheets.spreadsheets.values.get;let reads=0;
  ctx.sheets.spreadsheets.values.get=async args=>{reads++;return before(args);};
  await ctx.appendCbsScanNbrdBns([{bn:'70',detail:'RE-SWIPE'}]);
  assert.equal(reads,0);assert.equal(context.boardingState().cbsScanAppendTimer,null);
  await assert.rejects(ctx.appendCbsScanRecord({flight:'MU586',bn:'70',seat:'10A'}),{code:'NBRD_MESSAGE'});
  await assert.rejects(ctx.appendCbsScanRecord({flight:'MU586',bn:'70',seat:'10A',nbrdConfirmed:true,nbrdConfirmationDetail:'VISA'}),{code:'NBRD_MESSAGE'});
  const batchUpdate=ctx.sheets.spreadsheets.values.batchUpdate;
  ctx.sheets.spreadsheets.values.batchUpdate=async()=>{throw new Error('write failed');};
  await assert.rejects(ctx.appendCbsScanRecord({flight:'MU586',bn:'70',seat:'10A',nbrdConfirmed:true,nbrdConfirmationDetail:'RE-SWIPE'}),/write failed/);
  assert.equal(tables.get(0)[1][18],'PENDING');assert.ok(!tables.get(0).some(r=>r[0]==='070'));
  ctx.sheets.spreadsheets.values.batchUpdate=batchUpdate;
  await ctx.appendCbsScanRecord({flight:'MU586',bn:'70',seat:'10A',nbrdConfirmed:true,nbrdConfirmationDetail:'RE-SWIPE'});
  assert.equal(tables.get(0)[1][18],'RESOLVED');assert.ok(tables.get(0).some(r=>r[0]==='070'));
  await assert.rejects(ctx.appendCbsScanRecord({flight:'MU586',bn:'70',seat:'10A'}),{code:'DUPLICATE_BN'});
  await ctx.appendCbsScanNbrdBns([{bn:'70',detail:'manual note'}]);
  assert.equal(tables.get(0)[1][12],'manual note');assert.equal(tables.get(0)[1][18],'RESOLVED');
  assert.equal(tables.get(0).filter(r=>r[11]==='070').length,1);
  await ctx.appendCbsScanNbrdBns([{bn:'70',detail:'system detail'}],{replace:true,version:12});
  assert.equal(tables.get(0)[1][12],'system detail');assert.equal(tables.get(0)[1][18],'RESOLVED');
  await ctx.resolveCbsScanNbrdBn('71');
  await ctx.appendCbsScanRecord({flight:'MU586',bn:'71',seat:'INF',isInfant:true});
  await ctx.appendCbsScanNbrdBns([],{replace:true,version:13});
  assert.equal(tables.get(0)[2][11],'071');assert.equal(tables.get(0)[2][18],'RESOLVED');
  const records=await ctx.getCbsScanRecords();assert.equal(records.filter(r=>r.nbrdResolved).length,2);
});

test('red X reopens NBRD, persists pending state and blocks scanning again',async()=>{
 const {ctx,tables}=harness();
 await ctx.appendCbsScanNbrdBns([{bn:'88',detail:'VISA'}]);
 await ctx.resolveCbsScanNbrdBn('88');assert.equal(tables.get(0)[1][18],'RESOLVED');
 const pending=ctx.resolveCbsScanNbrdBn('88',false);
 const blocked=ctx.appendCbsScanRecord({flight:'MU586',bn:'88',seat:'10A'}).catch(err=>err);
 await pending;assert.equal((await blocked).code,'NBRD_MESSAGE');
 assert.equal(tables.get(0)[1][18],'PENDING');
 const records=await ctx.getCbsScanNbrdRecords();assert.equal(records[0].nbrdResolved,false);
 const update=ctx.sheets.spreadsheets.values.batchUpdate;
 ctx.sheets.spreadsheets.values.batchUpdate=async()=>{throw new Error('status failure');};
 await assert.rejects(ctx.resolveCbsScanNbrdBn('88'),/status failure/);assert.equal(tables.get(0)[1][18],'PENDING');
 ctx.sheets.spreadsheets.values.batchUpdate=update;
 await ctx.resolveCbsScanNbrdBn('88');await ctx.appendCbsScanRecord({flight:'MU586',bn:'88',seat:'10A'});
 assert.ok(tables.get(0).some(row=>row[0]==='088'));
});

test('successful scan includes all freshly read NBRDs without an extra Sheets read',async()=>{
 const {ctx,tables}=harness();
 await ctx.appendCbsScanNbrdBns([{bn:'1',detail:'NBRD'},{bn:'2',detail:'VISA'},{bn:'3',detail:'SEAT CHANGE'}]);
 // Simulate a Sheet edit after the initial three-entry cache was populated.
 const external=[];external[11]='004';external[12]='RE-SWIPE';tables.get(0).push(external);
 let reads=0;const get=ctx.sheets.spreadsheets.values.get;
 ctx.sheets.spreadsheets.values.get=async args=>{reads++;return get(args);};
 const saved=await ctx.appendCbsScanRecord({flight:'MU586',bn:'99',seat:'10A'});
 assert.equal(reads,1);assert.equal(saved.nbrdRows.length,4);
 assert.equal(saved.nbrdRows.find(row=>row.nbrdBn==='004').nbrdDetail,'RE-SWIPE');
 assert.equal(saved.nbrdRows.find(row=>row.nbrdBn==='004').nbrdResolved,false);
});
