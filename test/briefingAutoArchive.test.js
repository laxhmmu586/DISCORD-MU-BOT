const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),express=require('express');
const {registerBriefing,DEFAULTS}=require('../briefing'),{createAutoArchive,TIMES,CHANNEL,FOLDER}=require('../briefingAutoArchive');
function fixture(t){
 const db=new Database(':memory:');let stamp=Date.parse('2026-10-28T18:00:00Z'),uploads=[],sends=[],failDrive=false,failSend=false,messages=[],reports=0;
 const briefing=registerBriefing(express(),{employees:{db,get:()=>({employees:[]})},profiles:{},etab:{read:async()=>({status:'unavailable'})},now:()=>new Date(stamp),buildPdf:async()=>{reports++;return Buffer.from('%PDF-fixture');}});
 const key={date:'2026-10-28',flight:'MU583'},fields={...DEFAULTS,...Object.fromEntries(TIMES.map((k,i)=>[k,'12:'+i]))};
 const write=()=>db.prepare('INSERT INTO briefing_records VALUES(?,?,?,?,?) ON CONFLICT(date,flight) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(key.date,key.flight,JSON.stringify(fields),new Date(stamp).toISOString(),'agent');write();
 const client={user:{id:'bot'},isReady:()=>true,channels:{fetch:async id=>{assert.equal(id,CHANNEL);return {messages:{fetch:async()=>({find:fn=>messages.find(fn)})},send:async body=>{sends.push(body);if(failSend)throw Error('timeout');const result={id:'message-'+sends.length,content:body.content,author:{id:'bot'},attachments:{size:1}};messages.push(result);return result;}};}}};
 const options={db,briefing,client,now:()=>new Date(stamp),reserveDriveId:async()=> 'drive-fixed-id',uploadDrive:async item=>{uploads.push(item);if(failDrive)throw Error('drive unavailable');},logger:{error(){}}};let worker=createAutoArchive(options);t.after(()=>{worker.close();db.close();});
 return {db,fields,write,uploads,sends,messages,get reports(){return reports;},advance:ms=>stamp+=ms,tick:()=>worker.tick(),restart:()=>{worker.close();worker=createAutoArchive(options);},failDrive:value=>failDrive=value,failSend:value=>failSend=value};
}
test('five filled times must remain stable for five minutes, then archive and deliver once across restart',async t=>{
 const f=fixture(t);await f.tick();f.advance(299999);await f.tick();assert.equal(f.reports,0);f.advance(1);await f.tick();assert.equal(f.reports,1);assert.equal(f.uploads.length,1);assert.equal(f.sends.length,1);assert.equal(f.uploads[0].folderId,FOLDER);assert.equal(f.uploads[0].name,'2026-10-28 MU583 ARRIVAL BRIEFING SHEET.pdf');assert.equal(f.sends[0].files[0].name,f.uploads[0].name);f.restart();f.advance(600000);await f.tick();assert.equal(f.reports,1);assert.equal(f.sends.length,1);
});
test('missing or changed times restart the wait and do not create incomplete archives',async t=>{
 const f=fixture(t);f.fields.lastBag=' ';f.write();await f.tick();f.advance(600000);await f.tick();assert.equal(f.reports,0);f.fields.lastBag='13:00';f.write();await f.tick();f.advance(200000);f.fields.firstBag='12:59';f.write();await f.tick();f.advance(299999);await f.tick();assert.equal(f.reports,0);f.advance(1);await f.tick();assert.equal(f.reports,1);
});
test('Drive retries reuse reserved ID and pending deliveries survive date rollover',async t=>{
 const f=fixture(t);f.failDrive(true);await f.tick();f.advance(300000);await f.tick();assert.equal(f.reports,1);assert.equal(f.sends.length,1);assert.equal(f.db.prepare('SELECT drive_sent FROM briefing_auto_jobs').get().drive_sent,0);f.restart();f.advance(86400000);f.failDrive(false);await f.tick();assert.equal(f.reports,1);assert.equal(f.uploads.length,2);assert.equal(f.uploads[0].id,f.uploads[1].id);assert.equal(f.sends.length,1);
});
test('ambiguous Discord posts reconcile instead of sending a duplicate',async t=>{
 const f=fixture(t);f.failSend(true);await f.tick();f.advance(300000);await f.tick();assert.equal(f.sends.length,1);f.failSend(false);await f.tick();assert.equal(f.sends.length,1);f.messages.push({id:'recovered',content:f.sends[0].content,author:{id:'bot'}});await f.tick();assert.equal(f.db.prepare('SELECT discord_state FROM briefing_auto_jobs').get().discord_state,'sent');assert.equal(f.sends.length,1);
});
test('deleted automatic archive is not regenerated or delivered',async t=>{
 const f=fixture(t);f.failDrive(true);await f.tick();f.advance(300000);await f.tick();f.db.prepare('UPDATE briefing_reports SET deleted_at=?').run('deleted');f.failDrive(false);await f.tick();assert.equal(f.reports,1);assert.equal(f.sends.length,1);assert.equal(f.uploads.length,1);
});


test('Drive failure cannot block Discord and later retries do not duplicate the message',async t=>{
 const f=fixture(t);f.failDrive(true);await f.tick();f.advance(300000);await f.tick();assert.equal(f.sends.length,1);let job=f.db.prepare('SELECT * FROM briefing_auto_jobs').get();assert.equal(job.discord_state,'sent');assert.equal(job.drive_sent,0);assert.match(job.error,/drive unavailable/);f.restart();await f.tick();assert.equal(f.sends.length,1);f.failDrive(false);await f.tick();job=f.db.prepare('SELECT * FROM briefing_auto_jobs').get();assert.equal(job.drive_sent,1);assert.equal(job.error,null);assert.equal(f.sends.length,1);
});
