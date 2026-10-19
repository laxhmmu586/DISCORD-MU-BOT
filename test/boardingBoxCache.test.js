'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { BoardingBoxCache } = require('../boardingBoxCache');
const { BoardingSqliteLive } = require('../boardingSqliteLive');
const { nextBoardingCleanup } = require('../boardingCleanupTime');
const fs = require('node:fs');
const schema = fs.readFileSync(require.resolve('../db'),'utf8').match(/db\.exec\(`([\s\S]*?)`\);/)[1];
const log = (count=1,flight='MU586') => `2026 October 16, Friday, 14:56:04
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
function setup(t, loadLog, extra={}) {
  const db = new Database(':memory:'); db.exec(schema);
  const now = () => Date.parse('2026-10-16T22:00:00Z');
  const cache = new BoardingBoxCache({db,loadLog,now,report:()=>{},...extra});
  t.after(()=>{cache.stop();db.close();}); return {db,cache,now};
}
test('warm snapshot survives a new cache instance and opens without waiting for Drive', async t => {
  let calls=0; const {db,cache,now} = setup(t,async()=>{calls++;return log();});
  await cache.refresh(); assert.equal(calls,1);
  const reopened = new BoardingBoxCache({db,now,loadLog:()=>{throw new Error('must not load');}});
  const result = await reopened.read('MU586','16OCT26');
  assert.equal(result.maxBn,312);assert.equal(result.passengers,1);assert.equal(result.matched,true);assert.equal(calls,1);
  assert.equal(db.prepare('SELECT payload FROM boarding_box_cache WHERE flight_no=?').get('MU578'),undefined);
});
test('concurrent cold viewers share one log download and flights stay isolated', async t => {
  let calls=0,release;
  const {cache} = setup(t,()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const reads=[cache.read('MU586','16OCT26'),cache.read('MU578','16OCT26')];
  await Promise.resolve();release(log()+'\n'+log(2,'MU578'));
  const rows=await Promise.all(reads);
  assert.equal(calls,1);assert.equal(rows[0].expectedPassengers,1);assert.equal(rows[1].expectedPassengers,2);
});
test('stale saved result returns immediately during a shared slow refresh and updates after completion', async t => {
  let current=Date.parse('2026-10-16T22:00:00Z'),release;
  const {cache}=setup(t,()=>new Promise(resolve=>{release=resolve;}),{now:()=>current});
  cache.updateFromLog(log());current+=61000;
  assert.equal((await cache.read('MU586','16OCT26')).expectedPassengers,1);
  await Promise.resolve();release(log(2));await cache.pending;
  assert.equal((await cache.read('MU586','16OCT26')).expectedPassengers,2);
});
test('failed downloads preserve cache; older concurrent completion cannot overwrite newer totals', async t => {
  const {cache,db}=setup(t,async()=>{throw new Error('Drive offline');});
  const old=cache.beginUpdate();cache.updateFromLog(log(2));cache.updateFromLog(log(1),old);
  assert.equal((await cache.read('MU586','16OCT26')).expectedPassengers,2);
  await assert.rejects(cache.refresh(),/Drive offline/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_cache').get().n,1);
});
test('daily 07:00 cleanup deletes BOX with scans and prevents in-flight pre-cleanup data from restoring it', async t => {
  let current=Date.parse('2026-10-16T22:00:00Z');
  const {db,cache}=setup(t,async()=>log(),{now:()=>current});
  const live=new BoardingSqliteLive({db,now:()=>current,onReset:()=>cache.invalidate()});
  cache.beforeAccess=()=>live.cleanupIfDue();cache.updateFromLog(log());
  cache.confirm('MU586','16OCT26','1',true);
  cache.setNumber('MU586','16OCT26','001',false);
  const old=cache.beginUpdate();current=nextBoardingCleanup(current);
  assert.equal(live.cleanupIfDue(),true);
  cache.updateFromLog(log(),old);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_cache').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_confirmations').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_numbers').get().n,0);
  await assert.rejects(cache.read('MU586','16OCT26'),/today/);
});

test('manual delete/restore persists over log refresh and restart, including a BND-deleted BN', async t => {
  const {cache,db,now}=setup(t,async()=>log(3)); cache.updateFromLog(log(3));
  cache.setNumber('MU586','16OCT26','0002',false);
  cache.setNumber('MU586','16OCT26','0094',true);
  assert.deepEqual(cache.snapshot('MU586','16OCT26').bns,[1,3,94]);
  cache.updateFromLog(log(4));
  const reopened=new BoardingBoxCache({db,now,loadLog:async()=>log(4)});
  assert.deepEqual((await reopened.read('MU586','16OCT26')).bns,[1,3,4,94]);
  const restored=cache.setNumber('MU586','16OCT26','2',true);
  assert.deepEqual(restored.bns,[1,2,3,4,94]); assert.equal(restored.passengers,5);assert.equal(restored.total,5);
  assert.equal(cache.setNumber('MU586','16OCT26','002',true).updatedAt,restored.updatedAt);
  cache.updateFromLog(log(1,'MU578'));
  assert.deepEqual(cache.snapshot('MU578','16OCT26').bns,[1]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_numbers WHERE flight_date=?').get('15OCT26').n,0);
});

test('invalid numbers and failed writes cannot publish success or change BOX', t => {
  const {cache,db}=setup(t,async()=>log(3));cache.updateFromLog(log(3));let events=0;
  cache.subscribe('MU586','16OCT26',()=>events++);
  for(const bn of ['0','313','-1','1.5','1x','00001',null,[],true]) {
    assert.throws(()=>cache.setNumber('MU586','16OCT26',bn,false),{status:422});
  }
  assert.throws(()=>cache.setNumber('MU586','16OCT26',1,'false'),{status:422});
  assert.throws(()=>cache.setNumber('MU586','15OCT26',1,false),{status:400});
  db.exec(`CREATE TRIGGER fail_box_number BEFORE UPDATE ON boarding_box_cache BEGIN SELECT RAISE(ABORT,'disk full'); END;`);
  assert.throws(()=>cache.setNumber('MU586','16OCT26',1,false),/disk full/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_numbers').get().n,0);
  assert.deepEqual(cache.snapshot('MU586','16OCT26').bns,[1,2,3]);assert.equal(events,0);
});

test('persisted legacy FB cache is never returned and is replaced by SY+BND', async t => {
  const {cache,db}=setup(t,async()=>log(3));
  db.prepare('INSERT INTO boarding_box_cache VALUES (?,?,?,?,?)').run('16OCT26','MU586',JSON.stringify({source:'FB',bns:[99]}),'legacy',1);
  assert.equal(cache.snapshot('MU586','16OCT26'),null);
  const next=await cache.read('MU586','16OCT26');assert.equal(next.source,'BND');assert.deepEqual(next.bns,[1,2,3]);
});
