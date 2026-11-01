const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../has/public/home-auth.js'), 'utf8');

function fixture(firebaseAvailable = true) {
  const classes = new Set(['home-auth-pending']);
  const redirects = [];
  let observer, onError;
  const firebase = firebaseAvailable ? {apps: [{}], auth: () => ({onAuthStateChanged(next, error) { observer = next; onError = error; }})} : undefined;
  vm.runInNewContext(source, {
    window: {firebase},
    document: {documentElement: {classList: {add: value => classes.add(value), remove: value => classes.delete(value)}}},
    location: {replace: url => redirects.push(url)}
  });
  return {classes, redirects, auth: user => observer(user), error: () => onError(new Error('Auth unavailable'))};
}

test('Home remains concealed until restored authentication is resolved', () => {
  const f = fixture();
  assert.ok(f.classes.has('home-auth-pending'));
  assert.deepEqual(f.redirects, []);
  f.auth({uid: 'signed-in-user'});
  assert.ok(!f.classes.has('home-auth-pending'));
  assert.deepEqual(f.redirects, []);
});

test('signed-out visits and subsequent sign-out conceal Home and replace the URL with HAS login', () => {
  for (const previouslySignedIn of [false, true]) {
    const f = fixture();
    if (previouslySignedIn) f.auth({uid: 'signed-in-user'});
    f.auth(null);
    assert.ok(f.classes.has('home-auth-pending'));
    assert.deepEqual(f.redirects, ['/has-login.html']);
  }
});

test('missing Firebase or auth errors cannot reveal Home', () => {
  const missing = fixture(false);
  assert.ok(missing.classes.has('home-auth-pending'));
  assert.deepEqual(missing.redirects, ['/has-login.html']);
  const failed = fixture();
  failed.error();
  assert.ok(failed.classes.has('home-auth-pending'));
  assert.deepEqual(failed.redirects, ['/has-login.html']);
});

test('Home conceals content before scripts load and checks auth after Firebase initializes', () => {
  const html = fs.readFileSync(require.resolve('../has/public/home.html'), 'utf8');
  assert.match(html, /<html[^>]+class="home-auth-pending"/);
  assert.match(html, /html\.home-auth-pending body\{visibility:hidden\}/);
  assert.ok(html.indexOf('/__/firebase/init.js') < html.indexOf('/has/home-auth.js'));
  assert.ok(html.indexOf('/has/home-auth.js') < html.indexOf('/home.js'));
});
