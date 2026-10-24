// Use a Cloudflare Workers FREE account. No paid bindings or Google Cloud services.
const PREFIX = '/has-network';
const MAX_BODY = 2 * 1024 * 1024;
const json = (status, error) => Response.json({ error }, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function proxy(request, fetchUpstream = fetch) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith(PREFIX + '/')) return json(404, 'Unknown HAS endpoint.');
  const path = incoming.pathname.slice(PREFIX.length);
  if (!/^\/(?:has-pbb-api(?:\/|$)|profile-api$)/.test(path)) return json(404, 'Unknown HAS endpoint.');
  if (!['GET', 'POST'].includes(request.method)) return json(405, 'Method not allowed.');
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) return json(401, 'Sign in to continue.');
  const headers = new Headers({ Authorization: authorization, Accept: 'application/json, application/pdf, text/event-stream' });
  let body;
  if (request.method === 'POST') {
    if (Number(request.headers.get('Content-Length')) > MAX_BODY) return json(413, 'Request too large.');
    // Enforce the limit while reading even when Content-Length is omitted.
    const reader = request.body?.getReader(), chunks = [];
    let length = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY) { await reader.cancel(); return json(413, 'Request too large.'); }
        chunks.push(value);
      }
    }
    body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
  }
  // Never accept a client-supplied host or follow a redirect with a bearer token.
  const target = new URL('https://api.mufcapp.net');
  target.pathname = path;
  target.search = incoming.search;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchUpstream(target.href, {
      method: request.method, headers, body, redirect: 'manual', signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return json(502, 'Unexpected HAS service redirect.');
    }
    const output = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['Content-Type', 'Content-Disposition']) {
      if (response.headers.has(name)) output.set(name, response.headers.get(name));
    }
    if ((output.get('Content-Type') || '').includes('text/event-stream')) {
      output.set('Cache-Control', 'private, no-store, no-transform');
      output.set('X-Accel-Buffering', 'no');
    }
    // Stream PDFs and SSE directly, without buffering, storage or paid bindings.
    return new Response(response.body, { status: response.status, headers: output });
  } catch {
    return json(502, 'HAS service is temporarily unavailable. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

export default { fetch: request => proxy(request) };
