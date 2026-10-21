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

test('supplied ranged BND loads a cold BOX and supports manual delete/restore', async t => {
  const supplied=fs.readFileSync(require('node:path').join(__dirname,'fixtures/boarding-box-bnd-ranges.log'),'utf8');
  const {cache}=setup(t,async()=>supplied,{now:()=>Date.parse('2026-10-19T22:40:00Z')});
  const data=await cache.read('MU586','19OCT26');
  assert.ok(data);assert.equal(data.passengers,298);assert.equal(data.total,300);assert.equal(data.matched,true);
  const deleted=cache.setNumber('MU586','19OCT26','94',false);
  assert.equal(deleted.passengers,297);assert.ok(!deleted.bns.includes(94));
  const restored=cache.setNumber('MU586','19OCT26','0073',true);
  assert.equal(restored.passengers,298);assert.ok(restored.bns.includes(73));
  await cache.refresh();assert.deepEqual(cache.snapshot('MU586','19OCT26').bns,restored.bns);
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

test('manual delete/restore persists over refresh, BND-only updates and restart within the same SY', async t => {
  const {cache,db,now}=setup(t,async()=>log(3)); cache.updateFromLog(log(3));
  cache.setNumber('MU586','16OCT26','0002',false);
  cache.setNumber('MU586','16OCT26','0094',true);
  assert.deepEqual(cache.snapshot('MU586','16OCT26').bns,[1,3,94]);
  const bndUpdate=log(4).replace('C000/000/004','C000/000/003');
  cache.updateFromLog(bndUpdate);
  const reopened=new BoardingBoxCache({db,now,loadLog:async()=>bndUpdate});
  assert.deepEqual((await reopened.read('MU586','16OCT26')).bns,[1,3,4,94]);
  const restored=cache.setNumber('MU586','16OCT26','2',true);
  assert.deepEqual(restored.bns,[1,2,3,4,94]); assert.equal(restored.passengers,5);assert.equal(restored.total,5);
  assert.equal(cache.setNumber('MU586','16OCT26','002',true).updatedAt,restored.updatedAt);
  cache.updateFromLog(log(1,'MU578'));
  assert.deepEqual(cache.snapshot('MU578','16OCT26').bns,[1]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_numbers WHERE flight_date=?').get('15OCT26').n,0);
});

test('new SY clears old manual changes, publishes reset counts and preserves other flights and confirmations', t => {
  const {cache,db,now}=setup(t,async()=>log(4));
  cache.updateFromLog(log(3)+'\n'+log(2,'MU578'));
  cache.setNumber('MU586','16OCT26',2,false);
  cache.setNumber('MU586','16OCT26',94,true);
  cache.setNumber('MU578','16OCT26',1,false);
  cache.confirm('MU586','16OCT26','1',true);
  const events=[]; cache.subscribe('MU586','16OCT26',data=>events.push(data));
  cache.updateFromLog(log(4)+'\n'+log(2,'MU578'));
  assert.equal(events.length,1);
  assert.deepEqual(events[0].bns,[1,2,3,4]);
  assert.equal(events[0].total,4); assert.equal(events[0].matched,true);
  assert.equal(events[0].manualDeletedCount,0);
  assert.deepEqual(events[0].confirmedBoxes,['1']);
  assert.deepEqual(cache.snapshot('MU578','16OCT26').bns,[2]);
  const reopened=new BoardingBoxCache({db,now,loadLog:async()=>log(4)});
  assert.deepEqual(reopened.snapshot('MU586','16OCT26').bns,[1,2,3,4]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_box_numbers WHERE flight_no=?').get('MU586').n,0);
  assert.equal(reopened.setNumber('MU586','16OCT26',3,false).total,3);
  assert.equal(reopened.snapshot('MU586','16OCT26').manualDeletedCount,1);
});

test('a newer SY with unchanged counts resets manual changes while repeated reads preserve them', async t => {
  const {cache}=setup(t,async()=>log(3)); cache.updateFromLog(log(3));
  cache.setNumber('MU586','16OCT26',2,false);
  await cache.refresh(); assert.equal(cache.snapshot('MU586','16OCT26').total,2);
  const newSy=log(3)+'\n'+log(3).split('2026 October 16, Friday, 14:57:00')[0].replace('14:56:04','14:59:04');
  cache.updateFromLog(newSy);
  assert.equal(cache.snapshot('MU586','16OCT26').total,3);
  cache.setNumber('MU586','16OCT26',1,false);
  cache.updateFromLog(newSy+'\n2026 October 16, Friday, 15:00:00\n>fb 1\nUnrelated log update');
  assert.equal(cache.snapshot('MU586','16OCT26').total,2);
});

test('existing snapshots without SY revision reset stale manual changes on the first current SY load', t => {
  const {cache,db,now}=setup(t,async()=>log(3)); cache.updateFromLog(log(3));
  cache.setNumber('MU586','16OCT26',2,false);
  const payload=JSON.parse(db.prepare('SELECT payload FROM boarding_box_cache').get().payload);
  delete payload.syRevision;
  db.prepare('UPDATE boarding_box_cache SET payload=?').run(JSON.stringify(payload));
  const reopened=new BoardingBoxCache({db,now,loadLog:async()=>log(3)});
  reopened.updateFromLog(log(3));
  assert.equal(reopened.snapshot('MU586','16OCT26').total,3);
  reopened.setNumber('MU586','16OCT26',1,false);
  reopened.updateFromLog(log(3));
  assert.equal(reopened.snapshot('MU586','16OCT26').total,2);
});

test('failed new SY save rolls back manual reset and does not publish it', t => {
  const {cache,db}=setup(t,async()=>log(3)); cache.updateFromLog(log(3));
  cache.setNumber('MU586','16OCT26',2,false);
  let events=0; cache.subscribe('MU586','16OCT26',()=>events++);
  db.exec(`CREATE TRIGGER fail_sy_update BEFORE UPDATE ON boarding_box_cache BEGIN SELECT RAISE(ABORT,'disk full'); END;`);
  assert.throws(()=>cache.updateFromLog(log(4)),/disk full/);
  assert.deepEqual(cache.snapshot('MU586','16OCT26').bns,[1,3]);
  assert.equal(events,0);
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

test('manual deletion count survives refresh and restore cancels only its deduction', async t => {
  const {cache}=setup(t,async()=>log(290).replace('I00','I02'));
  await cache.refresh();
  assert.equal(cache.snapshot('MU586','16OCT26').manualDeletedCount,0);
  const deleted=cache.setNumber('MU586','16OCT26',1,false);
  assert.equal(deleted.expectedTotal,292); assert.equal(deleted.manualDeletedCount,1);
  assert.equal(cache.setNumber('MU586','16OCT26',1,false).manualDeletedCount,1);
  assert.equal(cache.setNumber('MU586','16OCT26',2,false).manualDeletedCount,2);
  await cache.refresh(); assert.equal(cache.snapshot('MU586','16OCT26').manualDeletedCount,2);
  assert.equal(cache.setNumber('MU586','16OCT26',1,true).manualDeletedCount,1);
  assert.equal(cache.setNumber('MU586','16OCT26',2,true).manualDeletedCount,0);
  assert.equal(cache.snapshot('MU586','16OCT26').expectedTotal,292);
});
