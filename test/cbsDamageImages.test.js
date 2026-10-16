const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {CbsDamageImages}=require('../cbsDamageImages');
function fixture(){
 const rows=[],state={exists:false};
 const sheets={spreadsheets:{get:async()=>({data:{sheets:state.exists?[{properties:{title:'CBS Damage Images'}}]:[]}}),batchUpdate:async()=>{state.exists=true;},values:{
  append:async args=>{const start=rows.length+1;rows.push(...structuredClone(args.requestBody.values));return {data:{updates:{updatedRange:`'CBS Damage Images'!A${start}:D${rows.length}`}}};},
  get:async args=>{const [,start,end]=/!A(\d+):D(\d+)$/.exec(args.range);return {data:{values:rows.slice(Number(start)-1,Number(end))}};}
 }}};
 return {rows,sheets,store:new CbsDamageImages(sheets,'fixture')};
}
test('multiple bags keep separate durable image references across a fresh read',async()=>{
 const f=fixture(),one=Buffer.concat([Buffer.from([255,216]),Buffer.alloc(60000,1)]),two=Buffer.concat([Buffer.from([255,216]),Buffer.alloc(90000,2)]);
 const record={caseType:'DPR',bagTag:'MU000001 / MU000002',damagedBags:[{tag:'MU000001',damageSketch:'data:image/jpeg;base64,'+one.toString('base64')},{tag:'MU000002',damageSketch:'data:image/jpeg;base64,'+two.toString('base64')}]};
 await f.store.saveRecord(record);assert.notEqual(record.damagedBags[0].damageSketchRef,record.damagedBags[1].damageSketchRef);assert(f.rows.every(row=>row[3].length<=30000));
 const drive=fs.readFileSync(require.resolve('../googleDrive'),'utf8'),ctx=vm.createContext({});vm.runInContext(drive.match(/const CBS_HEADERS = \[[\s\S]*?\];/)[0],ctx);vm.runInContext(drive.slice(drive.indexOf('function cbsRecordFromSheet('),drive.indexOf('async function appendCbsCase(')),ctx);
 const values=ctx.cbsValuesFromRecord(record),restored=ctx.cbsRecordFromSheet(values,2);assert(!JSON.stringify(values).includes('base64'));
 const reopened=new CbsDamageImages(f.sheets,'fixture');assert.deepEqual(await reopened.read(restored.damagedBags[0].damageSketchRef),one);assert.deepEqual(await reopened.read(restored.damagedBags[1].damageSketchRef),two);
 f.rows[0][3]='tampered';assert.equal(await reopened.read(restored.damagedBags[0].damageSketchRef),null);
});
test('invalid references, incomplete writes and invalid images cannot appear saved',async()=>{
 const f=fixture();for(const ref of ['../../secret','0-1-'+'a'.repeat(64),'1-999-'+'a'.repeat(64)])assert.equal(await f.store.read(ref),null);
 await assert.rejects(f.store.saveRecord({caseType:'DPR',damagedBags:[{damageSketch:'data:image/jpeg;base64,YWJj'}]}),/JPEG/);
 f.sheets.spreadsheets.values.append=async()=>({data:{}});
 await assert.rejects(f.store.saveRecord({caseType:'DPR',damageSketch:'data:image/jpeg;base64,/9j/2Q=='}),/acknowledged/);
});
test('AHL and old DPR records without a saved image do not create image rows',async()=>{const f=fixture();await f.store.saveRecord({caseType:'AHL'});await f.store.saveRecord({caseType:'DPR',damagedBags:[{tag:'MU000001'}]});assert.equal(f.rows.length,0);});
