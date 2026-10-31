const test=require('node:test'),assert=require('node:assert/strict'),model=require('../has/public/organization-model'),{createMembershipFixture}=require('./fixtures/hr-memberships.cjs');
const MU={station:'LAX',account:'MU'},CZ={station:'LAX',account:'CZ'};
async function fixture(t){const f=await createMembershipFixture();t.after(()=>f.close());return f;}
test('second/third Agents project into MU Supervisor team without changing canonical Main Account',async t=>{
 const f=await fixture(t),data=(await f.request('owner')).data,projected=model.forWorkspace(data.employees,MU);
 for(const [id,slot] of [['second',1],['third',2]]){const row=projected.find(p=>p.id===id);assert.equal(row.membershipSlot,slot);assert.equal(row.reportsTo,'team:LAX:MU:Supervisor');assert.deepEqual(model.reportingManagers(row,projected).map(p=>p.id),['sup-mu']);const choices=model.managersFor(row,data.access,projected);assert.equal(choices.length,1);assert.equal(choices[0].id,'team:LAX:MU:Supervisor');}
 assert.equal(data.employees.find(p=>p.id==='sup-mu').reportsTo,'','A Supervisor does not need a manager before Agents can report to its team');assert.equal(data.employees.find(p=>p.id==='second').account,'CZ');assert.equal(data.employees.find(p=>p.id==='second').reportsTo,'team:LAX:CZ:Supervisor');
});
test('workspace reporting saves independently, survives reload and requires account Supervisor team',async t=>{
 const f=await fixture(t),save=(id,reportsTo,scope=MU,revision=f.store.get().revision)=>f.request('owner','/membership-reporting',{id,scope,reportsTo,revision});
 assert.equal((await save('second','team:LAX:MU:Supervisor')).status,200);assert.equal(f.db.prepare('SELECT manager_id FROM employee_reporting WHERE employee_id=?').get('second').manager_id,'team:LAX:CZ:Supervisor');
 let data=(await f.request('owner')).data;assert.equal(model.membershipView(data.employees.find(p=>p.id==='second'),data.employees,MU).reportsTo,'team:LAX:MU:Supervisor');
 assert.equal((await save('third','team:LAX:MU:Supervisor')).status,200);assert.equal((await save('second','')).status,200);data=(await f.request('owner')).data;assert.equal(model.membershipView(data.employees.find(p=>p.id==='second'),data.employees,MU).unassigned,true);assert.equal(model.membershipView(data.employees.find(p=>p.id==='second'),data.employees,CZ).reportsTo,'team:LAX:CZ:Supervisor');
 for(const [manager,scope,status] of [['sup-mu',MU,400],['bm',MU,400],['team:LAX:CZ:Supervisor',MU,400],['team:LAX:MU:Supervisor',CZ,400],['team:LAX:MU:Supervisor',{station:'LAX',account:'XX'},400]]){const before=f.store.get();assert.equal((await save('second',manager,scope)).status,status);assert.deepEqual(f.store.get(),before);}
 assert.equal((await save('third','team:LAX:MU:Supervisor',MU,0)).status,409);
});
test('MU supervisors manage membership reporting; foreign managers and Agents cannot',async t=>{
 const f=await fixture(t),getBody=()=>({id:'second',scope:MU,reportsTo:'team:LAX:MU:Supervisor',revision:f.store.get().revision});
 for(const actor of ['second','bm-cz','sup-cz'])assert.equal((await f.request(actor,'/membership-reporting',getBody())).status,403);
 const result=await f.request('sup-mu','/membership-reporting',getBody());assert.equal(result.status,200);assert(result.data.employees.some(p=>p.id==='second'));assert(!result.data.employees.some(p=>p.id==='sup-cz'));
 assert.equal((await f.request('sup-mu','/membership-reporting',{...getBody(),scope:CZ})).status,400);
});
test('MU in account slot 2/3 grants Schedule and both Briefing directions, preserving Agent edit limits',async t=>{
 const f=await fixture(t);for(const uid of ['second','third']){
  const profile=f.profiles.status({uid}).profile;assert.equal(profile.canViewOperations,true);
  const schedule=await f.person(uid,'/staff-schedule-api?start=2026-10-31&end=2026-10-31&schema=2');assert.equal(schedule.status,200);assert.equal(schedule.data.canEdit,false);assert(schedule.data.employees.some(p=>p.id===uid));
  for(const [direction,flight] of [['arrival','MU583'],['departure','MU586']]){const briefing=await f.person(uid,'/briefing-api?date=2026-10-31&direction='+direction+'&flight='+flight);assert.equal(briefing.status,200);assert.equal(briefing.data.canEditBriefing,false);assert.equal((await f.person(uid,'/briefing-api',{date:'2026-10-31',flight,direction,field:'details',previous:'',value:'not permitted'})).status,403);}
 }
 assert.equal((await f.person('foreign','/staff-schedule-api?start=2026-10-31')).status,403);assert.equal((await f.person('foreign','/briefing-api?date=2026-10-31')).status,403);
});
