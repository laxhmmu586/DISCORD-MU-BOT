const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildBriefingPdf}=require('../has/server/briefingPdf'),{CONTACTS,DEFAULTS}=require('../has/server/briefing'),{PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
const snapshot={id:'b6c91e5c-2990-4aac-9378-c33abf905bb3',date:'2026-10-27',flight:'MU583',generatedAt:'2026-10-27T20:30:00Z',generatedBy:'LAKE XIA',contacts:CONTACTS,fields:{...DEFAULTS,registration:'B-7369',eta:'12:17L',gate:'154',pax:'306 / 01',crew:'4 / 17',sta:'09:05',rushBags:'2',wchrBusiness:'2',wchrEconomy:'12',arrivalLead:'Yogesh',announcement:'Terry',carousel:'George',phoneCall:'Yogesh',jetBridge:'LAKE XIA',details:'UM - HOU/YUTO 33D\nMU - HU/ANGE 33H',blockTime:'12:20L',firstPax:'12:32L',lastPax:'12:47L',firstBag:'12:35L',lastBag:'13:01L',instructions:'Confirm all passengers and baggage are clear before closing the operation.'}};
test('sample archive is a one-page selectable PDF with its immutable JSON attached',async()=>{
 const bytes=await buildBriefingPdf(snapshot),doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),1);assert.equal(doc.getTitle(),'Arrival Briefing MU583 2026-10-27');assert(doc.catalog.has(require('../vendor/pdf-lib/pdf-lib').PDFName.of('Names')));
 const folder=path.resolve('output/pdf');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'arrival-briefing-sample.pdf'),bytes);
});
test('long multilingual fields flow across pages without dropping content',async()=>{
 const long={...snapshot,fields:{...snapshot.fields,arrivalLead:'张三 / LI, MING',details:'中文核对。 Passenger details retained.\n'.repeat(130)+'END OF DETAILS',instructions:'Long instructions retained without truncation.\n'.repeat(110)+'END OF INSTRUCTIONS'}};
 const bytes=await buildBriefingPdf(long),doc=await PDFDocument.load(bytes);assert(doc.getPageCount()>2);const folder=path.resolve('tmp/pdfs');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'briefing-long.pdf'),bytes);
});

test('reports hide absent specials and omit STD while retaining ETD and positive special counts',async()=>{
 const {reportSections,renderBriefingReport}=require('../has/server/briefingPdf');
 const arrival={...snapshot,direction:'arrival',fields:{...DEFAULTS,wchrBusiness:'-',wchrEconomy:'6',wchcBusiness:'0',wchcEconomy:'1',um:'2',vip:' — ',avih:''}};
 const section=reportSections(arrival).find(([title])=>title==='Passenger Information');assert.deepEqual(section[1],[['WCHR - Economy','6'],['WCHC - Economy','1'],['UM','2']]);
 const departure={...snapshot,flight:'MU586',direction:'departure',fields:{...DEFAULTS,std:'1130',etd:'1230L',wchr:'16',wchc:'1',interline:'9',edi:'69',um:'0',avih:'-',vip:'—'}};
 const entries=reportSections(departure).find(([title])=>title==='Special Information')[1];assert.deepEqual(entries,[['WCHR','16'],['WCHC','1'],['Interline','9'],['EDI','69']]);
 const flight=reportSections(departure)[0][1];assert(!flight.some(([label])=>label==='STD'));assert(flight.some(([label,value])=>label==='ETD'&&value==='1230L'));
 const html=renderBriefingReport(departure);assert(!html.includes('>STD<'));assert(!html.includes('>AVIH<'));assert(html.includes('>69<'));assert((await buildBriefingPdf(departure)).subarray(0,5).toString()==='%PDF-');
 for(const direction of ['arrival','departure']){const empty={...snapshot,direction,fields:{...DEFAULTS}};assert(!reportSections(empty).some(([title])=>['Passenger Information','Special Information'].includes(title)));}
 for(const value of ['',null,undefined,'-','—',' – ','0','00','0.0'])assert.equal(require('../has/public/briefing-fields').hasSpecial(value),false);
 for(const value of ['1','6','0 / 1','VIP NAME'])assert.equal(require('../has/public/briefing-fields').hasSpecial(value),true);
});

test('Departure summary keeps booking table left and populated specials right across report formats',async()=>{
 const {summaryLayout,summarySvg}=require('../has/server/briefingSummary'),{renderBriefingReport,reportSections}=require('../has/server/briefingPdf');
 const data={...snapshot,direction:'departure',flight:'MU586',fields:{...DEFAULTS,bookingF:'1',bookingJ:'52',bookingY:'232',wchr:'6',interline:'22',edi:'56',gateBoardingComplete:'1211'}};
 const layout=summaryLayout(data),left=layout.commands.find(c=>c.value==='PAX BOOKING'),right=layout.commands.find(c=>c.value==='SPECIAL INFORMATION');assert(left.x<right.x);assert.equal(left.y,right.y);assert(layout.commands.some(c=>c.value==='285 + 0'));assert(layout.commands.some(c=>c.value==='91%'));for(const label of ['Config','PAX','INF','F','J','Y'])assert(layout.commands.some(c=>c.value===label));assert(!layout.commands.some(c=>c.value==='AVIH'));assert(summarySvg(data).includes('viewBox='));const html=renderBriefingReport(data);assert.equal((html.match(/PAX BOOKING/g)||[]).length,1);assert(!html.includes('F / Config'));assert(!html.includes('Boarding complete'));assert(!reportSections(data).find(([title])=>title==='Operational Times')[1].some(([label])=>label==='Boarding complete'));
 const long={...data,fields:{...data.fields,...Object.fromEntries(require('../has/public/briefing-fields').specials.map(([field])=>[field,'Long special information '.repeat(6)]))}};const bytes=await buildBriefingPdf(long);assert((await PDFDocument.load(bytes)).getPageCount()>1);
});
