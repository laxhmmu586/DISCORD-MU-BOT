const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const {WORKSPACE_PAGES, registerWorkspaceRoutes} = require('../workspaceRoutes');

test('workspace routes serve every clean URL and preserve deep-link queries on legacy redirects', async t => {
  const app = express(); registerWorkspaceRoutes(app);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const name of WORKSPACE_PAGES) {
    const response = await fetch(base + '/' + name); assert.equal(response.status, 200, name);
    assert.match(response.headers.get('content-type'), /text\/html/); assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text(); assert.match(html, /workspace-routes\.js/);
    for (const suffix of ['.html', '/']) {
      const old = await fetch(base + '/' + name + suffix + '?memo=a%2Fb&request=hello%20world', {redirect:'manual'});
      assert.equal(old.status, 301); assert.equal(old.headers.get('location'), '/' + name + '?memo=a%2Fb&request=hello%20world');
    }
  }
  assert.equal((await fetch(base + '/profile-api')).status, 404, 'page aliases do not catch API paths');
  assert.equal((await fetch(base + '/profile.css')).status, 404, 'page aliases do not rewrite assets');
});

test('Firebase and Express use the same canonical routes without changing the existing landing redirect', () => {
  const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/firebase.json'))).hosting;
  assert.deepEqual(hosting.redirects.find(r => r.source === '/'), {source:'/',destination:'/flights.html',type:302});
  for (const name of WORKSPACE_PAGES) {
    assert(hosting.redirects.some(r => r.source === '/' + name + '.html' && r.destination === '/' + name && r.type === 301));
    assert(hosting.rewrites.some(r => r.source === '/' + name && r.destination === '/has/' + name + '.html'));
  }
});

test('early URL normalization preserves query, fragment and history state while leaving other routes alone', () => {
  const source = fs.readFileSync(path.join(__dirname, '../has/public/workspace-routes.js'), 'utf8');
  for (const name of WORKSPACE_PAGES) {
    const calls = [], state = {entry:1};
    vm.runInNewContext(source, {location:{pathname:'/' + name + '.html',search:'?memo=123',hash:'#detail'},history:{state,replaceState:(...args)=>calls.push(args)}});
    assert.equal(calls.length, 1); assert.equal(calls[0][0], state); assert.equal(calls[0][2], '/' + name + '?memo=123#detail');
  }
  for (const pathname of ['/profile-api','/profile.css','/has-pbb.html','/briefing-api','/schedule']) {
    vm.runInNewContext(source, {location:{pathname},history:{replaceState:()=>assert.fail(pathname)}});
  }
});
