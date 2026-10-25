const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
const {createBriefingService,createGoogleExporter,isLegacyBriefing,validatePdf,JOBS}=require('../briefingSchedule');
async function pdf(width=612,height=792){const doc=await PDFDocument.create();doc.addPage([width,height]);return Buffer.from(await doc.save());}
async function fixture(t,{failExport=false,ambiguous=false}={}){
 const db=new Database(':memory:');t.after(()=>db.close());let instant=new Date('2026-10-25T15:48:00Z'),exports=0;const sends=[];
 const bytes=await pdf(),client={user:{id:'bot'},channels:{fetch:async channelId=>({messages:{fetch:async()=>({find:fn=>sends.map(s=>({id:s.id,author:{id:'bot'},attachments:new Map([[0,{name:s.name}]])})).find(fn)})},send:async options=>{const item={channelId,name:options.files[0].name,id:'id-'+(sends.length+1)};sends.push(item);if(ambiguous)throw Error('timeout');return {id:item.id,attachments:new Map([[0,options.files[0]]])};}})}};
 const options={db,client,now:()=>instant,logger:{error(){}},exportPdf:async job=>{exports++;if(failExport&&job.flight==='MU583')throw Error('export unavailable');return bytes;}};
 return {db,sends,options,service:createBriefingService(options),time:s=>instant=new Date(s),exports:()=>exports};
}
test('system sends both briefings at UTC 15:49 once daily across restart',async t=>{
 const h=await fixture(t);await h.service.tick();assert.equal(h.sends.length,0);h.time('2026-10-25T15:49:00Z');await h.service.tick();await h.service.tick();await createBriefingService(h.options).tick();assert.equal(h.sends.length,2);assert.equal(h.exports(),2);assert.deepEqual(h.sends.map(s=>s.channelId),JOBS.map(j=>j.channelId));assert.match(h.sends[0].name,/2026-10-25 MU583 ARRIVAL/);
 h.time('2026-12-01T15:49:00Z');await h.service.tick();assert.equal(h.sends.length,4);
});
test('failed export does not block the other flight; retries respect backoff',async t=>{
 const h=await fixture(t,{failExport:true});h.time('2026-10-25T15:49:00Z');await h.service.tick();assert.equal(h.sends.length,1);assert.equal(h.sends[0].channelId,JOBS[1].channelId);await h.service.tick();assert.equal(h.exports(),2);h.time('2026-10-25T15:55:00Z');await h.service.tick();assert.equal(h.exports(),3);assert.equal(h.sends.length,1);
});
test('ambiguous sends reconcile attachments without duplicate posts',async t=>{
 const h=await fixture(t,{ambiguous:true});h.time('2026-10-25T15:49:00Z');await h.service.tick();assert.equal(h.sends.length,2);await h.service.tick();assert.equal(h.sends.length,2);assert(h.db.prepare('SELECT state FROM briefing_deliveries').all().every(r=>r.state==='sent'));
});
test('adopts PDFs already sent manually today instead of resending on deployment',async t=>{
 const h=await fixture(t);h.time('2026-10-25T15:49:00Z');h.sends.push(...JOBS.map(j=>({channelId:j.channelId,name:'2026-10-25 '+j.flight+' '+j.sheet+' BRIEFING SHEET.pdf',id:'manual-'+j.flight})));
 await h.service.tick();assert.equal(h.sends.length,2);assert.equal(h.exports(),0);assert(h.db.prepare('SELECT state FROM briefing_deliveries').all().every(r=>r.state==='sent'));
});
test('exporter selects tab and requests single-page portrait Letter with narrow margins',async()=>{
 const bytes=await pdf();let request;
 const exporter=createGoogleExporter({getSheets:()=>({spreadsheets:{get:async()=>({data:{sheets:[{properties:{sheetId:17,title:'ARRIVAL'}}]}})}}),getClient:async()=>({request:async options=>{request=options;return {data:bytes};}})});
 assert.deepEqual(await exporter(JOBS[0]),bytes);const q=new URL(request.url).searchParams;assert.equal(q.get('gid'),'17');assert.equal(q.get('portrait'),'true');assert.equal(q.get('scale'),'4');assert.equal(q.get('range'),'A1:R67');assert.equal(q.get('left_margin'),'0.10');assert.equal(q.get('right_margin'),'0.10');
 await assert.rejects(validatePdf(await pdf(792,612)),/portrait/);await assert.rejects(validatePdf(Buffer.from('not a PDF')),/Invalid/);
});
test('recognizes legacy briefing calls only in configured channels',()=>{
 assert(isLegacyBriefing({channelId:'1252032370920656907',file:{name:'2026-10-25 MU586 DEPARTURE BRIEFING SHEET.pdf'}}));assert(!isLegacyBriefing({channelId:'123',file:{name:'MU586 BRIEFING SHEET.pdf'}}));assert(!isLegacyBriefing({channelId:JOBS[0].channelId,message:'ordinary message'}));
});
