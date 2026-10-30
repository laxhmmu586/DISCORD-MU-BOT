const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createFlightService}=require('../has/server/pbbFlights'),{createStore,registerPbb}=require('../has/server/pbb');
const sy=(flight,date,gate,time='10:00:00',origin='LAX')=>`2026 October 13, Tuesday, ${time}\n>SY ${flight}/${date}\n SY: ${flight}/${date} ${origin}/0 OP/TEST\n777/773L/B0000 GTD/${gate} POS/GATE\n*${origin}PVG R000/000/000\n`;
test('Departure uses only matching-day LAX SY flights and newest valid gate, never ETAB',async()=>{
 const log=sy('MU586','13OCT26','131')+sy('MU586','13OCT26','132','11:00:00')+sy('MU578','12OCT26','133')+sy('MU9578','14OCT26','134')+sy('MU9586','13OCT26','135','12:00:00','PVG')+sy('MU583','13OCT26','136');
 const service=createFlightService({getLog:async()=>log,arrivalService:{today:()=>{throw Error('ETAB must not be read');}}});
 const result=await service.today('2026-10-13','departure');assert.equal(result.source,'SY');assert.deepEqual(result.flights,[{flightNo:'MU586',date:'2026-10-13',gate:'132'}]);
});
test('SY missing, unknown or newest missing gates fail closed, without an ETAB fallback',async()=>{
 for(const log of ['',sy('MU586','13OCT26','????'),sy('MU586','13OCT26','TBA'),sy('MU586','13OCT26','132')+sy('MU586','13OCT26','????','12:00:00')]){const result=await createFlightService({getLog:async()=>log,arrivalService:{today:()=>{throw Error('fallback');}}}).today('2026-10-13','departure');assert.equal(result.status,'unavailable');assert.deepEqual(result.flights,[]);}
 const result=await createFlightService({getLog:async()=>{throw Error('offline');}}).today('2026-10-13','departure');assert.equal(result.status,'error');assert.deepEqual(result.flights,[]);
});
test('Arrival keeps ETAB and does not load SY logs',async()=>{
 const expected={date:'2026-10-13',status:'available',flights:[{flightNo:'MU583',date:'2026-10-13',gate:'131'}]};
 const result=await createFlightService({getLog:()=>{throw Error('SY must not be read');},arrivalService:{today:async(date,type)=>{assert.equal(date,'2026-10-13');assert.equal(type,'arrival');return expected;}}}).today('2026-10-13','arrival');assert.deepEqual(result,{...expected,source:'ETAB'});
});
test('Departure API uses Los Angeles today and validates flight/gate against today SY on creation',async()=>{
 const app=express();app.use(express.json());const store=createStore(':memory:',{now:()=>new Date('2026-10-14T02:00:00Z')});
 const service=createFlightService({getLog:async()=>sy('MU586','13OCT26','132')+sy('MU578','14OCT26','133'),arrivalService:{today:()=>{throw Error('ETAB');}}});
 const integration=registerPbb(app,{store,employeeSeed:[],gateService:service,authenticate:async()=>({uid:'test'})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const api=(url,body)=>fetch(base+url,{headers:{Authorization:'Bearer test','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 try{const today=await(await api('/pbb-api/today?type=departure')).json();assert.deepEqual(today.flights,[{flightNo:'MU586',date:'2026-10-13',gate:'132'}]);const response=await api('/pbb-api/records',{type:'departure',flightNo:'MU586',date:'2026-10-14',gate:'999',bridges:['L1'],role:'driver'});assert.equal(response.status,201);const r=await response.json();assert.equal(r.date,'2026-10-13');assert.equal(r.gate,'132');assert.equal((await api('/pbb-api/records',{type:'departure',flightNo:'MU578',bridges:['L2']})).status,409);}finally{integration.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
});
