const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3');
const {createEmployeeStore}=require('../employees'),{registerHasPbb}=require('../hasPbb');
const items=require('../public/public/has-pbb-data').filter(q=>q.type==='arrival'),strokes=[[[.1,.2],[.4,.6],[.8,.1]]];
test('Dashboard Config counts paired flights once using Inbound weekdays and enforces access/revisions',async t=>{
 const f=await fixture(t),config=(await f.request('lake','/dashboard/config')).data;
 assert.deepEqual(config.pairs,[]);assert.equal((await f.request('driver','/dashboard/config')).status,403);assert.equal((await f.request('driver','/dashboard/config',{revision:config.revision,pairs:[]})).status,403);
 const pairs=[{id:'mu',station:'LAX',account:'MU',inbound:{flightNo:'MU583',days:[1,3,5]},outbound:{flightNo:'MU586',days:[2,4,6]}},{id:'xx',station:'SFO',account:'XX',inbound:{flightNo:'XX101',days:[7]},outbound:{flightNo:'XX102',days:[7]}}];
 const saved=await f.request('lake','/dashboard/config',{revision:config.revision,pairs});assert.equal(saved.status,200);assert.deepEqual((await f.request('lake','/dashboard/config')).data.pairs,pairs);
 const context=(await f.request('driver','/context')).data;
 assert.deepEqual(context.flightSchedule,[pairs[0]]);
 assert.deepEqual((await f.request('other','/context')).data.flightSchedule,[]);
 assert.equal((await f.request('lake','/dashboard/config',{revision:config.revision,pairs:[]})).status,409);
 const stats=(await f.request('lake','/dashboard?start=2026-10-19&end=2026-10-25')).data;assert.deepEqual(stats.daily.map(d=>d.expectedFlights),[1,0,1,0,1,0,1]);assert.equal(stats.byScope.find(s=>s.station==='LAX'&&s.account==='MU').expectedFlights,3);assert.equal(stats.byScope.find(s=>s.station==='SFO'&&s.account==='XX').expectedFlights,1);
 const filtered=(await f.request('lake','/dashboard?station=LAX&account=MU&start=2026-10-19&end=2026-10-25')).data;assert.equal(filtered.daily.reduce((n,d)=>n+d.expectedFlights,0),3);
 assert.equal(filtered.byScope[0].weeklyArrivals,3);assert.equal(filtered.byScope[0].weeklyDepartures,3);
 for(const bad of [{...pairs[0],inbound:{flightNo:'MU583',days:[]}},{...pairs[0],outbound:{flightNo:'MU586',days:[8]}},{...pairs[0],inbound:{flightNo:'BAD',days:[1]}},{...pairs[0],inbound:{flightNo:'MU583',days:[1,1]}}])assert.equal((await f.request('lake','/dashboard/config',{revision:saved.data.revision,pairs:[bad]})).status,400);
 assert.equal((await f.request('lake','/dashboard/config',{revision:saved.data.revision,pairs:[pairs[0],{...pairs[0],id:'dup'}]})).status,400);
 assert.equal((await f.request('lake','/dashboard/config',{revision:saved.data.revision,pairs:[]})).status,200);assert.equal((await f.request('lake','/dashboard')).data.daily.reduce((n,d)=>n+d.expectedFlights,0),0);
});
test('LAX terminal certificates have inclusive boundaries and never substitute for each other',async t=>{
 const license=require('../public/public/pbb-terminal-license'),f=await fixture(t);
 for(const gate of ['131','159','159A'])assert.equal(license.terminal('LAX',gate),'TBIT');
 for(const gate of ['201','225','225A'])assert.equal(license.terminal('LAX',gate),'MSC');
 for(const gate of ['130','160','200','226','TBA','132BAD'])assert.equal(license.terminal('LAX',gate),null);
 const gateBody={role:'driver',flightNo:'MU583',gate:'201'};
 assert.equal((await f.request('driver','/gate',gateBody)).status,403);
 assert.equal((await f.request('driver','/records',{...gateBody,bridge:'L1'})).status,403);
 let data=f.employees.get(),e=data.employees.find(e=>e.id==='driver');e.pbbMscId='MSC-1091';e.pbbMscExpiry='2027-01-31';e.pbbExpiry='2026-10-20';f.employees.save(data,{email:'lake@mu.com'});
 assert.equal((await f.request('driver','/context')).data.employee.driver,true);assert.equal((await f.request('driver','/context')).data.employee.pbbMscId,'MSC-1091');
 assert.equal((await f.request('driver','/gate',{...gateBody,gate:'132'})).status,403);assert.equal((await f.request('driver','/gate',gateBody)).status,200);
 let r=(await f.request('driver','/records',{...gateBody,bridge:'L1'})).data;const apply=async(user,body)=>{const response=await f.change(user,r,body);assert.equal(response.status,200,JSON.stringify(response));r=response.data;};
 for(const role of ['driver','spotter']){for(const q of items.filter(q=>q.role===role&&q.phase==='pre'&&!q.hidden))await apply(role,{action:'answer',itemId:q.id,value:true});await apply(role,{action:'ready',value:true});}
 await apply('spotter',{action:'sign',strokes});await apply('driver',{action:'move'});assert.deepEqual(r.driverQualification,{terminal:'MSC',id:'MSC-1091',expiry:'2027-01-31'});
 await apply('driver',{action:'answer',itemId:'floor',value:true});await apply('driver',{action:'dock'});for(const q of items.filter(q=>q.role==='driver'&&q.phase==='after'))await apply('driver',{action:'answer',itemId:q.id,value:true});
 await apply('driver',{action:'sign',strokes});assert.equal(r.signatures.driver.pbbId,'MSC-1091');assert.equal(r.signatures.driver.pbbTerminal,'MSC');
 const pdf=await require('../hasPbbPdf').buildHasPbbPdf(r);assert.ok(pdf.length>1000);
 data=f.employees.get();e=data.employees.find(e=>e.id==='driver');e.pbbMscExpiry='2026-10-20';e.pbbExpiry='2027-01-31';f.employees.save(data,{email:'lake@mu.com'});
 assert.equal((await f.request('driver','/records',{role:'driver',flightNo:'MU999',gate:'225A',bridge:'L2'})).status,403);
 const nonLax=(await f.request('other','/records',{role:'driver',flightNo:'MU999',gate:'999',bridge:'L2'}));assert.equal(nonLax.status,201);
});
test('MSC employee fields persist, validate independently and cannot be silently removed by older clients',async t=>{
 const f=await fixture(t);let data=f.employees.get(),e=data.employees.find(e=>e.id==='driver');e.pbbMscId='MSC-TEST';e.pbbMscExpiry='2027-03-01';let saved=f.employees.save(data,{email:'lake@mu.com'});
 e=saved.employees.find(e=>e.id==='driver');assert.equal(e.pbbId,'PBB-driver');assert.equal(e.pbbMscId,'MSC-TEST');delete e.pbbMscId;delete e.pbbMscExpiry;saved=f.employees.save(saved,{email:'lake@mu.com'});assert.equal(saved.employees.find(e=>e.id==='driver').pbbMscId,'MSC-TEST');
 for(const values of [{pbbMscId:'ONLY',pbbMscExpiry:''},{pbbMscId:'TEST',pbbMscExpiry:'2027-02-30'},{pbbMscId:'',pbbMscExpiry:'2027-01-01'}]){data=f.employees.get();Object.assign(data.employees.find(e=>e.id==='driver'),values);assert.throws(()=>f.employees.save(data,{email:'lake@mu.com'}),/MSC/);}
});
test('NO requires a real photo and reason, retains resolved evidence, rejects stale updates and clears on reset',async t=>{
 const f=await fixture(t);let r=(await f.create()).data;const body={role:'driver',revision:r.revision,action:'answer',itemId:'serviceable',value:false};
 for(const evidence of [null,{}, {reason:'Problem',photo:'data:image/jpeg;base64,YmFk'}, {reason:' ',photo:'data:image/png;base64,AAAA'}]){const res=await f.request('driver','/records/'+r.id,{...body,evidence});assert.equal(res.status,400);assert.equal(f.service.get(r.id).revision,r.revision);}
 let response=await f.change('driver',r,{action:'answer',itemId:'serviceable',value:false});assert.equal(response.status,200);r=response.data;const report=r.evidence.driver.serviceable;
 assert.equal(r.answers.driver.serviceable,false);assert.equal(report.reason,'Fixture obstruction');assert.match(report.photo,/^data:image\/jpeg;base64,/);assert.equal(report.employeeId,'driver');
 assert.equal((await f.request('account','/records/'+r.id)).status,403);const prior=r;r=(await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).data;assert.ok(r.evidence.driver.serviceable.resolvedAt);assert.equal(r.evidence.driver.serviceable.photo,report.photo);
 assert.equal((await f.change('driver',prior,{action:'answer',itemId:'serviceable',value:false})).status,409);
 response=await f.request('spotter','/records/'+r.id+'/reset',{role:'spotter',revision:r.revision});assert.equal(response.status,200);assert.equal(response.data.evidence,undefined);
});
test('manual Arrival bridge reset clears only its generation and publishes shared state',async t=>{
 const f=await fixture(t);let r=(await f.create()).data;const sibling=(await f.create('driver','L2')).data,foreign=(await f.create('account')).data;
 await f.request('driver','/gate',{role:'driver',flightNo:'MU583',gate:'132'});
 r.answers.driver.serviceable=true;r.ready.driver=true;r.owners.driver='driver';r.signatures.driver={name:'TEST'};r.movingAt=r.dockedAt=r.completedAt='fixture';r.delivery={status:'sent',fileId:'old'};
 f.db.prepare('UPDATE has_pbb_records SET data=?,pdf=? WHERE id=?').run(JSON.stringify(r),Buffer.from('PDF'),r.id);
 for(const user of ['other','account'])assert.equal((await f.request(user,'/records/'+r.id+'/reset',{role:'driver',revision:r.revision})).status,403);
 assert.equal((await f.request('expired','/records/'+r.id+'/reset',{role:'driver',revision:r.revision})).status,403);
 assert.equal((await f.request('driver','/records/'+r.id+'/reset',{role:'driver',revision:r.revision-1})).status,409);
 const abort=new AbortController();t.after(()=>abort.abort());const response=await fetch(f.base+'/has-pbb-api/stream?id='+r.id,{headers:{Authorization:'Bearer spotter'},signal:abort.signal}),reader=response.body.getReader();await reader.read();
 const result=await f.request('spotter','/records/'+r.id+'/reset',{role:'spotter',revision:r.revision});assert.equal(result.status,200);const fresh=result.data;
 assert.equal(fresh.id,r.id);assert.equal(fresh.gate,'132');assert.equal(fresh.revision,r.revision+1);assert.equal(fresh.resetBy,'spotter');assert.ok(fresh.resetToken);
 assert.deepEqual(fresh.answers,{driver:{},spotter:{}});assert.deepEqual(fresh.signatures,{});assert.deepEqual(fresh.owners,{});assert.deepEqual(fresh.ready,{driver:null,spotter:null});assert.deepEqual(fresh.delivery,{status:'pending'});
 for(const key of ['movingAt','dockedAt','completedAt','driverQualification'])assert.equal(fresh[key],undefined);
 assert.equal(f.db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf,null);assert.deepEqual(f.service.get(sibling.id),sibling);assert.deepEqual(f.service.get(foreign.id),foreign);
 assert.equal((await f.request('driver','/context')).data.gateLocks[0].gate,'132');assert.equal((await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).status,409);
 assert.match(new TextDecoder().decode((await reader.read()).value),new RegExp(fresh.resetToken));abort.abort();
 f.setTime('2026-10-22T17:00:00Z');assert.equal((await f.request('spotter','/records/'+r.id+'/reset',{role:'spotter',revision:fresh.revision})).status,409);
});
test('manual reset protects a concurrent answer and prevents stale PDF delivery restoration',async t=>{
 let release,started;const ready=new Promise(resolve=>started=resolve),f=await fixture(t,{buildPdf:()=>new Promise(resolve=>{release=resolve;started();})});let r=(await f.create()).data;
 const changed=(await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).data;
 assert.equal((await f.request('spotter','/records/'+r.id+'/reset',{role:'spotter',revision:r.revision})).status,409);assert.equal(f.service.get(r.id).answers.driver.serviceable,true);
 r={...changed,completedAt:'fixture'};f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);const job=f.service.deliver(r.id);await ready;
 const fresh=(await f.request('spotter','/records/'+r.id+'/reset',{role:'spotter',revision:r.revision})).data;release(Buffer.from('obsolete PDF'));await job;
 assert.deepEqual(f.service.get(r.id),fresh);assert.equal(f.uploads(),0);assert.equal(f.db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf,null);
});
async function fixture(t,{failUpload=false,buildPdf}={}){
 const db=new Database(':memory:');let now=new Date('2026-10-21T17:00:00Z'),uploads=0;
 const seed=[['driver','LAX','MU'],['spotter','LAX','MU'],['other','SFO','MU'],['account','LAX','XX'],['expired','LAX','MU'],['missing','LAX','MU']].map(([id,station,account])=>({id,position:['driver','other','account'].includes(id)?'Manager':'Agent',name:'TEST '+id.toUpperCase(),eid:'123',station,account,attach:true,detach:true,spotter:true,pbbId:id==='missing'?'':'PBB-'+id,pbbExpiry:id==='missing'?'':id==='expired'?'2026-10-20':'2026-10-21'}));
 const employees=createEmployeeStore(db,{seed});const profiles={status:()=>{},linked:u=>employees.get().employees.find(e=>e.id===u.uid)};
 const app=express();app.use(express.json({limit:'2mb'}));const service=registerHasPbb(app,{store:{db,now:()=>now},employees,profiles,authenticate:async req=>{const uid=req.headers.authorization?.replace('Bearer ','');if(!uid)throw Error('Sign in required');return {uid,email:uid==='lake'?'lake@mu.com':uid==='demo'?'demo@hm.com':uid+'@test.invalid'};},...(buildPdf?{buildPdf}:{}),drive:{files:{generateIds:async()=>({data:{ids:['fake-id']}}),get:async()=>{throw {code:404};},create:async()=>{uploads++;if(failUpload)throw Error('fixture upload failure');return {data:{id:'fake-id'}};}}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(()=>{service.close();server.closeAllConnections();server.close();db.close();});
 const request=async(user,path='',body,method)=>{if(body?.action==='answer'&&body.value===false&&body.evidence===undefined)body={...body,evidence:{reason:'Fixture obstruction',photo:'data:image/webp;base64,'+require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/public/assets/pbb/has-crew-acknowledgment-v1.webp')).toString('base64')}};const res=await fetch(base+'/has-pbb-api'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():Buffer.from(await res.arrayBuffer())};};
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
 await apply('driver',{action:'sign',strokes});assert.ok(r.completedAt);await f.service.deliver(r.id);r=f.service.get(r.id);assert.equal(r.delivery.status,'sent');assert.equal(f.uploads(),1);assert.equal(r.delivery.discord,undefined);assert.equal((await require('../vendor/pdf-lib/pdf-lib').PDFDocument.load(f.db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf)).getPageCount(),2);
 await f.service.deliver(r.id);assert.equal(f.uploads(),1);assert.equal((await f.request('driver','/records/'+r.id+'/pdf')).data.subarray(0,4).toString(),'%PDF');
 const dashboard=await f.request('lake','/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.daily.length,7);assert.equal(dashboard.data.daily.at(-1).submittedFlights,1);assert.equal(dashboard.data.daily.at(-1).driveSaved,1);
 assert.equal((await f.request('driver','/dashboard')).status,403);assert.equal((await f.request('lake','/dashboard?end=bad')).status,400);
 assert.equal((await f.change('driver',r,{action:'dock'})).status,409);abort.abort();
});
test('dashboard independent station/account filters and overall totals count flights within each scope',async t=>{
 const f=await fixture(t);for(const [user,bridge] of [['driver','L1'],['driver','L2'],['other','L1'],['account','L1']]){
  const r=(await f.create(user,bridge)).data;r.completedAt='2026-10-21T17:00:00Z';r.delivery={status:'sent'};f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 }
 const overall=(await f.request('lake','/dashboard')).data;assert.equal(overall.byScope.length,3);assert.equal(overall.daily.at(-1).expectedFlights,0);assert.equal(overall.daily.at(-1).submittedFlights,3);assert.equal(overall.daily.at(-1).submittedChecklists,4);
 const lax=(await f.request('lake','/dashboard?station=LAX&account=ALL')).data;assert.equal(lax.byScope.length,2);assert.equal(lax.daily.at(-1).submittedFlights,2);assert.equal(lax.daily.at(-1).submittedChecklists,3);
 const mu=(await f.request('lake','/dashboard?station=ALL&account=MU')).data;assert.equal(mu.daily.at(-1).submittedFlights,2);
 const sfo=(await f.request('lake','/dashboard?station=SFO&account=MU')).data;assert.equal(sfo.daily.at(-1).submittedFlights,1);assert.equal(sfo.daily.at(-1).expectedFlights,0);
});
test('Drive failures keep submitted records and stable upload IDs for retry and stats',async t=>{
 const f=await fixture(t,{failUpload:true});let r=(await f.create()).data;
 r.completedAt='2026-10-21T17:00:00Z';r.movingAt=r.dockedAt=r.completedAt;r.answers={driver:Object.fromEntries(items.filter(q=>q.role==='driver').map(q=>[q.id,true])),spotter:Object.fromEntries(items.filter(q=>q.role==='spotter').map(q=>[q.id,true]))};r.ready={driver:true,spotter:true};r.signatures=Object.fromEntries(['driver','spotter'].map(role=>[role,{name:'TEST '+role.toUpperCase(),eid:'123',strokes,at:r.completedAt,pbbId:'PBB-fixture',pbbExpiry:'2026-10-21'}]));f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 await f.service.deliver(r.id);r=f.service.get(r.id);assert.equal(r.delivery.status,'failed');assert.equal(r.delivery.fileId,'fake-id');
 let stats=(await f.request('lake','/dashboard')).data.daily.at(-1);assert.equal(stats.submittedChecklists,1);assert.equal(stats.driveSaved,0);
 f.recover();await f.service.deliver(r.id);assert.equal(f.service.get(r.id).delivery.status,'sent');stats=(await f.request('lake','/dashboard')).data.daily.at(-1);assert.equal(stats.driveSaved,1);
});

test('combined stopped/chocks question atomically saves both checks and NO blocks Ready',async t=>{
 const f=await fixture(t);let r=(await f.create('spotter')).data;
 const change=async body=>{const result=await f.change('spotter',r,body);assert.equal(result.status,200);r=result.data;};
 assert.equal(items.filter(q=>q.role==='spotter'&&q.phase==='pre'&&!q.hidden).length,4);
 assert.equal(items.find(q=>q.id==='stopped').photo,'aircraft-chocks-lax-v2.webp');
 for(const q of items.filter(q=>q.role==='spotter'&&q.phase==='pre'&&!q.hidden))await change({action:'answer',itemId:q.id,value:true});
 assert.equal(r.answers.spotter.stopped,true);assert.equal(r.answers.spotter.chocks,true);
 await change({action:'ready',value:true});
 await change({action:'answer',itemId:'stopped',value:false});
 assert.equal(r.answers.spotter.stopped,false);assert.equal(r.answers.spotter.chocks,false);assert.equal(r.ready.spotter,null);
 assert.equal((await f.change('spotter',r,{action:'ready',value:true})).status,400);
 await change({action:'answer',itemId:'stopped',value:true});await change({action:'ready',value:true});
 assert.equal(r.ready.spotter,true);
});

test('changing gate resets only the scoped bridge, clears PDF/signatures and publishes the fresh revision',async t=>{
 const f=await fixture(t);let r=(await f.create()).data;
 const other=(await f.create('driver','L2')).data,foreign=(await f.create('account')).data;
 r.answers.driver.serviceable=true;r.ready.driver=true;r.owners.driver='driver';r.signatures.driver={name:'TEST'};r.movingAt=r.dockedAt=r.completedAt='fixture';r.driverQualification={id:'OLD'};r.delivery={status:'sent',fileId:'old-pdf'};
 f.db.prepare('UPDATE has_pbb_records SET data=?,pdf=? WHERE id=?').run(JSON.stringify(r),Buffer.from('old PDF'),r.id);
 const abort=new AbortController();t.after(()=>abort.abort());const stream=await fetch(f.base+'/has-pbb-api/stream?id='+r.id,{headers:{Authorization:'Bearer spotter'},signal:abort.signal});const reader=stream.body.getReader();await reader.read();
 const reset=await f.request('spotter','/records',{role:'spotter',flightNo:'MU583',gate:'134',bridge:'L1'});assert.equal(reset.status,201);const fresh=reset.data;
 assert.equal(fresh.id,r.id);assert.equal(fresh.gate,'134');assert.equal(fresh.revision,r.revision+1);assert.ok(fresh.resetToken);
 for(const key of ['movingAt','dockedAt','completedAt','driverQualification'])assert.equal(fresh[key],undefined);
 assert.deepEqual(fresh.answers,{driver:{},spotter:{}});assert.deepEqual(fresh.ready,{driver:null,spotter:null});assert.deepEqual(fresh.signatures,{});assert.deepEqual(fresh.owners,{});assert.deepEqual(fresh.delivery,{status:'pending'});assert.equal(f.db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf,null);
 assert.equal((await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).status,409);
 assert.equal(f.service.get(other.id).gate,'132');assert.equal(f.service.get(foreign.id).gate,'132');
 const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/"gate":"134"/);assert.match(event,/"answers":\{"driver":\{\},"spotter":\{\}\}/);
 const same=(await f.request('driver','/records',{role:'driver',flightNo:'MU583',gate:'134',bridge:'L1'})).data;assert.equal(same.revision,fresh.revision);assert.equal(same.resetToken,fresh.resetToken);abort.abort();
});
test('a PDF job started before a gate reset cannot restore obsolete answers or delivery',async t=>{
 let release,started;const ready=new Promise(resolve=>started=resolve);let builds=0;
 const f=await fixture(t,{buildPdf:()=>++builds===1?new Promise(resolve=>{release=resolve;started();}):Promise.resolve(Buffer.from('new PDF'))});
 const r=(await f.create()).data;r.completedAt='fixture';f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 const job=f.service.deliver(r.id);await ready;
 const fresh=(await f.request('driver','/records',{role:'driver',flightNo:'MU583',gate:'136',bridge:'L1'})).data;release(Buffer.from('old PDF'));await job;
 assert.deepEqual(f.service.get(r.id),fresh);assert.equal(f.uploads(),0);assert.equal(f.db.prepare('SELECT pdf FROM has_pbb_records WHERE id=?').get(r.id).pdf,null);
 fresh.completedAt='new';f.db.prepare('UPDATE has_pbb_records SET data=? WHERE id=?').run(JSON.stringify(fresh),fresh.id);await f.service.deliver(fresh.id);assert.equal(f.uploads(),1);assert.equal(f.service.get(fresh.id).gate,'136');assert.equal(f.service.get(fresh.id).delivery.status,'sent');
});

test('gate locks persist for exactly two hours from first confirmation, isolate scopes and support manual clear',async t=>{
 const f=await fixture(t),body={role:'driver',flightNo:'MU583',gate:'132'};
 const first=await f.request('driver','/gate',body);assert.equal(first.status,200);const lock=first.data.gateLocks[0];assert.equal(lock.expiresAt,'2026-10-21T19:00:00.000Z');
 assert.equal((await f.request('spotter','/context')).data.gateLocks[0].gate,'132');assert.equal((await f.request('account','/context')).data.gateLocks.length,0);assert.equal((await f.request('other','/context')).data.gateLocks.length,0);
 f.setTime('2026-10-21T18:00:00Z');assert.deepEqual((await f.request('driver','/gate',body)).data.gateLocks[0],lock);
 assert.equal((await f.request('driver','/gate',{...body,gate:'134'})).status,409);
 assert.equal((await f.request('driver','/records',{...body,gate:'134',bridge:'L1'})).status,409);
 await f.request('account','/gate/clear',{flightNo:'MU583'});assert.equal((await f.request('driver','/context')).data.gateLocks.length,1);
 f.setTime('2026-10-21T18:59:59Z');assert.equal((await f.request('driver','/context')).data.gateLocks.length,1);
 f.setTime('2026-10-21T19:00:00Z');assert.equal((await f.request('driver','/context')).data.gateLocks.length,0);
 await f.request('driver','/gate',{...body,gate:'134'});assert.equal((await f.request('driver','/context')).data.gateLocks[0].gate,'134');await f.request('spotter','/gate/clear',{flightNo:'MU583'});assert.equal((await f.request('driver','/context')).data.gateLocks.length,0);
 assert.equal((await f.request('expired','/gate',body)).status,403);assert.equal((await f.request('driver','/gate',{...body,gate:'bad gate'})).status,400);
});

test('Departure is isolated and gates movement on four Driver checks and Spotter readiness/signature',async t=>{
 const f=await fixture(t),arrival=(await f.create()).data;
 const created=await f.request('driver','/records',{flightNo:arrival.flightNo,gate:arrival.gate,bridge:arrival.bridge,role:'driver',type:'departure'});
 assert.equal(created.status,201);let r=created.data;assert.notEqual(r.id,arrival.id);assert.equal(r.type,'departure');
 const apply=async(user,body)=>{const result=await f.change(user,r,body);assert.equal(result.status,200,JSON.stringify(result));r=result.data;};
 assert.equal((await f.change('driver',r,{action:'answer',itemId:'serviceable',value:true})).status,400);
 assert.equal((await f.change('driver',r,{action:'move'})).status,409);
 for(const id of ['d1','d2','d3','d4'])await apply('driver',{action:'answer',itemId:id,value:true});
 await apply('driver',{action:'ready',value:true});
 await apply('spotter',{action:'answer',itemId:'d6',value:true});await apply('spotter',{action:'ready',value:true});
 assert.equal(r.ready.spotter,true);
 await apply('spotter',{action:'sign',strokes});await apply('driver',{action:'move'});await apply('driver',{action:'dock'});
 for(const id of ['d10','d11'])await apply('driver',{action:'answer',itemId:id,value:true});
 await apply('driver',{action:'sign',strokes});assert.ok(r.completedAt);await f.service.deliver(r.id);assert.equal(f.service.get(r.id).delivery.status,'sent');assert.equal(f.service.get(arrival.id).movingAt,undefined);
});

test('HAS Driver needs only a valid terminal ID; all linked employees may be Spotters',async t=>{const f=await fixture(t),d=f.employees.get();for(const e of d.employees){e.attach=false;e.detach=false;e.spotter=false;}f.employees.save(d,{email:'lake@mu.com'});const ctx=(await f.request('driver','/context')).data;assert.equal(ctx.employee.driver,true);assert.equal(ctx.employee.spotter,true);assert.equal((await f.create('driver')).status,201);assert.equal((await f.create('missing')).status,403);const opened=await f.request('missing','/records',{role:'spotter',flightNo:'MU583',gate:'132',bridge:'L2'});assert.equal(opened.status,201);const answered=await f.request('missing','/records/'+opened.data.id,{role:'spotter',revision:opened.data.revision,action:'answer',itemId:'cables',value:true});assert.equal(answered.status,200);});

test('Gate confirmations and clears immediately broadcast scoped snapshots to a second employee',async t=>{const f=await fixture(t),abort=new AbortController();t.after(()=>abort.abort());const timeout=setTimeout(()=>abort.abort(),8000);timeout.unref();t.after(()=>clearTimeout(timeout));const response=await fetch(f.base+'/has-pbb-api/stream',{headers:{Authorization:'Bearer spotter'},signal:abort.signal}),reader=response.body.getReader();let buffer='';const until=async text=>{while(!buffer.includes(text)){const {value,done}=await reader.read();assert.equal(done,false);buffer+=new TextDecoder().decode(value);}const output=buffer;buffer='';return output;};await until('event: gates');const confirmed=await f.request('driver','/gate',{role:'driver',flightNo:'MU583',gate:'132'});assert.equal(confirmed.status,200);const gateEvent=await until('MU583');assert.match(gateEvent,/event: gates/);assert.match(gateEvent,/132/);assert.deepEqual((await f.request('other','/context')).data.gateLocks,[]);const cleared=await f.request('driver','/gate/clear',{flightNo:'MU583'});assert.equal(cleared.status,200);assert.match(await until('event: gates'),/"gateLocks":\[\]/);abort.abort();});

test('demo dashboard permission is read-only and does not grant Config access',async t=>{const f=await fixture(t);assert.equal((await f.request('demo','/dashboard')).status,200);assert.equal((await f.request('demo','/dashboard/config')).status,403);assert.equal((await f.request('demo','/dashboard/config',{revision:1,pairs:[]})).status,403);assert.equal((await f.request('driver','/dashboard')).status,403);});
test('Ready immediately authorizes movement and Spotter can sign after Driver finishes',async t=>{const f=await fixture(t);let r=(await f.create()).data;const apply=async(user,body)=>{const response=await f.change(user,r,body);assert.equal(response.status,200,JSON.stringify(response));r=response.data;};for(const role of ['driver','spotter'])for(const q of items.filter(x=>x.role===role&&x.phase==='pre'))await apply(role,{action:'answer',itemId:q.id,value:true});await apply('driver',{action:'ready',value:true});await apply('spotter',{action:'ready',value:true});assert.equal(r.signatures.spotter,undefined);await apply('driver',{action:'move'});assert.ok(r.movingAt);await apply('driver',{action:'answer',itemId:'floor',value:true});await apply('driver',{action:'dock'});for(const q of items.filter(x=>x.role==='driver'&&x.phase==='after'))await apply('driver',{action:'answer',itemId:q.id,value:true});await apply('driver',{action:'sign',strokes});assert.equal(r.completedAt,undefined);await apply('spotter',{action:'sign',strokes});assert.ok(r.completedAt);await f.service.deliver(r.id);});
