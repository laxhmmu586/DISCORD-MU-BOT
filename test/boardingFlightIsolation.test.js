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
  for(const flight of Object.keys(context.SHEETS)) context.runWithBoardingFlight(flight,()=>Object.assign(context.boardingState(),{cbsScanSheetTitle:'',cbsScanSheetTitlePending:null,cbsScanSheetCache:{loadedAt:0,rows:[]},cbsScanAppendPending:[],cbsScanAppendTimer:null,cbsScanAppendRunning:false}));
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
  assert.equal(tables.get(640376113).slice(1).filter(r=>r[11]).length,0);
  assert.equal(tables.get(1102230555).slice(1).filter(r=>r[11]).length,1);
  assert.match(tables.get(1102230555).slice(1).find(r=>r[11])[12],/^\[MU586\]/);
  const before=writes.length;
  await context.runWithBoardingFlight('MU578',()=>assert.rejects(ctx.setEmergencyBoardRecordsEntered([2],true),/selected flight/));
  assert.equal(writes.length,before);
});
