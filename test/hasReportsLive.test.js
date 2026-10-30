const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Database=require('better-sqlite3'),fs=require('node:fs');
async function fixture(t,heartbeatMs){
 const db=new Database(':memory:'),users={one:{uid:'one',position:'Supervisor',station:'LAX',account:'MU'},two:{uid:'two',position:'Supervisor',station:'LAX',account:'MU'},other:{uid:'other',position:'Supervisor',station:'SFO',account:'XX'},agent:{uid:'agent',position:'Agent',station:'LAX',account:'MU'}},app=express();app.use(express.json({limit:'16mb'}));
 const service=require('../has/server/hasReports').registerHasReports(app,{employees:{db},profiles:{linked:u=>users[u.uid]},authenticate:async req=>{const user=users[req.headers.authorization];if(!user)throw Error('auth');return user;},liveHeartbeatMs:heartbeatMs});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/has-report-api';
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
 const request=async(user,path,body)=>fetch(base+path,{headers:{Authorization:user,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 async function subscribe(user,path){const controller=new AbortController(),response=await fetch(base+path,{headers:{Authorization:user},signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/event-stream/);assert.equal(response.headers.get('X-Accel-Buffering'),'no');const events=[];let buffer='';const reader=response.body.getReader();const closed=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=new TextDecoder().decode(value);let i;while((i=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,i);buffer=buffer.slice(i+2);const data=frame.split('\n').find(s=>s.startsWith('data: '));if(data)events.push(JSON.parse(data.slice(6)));}}}catch(e){if(e.name!=='AbortError')throw e;}})();t.after(()=>controller.abort());return {events,closed,stop:()=>controller.abort(),async wait(predicate){const until=Date.now()+2500;while(Date.now()<until){const event=events.find(predicate);if(event)return event;await new Promise(r=>setTimeout(r,10));}throw Error('Missing SSE update: '+JSON.stringify(events));}};}
 return {request,subscribe,users};
}
test('SSE publishes committed saves/imports and DA-to-WWH revisions only within the Main Account/month',async t=>{
 const {request,subscribe}=await fixture(t),da=await subscribe('one','/da/2026-10/stream?station=SFO&account=XX'),wwh=await subscribe('two','/wwh/2026-10/stream'),foreign=await subscribe('other','/da/2026-10/stream'),november=await subscribe('one','/da/2026-11/stream'),nextYear=await subscribe('one','/da/2027-10/stream');
 const initial=await da.wait(e=>e.revision===0);assert.deepEqual(initial.scope,{station:'LAX',account:'MU'});assert.equal('values' in initial,false);
 assert.equal((await request('two','/da/2026-10',{revision:0,values:{K7:292,L6:1}})).status,200);await da.wait(e=>e.revision===1);await wwh.wait(e=>e.daRevision===1);assert(foreign.events.every(e=>e.revision===0));assert(november.events.every(e=>e.revision===0));assert(nextYear.events.every(e=>e.revision===0));
 const file=fs.readFileSync('has/resources/has-report-templates/da-2026.xlsx').toString('base64');assert.equal((await request('two','/da/2026-10/import',{revision:1,file})).status,200);await da.wait(e=>e.revision===2);await wwh.wait(e=>e.daRevision===2);
 assert.equal((await request('agent','/da/2026-10/stream')).status,403);assert.equal((await request('agent','/wwh/2026-10/stream')).status,403);assert.equal((await request('','/da/2026-10/stream')).status,401);assert.equal((await request('one','/da/2025-01/stream')).status,400);
});
test('SSE rechecks permissions and ends streams when Main Account changes or role is revoked',async t=>{
 const {subscribe,users}=await fixture(t,50),one=await subscribe('one','/da/2026-10/stream'),two=await subscribe('two','/wwh/2026-10/stream');await one.wait(()=>true);await two.wait(()=>true);
 users.one.account='XX';users.two.position='Agent';
 await Promise.race([Promise.all([one.closed,two.closed]),new Promise((_,reject)=>setTimeout(()=>reject(Error('Revoked SSE stayed open')),1500))]);
 assert(one.events.every(e=>e.scope.account==='MU'));assert(two.events.every(e=>e.scope.account==='MU'));
});
