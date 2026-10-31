const test=require('node:test'),assert=require('node:assert/strict'),{createFixture}=require('./fixtures/hr-accounts.cjs');
async function fixture(t){const f=await createFixture();t.after(()=>f.close());return f;}
const body=f=>({id:'signup',employeeId:'existing',revision:f.store.get().revision});
test('Merge unifies login/accounts without requiring a reporting manager and hides only the duplicate',async t=>{
 const f=await fixture(t);assert.equal(f.db.prepare('SELECT manager_id FROM employee_reporting WHERE employee_id=?').get('signup'),undefined);
 f.db.prepare('INSERT INTO employee_accounts VALUES(?,?,?,?)').run('signup-password','signup','password','now');
 const before=f.store.get(),master=before.employees.find(p=>p.id==='existing'),source=before.employees.find(p=>p.id==='signup');
 const result=await f.request('owner','/merge',body(f));assert.equal(result.status,200);assert.equal(result.data.selectedId,'existing');assert(!result.data.employees.some(p=>p.id==='signup'));
 for(const uid of ['google-signup','signup-password','existing-password'])assert.equal(f.profiles.linked({uid}).id,'existing');
 const merged=f.store.get().employees.find(p=>p.id==='existing');for(const field of ['name','position','code','eid','pbbId','pbbExpiry'])assert.equal(merged[field],master[field]);assert.deepEqual(merged.additionalAccounts,[{station:'LAX',account:'CZ'}]);
 const archive=f.db.prepare('SELECT * FROM employee_profile_merges WHERE source_employee_id=?').get('signup');assert.equal(archive.target_employee_id,'existing');assert.equal(JSON.parse(archive.source_snapshot).nickname,source.nickname);assert.equal(f.store.get().employees.find(p=>p.id==='signup').mergedInto,'existing');assert.equal(f.store.get().employees.length,before.employees.length);
 const oldEmail=f.profiles.status({uid:'new-legacy-login',email:'signup@example.test',provider:'password'});assert.equal(oldEmail.profile.id,'existing');
 const roster=await (await fetch(f.origin+'/staff-schedule-api/today-team',{headers:{Authorization:'owner'}})).json();assert(!roster.employees.some(p=>p.id==='signup'));assert.equal(f.changes,1);
});
test('Merge accumulates distinct workspaces and preserves archived identities through later saves',async t=>{
 const f=await fixture(t),data=f.store.get();f.store.save({...data,employees:data.employees.map(p=>p.id==='signup'?{...p,name:'Duplicate',additionalAccounts:[{station:'SFO',account:'MU'}]}:p)}, {email:'lake@mu.com'});
 const response=await f.request('owner','/merge',body(f));assert.equal(response.status,200);assert.deepEqual(f.store.get().employees.find(p=>p.id==='existing').additionalAccounts,[{station:'LAX',account:'CZ'},{station:'SFO',account:'MU'}]);
 const active=f.store.get();f.store.save({revision:active.revision,employees:active.employees.filter(p=>!p.mergedInto)}, {email:'lake@mu.com'});assert(f.store.get().employees.some(p=>p.id==='signup'&&p.mergedInto==='existing'));assert.equal(f.profiles.status({uid:'google-signup'}).profile.id,'existing');const after=f.store.get();assert.throws(()=>f.store.save({revision:after.revision,employees:after.employees.filter(p=>p.id!=='existing'&&!p.mergedInto)}, {email:'lake@mu.com'}),/master profile/);
 const second=await f.request('owner','/merge',{id:'existing',employeeId:'foreign',revision:f.store.get().revision});assert.equal(second.status,200);assert.equal(f.profiles.linked({uid:'google-signup'}).id,'foreign');assert.equal(f.store.resolveId('signup'),'foreign');
});
test('Merge rejects protected identities, stale revisions, Google conflicts and excess memberships atomically',async t=>{
 const f=await fixture(t),original=f.store.get();for(const user of ['bm','other-admin'])assert.equal((await f.request(user,'/merge',body(f))).status,403);
 for(const [change,status] of [[{employeeId:'owner'},403],[{employeeId:'signup'},400],[{employeeId:'other-google'},409],[{revision:0},409]]){assert.equal((await f.request('owner','/merge',{...body(f),...change})).status,status);assert.deepEqual(f.store.get(),original);}
 f.store.changeAccount({revision:f.store.get().revision,station:'LAX',account:'EK'}, {email:'lake@mu.com'});const current=f.store.get();f.store.save({...current,employees:current.employees.map(p=>p.id==='signup'?{...p,additionalAccounts:[{station:'SFO',account:'MU'},{station:'LAX',account:'EK'}]}:p)}, {email:'lake@mu.com'});const before=f.store.get();assert.equal((await f.request('owner','/merge',body(f))).status,409);assert.deepEqual(f.store.get(),before);assert.equal(f.profiles.linked({uid:'google-signup'}).id,'signup');
});
test('failed archive write rolls back login transfer and employee changes',async t=>{
 const f=await fixture(t),before=f.store.get();f.db.exec("CREATE TRIGGER reject_merge BEFORE INSERT ON employee_profile_merges BEGIN SELECT RAISE(ABORT,'test rollback');END");assert.equal((await f.request('owner','/merge',body(f))).status,400);assert.deepEqual(f.store.get(),before);assert.equal(f.profiles.linked({uid:'google-signup'}).id,'signup');assert.equal(f.changes,0);
});

test('old EIDs and manager login aliases resolve to the saved master identity',async t=>{
 const f=await fixture(t),current=f.store.get();f.store.save({...current,employees:current.employees.map(p=>p.id==='signup'?{...p,eid:'11223'}:p)}, {email:'lake@mu.com'});assert.equal((await f.request('owner','/merge',body(f))).status,200);
 assert.equal(f.profiles.preview({uid:'eid-check',email:'unmatched@example.test',provider:'password'},'11223').profile.id,'existing');
 assert.equal((await f.request('owner','/merge',{id:'bm',employeeId:'existing',revision:f.store.get().revision})).status,200);assert.equal((await f.request('bm')).status,403);f.db.prepare('DELETE FROM employee_accounts WHERE uid=?').run('bm');assert.equal((await f.request('bm')).status,403,'Archived manager email cannot retain old privileges');
});
