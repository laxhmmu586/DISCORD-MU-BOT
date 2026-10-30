const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {createMailer}=require('../has/server/hasWheelchairMail');
test('persistent delivery claim prevents concurrent and restart duplicates',async()=>{
 const db=new Database(':memory:');let sent=0;
 const options={database:()=>db,read:scope=>{assert.deepEqual(scope,{station:'LAX',account:'MU'});return {updatedAt:'saved',values:{O6:2,P6:3}};},template:async()=>({days:[{day:1,start:6,end:6}]}),now:()=>new Date('2026-10-16T16:00:00Z'),sendEmail:async message=>{sent++;assert.match(message.text,/Total: 5/);return 'mail-id';}};
 const a=createMailer(options),b=createMailer(options);await Promise.all([a.tick(),b.tick()]);assert.equal(sent,1);await createMailer(options).tick();assert.equal(sent,1);assert.equal(db.prepare('SELECT state FROM has_wheelchair_mail').get().state,'sent');db.close();
});
test('missing DA is not sent as zero',async()=>{
 const db=new Database(':memory:');let sent=0;const mailer=createMailer({database:()=>db,read:()=>({values:{}}),now:()=>new Date('2026-10-16T16:00:00Z'),sendEmail:async()=>sent++});await mailer.tick();assert.equal(sent,0);db.close();
});
test('saved DA with blank wheelchair fields waits; explicitly entered zero is valid',async()=>{
 const db=new Database(':memory:');let sent=0;const values={};const mailer=createMailer({database:()=>db,read:()=>({updatedAt:'saved',values}),template:async()=>({days:[{day:1,start:6,end:7}]}),now:()=>new Date('2026-10-16T16:00:00Z'),sendEmail:async m=>{assert.match(m.text,/Total: 0/);sent++;return 'zero-id';}});
 await mailer.tick();assert.equal(sent,0);assert.equal(db.prepare('SELECT count(*) AS n FROM has_wheelchair_mail').get().n,0);values.O6=0;values.P7='0';await mailer.tick();assert.equal(sent,1);db.close();
});
test('restart on a non-scheduled date never sends a historical report',async()=>{
 let reads=0,sent=0;const mailer=createMailer({database:()=>{throw Error('Should not open database');},read:()=>{reads++;},now:()=>new Date('2026-10-25T18:00:00Z'),sendEmail:async()=>sent++});await mailer.tick();assert.equal(reads,0);assert.equal(sent,0);
});
