const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {createProblemMailer,createSender,mime,problemMessage}=require('../has/server/hasPbbProblemMail');
function fixture(t,sendEmail){
 const db=new Database(':memory:');let instant=new Date('2026-10-29T18:00:00Z');
 const rows=[{id:'manager',position:'Business Manager',station:'LAX',account:'MU',companyEmail:'manager@example.test',email:'personal@example.test'},{id:'outside',position:'Business Manager',station:'SFO',account:'MU',companyEmail:'outside@example.test'},{id:'second',position:'Business Manager',station:'LAX',account:'CI',additionalAccounts:[{station:'LAX',account:'MU'}],companyEmail:'second@example.test'},{id:'supervisor',position:'Supervisor',station:'LAX',account:'MU',companyEmail:'supervisor@example.test'}];
 const employees={get:()=>({employees:rows})},options={db,employees,now:()=>instant,sendEmail},mail=createProblemMailer(options);t.after(()=>{mail.close();db.close();});
 const record={id:'fictional-record',resetToken:'generation-1',station:'LAX',account:'MU',date:'2026-10-29',flightNo:'MU583',gate:'132',bridge:'L1',type:'arrival',evidence:{driver:{serviceable:{reportId:'report-1',name:'EXAMPLE EMPLOYEE',employeeId:'driver',at:instant.toISOString(),reason:'Obstruction <literal>\nSecond line',photo:'data:image/jpeg;base64,YWJj'}}}};
 return {db,rows,options,mail,record,advance(){instant=new Date(instant.getTime()+3600000);},job(){return db.prepare('SELECT * FROM has_pbb_problem_mail').get();}};
}
test('NO report delivers photo and exact question/reason only to same Main Account Business Manager HAS emails, once',async t=>{
 const sent=[],f=fixture(t,async(message,key)=>{sent.push({message,key});return 'fake-message';});
 f.mail.enqueue(f.record,'driver','serviceable');f.mail.enqueue(f.record,'driver','serviceable');await f.mail.tick();await f.mail.tick();assert.equal(sent.length,1);assert.equal(sent[0].message.to,'manager@example.test');assert.match(sent[0].message.text,/jet bridge is operational and serviceable/);assert.match(sent[0].message.text,/Obstruction <literal>\nSecond line/);assert.equal(sent[0].message.photo,f.record.evidence.driver.serviceable.photo);assert.equal(f.job().status,'sent');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM has_pbb_problem_mail').get().n,1);
});
test('missing HAS email stays pending without personal-email fallback; valid managers receive independently and retry does not duplicate',async t=>{
 const sent=[],f=fixture(t,async message=>{sent.push(message.to);return 'message-'+sent.length;});f.rows[0].companyEmail='';f.rows.push({id:'valid',position:'Business Manager',station:'LAX',account:'MU',companyEmail:'valid@example.test'});
 f.mail.enqueue(f.record,'driver','serviceable');await f.mail.tick();assert.deepEqual(sent,['valid@example.test']);assert.equal(f.job().status,'pending');assert.match(f.job().error,/HAS email/);
 f.rows[0].companyEmail='fixed@example.test';f.advance();await f.mail.tick();assert.deepEqual(sent,['valid@example.test','fixed@example.test']);assert.equal(f.job().status,'sent');
});
test('delivery retries survive worker restart and use immutable NO evidence even after the checklist changes',async t=>{
 const sent=[],f=fixture(t,async()=>{throw Error('Simulated Gmail outage');});f.mail.enqueue(f.record,'driver','serviceable');await f.mail.tick();assert.equal(f.job().status,'pending');assert.deepEqual(JSON.parse(f.job().sent),{});
 f.record.evidence.driver.serviceable.reason='Later changed';f.record.resetToken='generation-2';f.mail.close();f.advance();const restarted=createProblemMailer({...f.options,sendEmail:async message=>{sent.push(message);return 'recovered';}});t.after(()=>restarted.close());await restarted.tick();assert.match(sent[0].text,/Obstruction <literal>/);assert(!sent[0].text.includes('Later changed'));assert.equal(f.job().status,'sent');
});
test('two workers cannot concurrently send the same queued event; shared HAS addresses are deduplicated',async t=>{
 let release,started;const begin=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve),sent=[];
 const f=fixture(t,async message=>{sent.push(message.to);started();await held;return 'only-message';});f.rows.push({...f.rows[0],id:'another'});f.mail.enqueue(f.record,'driver','serviceable');
 const other=createProblemMailer(f.options);t.after(()=>other.close());const pending=f.mail.tick();await begin;await other.tick();assert.equal(sent.length,1);release();await pending;await other.tick();assert.equal(sent.length,1);
});
test('new reports and reset generations have separate durable identities',t=>{
 const f=fixture(t,async()=>{throw Error('Must not send in this test');});f.mail.enqueue(f.record,'driver','serviceable');f.record.resetToken='generation-2';f.mail.enqueue(f.record,'driver','serviceable');f.record.evidence.driver.serviceable.reportId='report-2';f.mail.enqueue(f.record,'driver','serviceable');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM has_pbb_problem_mail').get().n,3);
});
test('Gmail lost acknowledgements reconcile Sent by exact subject and recipient before a retry; MIME contains the actual photo',async t=>{
 const report={station:'LAX',account:'MU',role:'driver',name:'EXAMPLE',question:'Example question',reason:'Example reason',photo:'data:image/jpeg;base64,YWJj'},message=problemMessage(report,'manager@example.test','12345678901234567890123456789012');let sends=0,delivered=false;
 const gmail={users:{messages:{list:async()=>({data:{messages:delivered?[{id:'stored'}]:[]}}),get:async()=>({data:{payload:{headers:[{name:'Subject',value:'=?UTF-8?B?'+Buffer.from(message.subject).toString('base64')+'?='},{name:'To',value:message.to}]}}}),send:async({requestBody})=>{sends++;const raw=Buffer.from(requestBody.raw,'base64url').toString();assert.match(raw,/Content-Type: image\/jpeg/);assert.match(raw,/filename="jet-bridge-problem.jpg"/);assert.match(raw,/YWJj/);delivered=true;throw Error('Lost response');}}}};
 const send=createSender(async()=>({gmail,userId:'me'}));await assert.rejects(send(message,'unique-key'),/Lost response/);assert.equal(await send(message,'unique-key'),'stored');assert.equal(sends,1);assert.throws(()=>mime({...message,to:'bad\r\nBcc: other@example.test'},'key','me'));
});
