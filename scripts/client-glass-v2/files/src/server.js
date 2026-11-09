const {localLive}=require('./local-live');
const {desktopHtml}=require('./desktop-html');
const http = require('node:http');
const crypto = require('node:crypto');
const { cloudStatus } = require('./cloud-status');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { LogStore } = require('./log-store');
const { parseQuery, search, enrich } = require('./local-search');
const { excludedPage } = require('./desktop-policy');
const { SyncQueue } = require('./sync-queue');
const BRIDGE = require('../desktop-config.json').cloudBridgeUrl.replace(/\/$/,'');
const CLOUD = 'https://api.mufcapp.net';
const WEB = 'https://china-eastern.web.app';
const mime = { '.webp':'image/webp', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

async function startServer(settings, secret, port = 17865, syncFile = '', updateRoot = () => path.resolve(__dirname,'../web')) {
  const store = new LogStore(settings);
  const cachedSearch = require('./search-cache').createSearchCache(search);

  const verified = new Map();
  const cloudCache = new Map();
  const emailChecks = require('./email-checks').createEmailChecks();
  const completionFile = syncFile && path.join(path.dirname(syncFile), 'flight-module-completion.json');
  let completed = {};
  if (completionFile) {
    try { completed = JSON.parse(await fs.readFile(completionFile, 'utf8')) || {}; } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  let completionWrite = Promise.resolve();
  function rememberCompleted(sy) {
    const key = sy.flightNo + ':' + sy.flightDate;
    const entry = completed[key] ||= { steps: {} };
    let changed = false;
    for (const step of sy.crewApis?.steps || []) {
      if (['crewApis','net','ccl','cc','initialFlight','bdtChg'].includes(step.key) && step.complete && !entry.steps[step.key]) {
        entry.steps[step.key] = step;
        changed = true;
      }
    }
    if (sy.fscRateSheetSync?.rate && !entry.fsc) {
      entry.fsc = { rate: sy.fscRateSheetSync.rate };
      changed = true;
    }
    if (!changed) return;
    for (const oldKey of Object.keys(completed).slice(0, Math.max(0, Object.keys(completed).length - 120))) delete completed[oldKey];
    if (completionFile) completionWrite = completionWrite.then(async () => {
      const pending = completionFile + '.tmp';
      await fs.writeFile(pending, JSON.stringify(completed));
      await fs.rename(pending, completionFile);
    }).catch(error => console.error('MUFC completion save failed:', error.message));
  }
  const syncQueue = new SyncQueue(syncFile,BRIDGE); await syncQueue.load();
  const visa = require('./visa-service').createVisaService(syncFile ? path.join(path.dirname(syncFile), 'visa') : await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'mufc-visa-test-')), {monitoring:Boolean(syncFile)});
  let firebaseConfig;
  let onlineAuthorization='', onlineUntil=0;
  const publisher=require('./updates/publisher.cjs').createPublisher({store,context:require('./flight-context'),getAuthorization:()=>Date.now()<onlineUntil?onlineAuthorization:''});
  const publishTimer=setInterval(()=>void publisher.tick(),10000);publishTimer.unref();
  const json = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  async function config() {
    if (!firebaseConfig) firebaseConfig = require('../web/assets/firebase-config.json');
    return firebaseConfig;
  }
  async function authenticated(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return false;
    if ((verified.get(token) || 0) > Date.now()) return true;
    const cfg = await config();
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) return false;
    const result = await response.json();
    if (!result.users?.length) return false;
    if (verified.size > 25) verified.clear();
    verified.set(token, Date.now() + 5 * 60 * 1000);
    return true;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host}`;
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '') || req.headers['x-mufc-session'] !== secret) return json(res, { error: 'Desktop session required.' }, 403);
      if (req.headers.origin && req.headers.origin !== origin) return json(res, { error: 'Origin rejected.' }, 403);
      const url = new URL(req.url, origin);
      if(url.pathname==='/desktop-auth') {
        if(req.method==='DELETE'){onlineAuthorization='';onlineUntil=0;return json(res,{signedOut:true});}
        if(req.method!=='POST'||!await authenticated(req))return json(res,{error:'Employee sign-in required.'},401);
        const access=await fetch(CLOUD+'/desktop-access',{headers:{Authorization:req.headers.authorization}});
        if(!access.ok){let details={};try{details=await access.json();}catch{}return json(res,{error:details.error||'Employee sign-in failed. Please try again.',code:details.code||'DESKTOP_REQUIRED'},access.status);}
        onlineAuthorization=req.headers.authorization;
        onlineUntil=Date.now()+Math.min(55*60000,Math.max(0,JSON.parse(Buffer.from(onlineAuthorization.split('.')[1],'base64url')).exp*1000-Date.now()));
        void publisher.tick();return json(res,{approved:true});
      }
      const sessionReady=onlineAuthorization&&Date.now()<onlineUntil;
      const localPath=decodeURIComponent(url.pathname).replace(/\\/g,'/').replace(/\/{2,}/g,'/');
      const canonical=localPath.toLowerCase().replace(/[ .\/]+$/,'');
      if(/^\/(?:boarding-pass(?:[./-]|$)|reissue(?:[./-]|$))/.test(canonical))return json(res,{error:'This feature has moved to LakeTerm.'},410);
      if(canonical==='/reports.html'){res.writeHead(302,{Location:'/report.html'});return res.end();}
      const protectedPage=/^\/(?:index|report|reports|mufc-report|cbs|cbs-form|pir-form|has-pbb|has-pbb-dashboard)(?:\.html)?$/.test(canonical)||url.pathname==='/';
      if(protectedPage&&!sessionReady){res.writeHead(302,{Location:'/login.html','Cache-Control':'no-store'});return res.end();}
      if(sessionReady&&!req.headers.authorization)req.headers.authorization=onlineAuthorization;
      if((['/search','/local-flights','/sy-live-stream'].includes(url.pathname)||url.pathname.startsWith('/sales-report/'))&&!sessionReady)return json(res,{error:'Employee sign-in required.'},401);
 
      if (await visa.handle(req, res, url)) return;
      if (url.pathname === '/__/firebase/init.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        return res.end(`firebase.initializeApp(${JSON.stringify(await config())});`);
      }
      if (excludedPage(url.pathname)) return json(res, { error: 'Not included in MUFC Desktop.' }, 404);
      if(url.pathname==='/nextday-info/send'&&req.method==='POST'){
        if(!sessionReady||!await authenticated(req))return json(res,{error:'Employee sign-in required.'},401);
        let input='';for await(const chunk of req){input+=chunk;if(Buffer.byteLength(input)>16384)throw Error('Request too large.');}
        const body=JSON.parse(input||'{}'),flightNo=body.flightNo||'MU586';
        const context=require('./flight-context');if(!context.SUPPORTED_FLIGHTS.includes(flightNo))throw Error('Invalid flight.');
        const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],today=context.operationalDate(),d=new Date(Date.UTC(2000+Number(today.slice(-2)),months.indexOf(today.slice(2,5)),Number(today.slice(0,2))+1));
        const date=String(d.getUTCDate()).padStart(2,'0')+months[d.getUTCMonth()]+String(d.getUTCFullYear()).slice(-2);
        const log=await store.read(),sy=require('../legacy/syParser').findSYInfo(log,date,{preferredFlightNo:flightNo,strictPreferredFlight:true,preparationLog:log});
        if(!sy?.reservationTicketed||!sy.jcsy?.complete||!sy.jcsy.paginationComplete)return json(res,{error:'Complete next-day SY/JCSY is required in local logs.'},400);
        const terminalSy={flightNo,flightDate:date,reservationTicketed:['',...sy.reservationTicketed.slice(1,4).map(Number)],jcsy:{complete:true,paginationComplete:true,rows:sy.jcsy.rows.map(row=>({total:row.total,departure:row.departure||row.depart,overnight:row.overnight,isDomestic:row.isDomestic,category:row.category,market:row.market}))}};
        const response=await fetch(CLOUD+'/nextday-info/send',{method:'POST',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body:JSON.stringify({flightNo,terminalSy}),signal:AbortSignal.timeout(60000)});
        return json(res,await response.json(),response.status);
      }
      if (url.pathname === '/sy-live-stream') return localLive(req,res,settings,url.searchParams.get('q')||'SY');
      if (/^\/(?:irr(?:\/|-|$))/.test(url.pathname)) return json(res, {error:'This feature is available in the web version only.'}, 404);
      if (url.pathname === '/local-flights' && !req.headers.authorization) {
        const { discoverFlights, operationalDate } = require('./flight-context');
        return json(res, { flights:discoverFlights(await store.read(), {date:operationalDate()}), source:'local' });
      }
      if (url.pathname === '/search' && !/^SY\+?(?:\s+[A-Z]{2}\d{1,4}[A-Z]?)?(?:\/\d{2}[A-Z]{3}(?:\d{2})?)?$/i.test(url.searchParams.get('q')||'')) return json(res,{error:'Passenger lookup is not included in MUFC Desktop.'},404);
      if (url.pathname === '/search') {
        const q = url.searchParams.get('q') || '';
        const context = {flightNo:(url.searchParams.get('flightNo') || '').toUpperCase(),flightDate:(url.searchParams.get('flightDate') || '').toUpperCase()};
        const log = await store.read(parseQuery(q).date || (url.searchParams.get('source') === 'history' ? context.flightDate : null));
        if (req.headers.authorization) {
          const date = parseQuery(q).date || context.flightDate;
          if (date) context.completed = completed[context.flightNo + ':' + date];
        }
        const local = cachedSearch(log, q, context);
        if (!local.sy) return json(res,local);
        local.sy.bagSheet=require('./updates/terminal-bags.cjs').bagInfo(local.sy,require('../legacy/syParser').findBoardingBoxInfo(require('./flight-context').scopedLog(log,local.sy.flightNo,local.sy.flightDate),local.sy.flightNo,local.sy.flightDate));
        const operational=publisher.snapshot()?.flights?.find(f=>f.flightNo===local.sy.flightNo&&f.flightDate===local.sy.flightDate);
        if(operational)Object.assign(local.sy,{gate:operational.gate,bdt:operational.bdt,ed:operational.ed,sd:operational.sd});
        if (req.headers.authorization) rememberCompleted(local.sy);
        local.sy.localLogRevision = crypto.createHash('sha256').update(log).digest('hex');
        require('./updates/local-checks.cjs').applyLocalChecks(log,local.sy,{...require('../legacy/flightParser'),...require('../legacy/syParser'),...require('../legacy/spmlParser'),compareGdPdfText:require('./updates/gd-compare.cjs').compareGdPdfText});
        emailChecks(local.sy,req.headers.authorization || '');
        return json(res,local);
      }
      if(url.pathname==='/flight-day-sync')return json(res,{error:'Desktop publishing is main-process only.'},403);
      const webRoot=updateRoot(req.headers['x-mufc-ui-version']||'bundled');
      const relative = url.pathname === '/' ? '/index.html' : localPath;
      const file = path.resolve(webRoot, `.${relative}`);
      if (file.startsWith(webRoot + path.sep)) {
        try {
          let content = await fs.readFile(file);
          if (file.endsWith('.html')) {
            content = desktopHtml(content.toString('utf8'), req.headers['x-mufc-ui-version'] || 'bundled');
          }
          res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-src 'self' blob:; worker-src 'self' blob:" });
          return res.end(content);
        } catch (err) { if (err.code !== 'ENOENT' && err.code !== 'EISDIR') throw err; }
      }
      if (/^\/(?:has|mufc)-report-api(?:\/|$)/.test(url.pathname)) {
        const suffix=url.pathname.replace(/^\/(?:has|mufc)-report-api/,'');
        if (!/^\/(?:context$|(?:da|wwh|rechargeable)\/)/.test(suffix)) return json(res,{error:'Only LAX/MU DA, WWH and Rechargeable hours are included in MUFC.'},404);
        url.pathname='/mufc-report-api'+suffix;
      }
      if (!['GET', 'POST'].includes(req.method)) return json(res, { error: 'Unsupported method.' }, 405);
      // Online-only operations never inherit the local-file access permission.
      if (!await authenticated(req)) return json(res,{error:'Online sign-in is required for this feature.'},401);
      // Existing online business endpoints retain their current authentication and behavior.
      const headers = {};
      for (const name of ['authorization', 'content-type', 'accept', 'x-workspace-account']) if (req.headers[name]) headers[name] = req.headers[name];
      const init = { method: req.method, headers, signal: AbortSignal.timeout(url.pathname.includes('stream') ? 3600000 : 60000), redirect: 'error' };
      if (req.method === 'POST') { init.body = req; init.duplex = 'half'; }
      const upstreamPath = url.pathname === "/local-flights" ? "/flights" : url.pathname;
      const upstream = await fetch(`${CLOUD}${upstreamPath}${url.search}`, init);
      const outputHeaders = {};
      for (const name of ['content-type', 'content-disposition', 'cache-control']) if (upstream.headers.has(name)) outputHeaders[name] = upstream.headers.get(name);
      if (/^text\/html(?:;|$)/i.test(outputHeaders['content-type'] || '') && !outputHeaders['content-disposition']) {
        outputHeaders['Cache-Control'] = 'no-store';
        outputHeaders['X-Content-Type-Options'] = 'nosniff';
        outputHeaders['Content-Security-Policy'] = "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-src 'self' blob:; worker-src 'self' blob:";
        res.writeHead(upstream.status, outputHeaders);
        return res.end(desktopHtml(await upstream.text(), req.headers['x-mufc-ui-version'] || 'bundled'));
      }
      res.writeHead(upstream.status, outputHeaders);
      if (upstream.body) {
        const body = Readable.fromWeb(upstream.body);
        res.on('close', () => body.destroy());
        body.on('error', () => res.destroy());
        body.pipe(res);
      } else res.end();
    } catch (err) {
      if (!res.headersSent) json(res, { error: err.message }, 503);
      else res.destroy();
    }
  });
  server.on('close', () => {clearInterval(publishTimer);visa.close();});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, verifyToken: token => authenticated({ headers: { authorization: `Bearer ${token || ''}` } }),syncStatus:()=>publisher.status() };
}
module.exports = { startServer };
