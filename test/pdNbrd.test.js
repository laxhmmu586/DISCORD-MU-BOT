'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { nbrdEntriesFromPd } = require('../boardingNbrd');
const { FILE_BOUNDARY } = require('../flightContext');
const { normalizeBoardingFlight } = require('../boardingContext');
const { BoardingSqliteLive } = require('../boardingSqliteLive');
const sample = fs.readFileSync(path.join(__dirname, 'fixtures/pd-ckin-nbrd-12oct26.txt'), 'utf8');
const flight = 'MU586', date = '12OCT26';
const parse = log => nbrdEntriesFromPd(log, flight, date);
const header = ' PD: MU586/12OCT26*LAX,CKIN/NBRD';

test('supplied paginated list finds all seven BNs, split-page detail and bare NBRD', () => {
  assert.deepEqual(parse(sample), [
    { bn: '001', detail: 'CKIN NBRD VISA' },
    { bn: '004', detail: 'CKIN NBRD CTC LAKE' },
    { bn: '003', detail: 'CKIN NBRD UIPG' },
    { bn: '002', detail: 'CKIN NBRD SEAT CHANGE' },
    { bn: '006', detail: 'CKIN NBRD 25874' },
    { bn: '007', detail: 'CKIN NBRD SEATS' },
    { bn: '005', detail: 'CKIN NBRD' }
  ]);
});

test('flight/date and unrelated commands do not contribute NBRD', () => {
  assert.deepEqual(nbrdEntriesFromPd(sample, 'MU578', date), []);
  assert.deepEqual(nbrdEntriesFromPd(sample, flight, '11OCT26'), []);
  assert.deepEqual(parse(sample.replace(/CKIN\/NBRD/gi, 'CTC')), []);
  const first = `>pd*,ckin/nbrd\n${header}\n 1. 1LI/XIAO+ BN004 44L\n CKIN HK1 +\n`;
  assert.deepEqual(parse(first + '>fb4\n CKIN NBRD WRONG\n>pn1\n CKIN NBRD WRONG'), []);
  assert.deepEqual(parse(first + '>pn1\n PD: MU578/12OCT26*LAX,CKIN/NBRD\n CKIN NBRD WRONG'), []);
});

test('terminal files and unowned revisited-page fragments cannot inherit passengers', () => {
  const first = `>pd*,ckin/nbrd\n${header}\n 1. 1LI/XIAO+ BN004 44L\n CKIN HK1 +\n`;
  const second = `>pn1\n${header}\n CKIN NBRD WRONG\n 2. 1GUO/XIAO+ BN001 33H\n CKIN NBRD VISA`;
  assert.deepEqual(parse(first + FILE_BOUNDARY + second), [{ bn: '001', detail: 'CKIN NBRD VISA' }]);
  assert.deepEqual(parse(first.replace('HK1 +', 'HK1') + second), [{ bn: '001', detail: 'CKIN NBRD VISA' }]);
});

test('BN ownership resets on malformed rows; continuation comments combine without duplicates', () => {
  assert.deepEqual(parse(`>pd*,ckin/nbrd\n${header}\n 1. 1LI/XIAO+ BN004 44L\n CKIN NBRD VISA +\n>pf1\n${header}\n CKIN NBRD DOC\n CKIN NBRD DOC\n 2. 1NO/BN\n CKIN NBRD WRONG`),
    [{ bn: '004', detail: 'CKIN NBRD VISA | CKIN NBRD DOC' }]);
});

test('search ingestion overwrites manual NBRD by scoped BN while preserving resolution and row identity', t => {
  const db = new Database(':memory:');
  const dbSource = fs.readFileSync(require.resolve('../db'), 'utf8');
  db.exec(dbSource.match(/db\.exec\(`([\s\S]*?)`\);/)[1]);
  const live = new BoardingSqliteLive({ db, report() {} });
  t.after(() => db.close());
  live.saveNbrd(flight, [{ bn: '001', detail: 'MANUAL COMMENT' }], {}, date);
  live.resolve(flight, '001', true, date);
  live.saveNbrd(flight, [{ bn: '0003', detail: 'MANUAL PENDING' }], {}, date);
  const manualRows = live.nbrdRecords(flight, date);
  live.saveNbrd('MU578', [{ bn: '001', detail: 'OTHER FLIGHT' }], {}, date);
  live.saveNbrd(flight, [{ bn: '001', detail: 'OTHER DATE' }], {}, '11OCT26');
  live.scan(flight, { flight, bn: '004', seat: '44L' }, date);
  const events = [];
  live.subscribe(flight, snapshot => events.push(snapshot), date);
  // Execute the actual search ingestion block, including its raw-log selection.
  const source = fs.readFileSync(require.resolve('../index'), 'utf8');
  const block = source.match(/      if \(normalizeBoardingFlight\(selectedFlight\)\) \{\n?\r?[\s\S]*?const pdNbrd[\s\S]*?\n      \}/)?.[0];
  assert.ok(block, 'search contains the PD NBRD ingestion hook');
  const ctx = vm.createContext({ normalizeBoardingFlight, nbrdEntriesFromPd, nbrdEntriesFromFb: require('../boardingNbrd').nbrdEntriesFromFb, passengers: {}, boardingLive: live,
    preparationLog: sample, selectedFlight: flight, selectedDate: date });
  vm.runInContext(block, ctx);
  const first = live.nbrdRecords(flight, date);
  assert.equal(first.length, 7);
  assert.deepEqual(first.find(row => row.nbrdBn === '001'), {
    rowNumber: manualRows[0].rowNumber, nbrdBn: '001', nbrdDetail: 'CKIN NBRD VISA', nbrdResolved: true
  });
  assert.deepEqual(first.find(row => row.nbrdBn === '003'), {
    rowNumber: manualRows[1].rowNumber, nbrdBn: '003', nbrdDetail: 'CKIN NBRD UIPG', nbrdResolved: false
  });
  assert.equal(events[0].nbrd.find(row => row.bn === '003').detail, 'CKIN NBRD UIPG');
  assert.equal(first.find(row => row.nbrdBn === '004').nbrdResolved, true, 'already boarded adult stays resolved');
  assert.throws(() => live.scan(flight, { flight, bn: '003', seat: '44K' }, date), { code: 'NBRD_MESSAGE', detail: 'CKIN NBRD UIPG' });
  vm.runInContext(block, ctx);
  assert.deepEqual(live.nbrdRecords(flight, date), first);
  assert.equal(events.length, 1, 'repeat import does not broadcast or write changes');
  assert.equal(live.nbrdRecords('MU578', date)[0].nbrdDetail, 'OTHER FLIGHT');
  assert.equal(live.nbrdRecords(flight, '11OCT26')[0].nbrdDetail, 'OTHER DATE');
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_nbrd').get().n, 9);
});


