const test=require('node:test'),assert=require('node:assert/strict');
const {createEmployeeStore}=require('../employees');
function database(){let data;return {exec(){},transaction:fn=>fn,prepare(sql){return {run(value){if(sql.startsWith('INSERT'))data??=value;else data=value;},get(){return {data};}};}};}
const admin={email:'lake@mu.com'};
test('employee contact fields survive saves and remain private in qualified options',()=>{
 const store=createEmployeeStore(database(),{seed:[{id:'one',name:'Test Employee',eid:'00123',discordId:'',driver:true,spotter:false}]});
 let data=store.save(store.get(),admin);assert.equal(data.employees[0].code,'');assert.equal(data.employees[0].phone,'');assert.equal(data.employees[0].email,'');
 Object.assign(data.employees[0],{code:' 001A ',phone:' +1 (555) 123-4567 ',email:' employee@example.com '});
 store.save(data,admin);const row=store.get().employees[0];assert.equal(row.code,'001A');assert.equal(row.phone,'+1 (555) 123-4567');assert.equal(row.email,'employee@example.com');assert.equal(row.eid,'00123');
 assert.deepEqual(Object.keys(store.options()[0]),['id','name','eid','attach','detach','spotter']);
});
test('invalid contact fields do not overwrite saved employees',()=>{
 const store=createEmployeeStore(database(),{seed:[{id:'one',name:'Test',eid:'',discordId:'',driver:false,spotter:false}]});
 for(const fields of [{code:'x'.repeat(41)},{phone:'x'.repeat(41)},{email:'invalid'},{email:'x'.repeat(255)}]){const data=store.get();Object.assign(data.employees[0],fields);assert.throws(()=>store.save(data,admin),/codes, phone numbers and email/);assert.equal(store.get().revision,1);}
});

