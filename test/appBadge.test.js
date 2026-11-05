const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const workerSource = fs.readFileSync('public/public/firebase-messaging-sw.js', 'utf8');
const pageSource = fs.readFileSync('has/public/app-badge.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function worker(saved = new Map(), {supported = true, failStorage = false} = {}) {
  const handlers = {}, badges = [], shown = [], messages = [];
  const self = {
    location:{origin:'https://www.mufcapp.net'},
    navigator:supported ? {setAppBadge:async n => badges.push(n), clearAppBadge:async () => badges.push(0)} : {},
    caches:{open:async () => {
      if (failStorage) throw Error('Storage unavailable');
      return {match:async key => saved.has(key) ? new Response(saved.get(key)) : undefined,
        put:async (key, response) => saved.set(key, await response.text())};
    }},
    registration:{showNotification:async (title, options) => shown.push({title,options})},
    clients:{matchAll:async () => [{postMessage:value => messages.push(value)}]},
    addEventListener:(name, callback) => {handlers[name] = callback;}
  };
  vm.runInNewContext(workerSource, {self, URL, Response});
  async function event(name, value) {let pending; handlers[name]({...value,waitUntil:p => {pending = p;}}); await pending;}
  const push = (id, patch = {}) => event('push', {data:{json:() => ({data:{type:'approval_required',
    badgeUid:'alice',badgeKey:'incident:'+id,badgeEventId:'event:'+id,title:'Approval required',...patch}})}});
  const sync = (count, keys = [], uid = 'alice', origin = 'https://www.mufcapp.net') => event('message', {
    source:{url:origin+'/home'},data:{type:'MUFC_BADGE_SYNC',uid,count,keys}
  });
  return {push,sync,badges,shown,messages,saved,handlers};
}

test('background pushes persist across worker restart and deduplicate notifications and active items', async () => {
  const f = worker();
  await Promise.all([f.push('one'), f.push('two'), f.push('one')]);
  assert.deepEqual(f.badges, [1,2]);
  assert.equal(f.shown.length, 3, 'Badging must not suppress normal delivery');
  const restarted = worker(f.saved);
  await restarted.push('two');
  assert.deepEqual(restarted.badges, []);
  await restarted.push('three');
  assert.deepEqual(restarted.badges, [3]);
  await restarted.sync(1, ['incident:four']);
  await restarted.push('four');
  assert.equal(restarted.badges.at(-1), 1, 'An item already counted by the inbox is not counted twice');
  await restarted.sync(0);
  await restarted.push('four');
  assert.equal(restarted.badges.at(-1), 0, 'Late duplicate delivery does not resurrect a read item');
  await restarted.push('four', {badgeEventId:'new-approval-stage'});
  assert.equal(restarted.badges.at(-1), 1, 'A new approval stage can require attention again');
});

test('logout clears badges, rejects stale account pushes and isolates the next account', async () => {
  const f = worker();
  await f.sync(4, ['incident:existing']);
  await f.push('wrong-account', {badgeUid:'bob'});
  assert.equal(f.badges.at(-1), 4);
  await f.sync(0, [], null);
  await f.push('after-logout');
  assert.equal(f.badges.at(-1), 0);
  await f.sync(2, [], 'bob');
  await f.push('old-account');
  assert.equal(f.badges.at(-1), 2);
  await f.push('bob-item', {badgeUid:'bob'});
  assert.equal(f.badges.at(-1), 3);
});

test('invalid badge messages cannot overwrite persisted state', async () => {
  const f = worker();
  await f.sync(3);
  await f.sync(-1);
  await f.sync(0, [], 'alice', 'https://other.example');
  await f.sync('9');
  assert.deepEqual(f.badges, [3]);
});

test('unsupported Badging API and storage failures never block push notifications', async () => {
  for (const options of [{supported:false},{failStorage:true}]) {
    const f = worker(new Map(), options);
    await f.push('one');
    assert.equal(f.shown.length, 1);
    assert.deepEqual(f.badges, []);
  }
});

