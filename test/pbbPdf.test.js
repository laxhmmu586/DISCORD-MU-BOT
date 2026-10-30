const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {PDFDocument,PDFName,PDFArray,decodePDFRawStream}=require('../vendor/pdf-lib/pdf-lib');
const {buildPbbPdf}=require('../has/server/pbbPdf'),items=require('../has/public/pbb-data');
function streams(doc,page){const data=doc.context.lookup(page.node.get(PDFName.of('Contents')));return (data instanceof PDFArray?data.asArray().map(x=>doc.context.lookup(x)):[data]).map(x=>Buffer.from(decodePDFRawStream(x).decode()));}
for(const type of ['arrival','departure'])test(type+' PDF retains every original content stream and page box, then adds completed marks and audit',async()=>{
 const source=await PDFDocument.load(await fs.readFile(path.join(__dirname,'../has/public/assets/pbb',type+'-source.pdf')));
 const record={id:'test-original-template',type,flightNo:type==='arrival'?'MU583':'MU586',date:'2026-10-13',gate:'131',blockTime:'09:37',bridges:['L2'],answers:{driver:{},spotter:{}},notes:{driver:{},spotter:{}},signatures:{},completedAt:'2026-10-13T17:00:00Z'};
 for(const item of items[type])for(const role of item.roles)record.answers[role][item.id]=item.defaultValue||'Y';
 for(const role of ['driver','spotter'])record.signatures[role]={name:role==='driver'?'TEST DRIVER':'TEST SPOTTER',eid:'000321',at:'2026-10-13T16:00:00Z',strokes:[[[.1,.2],[.3,.7],[.6,.2]]]};
 const pdf=await buildPbbPdf(record),completed=await PDFDocument.load(pdf);assert.equal(completed.getPageCount(),source.getPageCount());
 for(let i=0;i<source.getPageCount();i++){assert.deepEqual(completed.getPages()[i].getMediaBox(),source.getPages()[i].getMediaBox());const after=streams(completed,completed.getPages()[i]);for(const original of streams(source,source.getPages()[i]))assert.ok(after.some(data=>data.equals(original)),'original graphic/text stream must remain byte-for-byte unchanged');}
 assert.ok(!streams(completed,completed.getPages()[0]).some(data=>data.toString().includes('30393a3337')),'block time is not written even for old records');
 assert.ok(completed.catalog.get(PDFName.of('Names')),'audit attachment must be present');
});
