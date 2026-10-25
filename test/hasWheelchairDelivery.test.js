const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {createMailer}=require('../hasWheelchairMail');
test('persistent delivery claim prevents concurrent and restart duplicates',async()=>{
 const db=new Database(':memory:');let sent=0;
 const options={database:()=>db,read:scope=>{assert.deepEqual(scope,{station:'LAX',account:'MU'});return {updatedAt:'saved',values:{O6:2,P6:3}};},template:async()=>({days:[{day:1,start:6,end:6}]}),now:()=>new Date('2026-10-16T16:00:00Z'),sendEmail:async message=>{sent++;assert.match(message.text,/Total: 5/);return 'mail-id';}};
 const a=createMailer(options),b=createMailer(options);await Promise.all([a.tick(),b.tick()]);assert.equal(sent,1);await createMailer(options).tick();assert.equal(sent,1);assert.equal(db.prepare('SELECT state FROM has_wheelchair_mail').get().state,'sent');db.close();
});
test('missing DA is not sent as zero',async()=>{
 const db=new Database(':memory:');let sent=0;const mailer=createMailer({database:()=>db,read:()=>({values:{}}),now:()=>new Date('2026-10-16T16:00:00Z'),sendEmail:async()=>sent++});await mailer.tick();assert.equal(sent,0);db.close();
});
