const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CBS_FIRESTORE_ENABLED = 'false';
const firestore = require('../cbsFirestore');

test('CBS targets the laxmufc Firestore database by default', () => {
  assert.equal(firestore.databaseId, 'laxmufc');
});

test('Firestore codec preserves CBS records', () => {
  const record = { rowNumber:2, status:'Open', active:true, flightRows:[{ from:'LAX', to:'PVG' }], empty:null };
  const encoded = firestore._test.encodeValue(record);
  assert.deepEqual(firestore._test.decodeValue(encoded), record);
});

test('legacy Sheet rows receive deterministic Firestore document IDs', () => {
  assert.equal(firestore._test.documentId({ rowNumber:42, bagTag:'MU123456' }), 'legacy-42');
  assert.equal(
    firestore._test.documentId({ bagTag:'MU123456', createdAt:'2026-08-23T00:00:00Z' }),
    firestore._test.documentId({ bagTag:'MU123456', createdAt:'2026-08-23T00:00:00Z' })
  );
});
