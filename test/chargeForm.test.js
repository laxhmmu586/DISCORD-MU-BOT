const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {registerBriefing}=require('../has/server/briefing');
const {createEmployeeStore}=require('../has/server/employees');
async function fixture(t,overrides={}){
 const db=new Database(':memory:'),rows=[['lead','Lead'],['sup','Supervisor'],['agent','Agent'],['other','Lead']].map(([id,position])=>({id,name:id+' employee',eid:id,position,station:'LAX',account:id==='other'?'CZ':'MU'}));
 const employees={...createEmployeeStore(db,{seed:rows}),db},profiles={linked:user=>{const person=employees.get().employees.find(row=>row.id===(user.uid==='override'?'agent':user.uid));return user.uid==='override'?{...person,permissionOverrides:{'briefing.edit':true}}:person;}},app=express();app.use(express.json());
 const options={employees,profiles,authenticate:async req=>{if(!req.headers.authorization)throw Error('Sign in');return {uid:req.headers.authorization};},chargeLog:async()=>'>XS FSC\nRATE BSR 1CNY = 0.1500733 USD',etab:{read:async()=>({status:'unavailable'})},now:()=>new Date('2026-11-01T20:00:00Z'),...overrides};
 const service=registerBriefing(app,options),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const request=async(user,path,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/briefing-api'+path,{headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 return {db,request,service,options};
}

test('Charge Form reads are scoped and only Lead+ can save shared prices, with revision protection and audit',async t=>{
 const f=await fixture(t);await f.request('lead','/charge-form/exchange');const state=(await f.request('lead','/charge-form')).data;
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
 assert.equal((await store.exchange()).status,'unavailable');assert.equal(store.readExchange().rate,'');
});

test('daily FSC is queried once and persists across service restarts, with Los Angeles midnight rollover',async t=>{
 const f=await fixture(t);let now=new Date('2026-11-02T07:59:59Z'),reads=0;const options={db:f.db,now:()=>now,getLog:async()=>{reads++;return 'RATE BSR 1CNY = 0.1500733 USD';}},create=require('../has/server/chargeForm').createChargeForm,store=create(options);
 const rates=await Promise.all([store.exchange(),store.exchange(),store.exchange()]);assert.equal(reads,1);assert(rates.every(rate=>rate.date==='2026-11-01'&&rate.rate==='0.1500733'));
 assert.equal((await create(options).exchange()).rate,'0.1500733');assert.equal(reads,1);
 now=new Date('2026-11-02T08:00:00Z');assert.equal(store.readExchange().rate,'');assert.equal((await store.exchange()).date,'2026-11-02');assert.equal(reads,2);
});
test('manual daily rate survives reopen and wins over a pending automatic lookup',async t=>{
 const f=await fixture(t);let release,reads=0;const create=require('../has/server/chargeForm').createChargeForm,store=create({db:f.db,now:()=>new Date('2026-11-01T20:00:00Z'),getLog:()=>{reads++;return new Promise(resolve=>release=resolve);}}),pending=store.exchange();await Promise.resolve();
 const saved=store.saveExchange({date:'2026-11-01',revision:0,rate:'0.2'},{name:'Lead',employeeId:'lead'});assert.equal(saved.rate,'0.2');release('RATE BSR 1CNY = 0.15 USD');assert.equal((await pending).rate,'0.2');assert.equal((await store.exchange()).rate,'0.2');assert.equal(reads,1);
 assert.throws(()=>store.saveExchange({date:'2026-11-01',revision:0,rate:'0.3'},{name:'Lead',employeeId:'lead'}),error=>error.status===409);
 assert.equal((await f.request('agent','/charge-form')).data.exchange.rate,'0.2');assert.equal((await f.request('agent','/charge-form/exchange',{date:'2026-11-01',revision:1,rate:'0.19'})).status,200);
});
test('opening defaults never waits for the log and exchange writes validate current day and values',async t=>{
 let reads=0;const f=await fixture(t,{chargeLog:async()=>{reads++;throw Error('offline');}});const result=await f.request('lead','/charge-form');assert.equal(result.status,200);assert.equal(reads,0);assert.equal(result.data.prices.cn0,1300);
 for(const rate of ['',0,-1,'not a rate',101])assert.equal((await f.request('lead','/charge-form/exchange',{date:'2026-11-01',revision:0,rate})).status,400);
 assert.equal((await f.request('lead','/charge-form/exchange',{date:'2026-10-31',revision:0,rate:'0.15'})).status,409);
 assert.equal((await f.request('other','/charge-form/exchange',{date:'2026-11-01',revision:0,rate:'0.15'})).status,403);
});
