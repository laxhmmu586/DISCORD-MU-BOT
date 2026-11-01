const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerBriefing}=require('../has/server/briefing');
const {createEmployeeStore}=require('../has/server/employees');
async function fixture(t){
 const db=new Database(':memory:'),rows=[['lead','Lead'],['sup','Supervisor'],['agent','Agent'],['other','Lead']].map(([id,position])=>({id,name:id+' employee',eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>{const person=employees.get().employees.find(row=>row.id===(user.uid==='override'?'agent':user.uid));return user.uid==='override'?{...person,permissionOverrides:{'briefing.edit':true}}:person;}},app=express();app.use(express.json());
 const options={employees,profiles,authenticate:async req=>{if(!req.headers.authorization)throw Error('Sign in');return {uid:req.headers.authorization};},etab:{read:async()=>({status:'unavailable'})},now:()=>new Date('2026-11-01T20:00:00Z')};
 const service=registerBriefing(app,options),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api'+path,{headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 return {db,request,service,options};
}
test('Counter/Gate default settings enforce Lead+ on reads and writes, including employee view and permission overrides',async t=>{
 const {request}=await fixture(t),path='/departure-defaults?section=counter';
 assert.equal((await request(null,path)).status,401);
 for(const user of ['agent','other','override']){assert.equal((await request(user,path)).status,403);assert.equal((await request(user,'/departure-defaults',{section:'counter',revision:0,values:{}})).status,403);}
 assert.equal((await request('lead',path+'&view=employee')).status,403);
 for(const user of ['lead','sup']){const result=await request(user,path);assert.equal(result.status,200);assert.equal(Object.keys(result.data.values).length,20);}
 for(const [user,allowed] of [['agent',false],['override',false],['lead',true],['sup',true]])assert.equal((await request(user,'?date=2026-11-01&flight=MU586')).data.canEditDepartureDefaults,allowed);
});
test('default sections save independently with auditing, validation and concurrent-edit protection',async t=>{
 const {db,request}=await fixture(t),counter=(await request('lead','/departure-defaults?section=counter')).data,gate=(await request('lead','/departure-defaults?section=gate')).data;
 const values={...counter.values,counterA59Number:'A57',counterA59Service:'Business'};
 assert.equal((await request('lead','/departure-defaults',{section:'counter',revision:0,values})).status,200);
 assert.equal((await request('sup','/departure-defaults',{section:'counter',revision:0,values:counter.values})).status,409);
 assert.deepEqual((await request('lead','/departure-defaults?section=gate')).data,gate);
 for(const invalid of [{...values,counterA59:'Do not copy an employee'},{...values,counterA59Number:'x'.repeat(151)},{...values,counterA59Service:123}])assert.equal((await request('lead','/departure-defaults',{section:'counter',revision:1,values:invalid})).status,400);
 assert.equal((await request('lead','/departure-defaults?section=constructor')).status,400);
 const saved=(await request('lead','/departure-defaults?section=counter')).data;assert.equal(saved.values.counterA59Number,'A57');assert.equal(saved.revision,1);
 assert.equal(db.prepare("SELECT employee_id FROM briefing_audit WHERE field='departure-defaults'").get().employee_id,'lead');
});
test('default changes update existing departures immediately, preserve assignments and times, and leave arrivals unchanged',async t=>{
 const {db,request,service,options}=await fixture(t),key={date:'2026-11-01',flight:'MU586',direction:'departure'},path='?date='+key.date+'&flight='+key.flight;
 for(const [field,value] of [['counterA59Service','Existing Counter'],['gateLeadLabel','Existing Gate Lead'],['gateLeadTime','1030']]){const before=(await request('lead',path)).data;assert.equal((await request('lead','',{...key,field,value,previous:before.fields[field]})).status,200);}
 assert.equal((await request('lead','/assign',{...key,employeeId:'agent',fromField:null,toField:'gateLead',toValue:''})).status,200);
 for(const section of ['counter','gate']){const state=(await request('lead','/departure-defaults?section='+section)).data;const values={...state.values,...(section==='counter'?{counterA59Number:'A50',counterA59Service:'New Counter'}:{gateLeadLabel:'New Gate Lead',passport1Label:'Document Check'})};assert.equal((await request('lead','/departure-defaults',{section,revision:state.revision,values})).status,200);}
 const existing=(await request('lead',path)).data;assert.equal(existing.fields.counterA59Service,'New Counter');assert.equal(existing.fields.gateLeadLabel,'New Gate Lead');assert.equal(existing.fields.gateLead,'agent employee');assert.equal(existing.fields.gateLeadTime,'1030');
 const next=(await request('agent','?date=2026-11-02&flight=MU578')).data;assert.equal(next.fields.counterA59Number,'A50');assert.equal(next.fields.counterA59Service,'New Counter');assert.equal(next.fields.gateLeadLabel,'New Gate Lead');assert.equal(next.fields.passport1Label,'Document Check');assert.equal(next.fields.gateLead,'');assert.equal(next.fields.gateLeadTime,'');
 assert.equal((await request('agent','?date=2026-11-02&flight=MU583')).data.fields.gateLeadLabel,'Gate Lead');
 assert.equal((await request('lead','/clear',{...key,expected:existing.fields})).status,200);const cleared=(await request('lead',path)).data;assert.equal(cleared.fields.gateLeadLabel,'New Gate Lead');assert.equal(cleared.fields.counterA59Service,'New Counter');assert.equal(cleared.fields.gateLead,'');
 registerBriefing(express(),options);assert.equal(service.record({date:'2026-11-03',flight:'MU586'}).fields.gateLeadLabel,'New Gate Lead');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM briefing_departure_defaults').get().n,2);
});
