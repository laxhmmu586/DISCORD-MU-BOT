const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {createEmployeeStore}=require('../employees'),{registerHasPbb}=require('../hasPbb');
const items=require('../public/public/has-pbb-data'),strokes=[[[.1,.2],[.4,.6],[.8,.1]]];
async function fixture(t,{failUpload=false}={}){
 const db=new Database(':memory:');let now=new Date('2026-10-21T17:00:00Z'),uploads=0;
 const seed=[['driver','LAX','MU'],['spotter','LAX','MU'],['other','SFO','MU'],['account','LAX','XX'],['expired','LAX','MU'],['missing','LAX','MU']].map(([id,station,account])=>({id,position:['driver','other','account'].includes(id)?'Manager':'Agent',name:'TEST '+id.toUpperCase(),eid:'123',station,account,attach:true,detach:true,spotter:true,pbbId:id==='missing'?'':'PBB-'+id,pbbExpiry:id==='missing'?'':id==='expired'?'2026-10-20':'2026-10-21'}));
 const employees=createEmployeeStore(db,{seed});const profiles={status:()=>{},linked:u=>employees.get().employees.find(e=>e.id===u.uid)};
 const app=express();app.use(express.json());const service=registerHasPbb(app,{store:{db,now:()=>now},employees,profiles,authenticate:async req=>{const uid=req.headers.authorization?.replace('Bearer ','');if(!uid)throw Error('Sign in required');return {uid,email:uid==='lake'?'lake@mu.com':uid+'@test.invalid'};},drive:{files:{generateIds:async()=>({data:{ids:['fake-id']}}),get:async()=>{throw {code:404};},create:async()=>{uploads++;if(failUpload)throw Error('fixture upload failure');return {data:{id:'fake-id'}};}}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body,method)=>{const res=await fetch(base+'/has-pbb-api'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():Buffer.from(await res.arrayBuffer())};};
 const create=(user='driver',bridge='L1')=>request(user,'/records',{role:user==='spotter'?'spotter':'driver',flightNo:'MU583',gate:'132',bridge});
 const change=async(user,r,body)=>request(user,'/records/'+r.id,{role:user==='spotter'?'spotter':'driver',revision:r.revision,...body});
 return {db,employees,service,base,request,create,change,uploads:()=>uploads,setTime:date=>{now=new Date(date);},recover:()=>{failUpload=false;}};
}
test('default flights persist per station/account, and only current Managers can add or delete',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request('spotter','/flights',{flightNo:'MU583',position:'Manager'})).status,403);
 assert.equal((await f.request('driver','/flights',{flightNo:'not valid'})).status,400);
 assert.deepEqual((await f.request('driver','/flights',{flightNo:' mu583 '})).data,['MU583']);
 assert.deepEqual((await f.request('driver','/flights',{flightNo:'MU583'})).data,['MU583']);
 assert.deepEqual((await f.request('spotter','/flights')).data,['MU583']);
 for(const user of ['other','account'])assert.deepEqual((await f.request(user,'/flights')).data,[]);
 assert.deepEqual((await f.request('account','/flights',{flightNo:'XX123'})).data,['XX123']);
 assert.equal((await f.request('spotter','/flights/MU583/delete',{})).status,403);
 assert.deepEqual((await f.request('account','/flights/MU583/delete',{})).data,['XX123']);
 assert.deepEqual((await f.request('driver','/flights')).data,['MU583']);
 assert.equal((await f.request('driver','/context')).data.canManageFlights,true);
 assert.equal((await f.request('spotter','/context')).data.canManageFlights,false);
 const r=(await f.create()).data;assert.deepEqual((await f.request('driver','/flights/MU583/delete',{})).data,[]);
 assert.equal((await f.request('driver','/records/'+r.id)).data.flightNo,'MU583');
 const data=f.employees.get();data.employees.find(e=>e.id==='driver').position='Agent';f.employees.save(data,{email:'lake@mu.com'});
 assert.equal((await f.request('driver','/flights',{flightNo:'MU588'})).status,403);
 assert.equal((await f.request('driver','/flights/MU583/delete',{})).status,403);
});
test('HAS scopes every record read/write/stream and daily uniqueness by station/account/flight/bridge',async t=>{
 const f=await fixture(t),a=await f.create(),same=await f.create('spotter'),other=await f.create('other'),account=await f.create('account');
 assert.equal(a.status,201);assert.equal(a.data.id,same.data.id);assert.notEqual(a.data.id,other.data.id);assert.notEqual(a.data.id,account.data.id);
 for(const user of ['other','account'])for(const path of ['/records/'+a.data.id,'/stream?id='+a.data.id,'/records/'+a.data.id+'/pdf'])assert.equal((await f.request(user,path)).status,403);
 assert.equal((await f.change('other',a.data,{action:'answer',itemId:'serviceable',value:true})).status,403);
 assert.equal((await f.request('other','/records')).data.length,1);assert.equal((await f.request('driver','/records')).data.length,1);
 assert.equal((await f.request('driver','/records/'+a.data.id+'/retry',{})).status,409);
});
test('expired/missing IDs block Driver creation and mutations; expiry includes its final day',async t=>{
 const f=await fixture(t);for(const user of ['expired','missing'])assert.equal((await f.create(user)).status,403);
 let r=(await f.create()).data;assert.equal((await f.request('driver','/context')).data.employee.driver,true);
 f.setTime('2026-10-22T17:00:00Z');assert.equal((await f.request('driver','/context')).data.employee.driver,false);
 assert.equal((await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).status,403);
});
test('administrator qualification revocation is enforced against an already open checklist',async t=>{
 const f=await fixture(t),r=(await f.create()).data;const data=f.employees.get();data.employees.find(e=>e.id==='driver').pbbExpiry='2026-10-20';f.employees.save(data,{email:'lake@mu.com'});
 assert.equal((await f.change('driver',r,{action:'ready',value:true})).status,403);
 assert.equal((await f.request('driver','/context')).data.employee.driver,false);
});
test('SSE sends shared Ready changes, denies premature movement, supports changes, signs independently and saves Drive only',async t=>{
 const f=await fixture(t);let r=(await f.create()).data;
 const abort=new AbortController(),stream=await fetch(f.base+'/has-pbb-api/stream?id='+r.id,{headers:{Authorization:'Bearer driver'},signal:abort.signal}),reader=stream.body.getReader();t.after(()=>abort.abort());
 assert.match(new TextDecoder().decode((await reader.read()).value),/event: state/);
 const apply=async(user,body)=>{const result=await f.change(user,r,body);assert.equal(result.status,200,JSON.stringify(result));r=result.data;return r;};
 assert.equal((await f.change('driver',r,{action:'move'})).status,409);
 for(const role of ['driver','spotter'])for(const q of items.filter(x=>x.role===role&&x.phase==='pre'))await apply(role,{action:'answer',itemId:q.id,value:true});
 const stale=r.revision;await apply('driver',{action:'answer',itemId:'serviceable',value:false});
 assert.equal((await f.change('driver',r,{action:'ready',value:true})).status,400);
 assert.equal((await f.request('driver','/records/'+r.id,{role:'driver',revision:stale,action:'answer',itemId:'serviceable',value:true})).status,409);
 await apply('driver',{action:'answer',itemId:'serviceable',value:true});
 await apply('spotter',{action:'ready',value:true});let received='';while(!received.includes('"spotter":true'))received+=new TextDecoder().decode((await reader.read()).value);assert.match(received,/"spotter":true/);
 await apply('spotter',{action:'ready',value:false});assert.equal(r.ready.spotter,false);await apply('driver',{action:'ready',value:true});assert.equal((await f.change('driver',r,{action:'move'})).status,409);
 await apply('spotter',{action:'ready',value:true});await apply('spotter',{action:'sign',strokes});assert.ok(r.signatures.spotter);assert.equal(r.completedAt,undefined);
 await apply('spotter',{action:'ready',value:false});assert.equal(r.signatures.spotter,undefined);assert.equal((await f.change('driver',r,{action:'move'})).status,409);
 await apply('spotter',{action:'ready',value:true});await apply('spotter',{action:'sign',strokes});await apply('driver',{action:'move'});
 assert.equal((await f.change('spotter',r,{action:'ready',value:false})).status,409);
 assert.equal((await f.change('driver',r,{action:'sign',strokes})).status,400);
 assert.equal((await f.change('driver',r,{action:'dock'})).status,409);
 await apply('driver',{action:'answer',itemId:'floor',value:true});await apply('driver',{action:'dock'});
 for(const q of items.filter(x=>x.phase==='after'))await apply('driver',{action:'answer',itemId:q.id,value:true});
 await apply('driver',{action:'sign',strokes});assert.ok(r.completedAt);await f.service.deliver(r.id);r=f.service.get(r.id);assert.equal(r.delivery.status,'sent');assert.equal(f.uploads(),1);assert.equal(r.delivery.discord,undefined);
 await f.service.deliver(r.id);assert.equal(f.uploads(),1);assert.equal((await f.request('driver','/records/'+r.id+'/pdf')).data.subarray(0,4).toString(),'%PDF');
 const dashboard=await f.request('lake','/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.daily.length,7);assert.equal(dashboard.data.daily.at(-1).submittedFlights,1);assert.equal(dashboard.data.daily.at(-1).driveSaved,1);
 assert.equal((await f.request('driver','/dashboard')).status,403);assert.equal((await f.request('lake','/dashboard?end=bad')).status,400);
 assert.equal((await f.change('driver',r,{action:'dock'})).status,409);abort.abort();
});
test('dashboard independent station/account filters and overall totals count flights within each scope',async t=>{
 const f=await fixture(t);for(const [user,bridge] of [['driver','L1'],['driver','L2'],['other','L1'],['account','L1']]){
  const r=(await f.create(user,bridge)).data;r.completedAt='2026-10-21T17:00:00Z';r.delivery={status:'sent'};f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 }
 const overall=(await f.request('lake','/dashboard')).data;assert.equal(overall.byScope.length,3);assert.equal(overall.daily.at(-1).expectedFlights,3);assert.equal(overall.daily.at(-1).submittedFlights,3);assert.equal(overall.daily.at(-1).submittedChecklists,4);
 const lax=(await f.request('lake','/dashboard?station=LAX&account=ALL')).data;assert.equal(lax.byScope.length,2);assert.equal(lax.daily.at(-1).submittedFlights,2);assert.equal(lax.daily.at(-1).submittedChecklists,3);
 const mu=(await f.request('lake','/dashboard?station=ALL&account=MU')).data;assert.equal(mu.daily.at(-1).submittedFlights,2);
 const sfo=(await f.request('lake','/dashboard?station=SFO&account=MU')).data;assert.equal(sfo.daily.at(-1).submittedFlights,1);assert.equal(sfo.daily.at(-1).expectedFlights,1);
});
test('Drive failures keep submitted records and stable upload IDs for retry and stats',async t=>{
 const f=await fixture(t,{failUpload:true});let r=(await f.create()).data;
 r.completedAt='2026-10-21T17:00:00Z';r.movingAt=r.dockedAt=r.completedAt;r.answers={driver:Object.fromEntries(items.filter(q=>q.role==='driver').map(q=>[q.id,true])),spotter:Object.fromEntries(items.filter(q=>q.role==='spotter').map(q=>[q.id,true]))};r.ready={driver:true,spotter:true};r.signatures=Object.fromEntries(['driver','spotter'].map(role=>[role,{name:'TEST '+role.toUpperCase(),eid:'123',strokes,at:r.completedAt,pbbId:'PBB-fixture',pbbExpiry:'2026-10-21'}]));f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 await f.service.deliver(r.id);r=f.service.get(r.id);assert.equal(r.delivery.status,'failed');assert.equal(r.delivery.fileId,'fake-id');
 let stats=(await f.request('lake','/dashboard')).data.daily.at(-1);assert.equal(stats.submittedChecklists,1);assert.equal(stats.driveSaved,0);
 f.recover();await f.service.deliver(r.id);assert.equal(f.service.get(r.id).delivery.status,'sent');stats=(await f.request('lake','/dashboard')).data.daily.at(-1);assert.equal(stats.driveSaved,1);
});
