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

test('search ingestion inserts missing SQLite NBRD once and preserves existing detail/resolution', t => {
  const db = new Database(':memory:');
  const dbSource = fs.readFileSync(require.resolve('../db'), 'utf8');
  db.exec(dbSource.match(/db\.exec\(`([\s\S]*?)`\);/)[1]);
  const live = new BoardingSqliteLive({ db, report() {} });
  t.after(() => db.close());
  live.saveNbrd(flight, [{ bn: '001', detail: 'MANUAL COMMENT' }], {}, date);
  live.resolve(flight, '001', true, date);
  live.scan(flight, { flight, bn: '004', seat: '44L' }, date);
  const events = [];
  live.subscribe(flight, snapshot => events.push(snapshot), date);
  // Execute the actual search ingestion block, including its raw-log selection.
  const source = fs.readFileSync(require.resolve('../index'), 'utf8');
  const block = source.match(/      if \(normalizeBoardingFlight\(selectedFlight\)\) \{\n?\r?[\s\S]*?const pdNbrd[\s\S]*?\n      \}/)?.[0];
  assert.ok(block, 'search contains the PD NBRD ingestion hook');
  const ctx = vm.createContext({ normalizeBoardingFlight, nbrdEntriesFromPd, boardingLive: live,
    preparationLog: sample, selectedFlight: flight, selectedDate: date });
  vm.runInContext(block, ctx);
  const first = live.nbrdRecords(flight, date);
  assert.equal(first.length, 7);
  assert.deepEqual(first.find(row => row.nbrdBn === '001'), {
    rowNumber: first[0].rowNumber, nbrdBn: '001', nbrdDetail: 'MANUAL COMMENT', nbrdResolved: true
  });
  assert.equal(first.find(row => row.nbrdBn === '004').nbrdResolved, true, 'already boarded adult stays resolved');
  assert.throws(() => live.scan(flight, { flight, bn: '003', seat: '44K' }, date), { code: 'NBRD_MESSAGE' });
  vm.runInContext(block, ctx);
  assert.deepEqual(live.nbrdRecords(flight, date), first);
  assert.equal(events.length, 1, 'repeat import does not broadcast or write changes');
  assert.equal(live.nbrdRecords('MU578', date).length, 0);
  assert.equal(live.nbrdRecords(flight, '11OCT26').length, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM boarding_nbrd').get().n, 7);
});
