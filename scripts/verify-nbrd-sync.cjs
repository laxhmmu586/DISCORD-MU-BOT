const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { operationalDate } = require('../flightContext');

(async () => {
  fs.mkdirSync(path.join(__dirname, '../.verification'), { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const viewport of [{ width: 1015, height: 700 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const pages = [], errors = [];
      let revision = 1;
      const rows = [
        { rowNumber: 1, nbrdBn: '004', nbrdDetail: 'TEST ONE', nbrdResolved: true },
        { rowNumber: 2, nbrdBn: '154', nbrdDetail: 'TEST TWO', nbrdResolved: true }
      ];
      const snapshot = () => ({ ok: true, live: true, revision, rows,
        nbrdFresh: true, nbrd: rows.filter(row => !row.nbrdResolved).map(row => ({ bn: row.nbrdBn, detail: row.nbrdDetail })) });
      const broadcast = async () => {
        for (const page of pages) await page.evaluate(data => {
          for (const stream of window.testStreams) stream.handlers.board?.({ data: JSON.stringify(data) });
        }, snapshot());
      };
      await context.addInitScript(date => {
        sessionStorage.setItem('mufc-online-flight', JSON.stringify({ flightNo: 'MU586', flightDate: date }));
        window.testStreams = [];
        window.EventSource = class {
          constructor() { this.handlers = {}; window.testStreams.push(this); }
          addEventListener(name, fn) { this.handlers[name] = fn; }
          close() {}
        };
      }, operationalDate());
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'api.mufcapp.net') {
          assert.equal(url.searchParams.get('flightNo'), 'MU586');
          assert.equal(url.searchParams.get('flightDate'), operationalDate());
          if (request.method() === 'POST') {
            const body = request.postDataJSON();
            if (url.pathname.endsWith('/resolve')) rows.find(row => row.nbrdBn === body.bn).nbrdResolved = body.resolved;
            else if (url.pathname.endsWith('/nbrd-bns')) rows.push({ rowNumber: 3, nbrdBn: String(body.entries[0].bn).padStart(3, '0'), nbrdDetail: body.entries[0].detail, nbrdResolved: false });
            else throw new Error('Unexpected mutation: ' + url.pathname);
            revision++;
            await broadcast();
          }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot()) });
        }
        if (url.hostname !== 'www.mufcapp.net') return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (url.pathname === '/__/firebase/init.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.firebase={apps:[{}],auth:()=>({currentUser:{},onAuthStateChanged:fn=>setTimeout(()=>fn({}),0)})};' });
        const file = path.join(__dirname, '../public/public', url.pathname);
        return route.fulfill({ status: fs.existsSync(file) ? 200 : 404,
          contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
          body: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '' });
      });
      const scan = await context.newPage(), board = await context.newPage(); pages.push(scan, board);
      pages.forEach(page => page.on('pageerror', error => errors.push(error.message)));
      await Promise.all([scan.goto('https://www.mufcapp.net/scan.html'), board.goto('https://www.mufcapp.net/m-board.html')]);
      const check = async (total, pending, resolved) => {
        for (const page of pages) {
          await page.waitForFunction(({ total, pending, resolved }) =>
            document.querySelector('.nbrd-count')?.textContent === `Total ${total} · Pending ${pending} · Resolved ${resolved}` &&
            document.querySelectorAll('.nbrd-bubble').length === total &&
            document.querySelectorAll('.nbrd-bubble.is-resolved').length === resolved,
          { total, pending, resolved }).catch(async error => {
            console.error(page.url(), await page.locator('body').innerText());
            throw error;
          });
          assert.equal(await page.locator('.nbrd-resolved-badge').count(), resolved);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      };
      await check(2, 0, 2);
      await scan.waitForFunction(() => !document.querySelector('#start').disabled);
      assert.match(await scan.locator('#nbrd-form').innerText(), /NBRD live · 2 entries/);
      // Exact screenshot case: two resolved BNs remain on both pages.
      for (const page of pages) assert.deepEqual(await page.locator('.nbrd-bubble').evaluateAll(nodes => nodes.map(node => node.firstChild.textContent)), ['004', '154']);
      await board.getByRole('button', { name: 'BN 004, resolved', exact: true }).click();
      await board.getByRole('button', { name: 'Mark NBRD pending', exact: true }).click();
      await check(2, 1, 1);
      await scan.getByRole('button', { name: 'BN 004, pending', exact: true }).click();
      await scan.getByRole('button', { name: 'Mark NBRD resolved', exact: true }).click();
      await check(2, 0, 2);
      await scan.waitForFunction(() => !document.querySelector('.nbrd-modal').open);
      await scan.locator('#nbrd-bn').fill('21');
      assert.equal(await scan.locator('#nbrd-bn').inputValue(), '21');
      await scan.locator('#nbrd-form button').click();
      await check(3, 1, 2);
      await scan.locator('#dialog-ok').click();
      await board.getByRole('button', { name: 'Refresh', exact: true }).first().click();
      await check(3, 1, 2);
      await board.reload(); await check(3, 1, 2);
      if (viewport.width === 1015) await board.screenshot({ path: '.verification/nbrd-sync-desktop.png', fullPage: true });
      else await board.screenshot({ path: '.verification/nbrd-sync-mobile.png', fullPage: true });
      rows.splice(0); revision++; await broadcast(); await check(0, 0, 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: desktop/mobile pages share all resolved/pending BNs and counts across bidirectional live changes, additions, refresh, reload and clearing.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
