'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Database=require('better-sqlite3'),express=require('express');
const {BoardingBoxCache}=require('../boardingBoxCache');
const {registerBoardingBoxStream}=require('../boardingBoxStream');
const schema=fs.readFileSync(require.resolve('../db'),'utf8').match(/db\.exec\(`([\s\S]*?)`\);/)[1];
const source=fs.readFileSync(require.resolve('../public/public/box-live'),'utf8');
const log=(count=1,flight='MU586')=>`2026 October 16, Friday, 14:56:04
>sy
 SY: ${flight}/16OCT26 LAX/0 CC1321/NAM
 777/773L/B2001 POS/GATE BN312
 C000/000/${String(count).padStart(3,'0')} I00
2026 October 16, Friday, 14:57:00
>fb 1
 PR: ${flight}/16OCT26*LAX,BN1
 1. TEST/PASSENGER BN1 20A Y PVG
2026 October 16, Friday, 14:58:00
>BND:
 BND: ${flight}/16OCT26LAX
 BOARDING NUMBER RANGE: 1--312
 ${312-count} BOARDING NUMBER(S) DELETED:
 ${Array.from({length:312-count},(_,i)=>i+count+1).join(' ')}
`;
async function harness(t) {
  const db=new Database(':memory:');db.exec(schema);let downloads=0;
  const cache=new BoardingBoxCache({db,now:()=>Date.parse('2026-10-16T22:00:00Z'),loadLog:async()=>{downloads++;return log();}});
  cache.updateFromLog(log()+'\n'+log(1,'MU578'));
  const app=express();app.use(express.json());registerBoardingBoxStream(app,{cache,date:()=> '16OCT26'});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const controllers=[];
  t.after(async()=>{controllers.forEach(c=>c.abort());cache.stop();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function connect(flight='MU586') {
    const controller=new AbortController();controllers.push(controller);
    const res=await fetch(`${base}/boarding-box/live-stream?flightNo=${flight}&flightDate=16OCT26`,{signal:controller.signal});
    assert.equal(res.headers.get('content-type'),'text/event-stream');
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
    async function next() {
      const timeout=setTimeout(()=>controller.abort(),2000);
      try {
        for (;;) {
          const end=buffer.indexOf('\n\n');
          if(end>=0){const item=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=item.match(/^data: (.+)$/m);if(data)return JSON.parse(data[1]);continue;}
          const chunk=await reader.read();if(chunk.done)throw new Error('stream ended');buffer+=decoder.decode(chunk.value,{stream:true});
        }
      } finally {clearTimeout(timeout);}
    }
    return {next,close:()=>controller.abort()};
  }
  return {cache,db,base,connect,downloads:()=>downloads};
}
test('two HTTP viewers receive the committed update; reconnection gets the latest snapshot without downloading logs',async t=>{
  const h=await harness(t),a=await h.connect(),b=await h.connect();
  const first=await a.next();assert.equal((await b.next()).expectedPassengers,1);
  let otherEvents=0;h.cache.subscribe('MU578','16OCT26',()=>otherEvents++);
  h.cache.updateFromLog(log(2)+'\n'+log(1,'MU578'));
  const second=await a.next(),peer=await b.next();
  assert.equal(second.expectedPassengers,2);assert.deepEqual(second,peer);assert.ok(second.updatedAt>first.updatedAt);
  assert.equal(otherEvents,0);
  a.close();const reconnected=await h.connect();assert.equal((await reconnected.next()).expectedPassengers,2);
  assert.equal(h.downloads(),0);
});
test('unchanged payload does not broadcast and daily clearing pushes reset to connected viewers',async t=>{
  const h=await harness(t),viewer=await h.connect();await viewer.next();let changes=0;
  h.cache.subscribe('MU586','16OCT26',()=>changes++);
  h.cache.updateFromLog(log()+'\n'+log(1,'MU578')+'\n');assert.equal(changes,0);
  h.db.exec('DELETE FROM boarding_box_cache');h.cache.invalidate();
  const reset=await viewer.next();assert.equal(reset.reset,true);assert.equal(reset.flightNo,'MU586');assert.equal(changes,1);
});
test('invalid flight/date is rejected before opening a stream',async t=>{
  const h=await harness(t);
  for(const query of ['flightNo=MU583&flightDate=16OCT26','flightNo=MU586&flightDate=15OCT26']) {
    const res=await fetch(h.base+'/boarding-box/live-stream?'+query);assert.equal(res.status,400);await res.text();
  }
});
test('clicking any BOX or Infant saves green state, synchronizes both viewers, and can be undone',async t=>{
  const h=await harness(t),a=await h.connect(),b=await h.connect();await a.next();await b.next();
  async function confirm(boxId,confirmed,flight='MU586') {
    const res=await fetch(`${h.base}/boarding-box/confirm?flightNo=${flight}&flightDate=16OCT26`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({boxId,confirmed})});
    return {status:res.status,data:await res.json()};
  }
  const saved=await confirm('1',true);assert.equal(saved.status,200);assert.deepEqual(saved.data.confirmedBoxes,['1']);
  assert.deepEqual((await a.next()).confirmedBoxes,['1']);assert.deepEqual((await b.next()).confirmedBoxes,['1']);
  const reopened=new BoardingBoxCache({db:h.db,now:()=>Date.parse('2026-10-16T22:00:00Z'),loadLog:async()=>log()});
  assert.deepEqual((await reopened.read('MU586','16OCT26')).confirmedBoxes,['1']);
  assert.deepEqual(h.cache.snapshot('MU578','16OCT26').confirmedBoxes,[]);
  assert.equal((await confirm('1',true)).data.updatedAt,saved.data.updatedAt,'repeat intent is idempotent');
  assert.equal((await confirm('INFANT',true)).status,200);await a.next();await b.next();
  assert.deepEqual((await confirm('1',false)).data.confirmedBoxes,['INFANT']);await a.next();await b.next();
  for(const [id,value] of [['2',true],['321',true],['1','true']]) assert.equal((await confirm(id,value)).status,422);
  assert.equal((await confirm('1',true,'MU583')).status,400);
});
test('browser connector scopes SSE, falls back only while offline, and closes on disposal',async()=>{
  const streams=[],timers=[],received=[];let polls=0;
  const root={mufcFlight:{flightNo:'MU578',flightDate:'16OCT26'},
    setTimeout(fn,ms){const timer={fn,ms};timers.push(timer);return timer;},clearTimeout(timer){if(timer)timer.cleared=true;},
    EventSource:class{constructor(url){this.url=url;this.handlers={};this.readyState=0;streams.push(this);}addEventListener(name,fn){this.handlers[name]=fn;}close(){this.closed=true;}}};
  vm.runInNewContext(source,{window:root,URL});
  const close=root.connectBoxLive({apiBase:'https://api.mufcapp.net',onData:data=>received.push(data),onFallback:async()=>polls++});
  const stream=streams[0],url=new URL(stream.url);assert.equal(url.searchParams.get('flightNo'),'MU578');assert.equal(url.searchParams.get('flightDate'),'16OCT26');
  stream.handlers.box({data:JSON.stringify({passengers:310})});assert.equal(received[0].passengers,310);assert.equal(timers.length,0);
  stream.onerror();assert.equal(timers[0].ms,15000);await timers[0].fn();assert.equal(polls,1);
  stream.readyState=1;stream.onopen();assert.equal(timers.at(-1).cleared,true);
  root.mufcFlight={flightNo:'MU586',flightDate:'16OCT26'};stream.handlers.box({data:'{"passengers":999}'});assert.equal(received.length,1);
  close();assert.equal(stream.closed,true);
});
test('BOX rendering rejects older HTTP snapshots and clears all viewers on reset without repainting unchanged data',()=>{
  const html=fs.readFileSync(require.resolve('../public/public/box'),'utf8');
  const apply=html.slice(html.indexOf('  function applySnapshot('),html.indexOf('  function render('));
  const rendered=[],status={hidden:true},content={hidden:true};
  const ctx=vm.createContext({root:{mufcFlight:{flightNo:'MU586',flightDate:'16OCT26'}},status,content,render:data=>rendered.push(data)});
  vm.runInContext('let stopped=false,lastRevision=-1,lastSignature="";'+apply,ctx);
  const snapshot=(updatedAt,passengers=2)=>({flightNo:'MU586',flightDate:'16OCT26',updatedAt,passengers});
  ctx.applySnapshot(snapshot(10));ctx.applySnapshot(snapshot(12,3));ctx.applySnapshot(snapshot(11,1));ctx.applySnapshot(snapshot(13,3));
  assert.deepEqual(rendered.map(row=>row.passengers),[2,3]);
  ctx.applySnapshot({...snapshot(14),reset:true});assert.equal(content.hidden,true);
  ctx.applySnapshot(snapshot(13));assert.equal(content.hidden,true);
  ctx.applySnapshot(snapshot(15,4));assert.equal(content.hidden,false);
  ctx.applySnapshot({...snapshot(99),flightNo:'MU578'});assert.equal(rendered.at(-1).passengers,4);
});

test('manual number endpoint commits before both SSE viewers update and stays flight scoped',async t=>{
  const h=await harness(t),a=await h.connect(),b=await h.connect();await a.next();await b.next();
  let otherEvents=0;h.cache.subscribe('MU578','16OCT26',()=>otherEvents++);
  async function save(bn,present,query='flightNo=MU586&flightDate=16OCT26') {
    const res=await fetch(`${h.base}/boarding-box/number?${query}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bn,present})});
    return {status:res.status,data:await res.json()};
  }
  const deleted=await save('0001',false);assert.equal(deleted.status,200);assert.deepEqual(deleted.data.bns,[]);
  assert.deepEqual((await a.next()).bns,[]);assert.deepEqual((await b.next()).bns,[]);
  const restored=await save('0094',true);assert.equal(restored.status,200);
  assert.deepEqual((await a.next()).bns,[94]);assert.deepEqual((await b.next()).bns,[94]);
  const reconnect=await h.connect();assert.deepEqual((await reconnect.next()).bns,[94]);
  assert.equal((await save('313',true)).status,422);
  assert.equal((await save('1',true,'flightNo=MU578&flightDate=15OCT26')).status,400);
  assert.equal((await save('1',true,'flightNo=MU583&flightDate=16OCT26')).status,400);
  assert.equal(otherEvents,0);
});
