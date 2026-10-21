const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),sharp=require('sharp');
const {openEmployeeDatabase}=require('../employeeDatabase'),{createProfileStore,registerProfiles}=require('../employeeProfiles');
const seed=[{id:'one',name:'TEST EMPLOYEE',nickname:'Test',eid:'00123',email:'employee@gmail.com',phone:'555',discordId:'',attach:true,detach:false,spotter:true},{id:'two',name:'SECOND EMPLOYEE',nickname:'Second',eid:'00456',email:'second@example.com',phone:'',discordId:'',attach:false,detach:false,spotter:false}];
const google={uid:'google-one',email:'Employee@Gmail.com',provider:'google.com',emailVerified:true};
function fixture(t){const legacy=new Database(':memory:'),employees=openEmployeeDatabase(legacy,{seed}),profiles=createProfileStore(employees);t.after(()=>{employees.close();legacy.close();});return {employees,profiles};}
function confirm(profiles,user=google){const preview=profiles.status(user);return profiles.link(user,{revision:preview.revision,eid:preview.profile.eid});}

test('profile displays affiliation and PBB credentials but cannot self-grant or change them',async t=>{
 const {profiles,employees}=fixture(t),ready=confirm(profiles);assert.equal(ready.profile.station,'LAX');assert.equal(ready.profile.account,'MU');
 for(const [key,value] of Object.entries({station:'SFO',account:'XX',pbbId:'PBB-123',pbbExpiry:'2099-12-31'}))await assert.rejects(profiles.update(google,{revision:ready.revision,[key]:value}),/Only nickname/);
 const list=employees.get();list.employees[0].pbbId='TEST-PBB';list.employees[0].pbbExpiry='2026-10-20';list.employees[0].station='SFO';list.employees[0].account='XX';employees.save(list,{email:'lake@mu.com'});
 const p=profiles.status(google).profile;assert.equal(p.station,'SFO');assert.equal(p.account,'XX');assert.equal(p.pbbId,'TEST-PBB');assert.equal(p.pbbExpiry,'2026-10-20');
});
test('Profile saves a normalized US phone number to the shared employee database',async t=>{
 const {profiles,employees}=fixture(t),ready=confirm(profiles);const saved=await profiles.update(google,{revision:ready.revision,phone:'+1 (626) 889 1216'});assert.equal(saved.profile.phone,'626-889-1216');assert.equal(employees.get().employees[0].phone,'626-889-1216');
});
test('@mu.com external employees do not need an employee record or EID confirmation',t=>{
 const {profiles,employees}=fixture(t);for(const provider of ['password','google.com'])assert.deepEqual(profiles.status({...google,uid:'external',email:'External@MU.COM',provider}),{state:'external'});
 assert.equal(employees.db.prepare('SELECT COUNT(*) AS count FROM employee_accounts').get().count,0);
 assert.equal(profiles.status({...google,email:'external@mu.com.attacker.example'}).state,'needs_eid');
});
test('verified email matches case insensitively, requires confirmation and persists UID association after email edits',async t=>{
 const {profiles,employees}=fixture(t);assert.equal(profiles.linked(google),undefined);assert.equal(profiles.status(google).state,'confirm');const ready=confirm(profiles);assert.equal(ready.state,'ready');
 const changed=await profiles.update(google,{revision:ready.revision,nickname:'New nickname',phone:'12345',email:'new@example.com'});assert.equal(changed.profile.nickname,'New nickname');assert.equal(employees.get().employees[0].email,'new@example.com');assert.equal(profiles.status(google).state,'ready');assert.equal(createProfileStore(employees).status(google).profile.email,'new@example.com');
 const record=employees.get().employees[0];assert.equal(record.eid,'00123');assert.equal(record.name,'TEST EMPLOYEE');assert.equal(record.attach,true);
});
test('unknown Google email requires EID and rejects missing, invalid, duplicate and already linked IDs',t=>{
 const {profiles,employees}=fixture(t),other={...google,uid:'other',email:'other@gmail.com'};
 assert.deepEqual(profiles.status(other),{state:'needs_eid'});assert.throws(()=>profiles.preview(other,'123'),/not found/);assert.throws(()=>profiles.preview(other,''),/Enter/);
 const preview=profiles.preview(other,'00123');assert.equal(preview.profile.id,'one');profiles.link(other,{eid:'00123',revision:preview.revision});assert.throws(()=>profiles.status(google),/already has/);
 const data=employees.get();data.employees[1].eid='00123';employees.save(data,{email:'admin@example.com'});assert.throws(()=>profiles.preview({...other,uid:'third'},'00123'),/ambiguous/);
});
test('unverified identities, edits to protected fields and stale changes cannot alter employee data',async t=>{
 const {profiles,employees}=fixture(t);assert.throws(()=>profiles.status({...google,emailVerified:false}),/verified/);const ready=confirm(profiles);
 await assert.rejects(profiles.update(google,{revision:ready.revision,name:'CHANGED'}),/Only nickname/);
 await assert.rejects(profiles.update(google,{revision:0,nickname:'stale'}),/changed/);
 await assert.rejects(profiles.update(google,{revision:ready.revision,email:'second@example.com'}),/already used/);
 await assert.rejects(profiles.update(google,{revision:ready.revision,nickname:'x'.repeat(61)}),/nicknames/);
 await assert.rejects(profiles.update({...google,uid:'stranger'},{revision:ready.revision,nickname:'attack'}),/Link/);
 assert.equal(employees.get().employees[0].name,'TEST EMPLOYEE');assert.equal(employees.get().revision,ready.revision);
});
test('avatars are decoded, normalized, persisted separately from admin saves, and removable',async t=>{
 const {profiles,employees}=fixture(t);let ready=confirm(profiles);const bytes=await sharp({create:{width:400,height:300,channels:3,background:'#2478ab'}}).png().toBuffer();
 ready=await profiles.update(google,{revision:ready.revision,avatar:'data:image/png;base64,'+bytes.toString('base64')});assert.match(ready.profile.avatar,/^data:image\/jpeg;base64,/);const meta=await sharp(Buffer.from(ready.profile.avatar.split(',')[1],'base64')).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);
 employees.save(employees.get(),{email:'admin@example.com'});assert.equal(profiles.status(google).profile.avatar,ready.profile.avatar);
 await assert.rejects(profiles.update(google,{revision:employees.get().revision,avatar:'data:image/svg+xml;base64,AAAA'}),/Choose/);
 await assert.rejects(profiles.update(google,{revision:employees.get().revision,avatar:'data:image/png;base64,AAAA'}),/valid image/);
 ready=await profiles.update(google,{revision:employees.get().revision,avatar:''});assert.equal(ready.profile.avatar,'');
});
test('EID enumeration is limited and deleted employee identities fail closed',t=>{
 const {profiles,employees}=fixture(t);for(let i=0;i<5;i++)assert.throws(()=>profiles.preview({...google,email:'unknown@gmail.com'},'999'),/not found/);assert.throws(()=>profiles.preview({...google,email:'unknown@gmail.com'},'00123'),error=>error.status===429);
 confirm(profiles);const data=employees.get();data.employees.shift();employees.save(data,{email:'admin@example.com'});assert.equal(profiles.linked(google),undefined);assert.throws(()=>profiles.status(google),/unavailable/);
});
test('profile HTTP API requires auth and returns conflicts without overwriting data',async t=>{
 const express=require('express'),app=express(),{employees}=fixture(t);app.use(express.json());registerProfiles(app,{employees,authenticate:async req=>{if(req.headers.authorization!=='Bearer fixture')throw Error('invalid');return google;}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/profile-api')).status,401);const headers={Authorization:'Bearer fixture','Content-Type':'application/json'};const preview=await (await fetch(base+'/profile-api',{headers})).json();assert.equal(preview.state,'confirm');
 const linked=await fetch(base+'/profile-api/link',{method:'POST',headers,body:JSON.stringify({revision:preview.revision,eid:preview.profile.eid})});assert.equal(linked.status,200);
 const stale=await fetch(base+'/profile-api',{method:'POST',headers,body:JSON.stringify({revision:0,nickname:'wrong'})});assert.equal(stale.status,409);assert.equal(employees.get().employees[0].nickname,'Test');
});
