const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {migrateGateCode}=require('../has/server/scheduleGateCode');
test('GS migration preserves schedule details, request snapshots and skills, and runs only once',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE staff_schedule_days(date TEXT PRIMARY KEY,revision INTEGER,data TEXT);CREATE TABLE staff_schedule_shortages(date TEXT PRIMARY KEY,data TEXT);CREATE TABLE staff_schedule_sync_settings(id INTEGER PRIMARY KEY,data TEXT);CREATE TABLE schedule_request_settings(id INTEGER PRIMARY KEY,revision INTEGER,data TEXT);CREATE TABLE schedule_requests(id TEXT PRIMARY KEY,data TEXT)');
 const assignment={code:'GS',color:'#123456',displayLabel:'GS',remark:'Keep GS in this remark'};
 db.prepare('INSERT INTO staff_schedule_days VALUES(?,4,?)').run('2026-10-31',JSON.stringify({assignments:{GS:assignment},labels:['Holiday'],dateColor:'#abcdef'}));
 db.prepare('INSERT INTO staff_schedule_shortages VALUES(?,?)').run('2026-10-31',JSON.stringify([{code:'GS',count:2}]));
 db.prepare('INSERT INTO staff_schedule_sync_settings VALUES(1,?)').run(JSON.stringify({horizon:'2027-04-30',roleDefinitions:{GS:{label:'Gate Specialist',color:'#123456'}}}));
 db.prepare('INSERT INTO schedule_request_settings VALUES(1,2,?)').run(JSON.stringify({version:2,people:{GS:{capabilities:['GS','G','C']}},hours:{GS:4,C:4}}));
 db.prepare('INSERT INTO schedule_requests VALUES(?,?)').run('request-GS',JSON.stringify({id:'request-GS',employeeId:'GS',before:assignment,partnerBefore:{code:'C'}}));
 migrateGateCode(db);
 const day=db.prepare('SELECT * FROM staff_schedule_days').get(),value=JSON.parse(day.data);assert.equal(day.revision,5);assert.deepEqual(value.assignments.GS,{...assignment,code:'G',displayLabel:'G'});assert.deepEqual(value.labels,['Holiday']);assert.equal(value.dateColor,'#abcdef');
 assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM staff_schedule_shortages').get().data),[{code:'G',count:2}]);
 const settings=db.prepare('SELECT * FROM schedule_request_settings').get();assert.equal(settings.revision,3);assert.deepEqual(JSON.parse(settings.data).people.GS.capabilities,['G','C']);assert.deepEqual(JSON.parse(settings.data).hours,{G:4,C:4});
 const request=JSON.parse(db.prepare('SELECT data FROM schedule_requests').get().data);assert.equal(request.id,'request-GS');assert.equal(request.employeeId,'GS');assert.equal(request.before.code,'G');
 assert.deepEqual(Object.keys(JSON.parse(db.prepare('SELECT data FROM staff_schedule_sync_settings').get().data).roleDefinitions),['G']);
 migrateGateCode(db);assert.equal(db.prepare('SELECT revision FROM staff_schedule_days').get().revision,5);assert.equal(db.prepare('SELECT revision FROM schedule_request_settings').get().revision,3);
});
