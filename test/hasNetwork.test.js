const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

function fixture() {
  let sent, callback;
  const request = new EventEmitter();
  request.setTimeout = (ms, cb) => { request.timeout = cb; };
  request.destroy = error => request.emit('error', error);
  request.end = body => { sent.body = body; };
  const sandbox = { module: { exports: {} }, URL, require: () => ({ request(options, cb) { sent = options; callback = cb; return request; } }) };
  vm.runInNewContext(fs.readFileSync('public/functions/proxy.js', 'utf8'), sandbox);
  const res = new EventEmitter();
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; res.headersSent = true; };
  return { proxy: sandbox.module.exports.proxy, res, request, sent: () => sent, respond: response => callback(response) };
}

test('HAS proxy rejects unauthenticated, unrelated and streaming requests', () => {
  for (const [path, method, auth, status] of [
    ['/has-network/has-pbb-api/context', 'GET', '', 401],
    ['/has-network/admin', 'GET', 'Bearer test', 404],
    ['/has-network/has-pbb-api/stream', 'GET', 'Bearer test', 404],
    ['/has-network/has-pbb-api/context', 'DELETE', 'Bearer test', 405],
  ]) {
    const f = fixture(); f.proxy({ url: path, method, headers: { authorization: auth } }, f.res);
    assert.equal(f.res.statusCode, status); assert.equal(f.sent(), undefined);
  }
});

test('HAS proxy preserves scope, bearer token, raw JSON and API error status without forwarding cookies', () => {
  const f = fixture(), body = Buffer.from('{"role":"spotter"}');
  f.proxy({ url: '/has-network/has-pbb-api/records?station=LAX&account=MU', method: 'POST', rawBody: body, headers: { authorization: 'Bearer test', cookie: 'secret', 'content-type': 'application/json' } }, f.res);
  assert.equal(f.sent().hostname, 'api.mufcapp.net');
  assert.equal(f.sent().path, '/has-pbb-api/records?station=LAX&account=MU');
  assert.equal(f.sent().headers.authorization, 'Bearer test'); assert.equal(f.sent().headers.cookie, undefined);
  assert.equal(f.sent().body, body);
  const response = new EventEmitter(); response.statusCode = 403; response.headers = { 'content-type': 'application/json', 'set-cookie': 'secret' }; response.pipe = res => { assert.equal(res, f.res); };
  f.respond(response); assert.equal(f.res.statusCode, 403); assert.equal(f.res.headers['set-cookie'], undefined);
  assert.equal(f.res.headers['Cache-Control'], 'private, no-store');
});

test('HAS PDF responses retain their download headers and upstream timeouts return 502', () => {
  const f = fixture(); f.proxy({ url: '/has-network/has-pbb-api/records/test/pdf', method: 'GET', headers: { authorization: 'Bearer test' } }, f.res);
  const response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="test.pdf"' }; response.pipe = () => {};
  f.respond(response); assert.equal(f.res.headers['content-type'], 'application/pdf'); assert.match(f.res.headers['content-disposition'], /test.pdf/);
  const failed = fixture(); failed.proxy({ url: '/has-network/profile-api', method: 'GET', headers: { authorization: 'Bearer test' } }, failed.res);
  failed.request.timeout(); assert.equal(failed.res.statusCode, 502);
});

test('HAS transport selects same origin in production and retains local/test overrides', () => {
  const script = fs.readFileSync('public/public/has-network.js', 'utf8');
  for (const [hostname, override, expected] of [['www.mufcapp.net', undefined, '/has-network'], ['localhost', undefined, undefined], ['www.mufcapp.net', 'http://test', 'http://test']]) {
    const context = { window: { MU_API_BASE: override }, location: { hostname } };
    vm.runInNewContext(script, context); assert.equal(context.window.MU_API_BASE, expected);
  }
});