function page({supported = true, initialData = null} = {}) {
  const {window,document} = parseHTML('<html><body></body></html>');
  const badges = [], messages = [], callbacks = [];
  let reloads = 0, authChanged;
  window.RequestInbox = {data:initialData, load:() => {reloads++;}};
  const navigator = {
    ...(supported ? {setAppBadge:async n => badges.push(n),clearAppBadge:async () => badges.push(0)} : {}),
    serviceWorker:{getRegistration:async () => ({active:{postMessage:value => messages.push(value)}}),
      addEventListener:(name,callback) => callbacks.push(callback)}
  };
  vm.runInNewContext(pageSource, {window,document,navigator,
    firebase:{auth:() => ({onAuthStateChanged:fn => {authChanged = fn;}})}});
  const auth = user => authChanged?.(user);
  const inbox = data => window.dispatchEvent(new window.CustomEvent('request-inbox-updated',{detail:data}));
  return {window,document,badges,messages,callbacks,auth,inbox,reloads:() => reloads};
}
const inboxData = () => ({uid:'alice',groups:Array.from({length:5}, () => ({})),rows:[
  {kind:'incident',r:{id:'review',canReview:true}},
  {kind:'uniform',r:{id:'complete',canComplete:true}},
  {kind:'expense',r:{id:'revision',needsRevision:true}},
  {kind:'terrific',r:{id:'finished'}}],reminderMessages:[{id:'reminder',badgeKey:'hr_reminder:r|due'},{id:'read',readAt:'today'}],
  readSignMemos:[{id:'memo',myStatus:'pending'}],signCount:1,scheduleItems:[{requestId:'schedule'}]});

test('foreground badge matches notification bell, skips incomplete/failed reads and clears when finished', async () => {
  const f = page({initialData:inboxData()});
  f.auth({uid:'alice'});
  await settle();
  assert.deepEqual(f.badges, [6]);
  assert.deepEqual(Array.from(f.messages[0].keys), ['incident:review','uniform:complete','expense:revision','hr_reminder:r|due','read_sign:memo','schedule:schedule']);
  f.inbox(null);
  f.inbox({...inboxData(),uid:'bob'});
  f.inbox({groups:[],rows:[],signCount:0});
  f.inbox({...inboxData(),scheduleError:true});
  f.inbox({...inboxData(),readSignError:true});
  f.inbox({...inboxData(),groups:[{error:'offline'},...Array(4).fill({})]});
  await settle();
  assert.deepEqual(f.badges, [6]);
  f.inbox({...inboxData(),rows:[],reminderMessages:[],signCount:0,scheduleItems:[],readSignMemos:[]});
  await settle();
  assert.equal(f.badges.at(-1), 0);
  assert.equal(f.messages.at(-1).count, 0);
  f.auth(null);
  await settle();
  assert.equal(f.messages.at(-1).uid, null);
});

test('foreground push and returning to the app refresh the actual inbox', () => {
  const f = page();
  f.auth({uid:'alice'});
  f.callbacks[0]({data:{type:'MUFC_BADGE_PUSH'}});
  f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  assert.equal(f.reloads(), 2);
});

test('explicit logout awaits badge clearing before navigation and cancels queued account updates', async () => {
  const f = page();
  f.auth({uid:'alice'});
  f.inbox(inboxData());
  await f.window.mufcClearAppBadge();
  assert.equal(f.badges.at(-1), 0);
  assert.equal(f.messages.at(-1).uid, null);
  assert(!f.messages.some(message => message.uid === 'alice'));
});

test('unsupported browsers need no permission or badge initialization', () => {
  const f = page({supported:false});
  f.inbox(inboxData());
  assert.deepEqual(f.badges, []);
  assert.deepEqual(f.messages, []);
});
