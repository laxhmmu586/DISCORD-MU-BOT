'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isWorldTracerOnlyRushBagUpdate } = require('../rushBagNotification');

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
