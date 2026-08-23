const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CBS_FIRESTORE_ENABLED = 'false';
const firestore = require('../cbsFirestore');

test('CBS targets the laxmufc Firestore database by default', () => {
  assert.equal(firestore.databaseId, 'laxmufc');
});

test('Firestore codec preserves CBS records', () => {
  const record = {
    rowNumber:2,
    status:'Open',
    active:true,
    flightRows:[{ from:'LAX', to:'PVG' }],
    updateEvents:[{ title:'Update', fields:[['File Number', 'LAXMU12345'], ['Status', 'Open']] }],
    empty:null
  };
  const encoded = firestore._test.encodeValue(record);
  assert.deepEqual(firestore._test.decodeValue(encoded), record);
});

test('Firestore codec never emits an array directly inside another array', () => {
  const encoded = firestore._test.encodeValue([[1, 2], ['label', 'value']]);
  assert.ok(encoded.arrayValue.values.every((value) => value.mapValue));
});

test('legacy Sheet rows receive deterministic Firestore document IDs', () => {
  assert.equal(firestore._test.documentId({ rowNumber:42, bagTag:'MU123456' }), 'legacy-42');
  assert.equal(
    firestore._test.documentId({ bagTag:'MU123456', createdAt:'2026-08-23T00:00:00Z' }),
    firestore._test.documentId({ bagTag:'MU123456', createdAt:'2026-08-23T00:00:00Z' })
  );
});

test('Firestore batch writes collapse duplicate document targets', () => {
  const records = [
    { firestoreId:'same-report-row', value:'old' },
    { firestoreId:'other-report-row', value:'other' },
    { firestoreId:'same-report-row', value:'new' }
  ];
  assert.deepEqual(firestore._test.dedupeRecords(records), [
    { firestoreId:'same-report-row', value:'new' },
    { firestoreId:'other-report-row', value:'other' }
  ]);
});

test('Firestore migration caching never caches collection results', () => {
  const source = require('node:fs').readFileSync(require.resolve('../cbsFirestore'), 'utf8');
  assert.match(source, /await migrations\.get\(collection\);[\s\S]*return list\(collection\);/);
  assert.doesNotMatch(source, /return migrations\.get\(collection\)/);
});
