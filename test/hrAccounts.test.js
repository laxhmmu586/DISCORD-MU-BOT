const test=require('node:test'),assert=require('node:assert/strict'),{createFixture}=require('./fixtures/hr-accounts.cjs');
async function fixture(t){const f=await createFixture();t.after(()=>f.close());return f;}
test('HR reads and saves 2nd/3rd memberships, validates scopes and preserves unrelated employee data',async t=>{
 const f=await fixture(t),first=(await f.request('owner')).data,employee=first.employees.find(row=>row.id==='existing');
 assert.deepEqual(employee.additionalAccounts,[{station:'LAX',account:'CZ'}]);assert.equal(employee.hasGoogleLogin,false);assert.equal(first.employees.find(row=>row.id==='signup').hasGoogleLogin,true);
 const original=f.store.get().employees.find(row=>row.id==='existing');
 const update=additionalAccounts=>f.request('owner','',{id:'existing',revision:f.store.get().revision,changes:{additionalAccounts}});
 const result=await update([{station:'LAX',account:'CZ'},{station:'SFO',account:'MU'}]);assert.equal(result.status,200);assert.equal(result.data.employees.find(row=>row.id==='existing').additionalAccounts.length,2);
 const saved=f.store.get().employees.find(row=>row.id==='existing');for(const field of ['id','name','eid','code','pbbId','pbbExpiry'])assert.equal(saved[field],original[field]);
 for(const invalid of [[{station:'LAX',account:'MU'}],[{station:'LAX',account:'CZ'},{station:'LAX',account:'CZ'}],[{station:'ZZZ',account:'INVALID'}],[{station:'HQ',account:'HQ'}],[{station:'LAX',account:'CZ'},{station:'SFO',account:'MU'},{station:'LAX',account:'MU'}],null]){const before=f.store.get();assert.equal((await update(invalid)).status,400);assert.deepEqual(f.store.get(),before);}
 assert.equal((await update([])).status,200);assert.deepEqual(f.store.get().employees.find(row=>row.id==='existing').additionalAccounts,[]);
});
test('additional accounts remain administrator-only and revision protected',async t=>{
 const f=await fixture(t);assert.equal((await f.request(null)).status,401);
 const view=(await f.request('bm')).data;assert(!('hasGoogleLogin' in view.employees.find(row=>row.id==='existing')));assert.deepEqual(view.employees.find(row=>row.id==='existing').additionalAccounts,[{station:'LAX',account:'CZ'}]);
 const body={id:'existing',revision:f.store.get().revision,changes:{additionalAccounts:[]}};assert.equal((await f.request('bm','',body)).status,403);
 assert.equal((await f.request('owner','',{...body,revision:0})).status,409);
 assert.equal((await f.request('bm','',{...body,changes:{nickname:'Managed'}})).status,200);assert.deepEqual(f.store.get().employees.find(row=>row.id==='existing').additionalAccounts,[{station:'LAX',account:'CZ'}]);
});
test('owner can link a self-registered Google login to an existing password account without changing records',async t=>{
 const f=await fixture(t),before=f.store.get(),target=before.employees.find(row=>row.id==='existing'),source=before.employees.find(row=>row.id==='signup');
 const result=await f.request('owner','/link-google',{id:'signup',employeeId:'existing',revision:before.revision});assert.equal(result.status,200);assert.equal(result.data.selectedId,'existing');
 assert.equal(f.profiles.status({uid:'google-signup',provider:'google.com',email:'signup@example.test',emailVerified:true}).profile.id,'existing');assert.equal(f.profiles.linked({uid:'existing-password'}).id,'existing');
 assert.deepEqual(f.store.get().employees.find(row=>row.id==='existing'),target);assert.deepEqual(f.store.get().employees.find(row=>row.id==='signup'),source);assert.equal(f.store.get().employees.length,before.employees.length);
 assert.equal(result.data.employees.find(row=>row.id==='existing').hasGoogleLogin,true);assert.equal(result.data.employees.find(row=>row.id==='signup').hasGoogleLogin,false);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM employee_google_link_audit').get().n,1);assert.equal(f.changes,1);
 assert.equal((await f.request('owner','/link-google',{id:'signup',employeeId:'foreign',revision:f.store.get().revision})).status,409);
});
test('Google login relinking rejects unauthorized, protected, conflicting and stale targets atomically',async t=>{
 const f=await fixture(t),body={id:'signup',employeeId:'existing',revision:f.store.get().revision};
 for(const role of ['bm','other-admin'])assert.equal((await f.request(role,'/link-google',body)).status,403);
 for(const [changes,status] of [[{employeeId:'owner'},403],[{employeeId:'other-google'},409],[{employeeId:'signup'},400],[{employeeId:'missing'},400],[{revision:0},409],[{id:'existing'},400]]){assert.equal((await f.request('owner','/link-google',{...body,...changes})).status,status);assert.equal(f.profiles.linked({uid:'google-signup'}).id,'signup');}
 const before=f.store.get();f.db.exec("CREATE TRIGGER reject_google_link_audit BEFORE INSERT ON employee_google_link_audit BEGIN SELECT RAISE(ABORT,'test rollback');END");
 assert.equal((await f.request('owner','/link-google',body)).status,400);assert.deepEqual(f.store.get(),before);assert.equal(f.profiles.linked({uid:'google-signup'}).id,'signup');assert.equal(f.changes,0);
});
