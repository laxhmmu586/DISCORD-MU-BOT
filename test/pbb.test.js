const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createStore,registerPbb}=require('../pbb'),{createEmployeeStore}=require('../employees'),items=require('../public/public/pbb-data');
const admin={uid:'admin',email:'lake@mu.com'},driver={uid:'driver',email:'driver@mu.com'},spotter={uid:'spotter',email:'spotter@mu.com'};
const info={type:'arrival',flightNo:'MU583',date:'2026-10-13',gate:'132',blockTime:'09:05',bridges:['L2']};
const employeeSeed=require('./fixtures/pbb-employees.json');
const strokes=[[[.1,.2],[.3,.5],[.6,.1]]];
test('role isolation, shared confirmations, sign-off, immutable completed records and durable PDFs',()=>{
 const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});let r=store.create(info,admin);
 assert.throws(()=>store.mutate(r.id,driver,{action:'answer',role:'driver',itemId:'a8',value:'Y'}),/not assigned/);
 assert.throws(()=>store.mutate(r.id,driver,{action:'sign',role:'driver',name:'A',strokes}),/Complete all/);
 r=store.mutate(r.id,driver,{action:'claim',role:'driver'});assert.equal(r.answers.spotter.a1,'Y');
 assert.throws(()=>store.mutate(r.id,spotter,{action:'answer',role:'driver',itemId:'a1',value:'N',note:'test'}),/not assigned/);
 assert.throws(()=>store.mutate(r.id,driver,{action:'answer',role:'spotter',itemId:'a1',value:'Y'}),/assigned/);
 assert.equal(store.mutate(r.id,driver,{action:'answer',role:'driver',itemId:'a3',value:'N'}).answers.driver.a3,'N');
 store.mutate(r.id,spotter,{action:'claim',role:'spotter'});
 for(const role of ['driver','spotter'])for(const item of items.arrival.filter(x=>x.id!=='a1'&&!x.hidden&&x.roles.includes(role)))store.mutate(r.id,role==='driver'?driver:spotter,{action:'answer',role,itemId:item.id,value:'Y'});
 store.mutate(r.id,spotter,{action:'signal',role:'spotter',phase:'safe'});store.mutate(r.id,driver,{action:'signal',role:'driver',phase:'go'});
 r=store.mutate(r.id,driver,{action:'sign',role:'driver',name:'Driver',strokes,eid:'123456'});assert.ok(!r.completedAt);
 assert.throws(()=>store.mutate(r.id,driver,{action:'answer',role:'driver',itemId:'a1',value:'NA'}),/locked/);
 r=store.mutate(r.id,spotter,{action:'sign',role:'spotter',name:'Spotter',strokes});assert.ok(r.completedAt);
 assert.throws(()=>store.mutate(r.id,spotter,{action:'answer',role:'spotter',itemId:'a1',value:'Y'}),/locked/);
 store.setPdf(r.id,Buffer.from('pdf'));assert.equal(store.pdf(r.id).toString(),'pdf');store.db.close();
});
test('employee seed, exact string IDs, qualified-only options and concurrent admin save protection',()=>{
 const s=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')}),employees=createEmployeeStore(s.db,{seed:employeeSeed}),data=employees.get();assert.equal(data.employees.length,29);assert.equal(data.employees[0].discordId,'900000000000000001');assert.equal(employees.options().length,0);
 data.employees[3].attach=true;data.employees[4].spotter=true;const saved=employees.save(data,admin);
 assert.equal(saved.revision,2);assert.equal(employees.options().length,2);assert.equal(employees.options()[0].eid,'123456');assert.equal(employees.options()[0].discordId,undefined);
 assert.throws(()=>employees.save(data,admin),/changed/);s.db.close();
});
test('API protects employee data, SSE publishes snapshots, two-role PDF triggers and retries skip successful targets',async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});let driveWrites=0,discordWrites=0,discordFail=true;
 const integration=registerPbb(app,{store,employeeSeed,authenticate:async req=>{if(req.headers.authorization==='Bearer admin')return admin;if(req.headers.authorization==='Bearer spotter')return spotter;if(req.headers.authorization==='Bearer driver')return driver;throw Error('Unauthenticated');},buildPdf:async()=>Buffer.from('%PDF fixture'),gateService:{read:async()=>({status:'unavailable'}),today:async(date,type)=>({flights:[{flightNo:'MU583',date,gate:'132'}]})},drive:{files:{generateIds:async()=>({data:{ids:['file-id']}}),get:async()=>{throw Object.assign(Error('missing'),{code:404});},create:async payload=>{assert.equal(payload.requestBody.name,'JetBridge-arrival-MU583-2026-10-13-L2.pdf');driveWrites++;return {data:{id:'file-id'}};}}},client:{channels:{fetch:async()=>({isTextBased:()=>true,send:async payload=>{assert.doesNotMatch(payload.content,/(?:^|\n)Record:/);assert.equal(payload.content,'Jet Bridge ARRIVAL | MU583 | 2026-10-13 |\nGate 132 | L2\nDriver: TEST DRIVER ✓\nSpotter: TEST SPOTTER ✓');assert.equal(payload.files[0].name,'JetBridge-arrival-MU583-2026-10-13-L2.pdf');discordWrites++;if(discordFail)throw Error('test failure');return {id:'message-id'};}})}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const api=async(path,who='admin',body)=>fetch(base+path,{headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 try{
 const guest=await (await fetch(base+'/pbb-api/session',{method:'POST'})).json();const publicResponse=await fetch(base+'/pbb-api/records',{headers:{Authorization:'Bearer '+guest.token}});assert.equal(publicResponse.status,200);assert.equal((await fetch(base+'/employee-admin-api',{headers:{Authorization:'Bearer '+guest.token}})).status,401);
 assert.equal((await api('/employee-admin-api','driver')).status,403);assert.equal((await api('/employee-admin-api','bad')).status,401);
 let data=await (await api('/employee-admin-api')).json();data.employees[3].attach=true;data.employees[3].spotter=true;data.employees[4].spotter=true;assert.equal((await api('/employee-admin-api','admin',data)).status,200);
 const r=await (await api('/pbb-api/records','admin',info)).json();const stream=await api('/pbb-api/records/'+r.id+'/stream','driver');assert.match(stream.headers.get('content-type'),/event-stream/);const reader=stream.body.getReader();const initial=await reader.read();assert.match(new TextDecoder().decode(initial.value),/event: state/);
 const lobby=await api('/pbb-api/active/stream?flightNo=MU583&type=arrival','spotter'),lobbyReader=lobby.body.getReader();const lobbyFirst=new TextDecoder().decode((await lobbyReader.read()).value);assert.match(lobbyFirst,/event: rooms/);assert.match(lobbyFirst,/\"L2\"/);
 for(const role of ['driver','spotter'])assert.equal((await api('/pbb-api/records/'+r.id,role,{action:'claim',role})).status,200);
 const rooms=await (await api('/pbb-api/active?flightNo=MU583&type=arrival','spotter')).json();assert.equal(rooms[0].driver.joined,true);assert.equal(rooms[0].spotter.joined,true);assert.equal(rooms[0].answers,undefined);const lobbyUpdate=new TextDecoder().decode((await lobbyReader.read()).value);assert.match(lobbyUpdate,/\"joined\":true/);await lobbyReader.cancel();
 for(const role of ['driver','spotter'])for(const item of items.arrival.filter(x=>x.id!=='a1'&&!x.hidden&&x.roles.includes(role))){assert.equal((await api('/pbb-api/records/'+r.id,role,{action:'answer',role,itemId:item.id,value:'Y'})).status,200);}
 let observed='';for(let i=0;i<10&&!observed.includes('"a1":"Y"');i++){const update=await reader.read();observed+=new TextDecoder().decode(update.value);}assert.match(observed,/"a1":"Y"/);await reader.cancel();
 assert.equal((await api('/pbb-api/records/'+r.id,'driver',{action:'signal',role:'driver',phase:'go'})).status,409);
 await api('/pbb-api/records/'+r.id,'spotter',{action:'signal',role:'spotter',phase:'safe'});await api('/pbb-api/records/'+r.id,'driver',{action:'signal',role:'driver',phase:'go'});
 assert.equal((await api('/pbb-api/records/'+r.id,'driver',{action:'sign',role:'driver',employeeId:'staff-5',strokes})).status,400);
 assert.equal((await api('/pbb-api/records/'+r.id,'driver',{action:'sign',role:'driver',employeeId:'staff-4',name:'Forged',eid:'bad',strokes})).status,200);
 assert.equal(store.get(r.id).signatures.driver.name,'TEST DRIVER');assert.equal(store.get(r.id).signatures.driver.eid,'123456');
 assert.equal((await api('/pbb-api/records/'+r.id,'spotter',{action:'sign',role:'spotter',employeeId:'staff-4',strokes})).status,400);
 await api('/pbb-api/records/'+r.id,'spotter',{action:'sign',role:'spotter',employeeId:'staff-5',strokes});for(let i=0;i<50&&store.get(r.id).delivery.discord.status==='pending';i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(driveWrites,1);assert.equal(discordWrites,1);assert.equal(store.get(r.id).delivery.discord.status,'failed');
 discordFail=false;await Promise.all([integration.deliver(r.id),integration.deliver(r.id)]);assert.equal(driveWrites,1);assert.equal(discordWrites,2);
 const downloaded=await api('/pbb-api/records/'+r.id+'/pdf','driver');assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-disposition'),'attachment; filename="JetBridge-arrival-MU583-2026-10-13-L2.pdf"');
 assert.equal((await api('/pbb-api/records/'+r.id,'driver',{action:'answer',role:'driver',itemId:'a1',value:'N'})).status,409);
 }finally{integration.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();}
});

test('shared buttons fill original rows atomically and enforce operator and departure sequence',()=>{
 const s=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});let r=s.create({...info,type:'departure'},admin);
 assert.throws(()=>s.mutate(r.id,driver,{action:'signal',role:'driver',phase:'go'}),/Wait for/);
 assert.throws(()=>s.mutate(r.id,spotter,{action:'signal',role:'spotter',phase:'ready'}),/other operator/);
 r=s.mutate(r.id,driver,{action:'signal',role:'driver',phase:'ready'});assert.equal(r.answers.driver.d5,'Y');assert.equal(r.answers.spotter.d6,undefined);
 r=s.mutate(r.id,spotter,{action:'signal',role:'spotter',phase:'safe'});assert.equal(r.answers.spotter.d6,'Y');
 r=s.mutate(r.id,driver,{action:'signal',role:'driver',phase:'go'});assert.equal(r.answers.driver.d7,'Y');assert.ok(r.signals.go.at);
 r=s.mutate(r.id,spotter,{action:'answer',role:'spotter',itemId:'d6',value:'N',note:'obstruction'});assert.equal(r.signals.safe,undefined);assert.throws(()=>s.mutate(r.id,driver,{action:'signal',role:'driver',phase:'go'}),/Wait for/);
 const arrival=s.create(info,admin);s.mutate(arrival.id,driver,{action:'claim',role:'driver'});s.mutate(arrival.id,spotter,{action:'claim',role:'spotter'});r=s.mutate(arrival.id,spotter,{action:'signal',role:'spotter',phase:'safe'});assert.equal(r.answers.spotter.a11,'Y');assert.equal(r.answers.spotter.a13,'Y');assert.equal(r.answers.driver.a12,undefined);
 r=s.mutate(arrival.id,driver,{action:'signal',role:'driver',phase:'go'});assert.equal(r.answers.driver.a12,'Y');assert.equal(r.answers.driver.a14,'Y');s.db.close();
});

test('arrival first item is hidden YES by default, date is today and another driver can continue',()=>{
 const s=createStore(':memory:',{now:()=>new Date('2026-10-13T16:30:00Z')});let r=s.create({...info,date:'2020-01-01'},admin);assert.equal(r.date,'2026-10-13');assert.equal(r.answers.driver.a1,'Y');assert.equal(r.answers.spotter.a1,'Y');assert.equal(r.answers.driver.a5,'Y');assert.equal(items.arrival.find(x=>x.id==='a1').hidden,true);
 r=s.mutate(r.id,driver,{action:'claim',role:'driver'});assert.equal(r.owners.driver,driver.uid);assert.equal(s.mutate(r.id,spotter,{action:'claim',role:'driver'}).owners.driver,spotter.uid);assert.equal(s.mutate(r.id,driver,{action:'claim',role:'spotter'}).owners.spotter,driver.uid);assert.throws(()=>s.mutate(r.id,driver,{action:'answer',role:'driver',itemId:'a1',value:'N'}),/assigned/);assert.equal(s.get(r.id).answers.driver.a1,'Y');s.db.close();
});

test('operators opening the same current flight and bridge join one active checklist',()=>{
 const s=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00:00Z')});const first=s.create(info,driver),second=s.create({...info,blockTime:'09:10',date:'2020-01-01'},spotter);assert.equal(first.id,second.id);assert.equal(s.list().length,1);assert.equal(second.blockTime,'');assert.notEqual(s.create({...info,bridges:['L1']},driver).id,first.id);s.db.close();
});

test('Arrival and Departure never collect block time',()=>{
 const s=createStore(':memory:',{now:()=>new Date('2026-10-13T16:00Z')});let r=s.create({...info,role:'spotter',blockTime:undefined},spotter);assert.equal(r.blockTime,'');s.mutate(r.id,spotter,{action:'claim',role:'spotter'});const joined=s.create({...info,role:'driver',blockTime:'09:37'},driver);assert.equal(joined.id,r.id);assert.equal(joined.blockTime,'');assert.equal(s.create({...info,type:'departure',blockTime:undefined},driver).blockTime,'');assert.equal(s.create({...info,role:'driver',bridges:['L1'],blockTime:undefined},driver).blockTime,'');s.db.close();
});

 test('daily bridge stays unique across flight/gate changes, completion, legacy overlaps and next day',()=>{
 let time=new Date('2026-10-13T16:00Z');const s=createStore(':memory:',{now:()=>time});const first=s.create(info,driver);
 assert.equal(s.create({...info,flightNo:'MU577',gate:'131'},spotter).id,first.id);
 assert.throws(()=>s.create({...info,bridges:['L1','L2']},driver),/one jet bridge/);
 s.mutate(first.id,driver,{action:'answer',role:'driver',itemId:'a3',value:'Y'});
 s.mutate(first.id,spotter,{action:'claim',role:'driver'});
 assert.equal(s.get(first.id).answers.driver.a3,'Y');assert.deepEqual(s.get(first.id).participants.driver,['driver','spotter']);
 const completed=s.get(first.id);completed.completedAt=time.toISOString();s.put(completed);
 assert.equal(s.create(info,driver).id,first.id);assert.throws(()=>s.mutate(first.id,spotter,{action:'claim',role:'driver'}),/locked/);
 assert.notEqual(s.create({...info,type:'departure'},driver).id,first.id);
 const legacy=s.create({...info,bridges:['L1']},driver);legacy.bridges=['L1','L3'];s.put(legacy);
 assert.equal(s.create({...info,bridges:['L3']},spotter).id,legacy.id);
 time=new Date('2026-10-14T16:00Z');assert.notEqual(s.create(info,driver).id,first.id);s.db.close();
 });
