const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clockIn,intervalMs,parseAdvisory,theme,arrivalTeam,createAdvisoryService,scheduleDate}=require('../etabAdvisory');
const sample=(gate='134',extra='')=>`//////////////// ETAB ADVISORY //////////////\nMU583/14OCT. B-7343. ETA 0922L. GATE ${gate}. PAX 279/0. CREW 04/17.\nTOW IN GATE ONLY\nMU586/14OCT. ${extra} STD 1230L.\nRegards/LAXOPS/RA.`;
test('supplied emails, gate words and departure priority',()=>{
 const a=parseAdvisory(sample('134','ETD 1300L.'),new Date('2026-10-14T10:18:00Z'));
 assert.deepEqual(a,{date:'2026-10-14',arrival:{flight:'MU583',gate:'134',eta:'0922L',clockIn:'0830L',reg:'B-7343',pax:'279/0',crew:'04/17'},departure:{flight:'MU586',time:'1230L',timeType:'STD'}});
 assert.equal(parseAdvisory(sample().replaceAll('14OCT','13OCT').replace('0922','0932')).arrival.clockIn,'0845L');
 assert.equal(parseAdvisory('unrelated'),null);
 assert.equal(parseAdvisory(sample().replace('0922','2560')),null);
 assert.equal(parseAdvisory(sample().replaceAll('14OCT','32OCT')),null);
});
test('clock-in agrees with original Apps Script for all 1440 minutes',()=>{
 for(let h=0;h<24;h++)for(let m=0;m<60;m++){
  const hh=m<=39?(h+23)%24:h,mm=m<=9?15:m<=24?30:m<=39?45:0;
  assert.equal(clockIn(String(h).padStart(2,'0')+String(m).padStart(2,'0')),String(hh).padStart(2,'0')+String(mm).padStart(2,'0')+'L');
 }
});
test('gate theme boundaries and LA polling across daylight savings',()=>{
 for(const g of ['201','203','225','225A'])assert.equal(theme(g),'msc');
 for(const g of ['131A','200','226'])assert.equal(theme(g),'day');
 assert.equal(theme('TBA'),'night');
 assert.equal(intervalMs(new Date('2026-10-15T04:00Z')),300000);
 assert.equal(intervalMs(new Date('2026-10-14T19:00Z')),900000);
 assert.equal(intervalMs(new Date('2026-12-15T05:00Z')),300000);
 assert.equal(parseAdvisory(sample().replaceAll('14OCT','01JAN'),new Date('2026-12-31T20:00Z')).date,'2027-01-01');
});
test('unchanged A shift lookup with server employee IDs and serial sheet dates',()=>{
 const rows=[[],['','','','10/14/2026'],['','Terry','','A'],['','George','','OFF']];
 assert.deepEqual(arrivalTeam(rows,'2026-10-14',[{name:'TERRY',discordId:'123456789012345678'}]),['123456789012345678']);
 assert.throws(()=>arrivalTeam(rows,'2026-10-14',[]),/Discord IDs/);
 assert.throws(()=>arrivalTeam(rows,'2026-10-15',[]),/date not found/);
 assert.equal(scheduleDate(46309),'2026-10-14');
});
test('schedule nicknames and account suffixes resolve to Admin names, only exact A shifts are tagged',()=>{
 const rows=[[],['','','','10/14/2026'],['','TAN, CHUYANG(Tamsun)','',' A '],['','George(CZ)','','a'],['','Not Working','','OFF'],['','Other Shift','','A/B']];
 const employees=[{name:'TAN, CHUYANG',discordId:'123456789012345678'},{name:'George',discordId:'223456789012345678'}];
 assert.deepEqual(arrivalTeam(rows,'2026-10-14',employees),employees.map(e=>e.discordId));
 assert.throws(()=>arrivalTeam(rows,'2026-10-14',[...employees,{name:'George (Other)',discordId:'323456789012345678'}]),/unique server Discord IDs/);
});
function fixture(){
 let state={},failTeam=false,reads=0,body=sample(),id='m1';const sends=[],errors=[];
 const service=createAdvisoryService({
  getClient:()=>({userId:'me',gmail:{users:{messages:{list:async()=>({data:{messages:[{id}]}}),get:async()=>({data:{internalDate:id==='m1'?'1791973080000':'1791973090000',payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')}}}})}}}}),
  readSchedule:async()=>{reads++;return [[],['','','','10/14/2026'],['','Terry','','A']];},getEmployees:()=>[{name:'Terry',discordId:'123456789012345678'}],
  channel:async()=>({send:async payload=>{if(payload.content&&failTeam)throw Error('network failure');sends.push(payload);return {id:'sent'+sends.length};}}),
  render:async()=>Buffer.from('image'),store:{get:()=>structuredClone(state),put:s=>{state=structuredClone(s);}},log:{error:(...a)=>errors.push(a)}
 });return {service,sends,errors,state:()=>state,reads:()=>reads,fail:()=>{failTeam=true;},recover:()=>{failTeam=false;},change:()=>{id='m2';body=sample('203');}};
}
test('image first then real mentions, unchanged mail does not read Sheet or resend',async()=>{
 const f=fixture();await f.service.tick();assert.equal(f.sends.length,2);assert.ok(f.sends[0].files);
 assert.equal(f.sends[1].content,'## 👥 Arrival Team\n## 🕒 Clock-in　**0830L**\n<@123456789012345678>');
 assert.deepEqual(f.sends[1].allowedMentions,{parse:[],users:['123456789012345678']});
 await f.service.tick();assert.equal(f.sends.length,2);assert.equal(f.reads(),1);
 f.change();await f.service.tick();assert.equal(f.sends.length,4);
});
test('partial delivery resumes without another image and overlap is skipped',async()=>{
 const f=fixture();f.fail();await Promise.all([f.service.tick(),f.service.tick()]);assert.equal(f.sends.length,1);assert.ok(f.state().pending.imageId);
 f.recover();await f.service.tick();assert.equal(f.sends.length,2);assert.equal(f.state().pending,undefined);assert.equal(f.reads(),1);
});
test('SQLite advisory state preserves partial delivery through store recreation',()=>{
 const Database=require('better-sqlite3'),{createStateStore}=require('../etabAdvisory');
 const db=new Database(':memory:');try{
  const store=createStateStore(db);assert.deepEqual(store.get(),{});
  store.put({pending:{messageId:'m1',imageId:'sent1'}});
  assert.deepEqual(createStateStore(db).get(),{pending:{messageId:'m1',imageId:'sent1'}});
  store.put({lastMessageId:'m1'});assert.deepEqual(store.get(),{lastMessageId:'m1'});
 }finally{db.close();}
});
