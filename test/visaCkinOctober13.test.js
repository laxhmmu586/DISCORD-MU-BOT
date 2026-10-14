const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateVisa,ckinFacts,dateFromToken}=require('../visaEngine');
const {findSYInfo}=require('../syParser');
const {countryForAirport}=require('../visaDestinations');
const now=new Date('2026-10-13T12:00:00Z');
const input={nationality:'USA',destinationCountry:'LAO',travelDate:'2026-10-13',entryDate:'2026-10-14',passportType:'ordinary'};
const evaluate=(lines,extra={})=>evaluateVisa({...input,ckinLines:lines,...extra},null,{now});

test('APPLY 240 is completed manual TWOV; negative and pending remarks remain review',()=>{
 for(const line of ['CKIN APPLY 240','CKIN 240']){
  const r=evaluate([line]);assert.equal(r.status,'pass');assert.equal(r.reasonCodes[0],'MANUAL_240');
 }
 for(const line of ['CKIN NOT APPLY 240','CKIN APPLY 240 PENDING','CKIN NEED APPLY 240','CKIN APPLY VISA 240','CKIN 240 CANCELLED'])assert.equal(evaluate([line]).status,'review',line);
 assert.equal(evaluate(['CKIN APPLY 240','CKIN NBRD VISA']).status,'review');
});

test('USA Laos checks use recorded birth or a single valid exit-ticket date',()=>{
 assert.equal(countryForAirport('VTE'),'LAO');
 assert.equal(evaluate(['CKIN BORN IN LAOS']).reasonCodes[0],'CKIN_LAOS_BIRTH_CHECKED');
 const ticket=evaluate(['CKIN EXIT TKT 12NOV2026']);
 assert.equal(ticket.status,'pass');assert.equal(ticket.exitDate,'2026-11-12');assert.equal(ticket.inspection,'recorded');
 for(const lines of [[],['CKIN NOT BORN IN LAOS'],['CKIN EXIT TKT'],['CKIN EXIT TKT 2027'],['CKIN EXIT TKT 31NOV2026'],['CKIN EXIT TKT 12OCT2026'],['CKIN EXIT TKT PENDING 12NOV2026'],['CKIN EXIT TKT','CKIN SEAT 12NOV2026'],['CKIN EXIT TKT 12NOV2026 13NOV2026'],['CKIN EXIT TKT 12NOV2026','CKIN EXIT TKT 13NOV2026'],['CKIN BORN IN LAOS','CKIN NOT BORN IN LAOS'],['CKIN BORN IN LAOS','CKIN NBRD DOCS']])assert.equal(evaluate(lines).status,'review',lines.join(';'));
 for(const destinationCountry of ['CHN','VNM','UNK'])assert.equal(evaluate(['CKIN BORN IN LAOS','CKIN EXIT TKT 12NOV2026'],{destinationCountry}).status,'review');
 assert.equal(evaluate(['CKIN BORN IN LAOS'],{nationality:'CAN'}).status,'review');
});

test('SGN visa issuer maps to Vietnam and TRA DOC retains exact expiry',()=>{
 assert.equal(ckinFacts(['CKIN SGN VS EXP DT 03 JUN 2029']).visaEvidence[0].issuer,'VNM');
 assert.equal(evaluate(['CKIN SGN VS EXP DT 03 JUN 2029'],{destinationCountry:'VNM'}).status,'pass');
 assert.equal(evaluate(['CKIN SGN VS EXP DT 03 JUN 2029'],{destinationCountry:'CHN'}).status,'review');
 assert.equal(evaluate(['CKIN SGN VS EXP DT 03 JUN 2025'],{destinationCountry:'VNM'}).status,'review');
 assert.equal(ckinFacts(['CKIN SGN VS CHN EXP DT 03 JUN 2029']).visaEvidence[0].issuer,'CHN');
 assert.equal(dateFromToken('2027 JAN 26'),'2027-01-26');
 assert.equal(dateFromToken('2027 FEB 31'),null);
 const doc=ckinFacts(['CKIN TRA DOC 2027 JAN 26']).documents[0];
 assert.equal(doc.type,'TRAVELDOC');assert.equal(doc.expiry,'2027-01-26');
 assert.equal(evaluate(['CKIN TRA DOC 2027 JAN 26'],{destinationCountry:'CHN'}).status,'pass');
 for(const line of ['CKIN TRA DOC 2025 JAN 26','CKIN TRA DOC 2027 FEB 31','CKIN TRA DOC USA 2027 JAN 26','CKIN TRA DOC 2027 JAN 26 2028 JAN 26'])assert.equal(evaluate([line],{destinationCountry:'CHN'}).status,'review',line);
});

// Operational syntax and BN numbers retained; all identities and identifiers synthetic.
test('five supplied October 13 cases pass VISA through the complete BN parser',()=>{
 const cases=[['102','VTE','CKIN BORN IN LAOS','CKIN_LAOS_BIRTH_CHECKED'],['105','CAN','CKIN APPLY 240','MANUAL_240'],['268','VTE','CKIN EXIT TKT 12NOV2026','CKIN_EXIT_TICKET_CHECKED'],['289','SGN','CKIN SGN VS EXP DT 03 JUN 2029','CKIN_VISA_CHECKED'],['300','TYN','CKIN TRA DOC 2027 JAN 26','CKIN_DOCUMENT_CHECKED']];
 const base=['2026 October 13, Tuesday, 11:55:00','> sy','SY: MU586/13OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN300 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','2026 October 13, Tuesday, 12:00:00','> fb1'];
 for(const [bn,dest,line,code] of cases){
  const log=[...base,`PR: MU586/13OCT26*LAX,BN${bn} PNR RL TESTXX`,`1. TEST/PASSENGER BN${bn} *35A S PVG BAG1/9/0 FBA/2PC`,'PASSPORT :XX1234567/P/NAT/USA/900101/401231/USA/N/A','CKIN BY YUIKA',line,`BAGTAG/0000000001/${bn==='105'?'PVG':dest}`,` O/MU999/14OCT BN015 36C B ${dest}`].join('\n');
  const row=findSYInfo(log,'13OCT26',{preferredFlightNo:'MU586'}).bnAudit[0];
  assert.equal(row.visaStatus,'pass',bn);assert.equal(row.visaDecision.reasonCodes[0],code,bn);assert.equal(row.visaDecision.destinationCountry,countryForAirport(dest)==='UNK'?'CHN':countryForAirport(dest));
  assert.equal(row.visaDecision.possibleMissedCheck,false);assert.notEqual(row.tkStatus,'pass');
  if(bn==='105')assert.notEqual(row.bagStatus,'pass');
 }
});
