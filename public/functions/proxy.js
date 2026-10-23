// Fixed upstream and restricted routes: this endpoint is not a general URL proxy.
const https = require('node:https');

function proxy(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const url = new URL(req.originalUrl || req.url, 'https://www.mufcapp.net');
  const path = url.pathname.replace(/^\/has-network(?=\/)/, '');
  if (!/^\/(?:has-pbb-api(?:\/|$)|profile-api$)/.test(path) || path.includes('/stream')) {
    return res.status(404).json({ error: 'Unknown HAS endpoint.' });
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  if (!/^Bearer \S+$/.test(req.headers.authorization || '')) return res.status(401).json({ error: 'Sign in to continue.' });
  const body = req.method === 'POST' ? req.rawBody : undefined;
  if (body?.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Request too large.' });
  const headers = { authorization: req.headers.authorization, accept: 'application/json, application/pdf' };
  if (body) { headers['content-type'] = req.headers['content-type'] || 'application/json'; headers['content-length'] = body.length; }
  const upstream = https.request({ hostname: 'api.mufcapp.net', path: path + url.search, method: req.method, headers }, response => {
    res.statusCode = response.statusCode;
    for (const name of ['content-type', 'content-disposition']) if (response.headers[name]) res.setHeader(name, response.headers[name]);
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(45000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'HAS service is temporarily unavailable. Please try again.' });
    else res.destroy();
  });
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  upstream.end(body);
}

module.exports = { proxy };
