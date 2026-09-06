'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findLinkedRushBagRecords, isDuplicateRushBagNotification, isWorldTracerOnlyRushBagUpdate } = require('../rushBagNotification');

const rushBag = (overrides = {}) => ({
  worldTracerFileNumber: '',
  originalTagNumber: '7006268330',
  rushTagNumber: '3781246944',
  flightRows: [{ flightDate: '2026-09-03', flightNumber: 'MU586', from: 'LAX', to: 'PVG' }],
  ...overrides
});

test('adding a WorldTracer file number is a WorldTracer-only Rush Bag update', () => {
  assert.equal(isWorldTracerOnlyRushBagUpdate(
    rushBag(),
    rushBag({ worldTracerFileNumber: 'LAXMU16703' })
  ), true);
});

test('normalization does not turn formatting-only differences into notification changes', () => {
  assert.equal(isWorldTracerOnlyRushBagUpdate(
    rushBag(),
    rushBag({
      worldTracerFileNumber: ' laxmu16703 ',
      originalTagNumber: ' 7006268330 ',
      flightRows: [{ flightDate: '2026-09-03', flightNumber: 'mu586', from: 'lax', to: 'pvg' }]
    })
  ), true);
});

test('an itinerary or tag change still requires a new Rush Bag notification', () => {
  assert.equal(isWorldTracerOnlyRushBagUpdate(
    rushBag(),
    rushBag({
      worldTracerFileNumber: 'LAXMU16703',
      flightRows: [{ flightDate: '2026-09-04', flightNumber: 'MU586', from: 'LAX', to: 'PVG' }]
    })
  ), false);
  assert.equal(isWorldTracerOnlyRushBagUpdate(
    rushBag(),
    rushBag({ worldTracerFileNumber: 'LAXMU16703', rushTagNumber: '9999999999' })
  ), false);
});

test('saving without changing the WorldTracer file number is not a WorldTracer-only update', () => {
  const record = rushBag({ worldTracerFileNumber: 'LAXMU16703' });
  assert.equal(isWorldTracerOnlyRushBagUpdate(record, { ...record }), false);
});

test('the same RUSH tag and itinerary is a duplicate notification', () => {
  assert.equal(isDuplicateRushBagNotification(
    rushBag(),
    rushBag({
      worldTracerFileNumber: 'LAXMU16703',
      originalTagNumber: 'MU268330',
      rushTagNumber: ' 3781-246944 ',
      flightRows: [{ flightDate: '2026-09-03', flightNumber: 'mu586', from: 'lax', to: 'pvg' }]
    })
  ), true);
});

test('a changed RUSH tag or itinerary is not a duplicate notification', () => {
  assert.equal(isDuplicateRushBagNotification(rushBag(), rushBag({ rushTagNumber: '3781246999' })), false);
  assert.equal(isDuplicateRushBagNotification(rushBag(), rushBag({
    flightRows: [{ flightDate: '2026-09-04', flightNumber: 'MU586', from: 'LAX', to: 'PVG' }]
  })), false);
});

test('Rush records are linked transitively by original and RUSH tags', () => {
  const records = [
    rushBag({ originalTagNumber:'ORIGINAL-1', rushTagNumber:'RUSH-1' }),
    rushBag({ originalTagNumber:'OTHER', rushTagNumber:' rush1 ' }),
    rushBag({ originalTagNumber:'OTHER', rushTagNumber:'RUSH-2' }),
    rushBag({ originalTagNumber:'UNRELATED', rushTagNumber:'RUSH-3' })
  ];
  const linked = findLinkedRushBagRecords(records, { originalTagNumber:'original1' });
  assert.equal(linked.length, 3);
  assert.deepEqual(new Set(linked.map((record) => record.rushTagNumber)), new Set(['RUSH-1', ' rush1 ', 'RUSH-2']));
});
