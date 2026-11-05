const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {withoutContactDetails}=require('../passengerServiceText');
const flight=require('../flightParser'),{findSYInfo}=require('../syParser');
const source=fs.readFileSync('index.js','utf8');
const names=['monthNameToNumber','sectionTimestampToIsoDate','sectionTimestampToMs','splitReportSections','cleanVipName','cleanVipPassengerName','hasVipServiceMarker','extractVipNameCandidate','extractBagsForVip','extractVipPassengersFromLog','syncVipRowsFromLog'];
function reports(){let writes=0;const context=vm.createContext({require:name=>{assert.equal(name,'./passengerServiceText');return {withoutContactDetails};},appendVipReportRows:async()=>{writes++;return {appended:1};}});for(const name of names){const match=source.match(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?^\\}','m'));assert(match,name);vm.runInContext(match[0],context);}return {context,writes:()=>writes};}
const passenger=(service='')=>[
 '2026 November 05, Thursday, 12:04:42','>fb 161',' PR: MU586/05NOV26*LAX,BN161 PNR RL ABCDEF',
 '  1. EXAMPLE/PERSON BN161 *36F T PVG ASR '+service,
 '                                        FF/AM 12345678/C M1/0',
 'CTC-555 0100 - VIP TRAVEL SERVICES - A/CTC',
 '    SECOND CONTACT - VIP TRAVEL SERVICES',
 '    VIP TRAVEL SERVICES',
 'PSPT-TEST/USA/01JAN80/M/H',' PAXLST   :EXAMPLE/PERSON/',
 ' PAX INFO :USA/DOB/800101/POB//GENDER/M','CKIN BY EXAMPLE','NAM EXAMPLE/PERSON'
].join('\n');
const sy='2026 November 05, Thursday, 12:00:00\n> SY: MU586/05NOV26 LAX/0 CI1145/NAM\n777/773L/B-0000 GTD/130 POS/GATE BN299 AK00000 CD00000\nBDT1145 SD1230 ED1230 CI1145\n';

test('CTC and its wrapped lines are excluded, without hiding following service data',()=>{
 const clean=withoutContactDetails(passenger()+'\n                                        WCHR');
 assert(!clean.includes('VIP'));assert(clean.includes('WCHR'));assert(clean.includes('PAXLST'));
});
test('contact-only VIP never becomes an active service in either passenger parser',()=>{
 flight.parseIncrementalLog(passenger());assert(!flight.passengers['161'].specialServices.includes('VIP'));
 const info=findSYInfo(sy+passenger(),'05NOV26',{preferredFlightNo:'MU586'});
 for(const row of [...info.seatMapRecords,...info.bnAudit])assert(!(row.specialServices||row.passengerRecord?.specialServices||[]).includes('VIP'));
});
test('contact-only VIP does not produce or write any VIP report row',async()=>{
 const r=reports();assert.equal(r.context.extractVipNameCandidate(passenger()),null);
 assert.equal(r.context.extractVipPassengersFromLog(passenger(),'2026-11-05').length,0);
 await r.context.syncVipRowsFromLog(passenger(),'2026-11-05');assert.equal(r.writes(),0);
});
test('real VIP attributes, explicit VIP PSM markers and VIP name markers remain valid',async()=>{
 const r=reports();assert(r.context.extractVipNameCandidate(passenger('VIP')));
 assert(r.context.hasVipServiceMarker('PSM-/VIP'));
 assert(r.context.extractVipNameCandidate('NAM EXAMPLE/PERSONVIP'));
 flight.parseIncrementalLog(passenger('VIP WCHR'));assert(flight.passengers['161'].specialServices.includes('VIP'));assert(flight.passengers['161'].specialServices.includes('WCHR'));
 await r.context.syncVipRowsFromLog(passenger('VIP'),'2026-11-05');assert.equal(r.writes(),1);
});
