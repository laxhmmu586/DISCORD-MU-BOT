const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),fs=require('node:fs'),{FlightListCache}=require('../flightListCache');
const sample=fs.readFileSync(require.resolve('./fixtures/flight-selection-supplied.log'),'utf8');
test('detected flights remain resident with no idle reloads, changed metadata publishes once and midnight starts a fresh scope',async()=>{
 const db=new Database(':memory:');try{let now=Date.parse('2026-10-08T20:00:00Z'),loads=0,resolve;const cache=new FlightListCache({db,now:()=>now,loadLog:async()=>{loads++;return sample;}});
 const first=await cache.read();assert.equal(loads,1);assert.equal(first.flights[0].flightNo,'MU586');assert.equal((await cache.read()).revision,first.revision);assert.equal(loads,1);
 const events=[];cache.subscribe(event=>events.push(event));cache.loadLog=()=>new Promise(r=>resolve=r);now+=3600000;const current=await cache.read();assert.equal(current.revision,first.revision);assert.equal(loads,1);assert.equal(cache.pending,null);cache.update(sample);assert.equal(events.length,0);
 cache.update(sample.replace('GTD/????','GTD/132'));assert.notEqual(cache.snapshot().revision,first.revision);assert.equal(events.length,1);const stable=cache.snapshot().revision;cache.update(sample.replace('GTD/????','GTD/132')+'\nUnrelated log entry');assert.equal(cache.snapshot().revision,stable);
 cache.update('2026 October 08, Thursday, 13:00:00\n>SY\nNo flight data');assert.equal(cache.snapshot().flights.length,1);assert.equal(cache.snapshot().revision,stable);assert.equal(events.length,1);
 const reopened=new FlightListCache({db,now:()=>now,loadLog:async()=>{throw Error('offline');},report:()=>{}});assert.equal((await reopened.read()).revision,stable);await reopened.pending?.catch(()=>{});
 now=Date.parse('2026-10-09T08:00:00Z');assert.equal(cache.snapshot(),null);
 }finally{db.close();}
});
