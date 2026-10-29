const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),Database=require('better-sqlite3');
const {createReadSignStore,registerReadSign,mailContent,signatureSVG}=require('../readSign');
function fixture(t){const db=new Database(':memory:');t.after(()=>db.close());const rows=['Agent','Supervisor','Manager','Lead'].map((position,i)=>({id:'e'+i,name:position+' EXAMPLE',eid:'100'+i,position,email:position.toLowerCase()+'@example.test'}));const employees={db,get:()=>({employees:rows})},profiles={linked:u=>rows.find(e=>e.id===u.uid)},users=rows.map(e=>({uid:e.id,email:e.email}));let time=new Date('2026-10-18T19:00:00Z');const args={employees,profiles,now:()=>time};return {...args,rows,users,store:createReadSignStore(args),setTime:v=>time=new Date(v)};}
const body=()=>({requestId:crypto.randomUUID(),subject:'Security alert: Data Protection',memoNumber:'SOP-2026-018',body:'Please review the attached SOP.\nBy signing you acknowledge the updated procedure.',deadline:'2026-10-25T23:59:00-07:00',attachments:[{name:'SOP.txt',type:'text/plain',data:Buffer.from('Example policy').toString('base64')}]});
const signed={acknowledged:true,strokes:[[[.1,.7],[.2,.2],[.3,.8],[.4,.4],[.5,.6],[.7,.3],[.8,.5]]]};

