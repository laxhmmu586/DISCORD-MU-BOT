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

test('collection cache expires and returns defensive copies', () => {
  const { collectionCache, cachedRows, clearCache } = firestore._test;
  clearCache();
  collectionCache.set('cases', { rows:[{ firestoreId:'case-1', nested:{ status:'Open' } }], loadedAt:Date.now() });

  const first = cachedRows('cases');
  first[0].nested.status = 'Closed';

  assert.equal(cachedRows('cases')[0].nested.status, 'Open');
  assert.equal(cachedRows('cases', Date.now() + firestore.cacheTtlMs + 1), null);
  clearCache();
});

test('successful writes update an already populated collection cache', () => {
  const { collectionCache, cachedRows, replaceCachedRow, clearCache } = firestore._test;
  clearCache();
  collectionCache.set('cases', { rows:[{ firestoreId:'case-1', status:'Open' }], loadedAt:0 });

  replaceCachedRow('cases', { firestoreId:'case-1', status:'Closed' });
  replaceCachedRow('cases', { firestoreId:'case-2', status:'Open' });

  assert.deepEqual(cachedRows('cases'), [
    { firestoreId:'case-1', status:'Closed' },
    { firestoreId:'case-2', status:'Open' }
  ]);
  clearCache();
});

test('Firestore adapter has no legacy Sheet migration path', () => {
  const source = require('node:fs').readFileSync(require.resolve('../cbsFirestore'), 'utf8');
  assert.doesNotMatch(source, /ensureMigrated|_cbsMigrations|legacyLoader/);
});
