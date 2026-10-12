const test=require('node:test');
const assert=require('node:assert/strict');
const {VisaStore}=require('../visaStore');
const {ckinFacts,evaluateVisa}=require('../visaEngine');
const catalog=require('../visaPolicyCatalog');
const {seedCandidates,publishVerifiedBaseline}=require('../visaSeed');
const now=new Date('2026-10-12T12:00:00Z');
const input={nationality:'USA',destinationCountry:'CHN',travelDate:'2026-10-12',entryDate:'2026-10-13',passportType:'ordinary',ckinLines:[]};
function store(){
 const s=new VisaStore(':memory:');
 for(const source of Object.values(catalog.sources)){
  s.db.prepare("INSERT INTO visa_sources(id,authority,url,fetched_at,content_sha256,snapshot_path,content,review_status) VALUES(?,'Government fixture',?,?,?,'fixture','Reviewed policy fixture','draft')").run(source.id,source.url,now.toISOString(),source.id);
  s.db.prepare('UPDATE visa_monitors SET latest_source_id=?,last_success_at=? WHERE url=?').run(source.id,now.toISOString(),source.url);
 }
 s.db.prepare("UPDATE visa_monitors SET last_success_at=? WHERE kind='feed'").run(now.toISOString());
 seedCandidates(s,now);publishVerifiedBaseline(s,now);return s;
}
// Preserve operational syntax; every identity/document identifier is synthetic.
const cases=[
 ['RUS','CHN','CKIN RUS PPT VISA FREE FOR 30DAYS','pass'],
 ['JPN','CHN','CKIN 30DAYS V FREE','pass'],
 ['USA','CHN','CKIN CHD TRVL DCMNT 2028 12 20','pass'],
 ['CAN','CHN','CKIN V FREE 30DAYS','pass'],
 ['TWN','CHN','CKIN TBZ 00000001 EXP 2027','pass'],
 ['USA','CHN','CKIN RESIDENT CARD 2034','pass'],
 ['MEX','CHN','CKIN APEC CARD EXP 2030','review'],
 ['USA','THA','CKIN TDAC','pass'],
 ['USA','CHN','CKIN CHN VISA TEST0001 EXP 2036','pass'],
 ['BRA','CHN','CKIN VISA FREE 30 DAYS','pass'],
 ['USA','CHN','CKIN PINK CARD EXP DT 06 JUL 2036','pass'],
 ['VNM','CHN','CKIN VS CHN EXP DT 31 01 2027','pass'],
 ['USA','CHN','CKIN DURAL CITIZENSHIP ARM PPT 90 DAYS VISA FREE TEST0002 EXP 2036','pass']
];
test('supplied CKIN formats retain entry basis and validity without false missed-check warnings',()=>{
 const s=store();try{for(const [nationality,destinationCountry,line,status] of cases){
  const r=evaluateVisa({...input,nationality,destinationCountry,ckinLines:[line]},s,{now});
  assert.equal(r.status,status,line);assert.equal(r.possibleMissedCheck,false,line);
 }}finally{s.close();}
});
test('DT is ignored and numeric dates are day-month-year with calendar validation',()=>{
 for(const line of ['CKIN VS CHN EXP DT 31 01 2027','CKIN VS CHN EXP DT 31/01/2027'])assert.equal(ckinFacts([line]).visaEvidence[0].expiry,'2027-01-31');
 for(const line of ['CKIN VS CHN EXP DT 31 02 2027','CKIN VS CHN EXP DT 01 13 2027','CKIN VS CHN EXP DT 31 01 2027 EXP DT 30 01 2027'])assert.equal(evaluateVisa({...input,ckinLines:[line]},null,{now}).status,'review');
 assert.equal(ckinFacts(['CKIN PINK CARD EXP DT 06 JUL 2036']).documents[0].expiry,'2036-07-06');
});
test('resident and APEC card expiry is recorded independently from China visa evidence',()=>{
 const f=ckinFacts(['CKIN RESIDENT CARD 2034','CKIN APEC CARD EXP 2030']);
 assert.deepEqual(f.documents.map(d=>[d.type,d.expiryYear]),[['PRCARD',2034],['APECCARD',2030]]);assert.equal(f.visaEvidence.length,0);
 assert.equal(ckinFacts(['CKIN RESIDENT CARD USA VISA CHN EXP 2036']).documents[0].expiryYear,null);
 const r=evaluateVisa({...input,ckinLines:['CKIN APEC CARD EXP 2030']},null,{now});assert.ok(r.missingFields.includes('APECChinaPreclearanceAndPassportMatch'));assert.match(r.reason,/2030/);
});
test('APEC entry requires China preclearance and passport match under a current rule',()=>{
 const s=store();try{
  const complete={...input,nationality:'MEX',purpose:'business',stayDays:30,apecPassportMatched:true,ckinLines:['CKIN APEC CARD CHN PPT MATCHED EXP 2030']};
  assert.equal(evaluateVisa(complete,s,{now}).status,'pass');
  for(const extra of [{apecPassportMatched:false},{ckinLines:['CKIN APEC CARD EXP 2030']}])assert.equal(evaluateVisa({...complete,...extra},s,{now}).status,'review');
 }finally{s.close();}
});
test('recorded exemption cannot borrow the nationality in a different passport claim',()=>{
 const s=store();try{
  assert.equal(evaluateVisa({...input,nationality:'BRA',ckinLines:['CKIN RUS PPT VISA FREE FOR 30DAYS']},s,{now}).status,'review');
  assert.equal(evaluateVisa({...input,nationality:'BRA',ckinLines:['CKIN VISA FREE 30 DAYS','CKIN VISA FREE 90 DAYS']},s,{now}).status,'review');
  assert.equal(evaluateVisa({...input,nationality:'BRA',ckinLines:['CKIN VISA FREE 30 DAYS']},s,{now}).status,'pass');
 }finally{s.close();}
});
test('recorded exemption must match current nationality rule and cannot override expiry or a conflicting passport claim',()=>{
 const s=store();try{
  for(const extra of [{nationality:'USA'},{travelDate:'2027-01-01',entryDate:'2027-01-02'}])assert.equal(evaluateVisa({...input,nationality:'BRA',ckinLines:['CKIN VISA FREE 30 DAYS'],...extra},s,{now}).status,'review');
  assert.equal(evaluateVisa({...input,nationality:'BRA',ckinLines:['CKIN NOT VISA FREE 30 DAYS']},s,{now}).status,'review');
 }finally{s.close();}
});
test('dual citizenship uses the valid alternate passport and retains Armenia limits in SQLite',()=>{
 const s=store();try{
  const ckinLines=['CKIN DURAL CITIZENSHIP ARM PPT 90 DAYS VISA FREE TEST0002 EXP 2036'];
  const r=evaluateVisa({...input,ckinLines},s,{now});assert.equal(r.policyNationality,'ARM');assert.equal(r.status,'pass');assert.deepEqual(r.missingFields,[]);assert.equal(s.activeRules('ARM','CHN','2026-10-13')[0].conditions.cumulativeDays,90);
  const complete={...input,ckinLines,purpose:'tourism',stayDays:30,previousStayDays:40,previousStayWindowDays:180};
  assert.equal(evaluateVisa(complete,s,{now}).status,'pass');
  assert.equal(evaluateVisa({...complete,previousStayDays:80},s,{now}).status,'pass');
  for(const text of [ckinLines[0].replace('2036','2025'),ckinLines[0].replace('ARM','AMR'),ckinLines[0].replace('DURAL','NO DUAL')])assert.equal(evaluateVisa({...complete,ckinLines:[text]},s,{now}).status,'review');
 }finally{s.close();}
});
test('TDAC is separate from the reviewed U.S. Thailand exemption and is required with a visa too',()=>{
 const s=store();try{
  const complete={...input,destinationCountry:'THA',purpose:'tourism',stayDays:20,ckinLines:['CKIN TDAC']};
  assert.equal(evaluateVisa(complete,s,{now}).status,'pass');
  for(const extra of [{ckinLines:['CKIN TDAC PENDING']},{ckinLines:['CKIN VISA THA EXP 2030']}])assert.equal(evaluateVisa({...complete,...extra},s,{now}).status,'review');
 }finally{s.close();}
});
test('document rules can explicitly review PINKCARD, without treating every pink remark as a China permit',()=>{
 const s=store();try{
  const r=s.draft({id:'reviewed-chn-usa-ordinary',nationality:'USA',destination_country:'CHN',passport_type:'ordinary',rule_type:'special_document',conditions:{documentType:'PINKCARD',issuer:'CHN'},effective_from:'2026-10-12',recheck_due_at:'2026-11-11'},[catalog.sources.law.id],now.toISOString());s.approve(r.id,r.version,'Fixture reviewer',now.toISOString());
  assert.equal(evaluateVisa({...input,ckinLines:['CKIN PINK CARD CHN EXP DT 06 JUL 2036']},s,{now}).status,'pass');
  assert.equal(evaluateVisa({...input,ckinLines:['CKIN PINK CARD USA EXP DT 06 JUL 2036']},s,{now}).status,'review');
 }finally{s.close();}
});
test('all supplied formats reach BN Security Check through the existing parser, including HKT Thailand',()=>{
 const {findSYInfo}=require('../syParser');const runtime=require('../visaRuntime');const s=store();runtime.setVisaStore(s);
 const base=['2026 October 12, Monday, 11:55:00','> sy',' SY: MU586/12OCT26 LAX/0 CI1145/NAM','777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000','BDT1145 SD1230 ED1230 CI1145','2026 October 12, Monday, 12:00:00','> fb1'];
 try{for(const [nationality,destinationCountry,line,status] of cases){
  const log=[...base,'PR: MU586/12OCT26*LAX,BN001 PNR RL TESTXX','1. TEST/PASSENGER BN001 *35A S PVG','PASSPORT :XX1234567/P/NAT/'+nationality+'/900101/401231/'+nationality+'/N/A',line,...(destinationCountry==='THA'?['BAGTAG/0000000001/HKT',' O/FM831/13OCT BN015 44A B HKT']:[])].join('\n');
  const row=findSYInfo(log,'12OCT26',{preferredFlightNo:'MU586'}).bnAudit[0];assert.equal(row.visaStatus,status,line);assert.equal(row.visaDecision.destinationCountry,destinationCountry,line);assert.equal(row.visaDecision.possibleMissedCheck,false,line);
 }}finally{runtime.setVisaStore(undefined);s.close();}
});
