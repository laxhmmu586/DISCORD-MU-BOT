const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const handler = import('../deploy/has-network/worker.mjs');
const request = (path, options = {}) => new Request('https://www.mufcapp.net' + path, {
  ...options, headers: { Authorization: 'Bearer test', ...options.headers },
});

test('free proxy rejects missing authentication and unrelated paths/methods before fetching', async () => {
  const { proxy } = await handler;
  for (const [path, options, status] of [
    ['/has-network/has-pbb-api/context', { headers: { Authorization: '' } }, 401],
    ['/has-network/admin', {}, 404],
    ['/has-pbb-api/context', {}, 404],
    ['/has-network/has-pbb-api/context', { method: 'DELETE' }, 405],
  ]) {
    const response = await proxy(request(path, options), () => { throw Error('Must not fetch'); });
    assert.equal(response.status, status);
  }
});

test('free proxy preserves scope, raw JSON and bearer token without forwarding cookies', async () => {
  const { proxy } = await handler;
  const body = '{"role":"spotter"}';
  const response = await proxy(request('/has-network/has-pbb-api/records?station=LAX&account=MU', {
    method: 'POST', body, headers: { Cookie: 'secret', 'Content-Type': 'application/json' },
  }), async (url, options) => {
    assert.equal(url, 'https://api.mufcapp.net/has-pbb-api/records?station=LAX&account=MU');
    assert.equal(options.headers.get('Authorization'), 'Bearer test');
    assert.equal(options.headers.get('Cookie'), null);
    assert.equal(new TextDecoder().decode(options.body), body);
    assert.equal(options.redirect, 'manual');
    return Response.json({ error: 'Denied' }, { status: 403, headers: { 'Set-Cookie': 'secret' } });
  });
  assert.equal(response.status, 403); assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), { error: 'Denied' });
});

test('free proxy streams SSE immediately and retains PDF headers and binary bytes', async () => {
  const { proxy } = await handler;
  let streamController;
  const stream = new ReadableStream({ start(controller) { streamController = controller; } });
  const response = await proxy(request('/has-network/has-pbb-api/stream?account=MU'), async () =>
    new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  const reader = response.body.getReader();
  streamController.enqueue(new TextEncoder().encode('event: gates\ndata: {}\n\n'));
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: gates/);
  streamController.close();
  const pdf = await proxy(request('/has-network/has-pbb-api/records/test/pdf'), async () =>
    new Response(new Uint8Array([37,80,68,70,0,255]), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="test.pdf"',
    } }));
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf');
  assert.match(pdf.headers.get('Content-Disposition'), /test.pdf/);
  assert.deepEqual([...new Uint8Array(await pdf.arrayBuffer())], [37,80,68,70,0,255]);
});

test('free proxy rejects redirects and reports upstream failures without following URLs', async () => {
  const { proxy } = await handler;
  for (const fetcher of [async () => Response.redirect('https://other.invalid'), async () => { throw Error('offline'); }]) {
    const response = await proxy(request('/has-network/profile-api'), fetcher);
    assert.equal(response.status, 502); assert.equal(response.headers.get('Location'), null);
  }
});

test('free proxy bounds POST bodies with and without Content-Length', async () => {
  const { proxy } = await handler;
  for (const headers of [{}, { 'Content-Length': String(3 * 1024 * 1024) }]) {
    const response = await proxy(request('/has-network/has-pbb-api/records', {
      method: 'POST', body: new Uint8Array(2 * 1024 * 1024 + 1), headers,
    }), () => { throw Error('Must not fetch'); });
    assert.equal(response.status, 413);
  }
});

test('Hosting deployment has no billable function or serverless rewrite dependency', () => {
  const config = JSON.parse(fs.readFileSync('public/firebase.json', 'utf8'));
  assert.equal(config.functions, undefined);
  assert.equal(config.hosting.rewrites, undefined);
});

test('HAS transport selects same origin in production and retains local/test overrides', () => {
  const script = fs.readFileSync('public/public/has-network.js', 'utf8');
  for (const [hostname, override, expected] of [['www.mufcapp.net', undefined, '/has-network'], ['localhost', undefined, undefined], ['www.mufcapp.net', 'http://test', 'http://test']]) {
    const context = { window: { MU_API_BASE: override }, location: { hostname } };
    vm.runInNewContext(script, context); assert.equal(context.window.MU_API_BASE, expected);
  }
});
