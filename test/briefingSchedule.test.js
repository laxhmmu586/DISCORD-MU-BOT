const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
const {createBriefingService,createGoogleExporter,isLegacyBriefing,validatePdf,JOBS,SPREADSHEET_ID}=require('../has/server/briefingSchedule');
async function pdf(width=612,height=792){const doc=await PDFDocument.create();doc.addPage([width,height]);return Buffer.from(await doc.save());}

test('retired legacy sender cannot export or post, including restarts and dates before November 1',async t=>{
 const db=new Database(':memory:');t.after(()=>db.close());
 const unexpected=()=>{assert.fail('Retired scheduler must never access Discord or export PDFs');};
 for(const date of ['2026-10-25T15:49:00Z','2026-10-30T15:49:00Z','2026-10-31T15:49:00Z','2026-11-01T15:49:00Z']){
  const service=createBriefingService({db,client:{channels:{fetch:unexpected}},exportPdf:unexpected,now:()=>new Date(date)});service.start();await service.tick();await service.tick();service.close();
 }
 assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='briefing_deliveries'").get(),undefined);
});
test('production starts website Finish and mail services without the legacy PDF scheduler',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../index.js'),'utf8');assert(!source.includes('briefingService'));assert.match(source,/briefingAutoArchive\.start\(\)/);assert.match(source,/ldmCpmMailService\.start\(\)/);
});

test('exporter selects tab and requests single-page portrait Letter with narrow margins',async()=>{
 const bytes=await pdf();let request;
 const exporter=createGoogleExporter({getSheets:()=>({spreadsheets:{get:async()=>({data:{sheets:[{properties:{sheetId:17,title:'ARRIVAL'}}]}})}}),getClient:async()=>({request:async options=>{request=options;return {data:bytes};}})});
 const result=await exporter(JOBS[0]);assert.deepEqual(result.bytes,bytes);assert.equal(result.viewUrl,'https://docs.google.com/spreadsheets/d/'+SPREADSHEET_ID+'/edit#gid=17');const q=new URL(request.url).searchParams;assert.equal(q.get('gid'),'17');assert.equal(q.get('portrait'),'true');assert.equal(q.get('scale'),'4');assert.equal(q.get('range'),'A1:R67');assert.equal(q.get('left_margin'),'0.10');assert.equal(q.get('right_margin'),'0.10');
 await assert.rejects(validatePdf(await pdf(792,612)),/portrait/);await assert.rejects(validatePdf(Buffer.from('not a PDF')),/Invalid/);
});
test('recognizes legacy briefing calls only in configured channels',()=>{
 assert(isLegacyBriefing({channelId:'1252032370920656907',file:{name:'2026-10-25 MU586 DEPARTURE BRIEFING SHEET.pdf'}}));assert(!isLegacyBriefing({channelId:'123',file:{name:'MU586 BRIEFING SHEET.pdf'}}));assert(!isLegacyBriefing({channelId:JOBS[0].channelId,message:'ordinary message'}));
});
