const test=require('node:test');
const assert=require('node:assert/strict');
const {ckinFacts,evaluateVisa}=require('../visaEngine');
const {findSYInfo}=require('../syParser');
const input={nationality:'USA',destinationCountry:'CHN',travelDate:'2026-10-19',passportType:'ordinary'};
const evaluate=(line,extra={})=>evaluateVisa({...input,ckinLines:[line],...extra},null);
test('explicit CHN GREEN CARD is Chinese residence; other green cards do not authorize China',()=>{
 const doc=ckinFacts(['CKIN CHN GREEN CARD EXP 2036']).documents[0];
 assert.deepEqual(doc,{type:'PRCARD',issuer:'CHN',expiry:null,expiryYear:2036,negative:false});
 assert.equal(evaluate('CKIN CHN GREEN CARD EXP 2036').status,'pass');
 for(const line of ['CKIN GREEN CARD EXP 2036','CKIN USA GREEN CARD EXP 2036','CKIN CHN GREEN CARD EXP 2025','CKIN CHN GREEN CARD PENDING EXP 2036'])assert.equal(evaluate(line).status,'review',line);
});
test('Cambodia country name and complete expiry stay bound to the destination',()=>{
 const line='CKIN VS TO CAMBODIA 20 APR 2035';
 const visa=ckinFacts([line]).visaEvidence[0];
 assert.equal(visa.issuer,'KHM');assert.equal(visa.expiry,'2035-04-20');
 assert.equal(evaluate(line,{destinationCountry:'KHM'}).status,'pass');
 assert.equal(evaluate(line).status,'review');
 assert.equal(evaluate('CKIN VS TO CAMBODIA 20 APR 2025',{destinationCountry:'KHM'}).status,'review');
});
test('unqualified V requires checked Vietnam context and valid expiry',()=>{
 assert.equal(evaluate('CKIN V EXP 2030',{destinationCountry:'VNM'}).status,'review');
 assert.equal(evaluate('CKIN V EXP 2030',{destinationCountry:'VNM',allowImplicitDestinationVisa:true}).status,'pass');
 for(const line of ['CKIN V EXP 2025','CKIN V PENDING EXP 2030','CKIN CHN V EXP 2030'])assert.equal(evaluate(line,{destinationCountry:'VNM',allowImplicitDestinationVisa:true}).status,'review');
});
test('October 19 agent syntax passes through BN route resolution',()=>{
 const cases=[['027','PVG','CKIN CHN GREEN CARD EXP 2036','CHN'],['162','SGN','CKIN V EXP 2030','VNM'],['121','KTI','CKIN VS TO CAMBODIA 20 APR 2035','KHM']];
 for(const [bn,dest,line,country] of cases){
  const log=['2026 October 19, Monday, 15:56:57','>sy','SY: MU586/19OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN300 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','>fb1',`PR: MU586/19OCT26*LAX,BN${bn} PNR RL TESTXX`,`1. TEST/PASSENGER BN${bn} *35A S PVG BAG1/9/0 FBA/2PC`,'PASSPORT :XX1234567/P/NAT/USA/900101/401231/USA/N/A','CKIN GE',line,`BAGTAG/0000000001/${dest}`,...(dest==='PVG'?[]:[` O/MU999/20OCT BN015 36C B ${dest}`])].join('\n');
  const row=findSYInfo(log,'19OCT26',{preferredFlightNo:'MU586'}).bnAudit[0];
  assert.equal(row.visaStatus,'pass',bn);assert.equal(row.visaDecision.destinationCountry,country,bn);
 }
});
