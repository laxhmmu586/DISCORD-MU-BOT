const test=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const positions=require('../public/public/employee-positions');
const {createEmployeeStore}=require('../employees');
const {createUniformStore}=require('../uniformRequests');

function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());
 const seed=['Agent','Senior Supervisor','Business Manager','President','Manager'].map((position,i)=>({id:'e'+i,name:'EXISTING NAME '+i,position,eid:'100'+i,phone:'626-555-0100',email:'person'+i+'@example.test',companyEmail:'person'+i+'@company.test',loginId:'person'+i+'@login.test',nickname:'Existing '+i,code:'C'+i,discordId:'',attach:false,detach:false,spotter:false}));
 const employees={...createEmployeeStore(db,{seed}),db};
 const users=seed.map(e=>({uid:e.id,email:e.loginId}));
 const profiles={linked:user=>employees.get().employees.find(e=>e.id===user.uid)};
 return {employees,users,store:createUniformStore({employees,profiles})};
}
const request=()=>({requestId:require('node:crypto').randomUUID(),reason:'annual',items:Array.from({length:6},(_,i)=>({size:i?'':'38',pieces:i?'':1,order:'',reusable:'',nonReusable:''}))});

test('HQ and all station titles are accepted without rewriting employee identity',t=>{
 const {employees}=fixture(t),admin={email:'lake@mu.com'};
 // Use the current schema's optional PBB fields before comparing unchanged records.
 const initial=employees.get();employees.save(initial,admin);
 const original=employees.get().employees;
 for(const position of positions.positions){
  const data=employees.get();data.employees[0].position=position;
  const saved=employees.save(data,admin);
  assert.equal(saved.employees[0].position,position);
  assert.deepEqual(saved.employees.map(({position,...identity})=>identity),original.map(({position,...identity})=>identity));
 }
 const data=employees.get();data.employees[0].position='Invented Role';
 assert.throws(()=>employees.save(data,admin),/position/);
 assert.equal(new Set(positions.positions).size,positions.positions.length);
 assert(!positions.positions.includes('CSA'));assert(positions.same('CSA','Agent'));
});

test('new station and HQ workflow stages resolve exactly and retain old request snapshots',t=>{
 const {store,users}=fixture(t),admin={email:'lake@mu.com'};
 const old=store.create(users[0],request());
 store.saveWorkflow(admin,{revision:1,stages:['Senior Supervisor','President','Business Manager']});
 assert.deepEqual(store.get(old.id).stages,['Supervisor','Manager']);
 let r=store.create(users[0],request());
 assert.deepEqual(r.nextApprovers.map(e=>e.id),['e1']);
 assert.throws(()=>store.decide(users[3],r.id,{revision:1,action:'approve'}),e=>e.status===403);
 r=store.decide(users[1],r.id,{revision:1,action:'approve'});
 assert.deepEqual(r.nextApprovers.map(e=>e.id),['e3']);
 r=store.decide(users[3],r.id,{revision:2,action:'approve'});
 assert.deepEqual(r.nextApprovers.map(e=>e.id),['e2']);
 r=store.decide(users[2],r.id,{revision:3,action:'approve'});
 assert.equal(r.status,'approved');assert.equal(r.manager.name,'EXISTING NAME 2');
 assert.throws(()=>store.saveWorkflow(admin,{revision:2,stages:['Agent','CSA','Manager']}),/duplicate/);
});

test('legacy Manager is absent from new choices while existing employee and workflow values remain valid',()=>{
 assert(!positions.groups.some(g=>g.label==='Existing positions'));assert(!positions.selectablePositions.includes('Manager'));assert(!positions.choices('Agent').includes('Manager'));assert(positions.choices('Manager').includes('Manager'));assert(positions.valid('Manager'));
 assert.equal(positions.readSignPublishers.length,23);assert(positions.canPublishReadSign('Business Manager'));assert(positions.canPublishReadSign('HR Manager'));assert(!positions.canPublishReadSign('Agent'));assert(!positions.canPublishReadSign('Lead'));
});
