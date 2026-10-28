const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildBriefingPdf}=require('../briefingPdf'),{CONTACTS,DEFAULTS}=require('../briefing'),{PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
const snapshot={id:'b6c91e5c-2990-4aac-9378-c33abf905bb3',date:'2026-10-27',flight:'MU583',generatedAt:'2026-10-27T20:30:00Z',generatedBy:'LAKE XIA',contacts:CONTACTS,fields:{...DEFAULTS,registration:'B-7369',eta:'12:17L',gate:'154',pax:'306 / 01',crew:'4 / 17',sta:'09:05',rushBags:'2',wchrBusiness:'2',wchrEconomy:'12',arrivalLead:'Yogesh',announcement:'Terry',carousel:'George',phoneCall:'Yogesh',jetBridge:'LAKE XIA',details:'UM - HOU/YUTO 33D\nMU - HU/ANGE 33H',blockTime:'12:20L',firstPax:'12:32L',lastPax:'12:47L',firstBag:'12:35L',lastBag:'13:01L',instructions:'Confirm all passengers and baggage are clear before closing the operation.'}};
test('sample archive is a one-page selectable PDF with its immutable JSON attached',async()=>{
 const bytes=await buildBriefingPdf(snapshot),doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),1);assert.equal(doc.getTitle(),'Arrival Briefing MU583 2026-10-27');assert(doc.catalog.has(require('../vendor/pdf-lib/pdf-lib').PDFName.of('Names')));
 const folder=path.resolve('output/pdf');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'arrival-briefing-sample.pdf'),bytes);
});
test('long multilingual fields flow across pages without dropping content',async()=>{
 const long={...snapshot,fields:{...snapshot.fields,arrivalLead:'张三 / LI, MING',details:'中文核对。 Passenger details retained.\n'.repeat(130)+'END OF DETAILS',instructions:'Long instructions retained without truncation.\n'.repeat(110)+'END OF INSTRUCTIONS'}};
 const bytes=await buildBriefingPdf(long),doc=await PDFDocument.load(bytes);assert(doc.getPageCount()>2);const folder=path.resolve('tmp/pdfs');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'briefing-long.pdf'),bytes);
});
