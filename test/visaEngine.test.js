const test=require('node:test');const assert=require('node:assert/strict');
const {VisaStore}=require('../visaStore');const {evaluateVisa,ckinFacts,dateFromToken}=require('../visaEngine');
const now=new Date('2026-10-12T12:00:00Z');
const facts={nationality:'CAN',destinationCountry:'CHN',travelDate:'2026-10-20',passportType:'ordinary',stayDays:15,purpose:'tourism',ckinLines:[]};
function approvedStore(){
 const s=new VisaStore(':memory:');const url='https://en.nia.gov.cn/n147418/n147463/c183390/content.html';
 const monitor=s.db.prepare('SELECT * FROM visa_monitors WHERE url=?').get(url);
 const snap=s.snapshot(monitor,'Official ordinary passport exemption up to thirty days',now.toISOString());
 s.db.prepare("UPDATE visa_monitors SET last_success_at=? WHERE kind='feed'").run(now.toISOString());
 const rule=s.draft({id:'can',nationality:'CAN',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_exempt',conditions:{maxStayDays:30,purposes:['tourism']},effective_from:'2026-02-17',effective_until:'2026-12-31',recheck_due_at:'2026-11-12'},[snap.id],now.toISOString());
 s.approve(rule.id,rule.version,'Test reviewer',now.toISOString());return s;
}
test('240 is manually confirmed without itinerary or nationality rechecks',()=>{
 for(const line of ['CKIN 240','CKIN 240 HOURS','CKIN TWOV 240','CKIN 240 TO HKG'])assert.equal(evaluateVisa({ckinLines:[line]},null,{now}).status,'pass');
 assert.equal(evaluateVisa({ckinLines:['CKIN 240']},null,{now}).manualOverride.verification,'agent_confirmed');
});
test('NBRD and negative requests cannot be treated as manual 240',()=>{
 for(const lines of [['CKIN NBRD 240'],['CKIN NEED 240'],['CKIN 240','CKIN NBRD VISA']])assert.equal(evaluateVisa({...facts,ckinLines:lines},null,{now}).status,'review');
});
test('PR CARD is a green card, without guessing issuer or universal entry permission',()=>{
 assert.deepEqual(ckinFacts(['CKIN PR CARD']).documents.map(({type,issuer})=>({type,issuer})),[{type:'PRCARD',issuer:null}]);
 assert.equal(evaluateVisa({...facts,ckinLines:['CKIN PR CARD']},null,{now}).status,'review');
});
test('visa dates cannot combine across CKIN lines or borrow a document number',()=>{
 const f=ckinFacts(['CKIN VISA CHN','CKIN SEAT CHANGE EXP 12DEC2030','CKIN VS CHN 1234567']);
 assert.equal(f.visaEvidence[0].expiry,null);assert.equal(f.visaEvidence[1].expiry,null);
 assert.equal(evaluateVisa({...facts,ckinLines:['CKIN VS CHN ISSUE12DEC2030 EXP31FEB2026']},null,{now}).status,'review');
});
test('real monthly abbreviations, duplicate prefix, attached EXP and TILL normalize',()=>{
 for(const line of ['CKIN V EXP12DEC2030','CKIN VS CHN EXP DT 12 DEC 2030','CKIN CKIN VISA CHN TILL 12DEC30'])assert.equal(ckinFacts([line]).visaEvidence[0].expiry,'2030-12-12');
 assert.equal(ckinFacts(['CKIN PINKCARD EXP 2030']).documents[0].type,'PINKCARD');
 assert.equal(ckinFacts(['CKIN VISA FREE 30 DAYS']).visaFreeClaim,true);
 assert.equal(ckinFacts(['CKIN VISA EXPIRED 12DEC2030']).visaEvidence[0].negative,true);
});
test('invalid dates and year-only dates remain unknown',()=>{
 assert.equal(dateFromToken('31FEB2030'),null);assert.equal(dateFromToken('2030'),null);assert.equal(dateFromToken('12OCT26'),'2026-10-12');
});
test('CKIN visa checks pass for a matching valid expiry; expiry year must be beyond travel year',()=>{
 for(const line of ['CKIN VS CHN EXP12DEC2030','CKIN VISA2030','CKIN V EXP 2030']){
  const r=evaluateVisa({...facts,nationality:'USA',ckinLines:[line]},null,{now});assert.equal(r.status,'pass');assert.equal(r.inspection,'recorded');
 }
 for(const line of ['CKIN VS CHN EXP 12DEC2025','CKIN VISA2026','CKIN VISA USA EXP 12DEC2030','CKIN VISA APPLY 2030'])assert.equal(evaluateVisa({...facts,ckinLines:[line]},null,{now}).status,'review');
 assert.equal(evaluateVisa({...facts,destinationCountry:'THA',ckinLines:['CKIN VISA2030']},null,{now}).status,'review');
});
test('reviewed destination combinations can match additional issuing countries',()=>{
 for(const country of ['AUS','GBR','FRA','MEX'])assert.equal(evaluateVisa({...facts,destinationCountry:country,ckinLines:[`CKIN VISA ${country} EXP 12DEC2030`]},null,{now}).status,'pass');
 assert.equal(ckinFacts(['CKIN VISA EXP 12DEC2030 BY CAN']).visaEvidence[0].issuer,null);
 const {countryForAirport}=require('../visaDestinations');assert.equal(countryForAirport('YYZ'),'CAN');assert.equal(countryForAirport('LHR'),'GBR');assert.equal(countryForAirport('ABC'),'UNK');
});
test('required visa and absent CKIN produces possible missed check, never a confirmed refusal',()=>{
 const s=approvedStore();try{
  const source=s.overview().rules[0].sources[0].id;
  const r=s.draft({id:'usa',nationality:'USA',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_document',conditions:{},effective_from:'2026-01-01',recheck_due_at:'2026-11-12'},[source],now.toISOString());s.approve(r.id,r.version,'Test reviewer',now.toISOString());
  const result=evaluateVisa({...facts,nationality:'USA'},s,{now});assert.equal(result.status,'review');assert.equal(result.requirement,'required');assert.equal(result.inspection,'missing');assert.equal(result.possibleMissedCheck,true);assert.equal(result.action,'double_check');
  const checked=evaluateVisa({...facts,nationality:'USA',ckinLines:['CKIN VISA2030']},s,{now});assert.equal(checked.status,'pass');assert.equal(checked.requirement,'required');assert.equal(checked.possibleMissedCheck,false);
  const greenCard=evaluateVisa({...facts,nationality:'USA',ckinLines:['CKIN PR CARD']},s,{now});assert.equal(greenCard.status,'review');assert.equal(greenCard.possibleMissedCheck,false);
 }finally{s.close();}
});
test('approved current government rule passes with all required facts',()=>{
 const s=approvedStore();try{const r=evaluateVisa(facts,s,{now});assert.equal(r.status,'pass');assert.equal(r.sources.length,1);assert.equal(r.rules[0].version,1);}finally{s.close();}
});
test('expiration uses travel date and never extends an old reachable page',()=>{
 const s=approvedStore();try{assert.equal(evaluateVisa({...facts,travelDate:'2027-01-01'},s,{now}).status,'review');}finally{s.close();}
});
test('missing purpose, stay and passport type cannot silently pass',()=>{
 const s=approvedStore();try{for(const field of ['purpose','stayDays','passportType'])assert.equal(evaluateVisa({...facts,[field]:undefined},s,{now}).status,'review');}finally{s.close();}
});
test('missing exemption facts are returned together for the BN double-check explanation',()=>{
 const s=approvedStore();try{assert.deepEqual(evaluateVisa({...facts,purpose:undefined,stayDays:undefined},s,{now}).missingFields,['stayDays','purpose']);}finally{s.close();}
});
test('changed source suspends old rule even before its policy expiration',()=>{
 const s=approvedStore();try{const url=s.overview().rules[0].sources[0].url;const m=s.db.prepare('SELECT * FROM visa_monitors WHERE url=?').get(url);s.snapshot(m,'Changed eligibility, exemption suspended',now.toISOString());assert.equal(evaluateVisa(facts,s,{now}).status,'review');}finally{s.close();}
});
test('new official notice holds government auto-pass but not manual 240',()=>{
 const s=approvedStore();try{s.db.prepare('INSERT INTO visa_notices VALUES(?,?,?, ?,NULL,NULL)').run('https://www.mfa.gov.cn/new.html','Changed visa rules',now.toISOString(),'pending');assert.equal(evaluateVisa(facts,s,{now}).status,'review');assert.equal(evaluateVisa({...facts,ckinLines:['CKIN 240']},s,{now}).status,'pass');s.acknowledgeNotice('https://www.mfa.gov.cn/new.html','Test',now.toISOString());assert.equal(evaluateVisa(facts,s,{now}).status,'pass');}finally{s.close();}
});
test('monitoring failure does not refresh freshness; stale facts require review',()=>{
 const s=approvedStore();try{assert.equal(evaluateVisa(facts,s,{now:new Date('2026-10-16T12:00:00Z')}).status,'review');}finally{s.close();}
});
test('drafts cannot pass and publishing a version preserves the old source and version',()=>{
 const s=approvedStore();try{const source=s.overview().rules[0].sources[0].id;
 const r=s.draft({id:'can',nationality:'CAN',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_exempt',conditions:{maxStayDays:30,purposes:['tourism']},effective_from:'2027-01-01',effective_until:'2027-12-31',recheck_due_at:'2026-11-12'},[source],now.toISOString());
 assert.equal(evaluateVisa({...facts,travelDate:'2027-01-01'},s,{now}).status,'review');s.approve(r.id,r.version,'Test',now.toISOString());assert.equal(evaluateVisa({...facts,travelDate:'2027-01-01'},s,{now}).status,'pass');assert.equal(evaluateVisa(facts,s,{now}).status,'pass');assert.equal(s.overview().rules.find(x=>x.version===1).status,'superseded');
 }finally{s.close();}
});
test('fixed condition schema rejects executable or unknown operators',()=>{
 const s=approvedStore();try{assert.throws(()=>s.draft({id:'bad',nationality:'CAN',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_exempt',effective_from:'2026-01-01',recheck_due_at:'2026-12-01',conditions:{maxStayDays:30,purposes:['tourism'],eval:'return true'}},[s.overview().rules[0].sources[0].id]),/conditions/);}finally{s.close();}
});
test('dashboard parser integrates manual 240 without marking all audit fields pass',()=>{
 const {findSYInfo}=require('../syParser');
 const log=['2026 October 12, Monday, 11:55:00','> sy',' SY: MU586/12OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','2026 October 12, Monday, 12:00:00','> fb1',' PR: MU586/12OCT26*LAX,BN001 PNR RL TESTXX','1. TEST/PASSENGER BN001 *35A S PVG','PASSPORT :XX1234567/P/NAT/USA/900101/301231/USA/N/A','CKIN 240'].join('\n');
 const row=findSYInfo(log,'12OCT26',{preferredFlightNo:'MU586'}).bnAudit.find(r=>r.bn==='1'||r.bn==='001');assert.ok(row);assert.equal(row.visaStatus,'pass');assert.match(row.visaReason,/人工核对/);assert.notEqual(row.tkStatus,'pass');
});
test('LAX departure-day visa expiry cannot pass the BN audit for a China arrival',()=>{
 const {findSYInfo}=require('../syParser');
 const log=['2026 October 12, Monday, 11:55:00','> sy',' SY: MU586/12OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','2026 October 12, Monday, 12:00:00','> fb1',' PR: MU586/12OCT26*LAX,BN001 PNR RL TESTXX','1. TEST/PASSENGER BN001 *35A S PVG','PASSPORT :XX1234567/P/NAT/USA/900101/301231/USA/N/A','CKIN VISA CHN EXP 12OCT2026'].join('\n');
 assert.equal(findSYInfo(log,'12OCT26',{preferredFlightNo:'MU586'}).bnAudit[0].visaStatus,'review');
});
test('manual 240 remains pass when audit storage fails',()=>{
 const runtime=require('../visaRuntime');const s=new VisaStore(':memory:');runtime.setVisaStore(s);s.close();
 try{assert.equal(runtime.checkVisa({ckinLines:['CKIN 240']}).status,'pass');}finally{runtime.setVisaStore(undefined);}
});
test('conflicting CKIN stay or purpose notes cannot produce an exemption pass',()=>{
 const {findSYInfo}=require('../syParser');const runtime=require('../visaRuntime');const s=approvedStore();runtime.setVisaStore(s);
 const base=['2026 October 12, Monday, 11:55:00','> sy',' SY: MU586/12OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','2026 October 12, Monday, 12:00:00','> fb1',' PR: MU586/12OCT26*LAX,BN001 PNR RL TESTXX','1. TEST/PASSENGER BN001 *35A S PVG','PASSPORT :XX1234567/P/NAT/CAN/900101/301231/CAN/N/A','CKIN PURPOSE TOURISM STAY 15 DAYS'];
 try{for(const extra of ['CKIN PURPOSE WORK','CKIN STAY 60 DAYS']){
  const row=findSYInfo([...base,extra].join('\n'),'12OCT26',{preferredFlightNo:'MU586'}).bnAudit[0];assert.equal(row.visaStatus,'review');
 }}finally{runtime.setVisaStore(undefined);s.close();}
});