test('FB-only log imports NBRD into SQLite before a missing SY can return', t => {
  const { passengers, parseIncrementalLog } = require('../flightParser');
  const { scopedLog } = require('../flightContext');
  const { nbrdEntriesFromFb } = require('../boardingNbrd');
  const log = '2026 October 12, Monday, 08:32:07\n>fb 1\n PR: MU586/12OCT26*LAX,BN1\n  1. TEST/PASSENGER BN001 33H R PVG\nCKIN HK1 LKCK/7810000000000/CHKLEG\nCKIN NBRD CTC LAKE\n      I/DL484/12OCT BN999 T MCO\n      O/MU5816/13OCT BN011 36J B KMG\n RES AUTO 10OCT1230 +\n';
  parseIncrementalLog(scopedLog(log, flight, date));
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(require.resolve('../db'), 'utf8').match(/db\.exec\(`([\s\S]*?)`\);/)[1]);
  t.after(() => db.close());
  const live = new BoardingSqliteLive({ db, report() {} });
  const source = fs.readFileSync(require.resolve('../index'), 'utf8').replace(/\r\n/g, '\n');
  const begin = source.indexOf('      if (normalizeBoardingFlight(selectedFlight)) {', source.indexOf('const preparationLog = log;'));
  const end = source.indexOf('\n      }', begin) + 8;
  assert.ok(begin < source.indexOf('if (!syInfo)', begin));
  const ctx = vm.createContext({ normalizeBoardingFlight, passengers, nbrdEntriesFromFb, nbrdEntriesFromPd, boardingLive: live, preparationLog: log, selectedFlight: flight, selectedDate: date });
  vm.runInContext(source.slice(begin, end), ctx);
  assert.equal(live.nbrdRecords(flight, date)[0].nbrdBn, '001');
  assert.equal(live.nbrdRecords(flight, date)[0].nbrdDetail, 'CKIN NBRD CTC LAKE');
  assert.equal(live.nbrdRecords('MU578', date).length, 0);
  assert.equal(live.nbrdRecords(flight, '11OCT26').length, 0);
  assert.throws(() => live.scan(flight, { flight, bn: '001', seat: '33H' }, date), { code: 'NBRD_MESSAGE' });
});


test('without SY, PR/PD header scope uses the flight date and timestamp year', () => {
  const { sections, scopedLog } = require('../flightContext');
  const { parseIncrementalLog, passengers } = require('../flightParser');
  const { nbrdEntriesFromFb } = require('../boardingNbrd');
  const stamp = '2026 October 12, Monday, 08:32:07\n';
  for (const suffix of ['12OCT', '12OCT26', '13OCT']) {
    const fb = stamp + '>fb 1\n PR: MU578/' + suffix + '*LAX,BN1\n 1. TEST/PASSENGER BN001 33H R PVG\nCKIN NBRD CTC LAKE\n';
    const expected = suffix.length === 5 ? suffix + '26' : suffix;
    assert.equal(sections(fb)[0].flightNo, 'MU578');
    assert.equal(sections(fb)[0].flightDate, expected);
    assert.equal(scopedLog(fb, 'MU586', expected), '');
    parseIncrementalLog(scopedLog(fb, 'MU578', expected));
    assert.deepEqual(nbrdEntriesFromFb(Object.values(passengers)), [{bn:'001',detail:'CKIN NBRD CTC LAKE'}]);
    const pd = stamp + '>pd*,ckin/nbrd\n PD: MU578/' + suffix + '*LAX,CKIN/NBRD\n 1. 1TEST/PASSENGER BN001 33H R PVG\n CKIN NBRD CTC LAKE\n';
    assert.deepEqual(nbrdEntriesFromPd(pd, 'MU578', expected), [{bn:'001',detail:'CKIN NBRD CTC LAKE'}]);
    assert.deepEqual(nbrdEntriesFromPd(pd, 'MU586', expected), []);
    assert.deepEqual(nbrdEntriesFromPd(pd, 'MU578', '11OCT26'), []);
  }
});
