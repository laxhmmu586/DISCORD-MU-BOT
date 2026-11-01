const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerBriefing}=require('../has/server/briefing');
const {createEmployeeStore}=require('../has/server/employees');
async function fixture(t){
 const db=new Database(':memory:'),rows=[['lead','Lead'],['sup','Supervisor'],['agent','Agent'],['other','Lead']].map(([id,position])=>({id,name:id+' employee',eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>{const person=employees.get().employees.find(row=>row.id===(user.uid==='override'?'agent':user.uid));return user.uid==='override'?{...person,permissionOverrides:{'briefing.edit':true}}:person;}},app=express();app.use(express.json());
 const options={employees,profiles,authenticate:async req=>{if(!req.headers.authorization)throw Error('Sign in');return {uid:req.headers.authorization};},chargeLog:async()=>'>XS FSC\nRATE BSR 1CNY = 0.1500733 USD',etab:{read:async()=>({status:'unavailable'})},now:()=>new Date('2026-11-01T20:00:00Z')};
 const service=registerBriefing(app,options),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api'+path,{headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 return {db,request,service,options};
}

test('Charge Form reads are scoped and only Lead+ can save shared prices, with revision protection and audit',async t=>{
 const f=await fixture(t),state=(await f.request('lead','/charge-form')).data;
 assert.equal((await f.request(null,'/charge-form')).status,401);assert.equal((await f.request('other','/charge-form')).status,403);
 assert.equal(state.exchange.rate,'0.1500733');assert.equal(state.canEdit,true);assert.equal(state.prices.cn0,1300);
 assert.equal((await f.request('agent','/charge-form')).data.canEdit,false);
 for(const user of ['agent','override'])assert.equal((await f.request(user,'/charge-form',{revision:0,prices:state.prices})).status,403);
 assert.equal((await f.request('lead','/charge-form?view=employee',{revision:0,prices:state.prices})).status,403);
 const prices={...state.prices,cn0:1400,biz0:1200};const saved=await f.request('lead','/charge-form',{revision:0,prices});assert.equal(saved.status,200);assert.equal(saved.data.prices.cn0,1400);assert.equal(saved.data.revision,1);
 assert.equal((await f.request('sup','/charge-form',{revision:0,prices})).status,409);
 assert.equal(f.db.prepare("SELECT employee_id FROM briefing_audit WHERE field='charge-prices'").get().employee_id,'lead');
 registerBriefing(express(),f.options);assert.equal((await f.request('agent','/charge-form')).data.prices.biz0,1200);
 for(const invalid of [{...prices,cn0:-1},{...prices,cn0:'100'},{...prices,cn0:1.001},{...prices,unexpected:12}])assert.equal((await f.request('lead','/charge-form',{revision:1,prices:invalid})).status,400);
});
test('Charge Form matches the reference formulas and whole-dollar display without rounding the exchange rate',()=>{
 const m=require('../has/public/charge-form-model'),rate=.1500733;
 assert.equal(m.dollars(m.usd(m.groups.china[0],m.defaults,rate)),'$195');assert.equal(m.dollars(m.usd(m.groups.special[3],m.defaults,rate)),'$675');
 assert.equal(m.dollars(m.usd(m.groups.business[0],m.defaults,rate)),'$1,100');assert.equal(m.dollars(m.usd(m.groups.seat[0],m.defaults,.2)),'$180');
 for(const value of ['',0,-1,'invalid'])assert.equal(m.usd(m.groups.china[0],m.defaults,value),null);
 assert.equal(m.usd(m.groups.china[0],m.defaults,rate),1300*rate);
});
test('missing FSC log returns an unavailable rate instead of a stale or invented exchange rate',async t=>{
 const f=await fixture(t),store=require('../has/server/chargeForm').createChargeForm({db:f.db,getLog:async()=>{throw Error('offline');}});
 assert.deepEqual(await store.exchange(),{status:'unavailable',rate:'',source:'XS FSC'});
});
