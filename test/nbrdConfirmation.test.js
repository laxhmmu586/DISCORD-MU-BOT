const test = require('node:test');
const assert = require('node:assert/strict');
const { createNbrdConfirmationStore } = require('../nbrdConfirmation');

test('first warning cannot board; repeated pass can be confirmed with a scoped token', () => {
  const store = createNbrdConfirmationStore();
  const key = store.key('MU586', '11OCT26', 'pass');
  const first = store.warning(key);
  assert.equal(first.canBoard, false);
  assert.equal(store.canBoard(first.confirmationToken, key), false);
  const second = store.warning(key, first.confirmationToken);
  assert.equal(second.canBoard, true);
  assert.equal(store.canBoard(second.confirmationToken, key), true);
  for (const different of [store.key('MU578', '11OCT26', 'pass'), store.key('MU586', '12OCT26', 'pass'), store.key('MU586', '11OCT26', 'other')]) {
    assert.equal(store.canBoard(second.confirmationToken, different), false);
  }
  store.consume(second.confirmationToken);
  assert.equal(store.canBoard(second.confirmationToken, key), false);
});

test('NOT OK can defer a second-scan decision, and expired challenges restart at the warning', () => {
  let now = 0;
  const store = createNbrdConfirmationStore({now:()=>now, ttlMs:100});
  const key = store.key('MU586', '11OCT26', 'pass');
  const first = store.warning(key);
  const second = store.warning(key, first.confirmationToken);
  const next = store.warning(key, second.confirmationToken);
  assert.equal(next.canBoard, true);
  now = 101;
  assert.equal(store.canBoard(next.confirmationToken, key), false);
  assert.equal(store.warning(key, next.confirmationToken).canBoard, false);
});

test('changed NBRD details reset the warning instead of reusing an older decision',()=>{
 const store=createNbrdConfirmationStore();const key=store.key('MU586','11OCT26','pass');
 const first=store.warning(key,undefined,'VISA');
 const second=store.warning(key,first.confirmationToken,'VISA');
 assert.equal(store.detail(second.confirmationToken,key),'VISA');
 const changed=store.warning(key,second.confirmationToken,'RE-SWIPE');
 assert.equal(changed.canBoard,false);assert.equal(store.canBoard(changed.confirmationToken,key),false);
});
