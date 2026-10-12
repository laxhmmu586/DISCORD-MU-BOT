const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {VisaStore}=require('../visaStore');
const catalog=require('../visaPolicyCatalog');
const {seedCandidates,publishVerifiedBaseline}=require('../visaSeed');
const {evaluateVisa}=require('../visaEngine');
const now=new Date('2026-10-12T12:00:00Z');
function prepareCatalog(store=new VisaStore(':memory:')) {
 // Fixture source identities model the reviewed production snapshots without copying whole pages.
 for(const s of Object.values(catalog.sources)) {
  store.db.prepare("INSERT OR IGNORE INTO visa_sources(id,authority,url,fetched_at,content_sha256,snapshot_path,content,review_status) VALUES(?,'Government fixture',?,?,?,'fixture','Reviewed policy fixture','draft')").run(s.id,s.url,now.toISOString(),s.id);
  store.db.prepare('UPDATE visa_monitors SET latest_source_id=?,last_success_at=? WHERE url=?').run(s.id,now.toISOString(),s.url);
 }
 store.db.prepare("UPDATE visa_monitors SET last_success_at=? WHERE kind='feed'").run(now.toISOString());
 seedCandidates(store,now);publishVerifiedBaseline(store,now);return store;
}
const input={destinationCountry:'CHN',travelDate:'2026-10-20',passportType:'ordinary',stayDays:15,purpose:'tourism',previousStayDays:0,previousStayWindowDays:180,ckinLines:[]};
test('original groups and additional document/destination rules have approved coverage',()=>{
 const s=prepareCatalog();try{
  assert.equal(catalog.rules.length,37);assert.equal(new Set(catalog.rules.map(r=>r.nationality)).size,32);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM visa_coverage WHERE coverage_status='enabled'").get().n,33);
  for(const rule of catalog.rules.filter(r=>r.destination_country==='CHN'&&!r.id.startsWith('chn-entry-'))){
   const result=evaluateVisa({...input,nationality:rule.nationality},s,{now});
   if(['visa_exempt','citizen_return'].includes(rule.rule_type))assert.equal(result.status,'pass',rule.nationality);
   else {assert.equal(result.status,'review',rule.nationality);assert.equal(result.possibleMissedCheck,true,rule.nationality);}
  }
 }finally{s.close();}
});
test('China visa-free cutoff dates survive activation, including Canada UK and Russia',()=>{
 const s=prepareCatalog();try{
  for(const n of ['CAN','GBR']){
   const r=s.activeRules(n,'CHN','2026-12-31')[0];assert.equal(r.effective_until,'2026-12-31');
   assert.equal(evaluateVisa({...input,nationality:n,travelDate:'2027-01-01'},s,{now}).status,'review');
  }
  assert.equal(s.activeRules('RUS','CHN','2027-01-01')[0].effective_until,'2027-12-31');
 }finally{s.close();}
});
test('policy cutoff and visa expiry use China entry dates, not the LAX departure date',()=>{
 const s=prepareCatalog();try{
  const crossing={...input,nationality:'CAN',travelDate:'2026-12-30',entryDateEarliest:'2026-12-31',entryDateLatest:'2027-01-01'};
  const r=evaluateVisa(crossing,s,{now});assert.equal(r.status,'review');assert.ok(r.missingFields.includes('destinationEntryDate'));
  assert.equal(evaluateVisa({...crossing,entryDate:'2026-12-31'},s,{now}).status,'pass');
  assert.equal(evaluateVisa({...crossing,nationality:'USA',ckinLines:['CKIN VISA CHN EXP 30DEC2026']},s,{now}).status,'review');
  assert.equal(evaluateVisa({...crossing,ckinLines:['CKIN 240']},s,{now}).status,'pass');
 }finally{s.close();}
});
test('mutual policy limits remain stored but are not required BN passenger inputs',()=>{
 const s=prepareCatalog();try{for(const n of ['KAZ','THA','MYS']) {
  for(const extra of [{previousStayDays:undefined},{previousStayWindowDays:undefined},{previousStayDays:80},{stayDays:31},{purpose:'work'}])assert.equal(evaluateVisa({...input,nationality:n,...extra},s,{now}).status,'pass',n);
 }}finally{s.close();}
});
test('Taiwan permit is distinguished from visas and USA green cards',()=>{
 const s=prepareCatalog();try{
  assert.equal(evaluateVisa({...input,nationality:'TWN',ckinLines:['CKIN TBZ EXP 12DEC2030']},s,{now}).status,'pass');
  for(const line of ['CKIN TBZ','CKIN TBZ EXPIRED 12DEC2030','CKIN PR CARD','CKIN VS CHN EXP 12DEC2030']){
   const r=evaluateVisa({...input,nationality:'TWN',ckinLines:[line]},s,{now});
   // A normal visa cannot substitute for the required Taiwan-resident travel document.
   assert.equal(r.status,'review',line);
  }
 }finally{s.close();}
});
test('travel documents and transit claims are not silently treated as China visas or missing notes',()=>{
 const s=prepareCatalog();try{for(const line of ['CKIN TRAVELDOC EXP 12DEC2030','CKIN TRAVEL DOC USA EXP 12DEC2030','CKIN 24 TWOV','CKIN APEC CARD']){
  const r=evaluateVisa({...input,nationality:'USA',ckinLines:[line]},s,{now});assert.equal(r.status,'review',line);assert.equal(r.possibleMissedCheck,false,line);
 }}finally{s.close();}
});
test('a green-card entry rule cannot borrow an expiry from a visa in the same remark',()=>{
 const s=prepareCatalog();try{
  const r=s.draft({id:'reviewed-chn-usa-ordinary',nationality:'USA',destination_country:'CHN',passport_type:'ordinary',rule_type:'residence_document',conditions:{documentType:'PRCARD',issuer:'CHN'},effective_from:'2026-10-12',recheck_due_at:'2026-11-11'},[catalog.sources.law.id],now.toISOString());s.approve(r.id,r.version,'Reviewer',now.toISOString());
  assert.equal(evaluateVisa({...input,nationality:'USA',ckinLines:['CKIN PR CARD CHN EXP12DEC2030']},s,{now}).status,'pass');
  assert.equal(evaluateVisa({...input,nationality:'USA',ckinLines:['CKIN PR CARD USA VISA CHN EXP12DEC2030']},s,{now}).status,'review');
 }finally{s.close();}
});
test('changed government snapshot cannot automatically inherit catalog approval',()=>{
 const s=prepareCatalog();try{
  const m=s.db.prepare('SELECT * FROM visa_monitors WHERE url=?').get(catalog.sources.unilateral.url);
  s.snapshot(m,'Changed current visa-free policy on an official source',now.toISOString());seedCandidates(s,now);publishVerifiedBaseline(s,now);
  assert.equal(evaluateVisa({...input,nationality:'CAN'},s,{now}).status,'review');
  assert.equal(s.activeRules('CAN','CHN',input.travelDate)[0].version,1);
 }finally{s.close();}
});
test('new announcements remain pending after initial inventory has been processed',()=>{
 const s=prepareCatalog();try{
  s.db.prepare("INSERT INTO visa_notices(url,title,discovered_at,status) VALUES('https://www.mfa.gov.cn/new-policy.html','New exemption change',?,'pending')").run(now.toISOString());publishVerifiedBaseline(s,now);
  assert.equal(s.overview().notices.length,1);assert.equal(evaluateVisa({...input,nationality:'CAN'},s,{now}).status,'review');
 }finally{s.close();}
});
test('a new Thailand candidate cannot prevent the reviewed China initial notice inventory from clearing',()=>{
 const s=prepareCatalog();try{
  s.db.prepare("UPDATE visa_rules SET status='draft',reviewed_by=NULL WHERE id='tha-reviewed-usa'").run();
  s.db.prepare('UPDATE visa_monitors SET latest_source_id=NULL WHERE url=?').run(catalog.sources.thaiUsa.url);
  const reviewed=catalog.sources.tha;
  s.db.prepare("INSERT OR IGNORE INTO visa_monitors(url,kind,authority,latest_source_id,last_success_at) VALUES(?,'policy','Fixture',?,?)").run(reviewed.url,reviewed.id,now.toISOString());
  s.db.prepare("INSERT INTO visa_notices(url,title,discovered_at,status) VALUES(?,'Reviewed initial visa notice',?,'pending')").run(reviewed.url,now.toISOString());
  publishVerifiedBaseline(s,now);assert.equal(s.overview().notices.length,0);
 }finally{s.close();}
});
test('approved policies remain available after SQLite restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'visa-catalog-'));const filename=path.join(dir,'visa.db');
 let s=prepareCatalog(new VisaStore(filename));s.close();s=new VisaStore(filename);
 try{assert.equal(evaluateVisa({...input,nationality:'CAN'},s,{now}).status,'pass');assert.equal(s.overview().coverage.filter(r=>r.coverage_status==='enabled').length,33);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('a reviewed operator rule overrides a baseline and does not fall back after expiration',()=>{
 const s=prepareCatalog();try{
  const r=s.draft({id:'reviewed-chn-can-ordinary',nationality:'CAN',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_document',conditions:{},effective_from:'2026-10-12',effective_until:'2026-10-25',recheck_due_at:'2026-11-11'},[catalog.sources.unilateral.id],now.toISOString());s.approve(r.id,r.version,'Reviewer',now.toISOString());
  assert.equal(evaluateVisa({...input,nationality:'CAN'},s,{now}).requirement,'required');
  assert.equal(evaluateVisa({...input,nationality:'CAN',travelDate:'2026-10-26'},s,{now}).status,'review');
  assert.equal(s.activeRules('CAN','CHN','2026-10-26').length,1);
 }finally{s.close();}
});
module.exports={prepareCatalog};
