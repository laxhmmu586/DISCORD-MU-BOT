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
test('cutover suppresses only legacy ETAB posts to the configured channel while enabled',()=>{
 const {isLegacyEtabRequest}=require('../etabAdvisory'),old={channelId:'1252026975720046655',message:'## ✈️ ETAB ADVISORY - GATE:134\n### Arrival - MU583/14OCT'};
 assert.equal(isLegacyEtabRequest(old,true),true);
 assert.equal(isLegacyEtabRequest(old,false),false);
 assert.equal(isLegacyEtabRequest({...old,channelId:'other'},true),false);
 assert.equal(isLegacyEtabRequest({...old,message:'normal service notification'},true),false);
});
function fixture(channelId='fixture-channel',nonceScope='',employees=[{name:'Terry',discordId:'123456789012345678'}],onAdvisorySent){
 let state={},failTeam=false,reads=0,body=sample(),id='m1';const sends=[],errors=[];
 const service=createAdvisoryService({
  nonceScope,onAdvisorySent,getClient:()=>({userId:'me',gmail:{users:{messages:{list:async()=>({data:{messages:[{id}]}}),get:async()=>({data:{internalDate:id==='m1'?'1791973080000':'1791973090000',payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')}}}})}}}}),
  readSchedule:async()=>{reads++;return [[],['','','','10/14/2026'],['','Terry','','A']];},getEmployees:()=>employees,
  channel:async()=>({id:channelId,send:async payload=>{if(payload.content&&failTeam)throw Error('network failure');sends.push(payload);return {id:'sent'+sends.length};}}),
  render:async()=>Buffer.from('image'),store:{get:()=>structuredClone(state),put:s=>{state=structuredClone(s);}},log:{error:(...a)=>errors.push(a)}
 });return {service,sends,errors,state:()=>state,seed:value=>{state=value;},reads:()=>reads,fail:()=>{failTeam=true;},recover:()=>{failTeam=false;},change:()=>{id='m2';body=sample('203');}};
}

test('MSC warnings match script boundaries and optional text fields remain optional',()=>{
 const {buildDiscordPayload}=require('../etabAdvisory');
 for(const gate of ['201','203','225','225A'])assert.ok(buildDiscordPayload(parseAdvisory(sample(gate))).endsWith('\n# 🚨 MSC GATE OPERATION'));
 for(const gate of ['134','TBA','200','226'])assert.doesNotMatch(buildDiscordPayload(parseAdvisory(sample(gate))),/MSC GATE OPERATION/);
 const text=buildDiscordPayload({date:'2026-10-14',arrival:{flight:'MU583'},departure:{flight:'MU586'}});
 assert.equal(text,'## ✈️ ETAB · 14 OCT - GATE:TBA\n### Arrival - MU583\n### Departure - MU586\n🔹 ETD: TBA\n');
 const nextDay=parseAdvisory(sample().replace('MU586/14OCT.  STD 1230L.','MU586/15OCT. ETD 0130L.'));
 assert.match(buildDiscordPayload(nextDay),/Departure - MU586\n🔹 ETD: 0130L/);
});

test('pending legacy image delivery resumes as one text message',async()=>{
 const f=fixture();f.seed({pending:{messageId:'legacy',received:1791973080000,hash:'old',ids:['123456789012345678'],advisory:parseAdvisory(sample()),imageId:'old-image'}});
 await f.service.tick();assert.equal(f.sends.length,1);assert.equal(f.sends[0].files,undefined);
 assert.match(f.sends[0].content,/👥 Arrival Team:\n<@123456789012345678>/);
 assert.equal(f.state().pending,undefined);assert.equal(f.reads(),0);
});
test('one text advisory includes database mentions and unchanged mail does not resend',async()=>{
 const f=fixture();await f.service.tick();assert.equal(f.sends.length,1);assert.equal(f.sends[0].files,undefined);
 assert.equal(f.sends[0].content,'## ✈️ ETAB · 14 OCT - GATE:134\n### Arrival - MU583\n🔸 REG: B-7343\n🔸 ETA: 0922L\n🔸 PAX: 279/0\n🔸 CREW: 04/17\n### 🕒 Clock-in: 0830L\n👥 Arrival Team:\n<@123456789012345678>\n### Departure - MU586\n🔹 STD: 1230L\n');
 assert.deepEqual(f.sends[0].allowedMentions,{parse:[],users:['123456789012345678']});
 await f.service.tick();assert.equal(f.sends.length,1);assert.equal(f.reads(),1);
 f.change();await f.service.tick();assert.equal(f.sends.length,2);assert.match(f.sends[1].content,/\n# 🚨 MSC GATE OPERATION$/);
});
test('failed text delivery retries and overlap is skipped',async()=>{
 const f=fixture();f.fail();await Promise.all([f.service.tick(),f.service.tick()]);assert.equal(f.sends.length,0);assert.ok(f.state().pending);
 f.recover();await f.service.tick();assert.equal(f.sends.length,1);assert.equal(f.state().pending,undefined);assert.equal(f.reads(),1);
});
test('test and production channel nonces cannot collide for the same Gmail message',async()=>{
 const testChannel=fixture('test'),production=fixture('production');
 await testChannel.service.tick();await production.service.tick();
 assert.notEqual(testChannel.sends[0].nonce,production.sends[0].nonce);
});
test('TBA and ordinary test variants have different nonces in the same destination',async()=>{
 const original=fixture('logging','test-original'),tba=fixture('logging','test-tba');
 await original.service.tick();await tba.service.tick();
 assert.notEqual(original.sends[0].nonce,tba.sends[0].nonce);
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

test('standard airplane title is used for all gate categories',()=>{
 const {buildDiscordPayload}=require('../etabAdvisory');
 for(const [gate] of [['TBA','yellow'],['156','green'],['200','green'],['201','red'],['225','red'],['225A','red'],['226','green']]) {
  const content=buildDiscordPayload(parseAdvisory(sample(gate)));
  assert.ok(content.startsWith('## ✈️ ETAB · '),gate);
  assert.doesNotMatch(content,/<a?:\w+:\d+>/);
  assert.ok(content.includes('ETAB · 14 OCT - GATE:'+gate));
 }
});

test('missing and blank Discord IDs skip only those employees and retain valid mentions',()=>{
 const rows=[[],['','','','10/14/2026'],['','Terry','','A'],['','Missing','','A'],['','Blank','','A'],['','Empty','','A']];
 const warnings=[];
 const employees=[{name:'Terry',discordId:'123456789012345678'},{name:'Missing'},{name:'Blank',discordId:'  '},{name:'Empty',discordId:''}];
 assert.deepEqual(arrivalTeam(rows,'2026-10-14',employees,{warn:(...args)=>warnings.push(args)}),['123456789012345678']);
 assert.equal(warnings.length,1);
 assert.match(warnings[0][1],/Missing, Blank, Empty/);
 assert.throws(()=>arrivalTeam(rows,'2026-10-14',[...employees,{name:'Missing',discordId:'223456789012345678'}],{warn(){}}),/unique server Discord IDs/);
 assert.throws(()=>arrivalTeam(rows,'2026-10-14',employees.map(e=>e.name==='Missing'?{...e,discordId:'invalid'}:e),{warn(){}}),/unique server Discord IDs/);
});

test('advisory sends once when the arrival employee has no Discord ID',async()=>{
 const f=fixture('fixture-channel','',[{name:'Terry'}]);
 await f.service.tick();
 assert.equal(f.errors.length,0);
 assert.equal(f.sends.length,1);
 assert.deepEqual(f.sends[0].allowedMentions,{parse:[],users:[]});
 assert.doesNotMatch(f.sends[0].content,/Arrival Team|<@/);
 assert.equal(f.state().lastMessageId,'m1');
 assert.equal(f.state().pending,undefined);
 await f.service.tick();
 assert.equal(f.sends.length,1);
});

test('Briefing imports only after Discord acknowledges ETAB delivery',async()=>{
 const Database=require('better-sqlite3'),db=new Database(':memory:'),source=require('../has/server/briefingEtab').createBriefingEtab({db});
 try{const f=fixture('fixture-channel','',[{name:'Terry'}],(advisory,metadata)=>source.accept(advisory,metadata));f.fail();await f.service.tick();assert.equal(source.read('2026-10-14','MU583').status,'unavailable');f.recover();await f.service.tick();assert.equal(source.read('2026-10-14','MU583').gate,'134');assert.equal(source.read('2026-10-14','MU583').discordMessageId,'sent1');f.change();await f.service.tick();assert.equal(source.read('2026-10-14','MU583').gate,'203');}finally{db.close();}
});


test('already delivered ETAB backfills Briefing without another Discord send',async()=>{
 const received=[];const f=fixture('fixture-channel','',undefined,(a,m)=>received.push({a,m}));
 f.seed({lastMessageId:'m1',lastReceived:1791973080000,lastAdvisoryId:'discord-existing'});
 await f.service.tick();await f.service.tick();
 assert.equal(f.sends.length,0);assert.equal(received.length,1);
 assert.equal(received[0].a.arrival.reg,'B-7343');assert.equal(received[0].m.discordMessageId,'discord-existing');
});
test('28 October mail fills registration, ETA, pax, crew and numeric or TBA gate',()=>{
 const Database=require('better-sqlite3'),{createBriefingEtab}=require('../has/server/briefingEtab');
 const db=new Database(':memory:');try{const etab=createBriefingEtab({db});for(const gate of ['133','TBA']){
  const advisory=parseAdvisory(`MU583/28OCT. B-2002. ETA 0859L. GATE ${gate}. PAX 303/0. CREW 04/17.\nMU586/28OCT. STD 1230L.\nRegards/LAXOPS/RA.`,new Date('2026-10-28T15:00Z'));
  etab.accept(advisory,{discordMessageId:'delivered',received:1793199600000});
  const snapshot=etab.read('2026-10-28','MU583');assert.equal(snapshot.registration,'B-2002');assert.equal(snapshot.eta,'0859L');assert.equal(snapshot.gate,gate);assert.equal(snapshot.pax,'303/0');assert.equal(snapshot.crew,'04/17');
 }}finally{db.close();}
});