test('Main Account isolation covers lists, detail, attachments, signing and recipient changes, including legacy memos',t=>{
 const f=fixture(t);f.rows.forEach(e=>Object.assign(e,{station:'LAX',account:'MU'}));
 f.rows[2].account='CZ';f.rows[2].additionalAccounts=[{station:'LAX',account:'MU'}];
 const memo=f.store.publish(f.users[1],body());
 assert.deepEqual(f.store.list(f.users[2]).memos,[]);
 for(const action of [()=>f.store.read(f.users[2],memo.id),()=>f.store.attachment(f.users[2],memo.id,memo.attachments[0].id),()=>f.store.sign(f.users[2],memo.id,signed),()=>f.store.addRecipients(f.users[2],memo.id,{employeeIds:['e2']})])assert.throws(action,e=>e.status===404);
 // Simulate pre-scope data without persisted account metadata.
 const legacy=f.store.get(memo.id);delete legacy.recipientAccounts;
 f.employees.db.prepare('UPDATE read_sign_memos SET data=? WHERE id=?').run(JSON.stringify(legacy),memo.id);
 assert.deepEqual(f.store.list(f.users[2]).memos,[]);assert.throws(()=>f.store.read(f.users[2],memo.id),e=>e.status===404);
 assert.equal(f.store.read(f.users[0],memo.id).subject,memo.subject);
 // A shared HQ memo is visible in both accounts, but its register stays account-local.
 f.rows.push({id:'hq',name:'HQ',position:'President',station:'HQ',account:'HQ',email:'hq@example.test'});
 const shared=f.store.publish({uid:'hq'},{...body(),targetAccount:'ALL'});
 const detail=f.store.read(f.users[2],shared.id);assert.deepEqual(detail.roster.map(p=>p.id),['e2']);assert.equal(detail.total,1);
 assert.equal(f.store.read(f.users[1],shared.id).total,3);
 assert.equal(f.store.read({uid:'hq'},shared.id).total,5);
});
test('addresses removed after publication cannot starve later notification batches',async t=>{const f=fixture(t);for(let i=4;i<45;i++)f.rows.push({id:'e'+i,name:'Example '+i,position:'Agent',email:'staff'+i+'@example.test'});let sent=0;const service=registerReadSign(express(),{...f,authenticate:async()=>f.users[0],send:async()=>{sent++;}});t.after(service.close);const memo=service.store.publish(f.users[1],body());for(let i=0;i<40;i++)f.rows[i].email='';await service.retry();assert.equal(sent,0);await service.retry();assert.equal(sent,5);assert.equal(service.store.read(f.users[1],memo.id).roster.length,5);assert.equal(service.store.read(f.users[1],memo.id).roster.some(p=>p.id==='e0'),false);f.rows[0].email='restored@example.test';await service.retry();assert.equal(sent,6);});
test('HTML reminder has a sign-in deep-link button, plain-text alternative, and escapes published content',()=>{const memo={id:'example-memo',subject:'Policy <img src=x onerror=alert(1)>',memoNumber:'<SOP>',publisher:{name:'Example & Co'},deadline:'2026-10-25T23:59:00-07:00',body:'Read this <script>alert(1)</script>\nThen sign.',attachments:[{name:'<document>.txt'}]},mail=mailContent(memo,'staff@example.test');assert.match(mail,/Content-Type: multipart\/alternative/);assert.match(mail,/Content-Type: text\/plain/);assert.match(mail,/Content-Type: text\/html/);const part=mail.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0],html=Buffer.from(part.replace(/\r\n/g,''),'base64').toString();assert.match(html,/Open Read &amp; Sign/);assert.match(html,/https:\/\/www.mufcapp.net\/read-sign.html\?memo=example-memo/);assert(!html.includes('<script>'));assert(!html.includes('<img src=x'));assert(html.includes('&lt;document&gt;.txt'));assert(html.includes('Example &amp; Co'));});
test('publishing uses server-side positions and preserves roster and attachment snapshots',t=>{const f=fixture(t);for(const i of [0,3])assert.throws(()=>f.store.publish(f.users[i],{...body(),position:'Manager'}),e=>e.status===403);const b=body(),r=f.store.publish(f.users[1],b);assert.equal(r.total,4);assert.equal(r.publisher.name,'Supervisor EXAMPLE');assert.equal(r.myStatus,'pending');assert.equal(f.store.attachment(f.users[1],r.id,r.attachments[0].id).bytes.toString(),'Example policy');assert.equal(f.store.publish(f.users[1],b).id,r.id);assert.throws(()=>f.store.publish(f.users[2],b),e=>e.status===409);f.rows[0].name='Changed name';f.rows.push({id:'new',name:'New employee',position:'Agent'});assert.equal(f.store.read(f.users[1],r.id).roster[0].name,'Agent EXAMPLE');assert.equal(f.store.list({uid:'new'}).memos[0].myStatus,'not-required');assert.throws(()=>f.store.sign({uid:'new'},r.id,signed),e=>e.status===403);});
test('full handwritten signature and acknowledgement required; idempotent retry; only managers see register while staff retain personal history',t=>{const f=fixture(t),r=f.store.publish(f.users[1],body());for(const bad of [{...signed,acknowledged:false},{acknowledged:true,strokes:[]},{acknowledged:true,strokes:[[[.1,.1],[.1,.1]]]},{acknowledged:true,strokes:[[[0,0],[Infinity,1]]]}])assert.throws(()=>f.store.sign(f.users[0],r.id,bad));const result=f.store.sign(f.users[0],r.id,signed);assert.equal(result.myStatus,'signed');assert.equal(result.signed,undefined);assert.equal(result.roster,undefined);assert.match(f.store.read(f.users[1],r.id).roster[0].signature,/^data:image\/svg\+xml;base64,/);assert.equal(f.store.sign(f.users[0],r.id,{acknowledged:true}).mySignedAt,result.mySignedAt);assert.equal(f.store.read(f.users[2],r.id).roster[0].signedAt,result.mySignedAt);assert.equal(f.store.list(f.users[0]).memos[0].myStatus,'signed');assert.equal(f.store.list(f.users[3]).memos[0].myStatus,'pending');assert.throws(()=>f.store.list({uid:'unknown'}),e=>e.status===403);});
test('overdue memos remain visible; late signature date is recorded and flagged',t=>{const f=fixture(t),r=f.store.publish(f.users[2],body());f.setTime('2026-11-01T12:00:00Z');assert.equal(f.store.list(f.users[0]).memos[0].myStatus,'overdue');const after=f.store.sign(f.users[0],r.id,signed);assert.equal(f.store.read(f.users[2],r.id).roster[0].late,true);assert.equal(after.mySignedAt,'2026-11-01T12:00:00.000Z');});
test('publish validation is atomic; bad deadlines, empty subject, injected attachment types and excess files fail',t=>{const f=fixture(t);for(const patch of [{deadline:'bad'},{deadline:'2026-10-01T00:00:00Z'},{subject:''},{memoNumber:'a'.repeat(101)},{attachments:Array(6).fill(body().attachments[0])},{attachments:[{name:'evil.html',type:'text/html',data:Buffer.from('<script/>').toString('base64')}]},{attachments:[{name:'../SOP.txt',type:'text/plain',data:'eA=='}]},{attachments:[{name:'SOP.txt',type:'text/plain',data:'not base64'}]}])assert.throws(()=>f.store.publish(f.users[1],{...body(),...patch}));assert.equal(f.store.list(f.users[0]).memos.length,0);assert.equal(f.employees.db.prepare('SELECT count(*) n FROM read_sign_mail').get().n,0);assert.match(signatureSVG(signed.strokes),/viewBox="0 0 600 200"/);});
test('notification email carries authenticated memo deep link, message and deadline',t=>{const f=fixture(t),r=f.store.publish(f.users[1],body()),mail=mailContent(r,'agent@example.test');assert.match(mail,/To: agent@example.test/);const message=Buffer.from(mail.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString();assert.match(message,new RegExp('https://www.mufcapp.net/read-sign.html\\?memo='+r.id));assert.match(message,/Security alert: Data Protection/);assert.match(message,/SOP.txt/);});
test('HTTP auth, attachment download, durable per-recipient retry and missing-email recovery',async t=>{const f=fixture(t),app=express();let sends=0,offline=true;f.rows[3].email='';const service=registerReadSign(app,{...f,authenticate:async req=>{const user=f.users.find(u=>req.headers.authorization==='Bearer '+u.uid);if(!user)throw Error('no');return user;},send:async()=>{sends++;if(offline)throw Error('offline');}});t.after(service.close);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port+'/read-sign-api',call=(path='',who='e0',b)=>fetch(base+path,{method:b?'POST':'GET',headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});assert.equal((await call('','unknown')).status,401);assert.equal((await call('','e0',body())).status,403);const r=service.store.publish(f.users[1],body());await service.retry();assert.equal(sends,3);assert.equal(service.store.read(f.users[1],r.id).roster.length,3);offline=false;f.rows[3].email='lead@example.test';await service.retry();assert.equal(sends,6);await service.retry();assert.equal(sends,6);assert(service.store.read(f.users[2],r.id).roster.every(p=>p.emailStatus==='sent'));assert.equal((await call('/'+r.id+'/attachments/'+r.attachments[0].id)).status,403);assert.equal((await call('/'+r.id+'/attachments/'+r.attachments[0].id,'e3')).status,403);const response=await call('/'+r.id+'/attachments/'+r.attachments[0].id,'e2');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(await response.text(),'Example policy');assert.equal((await call('/'+r.id+'/sign','e0',signed)).status,200);});


test('staff API responses omit roster, signatures, delivery status and aggregate counts; role changes take effect immediately',t=>{const f=fixture(t),r=f.store.publish(f.users[1],body());f.store.sign(f.users[2],r.id,signed);for(const i of [0,3]){for(const value of [f.store.read(f.users[i],r.id),f.store.list(f.users[i]).memos[0]]){for(const key of ['roster','signed','total','publishHash'])assert.equal(Object.hasOwn(value,key),false);assert(!JSON.stringify(value).includes('data:image/svg'));}assert.equal(f.store.read(f.users[i],r.id).canDownload,false);assert.throws(()=>f.store.attachment(f.users[i],r.id,r.attachments[0].id),e=>e.status===403);}for(const i of [1,2]){assert.equal(f.store.read(f.users[i],r.id).roster.length,4);assert.equal(f.store.read(f.users[i],r.id).canManage,true);assert.equal(f.store.attachment(f.users[i],r.id,r.attachments[0].id).bytes.toString(),'Example policy');}f.rows[1].position='Agent';assert.equal(f.store.read(f.users[1],r.id).roster,undefined);assert.throws(()=>f.store.attachment(f.users[1],r.id,r.attachments[0].id),e=>e.status===403);});

test('no-email operational accounts are excluded from new and existing rosters, totals and signing',t=>{
 const f=fixture(t);f.rows.push({id:'ops',name:'HAS Ops Ramp',position:'Agent',email:'',companyEmail:''});f.rows.push({id:'company',name:'COMPANY EMAIL ONLY',position:'Agent',email:'',companyEmail:'person@company.test'});
 const memo=f.store.publish(f.users[1],body());assert.equal(memo.roster.length,5);assert(!memo.roster.some(p=>p.id==='ops'));assert(memo.roster.some(p=>p.id==='company'));
 assert.equal(f.employees.db.prepare('SELECT count(*) n FROM read_sign_mail WHERE employee_id=?').get('ops').n,0);
 const raw=JSON.parse(f.employees.db.prepare('SELECT data FROM read_sign_memos WHERE id=?').get(memo.id).data);raw.roster.push({id:'ops',name:'HAS Ops Ramp',eid:''});f.employees.db.prepare('UPDATE read_sign_memos SET data=? WHERE id=?').run(JSON.stringify(raw),memo.id);
 assert.equal(f.store.read(f.users[1],memo.id).total,5);assert.equal(f.store.list(f.users[1]).memos[0].total,5);assert.throws(()=>f.store.sign({uid:'ops'},memo.id,signed),e=>e.status===403);
 f.store.sign(f.users[0],memo.id,signed);f.rows[0].email='';const view=f.store.read(f.users[1],memo.id);assert.equal(view.total,4);assert.equal(view.signed,0);assert(!view.roster.some(p=>p.id==='e0'));assert.equal(f.store.list(f.users[0]).memos[0].myStatus,'not-required');
});

test('managers append recipients to old memos after an email is added without losing signatures',t=>{
 const f=fixture(t);f.rows[3].email='';let r=f.store.publish(f.users[1],body());const original=f.store.sign(f.users[0],r.id,signed).mySignedAt;
 f.rows[3].email='new-staff@example.test';assert.equal(f.store.read(f.users[3],r.id).required,false);assert(f.store.read(f.users[1],r.id).availableRecipients.some(p=>p.id===f.rows[3].id));
 assert.throws(()=>f.store.addRecipients(f.users[0],r.id,{employeeIds:[f.rows[3].id]}),e=>e.status===403);
 for(const employeeIds of [[],['missing'],[f.rows[3].id,f.rows[3].id]])assert.throws(()=>f.store.addRecipients(f.users[1],r.id,{employeeIds}));
 r=f.store.addRecipients(f.users[1],r.id,{employeeIds:[f.rows[3].id]});assert.equal(r.total,4);assert.equal(r.signed,1);assert.equal(r.availableRecipients.length,0);assert.equal(f.store.read(f.users[0],r.id).mySignedAt,original);assert.equal(f.store.read(f.users[3],r.id).myStatus,'pending');
 const mail=f.employees.db.prepare('SELECT * FROM read_sign_mail WHERE memo_id=? AND employee_id=?').get(r.id,f.rows[3].id);assert.equal(mail.status,'pending');assert.equal(mail.recipient,'new-staff@example.test');
 const staff=f.store.read(f.users[3],r.id);assert.equal(staff.availableRecipients,undefined);assert.equal(staff.recipientHistory,undefined);
 f.store.addRecipients(f.users[1],r.id,{employeeIds:[f.rows[3].id]});assert.equal(f.store.get(r.id).recipientHistory.length,1);assert.equal(f.store.read(f.users[1],r.id).total,4);
 assert.equal(f.store.sign(f.users[3],r.id,signed).myStatus,'signed');
});
test('recipient additions validate the entire batch and accept overdue acknowledgements',t=>{
 const f=fixture(t),r=f.store.publish(f.users[1],body());f.rows.push({id:'late',name:'FICTIONAL LATE EMPLOYEE',email:'late@example.test',position:'Agent'});f.rows.push({id:'no-email',name:'FICTIONAL OPS',position:'Agent',email:''});
 assert.throws(()=>f.store.addRecipients(f.users[1],r.id,{employeeIds:['late','no-email']}));assert.equal(f.store.get(r.id).roster.some(p=>p.id==='late'),false);
 f.setTime('2026-11-01T12:00:00Z');f.store.addRecipients(f.users[1],r.id,{employeeIds:['late']});assert.equal(f.store.read({uid:'late'},r.id).myStatus,'overdue');assert.equal(f.store.sign({uid:'late'},r.id,signed).myStatus,'signed');
});

test('every pictured management title can publish, inspect counts and append old memo recipients',t=>{
 const f=fixture(t),positions=require('../public/public/employee-positions');
 for(const position of positions.readSignPublishers){
  f.rows[1].position=position;const r=f.store.publish(f.users[1],body());assert.equal(f.store.list(f.users[1]).canPublish,true,position);
  f.store.sign(f.users[0],r.id,signed);const view=f.store.read(f.users[1],r.id);assert.equal(view.total,4,position);assert.equal(view.signed,1,position);assert.equal(view.canManage,true,position);assert.equal(view.roster.length,4,position);
  const id='extra-'+r.id;f.rows.push({id,name:'Fictional new recipient',email:'new@example.test',position:'Agent'});const result=f.store.addRecipients(f.users[1],r.id,{employeeIds:[id]});assert.equal(result.signed,1,position);assert.equal(result.total,5,position);f.rows.pop();
 }
 for(const position of ['Agent','Lead','Accounting','Admin Assistant','HRIS Administrator','Unknown']){f.rows[1].position=position;assert.equal(f.store.list(f.users[1]).canPublish,false,position);assert.throws(()=>f.store.publish(f.users[1],{...body(),position:'President'}),e=>e.status===403);}
});


test('Main Account publishers exclude secondary memberships and reject forged cross-account publish/add batches atomically',t=>{
 const f=fixture(t);for(const e of f.rows)Object.assign(e,{station:'LAX',account:'CZ'});
 f.rows[1].position='Business Manager';f.rows[1].additionalAccounts=[{station:'LAX',account:'MU'}];
 f.rows[3].account='MU';f.rows[3].additionalAccounts=[{station:'LAX',account:'CZ'}];
 const info=f.store.list(f.users[1]);assert.equal(info.canSelectAccounts,false);assert.deepEqual(info.recipientAccounts,[{station:'LAX',account:'CZ'}]);
 const memo=f.store.publish(f.users[1],body());assert.deepEqual(memo.roster.map(p=>p.id),['e0','e1','e2']);
 assert.equal(f.employees.db.prepare('SELECT count(*) n FROM read_sign_mail WHERE memo_id=?').get(memo.id).n,3);
 const count=f.employees.db.prepare('SELECT count(*) n FROM read_sign_memos').get().n;
 for(const targetAccount of ['ALL',JSON.stringify(['LAX','MU']),JSON.stringify(['SFO','CZ'])])assert.throws(()=>f.store.publish(f.users[1],{...body(),targetAccount}),e=>e.status===403);
 assert.equal(f.employees.db.prepare('SELECT count(*) n FROM read_sign_memos').get().n,count);
 f.rows.push({id:'new-cz',name:'New CZ',email:'cz@example.test',station:'LAX',account:'CZ'});
 const detail=f.store.read(f.users[1],memo.id);assert.deepEqual(detail.availableRecipients.map(p=>p.id),['new-cz']);
 assert.throws(()=>f.store.addRecipients(f.users[1],memo.id,{employeeIds:['new-cz','e3']}),e=>e.status===403);
 assert(!f.store.get(memo.id).roster.some(p=>p.id==='new-cz'));
 assert.equal(f.store.addRecipients(f.users[1],memo.id,{employeeIds:['new-cz']}).total,4);
});

test('Headquarter publisher chooses a single account or all accounts, including across stations',t=>{
 const f=fixture(t);Object.assign(f.rows[1],{station:'HQ',account:'HQ'});
 Object.assign(f.rows[0],{station:'LAX',account:'CZ'});Object.assign(f.rows[2],{station:'LAX',account:'MU'});Object.assign(f.rows[3],{station:'SFO',account:'CZ'});
 assert.equal(f.store.list(f.users[1]).canSelectAccounts,true);
 const one=f.store.publish(f.users[1],{...body(),targetAccount:JSON.stringify(['SFO','CZ'])});assert.deepEqual(one.roster.map(p=>p.id),['e3']);
 const all=f.store.publish(f.users[1],{...body(),targetAccount:'ALL'});assert.equal(all.total,4);
 f.rows.push({id:'new-mu',name:'New MU',email:'mu@example.test',station:'LAX',account:'MU'});
 assert(f.store.read(f.users[1],one.id).availableRecipients.some(p=>p.id==='new-mu'));
 assert.equal(f.store.addRecipients(f.users[1],one.id,{employeeIds:['new-mu']}).total,2);
 const draft={...body(),targetAccount:'ALL'},published=f.store.publish(f.users[1],draft);assert.equal(f.store.publish(f.users[1],draft).id,published.id);
 assert.throws(()=>f.store.publish(f.users[1],{...draft,targetAccount:JSON.stringify(['LAX','CZ'])}),e=>e.status===409);
});

test('recipient scope follows current Main Account after promotion and does not grant HQ power from an additional account',t=>{
 const f=fixture(t);for(const e of f.rows)Object.assign(e,{station:'LAX',account:'CZ'});
 f.rows[1].additionalAccounts=[{station:'HQ',account:'HQ'}];assert.equal(f.store.list(f.users[1]).canSelectAccounts,false);
 f.rows[0].account='MU';f.rows[1].account='MU';
 const r=f.store.publish(f.users[1],body());assert.deepEqual(r.roster.map(p=>p.id),['e0','e1']);
});


test('test account identities are excluded from new and existing Read & Sign recipients and totals',t=>{
 const f=fixture(t);
 for(const field of ['loginId','email','companyEmail']){
  const testPerson={id:'hidden-'+field,name:'Test Identity',position:'Agent',email:'staff@example.test',[field]:' TEST@HM.COM '};f.rows.push(testPerson);
  const r=f.store.publish(f.users[1],body());assert(!r.roster.some(p=>p.id===testPerson.id));
  assert(!r.availableRecipients.some(p=>p.id===testPerson.id));assert.equal(r.total,4);
  assert.throws(()=>f.store.addRecipients(f.users[1],r.id,{employeeIds:[testPerson.id]}));
  const raw=JSON.parse(f.employees.db.prepare('SELECT data FROM read_sign_memos WHERE id=?').get(r.id).data);raw.roster.push({id:testPerson.id,name:testPerson.name});f.employees.db.prepare('UPDATE read_sign_memos SET data=? WHERE id=?').run(JSON.stringify(raw),r.id);
  assert.equal(f.store.read(f.users[1],r.id).total,4);assert.equal(f.store.list(f.users[1]).memos.find(m=>m.id===r.id).total,4);
  assert.throws(()=>f.store.sign({uid:testPerson.id},r.id,signed),e=>e.status===403);
  assert.equal(f.employees.db.prepare('SELECT count(*) n FROM read_sign_mail WHERE employee_id=?').get(testPerson.id).n,0);
 }
});


test('queued Read & Sign mail skips an employee newly identified as the test account',async t=>{
 const f=fixture(t),memo=f.store.publish(f.users[1],body());f.rows[0].loginId='test@hm.com';const sent=[];
 const service=registerReadSign(express(),{...f,send:async(memo,address)=>sent.push(address),authenticate:async()=>f.users[1]});t.after(()=>service.close());
 await new Promise(setImmediate);await service.retry();assert(!sent.includes(f.rows[0].email));
 assert.equal(f.employees.db.prepare('SELECT status FROM read_sign_mail WHERE memo_id=? AND employee_id=?').get(memo.id,'e0').status,'excluded');
});
