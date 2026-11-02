const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),fs=require('node:fs'),{FlightListCache}=require('../flightListCache');
const sample=fs.readFileSync(require.resolve('./fixtures/flight-selection-supplied.log'),'utf8');
test('detected flight entries are permanent for the day and require no further discovery reads',async()=>{
 const db=new Database(':memory:');try{let now=Date.parse('2026-10-08T20:00:00Z'),loads=0;const cache=new FlightListCache({db,now:()=>now,loadLog:async()=>{loads++;return sample;}});
 const first=await cache.read();assert.equal(loads,1);assert.deepEqual(first.flights,[{flightNo:'MU586',flightDate:'08OCT26'}]);now+=3600000;
 assert.equal((await cache.read()).revision,first.revision);assert.equal(loads,1);cache.update(sample.replace('GTD/????','GTD/132'));assert.deepEqual(cache.snapshot(),first);
 cache.update('2026 October 08, Thursday, 13:00:00\n>SY\nNo flight data');assert.equal(cache.snapshot().flights.length,1);
 const reopened=new FlightListCache({db,now:()=>now,loadLog:async()=>{throw Error('A resident card must not read logs');}});assert.deepEqual((await reopened.read()).flights,first.flights);
 now=Date.parse('2026-10-09T08:00:00Z');assert.equal(cache.snapshot(),null);
 }finally{db.close();}
});
