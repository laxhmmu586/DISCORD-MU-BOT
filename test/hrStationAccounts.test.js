const test=require('node:test'),assert=require('node:assert/strict');
test('HR account selections stay within the employee station, with server enforcement',async()=>{
 const f=await require('./fixtures/hr-accounts.cjs').createFixture();try{let before=f.store.get();f.store.changeAccount({revision:before.revision,station:'LAX',account:'CI'},{email:'lake@mu.com'});
 const update=changes=>f.request('owner','',{id:'existing',revision:f.store.get().revision,changes});
 let response=await update({station:'JFK',account:'MU',reportsTo:''});assert.equal(response.status,403);assert.equal(f.store.get().employees.find(x=>x.id==='existing').station,'LAX');
 response=await update({additionalAccounts:[{station:'SFO',account:'MU'}]});assert.equal(response.status,403);
 response=await update({additionalAccounts:[{station:'LAX',account:'CZ'},{station:'LAX',account:'CI'}]});assert.equal(response.status,200);const employee=f.store.get().employees.find(x=>x.id==='existing');assert.deepEqual(employee.additionalAccounts,[{station:'LAX',account:'CZ'},{station:'LAX',account:'CI'}]);
 }finally{f.close();}
});
