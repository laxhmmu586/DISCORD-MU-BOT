const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {createEmployeeStore,registerEmployees}=require('../employees');
const admin={email:'lake@mu.com'};
async function fixture(t){
 const db=new Database(':memory:'),seed=[['hq','President','LAX','MU'],['manager','Business Manager','LAX','MU'],['supervisor','Supervisor','LAX','MU'],['agent','Agent','LAX','MU'],['other','Agent','LAX','XX'],['station','Agent','SFO','MU']].map(([id,position,station,account])=>({id,position,station,account,name:'FIXTURE '+id.toUpperCase(),eid:'00123',loginId:id+'@example.test',attach:false,detach:false,spotter:false}));
 const store=createEmployeeStore(db,{seed}),app=express();app.use(express.json());registerEmployees(app,{store,authenticate:async req=>({email:req.headers['x-email']||admin.email})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(path='',body,email=admin.email)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/employee-admin-api'+path,{method:body?'POST':'GET',headers:{'x-email':email,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};return {db,store,request};
}
test('accounts persist empty, reject duplicates and can only be deleted while empty at the current revision',async t=>{
 const f=await fixture(t),before=f.store.get();let r=await f.request('/accounts',{revision:before.revision,station:' lax ',account:' zz '});assert.equal(r.status,200);assert(r.data.accounts.some(a=>a.station==='LAX'&&a.account==='ZZ'));assert.deepEqual(r.data.employees,before.employees);
 assert(createEmployeeStore(f.db,{seed:[]}).get().accounts.some(a=>a.account==='ZZ'),'Empty account survives store reopen');
 assert.equal((await f.request('/accounts',{revision:r.data.revision,station:'LAX',account:'ZZ'})).status,409);
 assert.equal((await f.request('/accounts/delete',{revision:before.revision,station:'LAX',account:'ZZ'})).status,409);
 assert.equal((await f.request('/accounts/delete',{revision:r.data.revision,station:'LAX',account:'MU'})).status,409);
 const draft=f.store.get();draft.employees.push({id:'new',name:'NEW FIXTURE',position:'Agent',station:'LAX',account:'ZZ',attach:false,detach:false,spotter:false});f.store.save(draft,admin);
 assert.equal((await f.request('/accounts/delete',{revision:r.data.revision,station:'LAX',account:'ZZ'})).status,409);
 assert.equal((await f.request('/accounts/delete',{revision:f.store.get().revision,station:'LAX',account:'ZZ'})).status,409,'Server checks current employees even with latest revision');
 const cleared=f.store.get();cleared.employees=cleared.employees.filter(e=>e.id!=='new');f.store.save(cleared,admin);r=await f.request('/accounts/delete',{revision:f.store.get().revision,station:'LAX',account:'ZZ'});assert.equal(r.status,200);assert(!r.data.accounts.some(a=>a.account==='ZZ'));assert.equal(r.data.employees.length,before.employees.length);
 for(const scope of [{station:'HQ',account:'HQ'},{station:'bad space',account:'MU'}])assert.equal((await f.request('/accounts',{revision:r.data.revision,...scope})).status,400);
});
test('Business Manager can read the own-account card but only edit own Agents PBB fields',async t=>{
 const f=await fixture(t),email='manager@example.test',view=(await f.request('',undefined,email)).data;
 assert.deepEqual(view.accounts,[{station:'LAX',account:'MU'}]);assert.deepEqual(view.employees.map(e=>e.id),['manager','supervisor','agent']);assert.equal(view.access.mode,'business-manager');
 const agent=view.employees.find(e=>e.id==='agent'),saved=await f.request('',{revision:view.revision,employees:[{...agent,name:'FORGED NAME',eid:'99999',station:'SFO',pbbId:'PBB-TEST',pbbExpiry:'2027-10-22'}]},email);assert.equal(saved.status,200);const actual=f.store.get().employees.find(e=>e.id==='agent');assert.equal(actual.name,agent.name);assert.equal(actual.eid,agent.eid);assert.equal(actual.station,'LAX');assert.equal(actual.pbbId,'PBB-TEST');
 for(const id of ['hq','supervisor','manager','other','station','unknown'])assert.equal((await f.request('',{revision:f.store.get().revision,employees:[{id,pbbId:'FORGED',pbbExpiry:'2027-10-22'}]},email)).status,403,id);
 for(const path of ['/accounts','/accounts/delete'])assert.equal((await f.request(path,{revision:f.store.get().revision,station:'LAX',account:'ZZ'},email)).status,403);
 assert.equal((await f.request('',undefined,'agent@example.test')).status,403);
 const changed=f.store.get();changed.employees.find(e=>e.id==='manager').position='Agent';f.store.save(changed,admin);assert.equal((await f.request('',undefined,email)).status,403,'Revocation applies to the next request');
});
test('HeadQuarter titles do not create normal account groups or leak into Business Manager views',()=>{
 const db=new Database(':memory:');try{const store=createEmployeeStore(db,{seed:[{id:'hq',position:'President',name:'HQ FIXTURE',station:'LAX',account:'MU',attach:false,detach:false,spotter:false}]});assert.deepEqual(store.get().accounts,[]);}finally{db.close();}
});

test('one employee may belong to three accounts without duplication and additional membership prevents deletion',async t=>{
 const {store,request}=await fixture(t);let data=store.get(),agent=data.employees.find(e=>e.id==='agent');agent.additionalAccounts=[{station:'LAX',account:'XX'},{station:'SFO',account:'MU'}];data=store.save(data,admin);
 assert.equal(data.employees.filter(e=>e.id==='agent').length,1);assert.equal(data.employees.find(e=>e.id==='agent').additionalAccounts.length,2);
 const empty=store.get();empty.employees=empty.employees.filter(e=>e.id!=='other');data=store.save(empty,admin);assert.equal((await request('/accounts/delete',{revision:data.revision,station:'LAX',account:'XX'})).status,409);
 const moved=store.get();moved.employees.find(e=>e.id==='manager').station='SFO';data=store.save(moved,admin);const view=(await request('',undefined,'manager@example.test')).data;assert(view.employees.some(e=>e.id==='agent'));assert(!view.employees.some(e=>e.id==='supervisor'));
 const forged=store.get();forged.employees.find(e=>e.id==='agent').additionalAccounts=[{station:'LAX',account:'MU'}];assert.throws(()=>store.save(forged,admin),/distinct/);
 forged.employees.find(e=>e.id==='agent').additionalAccounts=[{station:'XYZ',account:'MISSING'}];assert.throws(()=>store.save(forged,admin),/existing/);
 forged.employees.find(e=>e.id==='agent').additionalAccounts=Array(3).fill({station:'LAX',account:'XX'});assert.throws(()=>store.save(forged,admin),/at most/);
});

test('Business Manager checks an EID and explicitly links an existing Agent rather than duplicating identity',async t=>{
 const {store,request}=await fixture(t),email='manager@example.test';let data=store.get();data.employees.forEach((e,i)=>e.eid=String(9000+i));store.save(data,admin);const target=store.get().employees.find(e=>e.id==='other'),before={...target};
 let checked=await request('/employee-check',{station:'LAX',account:'MU',eid:target.eid},email);assert.equal(checked.status,200);assert.equal(checked.data.existing.slot,'second');assert.deepEqual(Object.keys(checked.data.existing).sort(),['alreadyMember','eid','full','id','name','slot']);
 let result=await request('/add-employee',{station:'LAX',account:'MU',eid:target.eid,revision:checked.data.revision},email);assert.equal(result.status,409,'Existing employee requires confirmation');
 result=await request('/add-employee',{station:'LAX',account:'MU',eid:target.eid,revision:checked.data.revision,existingId:target.id,name:'FORGED'},email);assert.equal(result.status,200);assert(result.data.employees.some(e=>e.id===target.id));let actual=store.get().employees.find(e=>e.id===target.id);assert.equal(actual.name,before.name);assert.equal(actual.loginId,before.loginId);assert.equal(actual.id,before.id);assert.deepEqual(actual.additionalAccounts,[{station:'LAX',account:'MU'}]);assert.equal(store.get().employees.length,6);
 checked=await request('/employee-check',{station:'LAX',account:'MU',eid:target.eid},email);assert.equal(checked.data.existing.alreadyMember,true);
 assert.equal((await request('/employee-check',{station:'SFO',account:'MU',eid:target.eid},email)).status,403);assert.equal((await request('/employee-check',{station:'LAX',account:'MU',eid:target.eid},'agent@example.test')).status,403);
 data=store.get();data.employees.find(e=>e.id==='manager').additionalAccounts=[{station:'SFO',account:'MU'}];store.save(data,admin);checked=await request('/employee-check',{station:'SFO',account:'MU',eid:target.eid},email);assert.equal(checked.data.existing.slot,'third');result=await request('/add-employee',{station:'SFO',account:'MU',eid:target.eid,existingId:target.id,revision:checked.data.revision},email);assert.equal(result.status,200);assert.equal(store.get().employees.find(e=>e.id===target.id).additionalAccounts.length,2);
 store.changeAccount({revision:store.get().revision,station:'ORD',account:'TEST'},admin);checked=await request('/employee-check',{station:'ORD',account:'TEST',eid:target.eid});assert.equal(checked.data.existing.full,true);assert.equal((await request('/add-employee',{station:'ORD',account:'TEST',eid:target.eid,existingId:target.id,revision:checked.data.revision})).status,409);
 checked=await request('/employee-check',{station:'LAX',account:'MU',eid:'99999'},email);assert.equal(checked.data.existing,null);assert.equal((await request('/add-employee',{station:'LAX',account:'MU',eid:'99999',revision:checked.data.revision,name:'NEW FICTIONAL AGENT',position:'President'},email)).status,200);assert.equal(store.get().employees.find(e=>e.eid==='99999').position,'Agent');
 assert.equal((await request('/add-employee',{station:'LAX',account:'MU',eid:'99998',revision:checked.data.revision,name:'STALE'},email)).status,409);
 data=store.get();data.employees.find(e=>e.id==='agent').eid=target.eid;store.save(data,admin);assert.equal((await request('/employee-check',{station:'LAX',account:'MU',eid:target.eid},email)).status,409,'Ambiguous EID fails closed');
});


test('Supervisor edits all lower-level employee information and account assignments within the original scope',async t=>{
 const f=await fixture(t),email='supervisor@example.test',view=(await f.request('',undefined,email)).data;
 assert.equal(view.access.canEditEmployeeInfo,true);assert.deepEqual(view.access.editableEmployeeIds,['agent']);assert(view.accountChoices.some(a=>a.station==='SFO'));const before=view.employees.find(e=>e.id==='agent');
 for(const id of ['supervisor','manager','hq','other','station','unknown'])assert.equal((await f.request('',{revision:f.store.get().revision,employees:[{id,pbbId:'FORGED'}]},email)).status,403,id);
 for(const change of [{position:'Supervisor'},{position:'Business Manager'},{loginId:'lake@mu.com'},{station:'ZZ',account:'FAKE'}])assert.equal((await f.request('',{revision:f.store.get().revision,employees:[{...before,...change}]},email)).status,403);
 const edited={...before,position:'Lead',name:'EDITED EMPLOYEE',nickname:'Updated',eid:'9988',phone:'6265550123',email:'updated@example.test',companyEmail:'company@example.test',loginId:'updated-signin@example.test',discordId:'123456789012345678',station:'SFO',account:'MU',additionalAccounts:[{station:'LAX',account:'MU'},{station:'LAX',account:'XX'}],pbbId:'TBIT-1',pbbExpiry:'2027-10-23',pbbMscId:'MSC-1',pbbMscExpiry:'2027-10-23',attach:true,detach:true,spotter:true};
 let r=await f.request('',{revision:view.revision,employees:[edited]},email);assert.equal(r.status,200);const actual=f.store.get().employees.find(e=>e.id==='agent');for(const key of ['position','name','nickname','eid','email','companyEmail','loginId','discordId','station','account','pbbId','pbbMscId','attach','detach','spotter'])assert.equal(actual[key],edited[key],key);assert.deepEqual(actual.additionalAccounts,edited.additionalAccounts);
 // Removing the original account remains a savable reassignment, then removes further access.
 r=await f.request('',{revision:r.data.revision,employees:[{...actual,additionalAccounts:[]}]},email);assert.equal(r.status,200);assert(!r.data.employees.some(e=>e.id==='agent'));assert.equal((await f.request('',{revision:r.data.revision,employees:[actual]},email)).status,403);
 for(const path of ['/accounts','/accounts/delete'])assert.equal((await f.request(path,{revision:f.store.get().revision,station:'LAX',account:'ZZ'},email)).status,403);
 const revoked=f.store.get();revoked.employees.find(e=>e.id==='supervisor').position='Lead';f.store.save(revoked,admin);assert.equal((await f.request('',undefined,email)).status,403);
});

test('administrator can persist HeadQuarter as the main account without a station account membership',async t=>{
 const f=await fixture(t),draft=f.store.get(),agent=draft.employees.find(e=>e.id==='agent');agent.station='HQ';agent.account='HQ';
 const saved=f.store.save(draft,admin),actual=saved.employees.find(e=>e.id==='agent');assert.equal(actual.station,'HQ');assert.equal(actual.account,'HQ');assert(require('../public/public/employee-account-groups').isHeadquarter(actual));assert(!require('../public/public/employee-account-groups').belongs(actual,{station:'LAX',account:'MU'}));
});
