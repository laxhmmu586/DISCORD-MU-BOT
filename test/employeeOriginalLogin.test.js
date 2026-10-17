const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {openEmployeeDatabase}=require('../employeeDatabase'),{createProfileStore}=require('../employeeProfiles');
function setup(t){const legacy=new Database(':memory:'),employees=openEmployeeDatabase(legacy,{seed:[{id:'one',name:'FIRST EMPLOYEE',nickname:'First',eid:'00123',email:'personal@gmail.com',loginId:'legacy@mu.com',phone:'',discordId:'',attach:false,detach:false,spotter:false},{id:'two',name:'SECOND EMPLOYEE',nickname:'Second',eid:'00456',email:'second@gmail.com',phone:'',discordId:'',attach:false,detach:false,spotter:false}]}),profiles=createProfileStore(employees);t.after(()=>{employees.close();legacy.close();});return {employees,profiles};}
test('admin original sign-in email links a legacy password account without EID and survives contact edits',async t=>{
 const {employees,profiles}=setup(t),user={uid:'legacy-uid',email:'LEGACY@MU.COM',provider:'password'};const ready=profiles.status(user);assert.equal(ready.state,'ready');assert.equal(ready.profile.id,'one');assert.equal(ready.profile.email,'personal@gmail.com');
 await profiles.update(user,{revision:ready.revision,email:'new-contact@gmail.com'});assert.equal(profiles.status(user).state,'ready');assert.equal(employees.get().employees[0].loginId,'legacy@mu.com');assert.equal(employees.db.prepare('SELECT employee_id FROM employee_accounts WHERE uid=?').get(user.uid).employee_id,'one');
});
test('original login IDs are unique and validated, and old admin clients cannot erase them by omission',t=>{
 const {employees}=setup(t);let data=employees.get();delete data.employees[0].loginId;let saved=employees.save(data,{email:'lake@mu.com'});assert.equal(saved.employees[0].loginId,'legacy@mu.com');
 data=employees.get();data.employees[1].loginId=' LEGACY@MU.COM ';assert.throws(()=>employees.save(data,{email:'lake@mu.com'}),/unique/);assert.equal(employees.get().revision,saved.revision);
 data=employees.get();data.employees[1].loginId='invalid';assert.throws(()=>employees.save(data,{email:'lake@mu.com'}),/valid/);
});
test('ambiguous original/contact matches fail closed and profile cannot edit original login IDs',async t=>{
 const {employees,profiles}=setup(t);let data=employees.get();data.employees[1].email='legacy@mu.com';employees.save(data,{email:'lake@mu.com'});assert.throws(()=>profiles.status({uid:'legacy-uid',email:'legacy@mu.com',provider:'password'}),/ambiguous/);
 data=employees.get();data.employees[1].email='second@gmail.com';employees.save(data,{email:'lake@mu.com'});const user={uid:'legacy-uid',email:'legacy@mu.com',provider:'password'},ready=profiles.status(user);await assert.rejects(profiles.update(user,{revision:ready.revision,loginId:'attacker@example.com'}),/Only nickname/);
});
test('ordinary Google original-ID matches still require confirmation, while unmapped external accounts stay exempt',t=>{
 const {employees,profiles}=setup(t);const data=employees.get();data.employees[0].loginId='original@gmail.com';employees.save(data,{email:'lake@mu.com'});assert.equal(profiles.status({uid:'google',email:'original@gmail.com',provider:'google.com',emailVerified:true}).state,'confirm');assert.equal(profiles.status({uid:'external',email:'external@mu.com',provider:'password'}).state,'external');
});

test('only the two Lake administrators can change, clear, add or remove original login mappings',t=>{
 const {employees}=setup(t);
 for(const email of ['lake@mu.com','NEXTWEEK1216@GMAIL.COM']){const data=employees.get();data.employees[1].loginId=email;employees.save(data,{email});}
 for(const email of ['tamsun@hm.com','tamsun10@gmail.com','employee@gmail.com']){
  let data=employees.get();data.employees[0].nickname='Updated contact';employees.save(data,{email});
  for(const change of [rows=>rows[0].loginId='changed@mu.com',rows=>rows[0].loginId='',rows=>rows.push({...rows[0],id:'new',loginId:'new@mu.com'}),rows=>rows.splice(0,1)]){
   data=employees.get();const revision=data.revision;change(data.employees);assert.throws(()=>employees.save(data,{email}),error=>error.status===403&&/Original Login IDs/.test(error.message));assert.equal(employees.get().revision,revision);assert.equal(employees.get().employees[0].loginId,'legacy@mu.com');
  }
 }
});
