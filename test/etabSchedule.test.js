const {test}=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {createArrivalTeamReader}=require('../etabSchedule');
const {createAdvisoryService,createStateStore}=require('../etabAdvisory');
function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL)');
 let rows=[{id:'one',name:'Renamed Employee',station:'LAX',account:'MU',discordId:'123456789012345678'}];
 const employees={db,get:()=>({employees:rows})},warnings=[];
 const read=createArrivalTeamReader({employees,log:{warn:(...args)=>warnings.push(args)}});
 const save=assignments=>db.prepare('INSERT OR REPLACE INTO staff_schedule_days VALUES(?,1,?)').run('2026-10-31',JSON.stringify({assignments}));
 return {db,read,save,warnings,employees,setRows:value=>{rows=value;}};
}
test('website assignment IDs survive renames, duplicate names and subsequent edits',async t=>{
 const f=fixture(t);f.save({one:{code:' A '},two:{code:'C'}});
 f.setRows([...f.employees.get().employees,{id:'two',name:'Renamed Employee',discordId:'223456789012345678'}]);
 assert.deepEqual(await f.read('2026-10-31'),['123456789012345678']);
 f.save({one:{code:'X'},two:{code:'a'}});assert.deepEqual(await f.read('2026-10-31'),['223456789012345678']);
});
test('website roster scope excludes other accounts, stations, deleted employees and placeholders',async t=>{
 const f=fixture(t);f.setRows([
  {id:'extra',name:'Additional MU',station:'LAX',account:'CZ',additionalAccounts:[{station:'LAX',account:'MU'}],discordId:'123456789012345678'},
  ...[['other','Other','LAX','CZ'],['sfo','SFO','SFO','MU'],['demo','DEMO HAS','LAX','MU'],['ops','HAS OPS RAMP','LAX','MU']].map(([id,name,station,account])=>({id,name,station,account,discordId:'223456789012345678'})),
  {id:'mixed',name:'Mixed',discordId:'323456789012345678'}
 ]);f.save(Object.fromEntries(['extra','other','sfo','demo','ops','deleted','mixed'].map(id=>[id,{code:id==='mixed'?'A/B':'A'}])));
 assert.deepEqual(await f.read('2026-10-31'),['123456789012345678']);
});
test('blank IDs skip, duplicate mentions collapse, invalid IDs and unsaved days remain retryable',async t=>{
 const f=fixture(t);await assert.rejects(f.read('2026-10-31'),/website schedule date not found/);
 f.save({});assert.deepEqual(await f.read('2026-10-31'),[]);
 f.setRows([{id:'one',name:'Blank',discordId:' '},{id:'two',name:'Valid',discordId:'123456789012345678'},{id:'three',name:'Same Discord',discordId:'123456789012345678'}]);
 f.save({one:{code:'A'},two:{code:'A'},three:{code:'A'}});
 assert.deepEqual(await f.read('2026-10-31'),['123456789012345678']);assert.equal(f.warnings.length,1);
 f.setRows([{id:'one',name:'Invalid',discordId:'invalid'}]);await assert.rejects(f.read('2026-10-31'),/valid server Discord IDs/);
});
test('31 October Gate 148 mail delivers using only website schedule, retries and deduplicates',async t=>{
 const f=fixture(t),sends=[],errors=[];let fail=true;
 const body='/////////////////////// E T A B A D V I S O R Y ///////////////////////////\nMU583/31OCT. B-7368. ETA 0904L. GATE 148. PAX 306/00. CREW 04/17.\nMU586/31OCT. STD 1230L.\nRegards/LAXOPS/RA.';
 const service=createAdvisoryService({getArrivalTeam:f.read,store:createStateStore(f.db),log:{error:(...args)=>errors.push(args)},
 getClient:()=>({userId:'me',gmail:{users:{messages:{list:async()=>({data:{messages:[{id:'oct31'}]}}),get:async()=>({data:{internalDate:'1793439029000',payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')}}}})}}}}),
 channel:async()=>({id:'test',send:async payload=>{if(fail)throw Error('network failure');sends.push(payload);return {id:'delivered'};}})});
 await service.tick();assert.equal(sends.length,0);assert.match(errors[0][1],/website schedule date not found/);
 f.save({one:{code:'A'}});await service.tick();assert.equal(sends.length,0);
 fail=false;await service.tick();await service.tick();assert.equal(sends.length,1);
 assert.match(sends[0].content,/ETAB · 31 OCT - GATE:148/);assert.match(sends[0].content,/REG: B-7368/);assert.match(sends[0].content,/ETA: 0904L/);
 assert.deepEqual(sends[0].allowedMentions.users,['123456789012345678']);
});
