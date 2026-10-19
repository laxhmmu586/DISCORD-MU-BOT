'use strict';
const { normalizeSupportedFlight, operationalDate } = require('./flightContext');
function registerBoardingBoxStream(app, { cache, date = operationalDate, timers = globalThis }) {
  app.post('/boarding-box/confirm', (req,res) => {
    const flightNo = normalizeSupportedFlight(req.query.flightNo);
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || flightDate !== date()) return res.status(400).json({error:'Please select today’s flight.'});
    try { return res.json(cache.confirm(flightNo,flightDate,req.body?.boxId,req.body?.confirmed)); }
    catch (error) { return res.status(error.status || 503).json({error:error.status ? error.message : 'Unable to save BOX selection. Please retry.'}); }
  });
  app.post('/boarding-box/number', (req,res) => {
    res.setHeader('Cache-Control','no-store');
    const flightNo = normalizeSupportedFlight(req.query.flightNo);
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || flightDate !== date()) return res.status(400).json({error:'Please select today’s flight.'});
    try { return res.json(cache.setNumber(flightNo,flightDate,req.body?.bn,req.body?.present)); }
    catch (error) { return res.status(error.status || 503).json({error:error.status ? error.message : 'Unable to save BOX number. Please retry.'}); }
  });
  app.get('/boarding-box/live-stream', async (req,res) => {
    const flightNo = normalizeSupportedFlight(req.query.flightNo);
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || flightDate !== date()) return res.status(400).json({error:'Please select today’s flight.'});
    let unsubscribe, heartbeat, closed = false;
    const close = () => { closed = true; unsubscribe?.(); timers.clearInterval(heartbeat); };
    res.on('close',close);
    try {
      await cache.read(flightNo,flightDate);
      if (closed) return;
      res.setHeader('Content-Type','text/event-stream');
      res.setHeader('Cache-Control','no-cache, no-transform');
      res.setHeader('Connection','keep-alive');
      res.setHeader('X-Accel-Buffering','no');
      res.flushHeaders?.(); res.write('retry: 3000\n\n');
      const send = data => {
        if (closed) return;
        if (res.writableLength > 1024 * 1024) { close(); res.end(); return; }
        res.write(`id: ${data.updatedAt}\nevent: box\ndata: ${JSON.stringify(data)}\n\n`);
      };
      unsubscribe = cache.subscribe(flightNo,flightDate,send);
      send(cache.snapshot(flightNo,flightDate) || {reset:true,flightNo,flightDate,updatedAt:cache.revision});
      heartbeat = timers.setInterval(() => {
        if (flightDate !== date()) {
          send({reset:true,flightNo,flightDate,updatedAt:cache.nextRevision()}); close(); res.end();
        } else if (res.writableLength > 1024 * 1024) { close(); res.end(); }
        else res.write(': keep-alive\n\n');
      },15000);
      heartbeat?.unref?.();
    } catch (error) {
      close();
      if (!res.headersSent) res.status(503).json({error:'BOX live updates unavailable.'});
      else res.end();
    }
  });
}
module.exports = { registerBoardingBoxStream };
