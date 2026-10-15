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
      context.setDefaultTimeout(15000);
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
          contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript',
          body: fs.existsSync(file) ? fs.readFileSync(file) : '' });
      });
      const scan = await context.newPage(), board = await context.newPage(), emergency = await context.newPage(); pages.push(scan, board, emergency);
      pages.forEach(page => page.on('pageerror', error => errors.push(error.message)));
      await Promise.all([scan.goto('https://www.mufcapp.net/scan.html'), board.goto('https://www.mufcapp.net/m-board.html'), emergency.goto('https://www.mufcapp.net/scan2.html')]);
      assert.equal(await emergency.evaluate(() => ['586','9586','578','9578'].every(flight => isEmergencyBarcode(`MU${flight}|BN014`) && isEmergencyBarcode(`MU${flight}|INF|INF014`))), true);
      assert.equal(await emergency.evaluate(() => isEmergencyBarcode('MU583|BN014')), false);
      const check = async (total, pending, resolved) => {
        for (const page of pages) {
          await page.waitForFunction(({ total, pending, resolved }) =>
            !document.querySelector('.nbrd-count') &&
            document.querySelectorAll('.nbrd-bubble').length === total &&
            document.querySelectorAll('.nbrd-bubble.is-resolved').length === resolved,
          { total, pending, resolved }).catch(async error => {
            console.error(page.url(), await page.locator('body').innerText());
            throw error;
          });
          assert.equal(await page.locator('.nbrd-resolved-badge').count(), 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      };
      await check(2, 0, 2);
      await board.evaluate(() => window.testStreams[0].onopen());
      assert.equal(await board.locator('#boarding-live-indicator').isVisible(), true);
      assert.equal(await board.locator('#boarding-live-indicator').evaluate(node=>getComputedStyle(node).backgroundColor), 'rgb(53, 201, 154)');
      assert.equal(await board.locator('#status').isVisible(), false);
      assert.doesNotMatch(await board.locator('body').innerText(), /Scanned \d|Total \d+ · Pending|\nLive\n/);
      await board.evaluate(() => window.testStreams[0].onerror());
      assert.equal(await board.locator('#boarding-live-indicator').isVisible(), false);
      await board.evaluate(() => window.testStreams[0].onopen());
      await scan.waitForFunction(() => !document.querySelector('#start').disabled);
      assert.equal(await scan.locator('#nbrd-entry-total').textContent(), '(2)');
      assert.equal(await scan.locator('.nbrd-add-status').isVisible(), false);
      assert.equal(await scan.locator('#add-nbrd').count(), 0, 'Standalone Add NBRD card is removed');
      assert.equal(await scan.locator('#nbrd-section #nbrd-form').count(), 1);
      assert.equal(await scan.locator('#nbrd-form button').textContent(), 'Add');
      assert.equal(await scan.locator('#nbrd-form label').count(), 0, 'No visible field labels in compact controls');
      assert.equal(await scan.getByRole('textbox', { name: 'BN', exact: true }).count(), 1);
      assert.equal(await scan.getByRole('combobox', { name: 'NBRD Message', exact: true }).count(), 1);
      assert.deepEqual(await scan.locator('#nbrd-message option').allTextContents(), ['NBRD', 'SEAT CHANGE', 'INV UPGRADE', 'VISA', 'RE-SWIPE']);
      for (const width of [320, 390, 640, 1015]) {
        await scan.setViewportSize({ width, height: 844 });
        const controls = await scan.locator('#nbrd-form').evaluate(form => [...form.querySelectorAll('input,select,button')].map(node => {
          const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, width:r.width };
        }));
        assert.equal(controls[0].y, controls[1].y);
        assert.equal(controls[1].y, controls[2].y);
        assert.ok(controls[0].right <= controls[1].x && controls[1].right <= controls[2].x);
        assert.ok(controls.every(control => control.width >= 64), 'All controls remain usable on small screens');
        assert.ok(controls[1].width >= 82, 'Message selector fits NBRD at the smallest width');
        assert.equal(await scan.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await scan.locator('#nbrd-section').screenshot({ path: `.verification/nbrd-inline-${width}.png` });
      }
      await scan.setViewportSize(viewport);
      assert.equal(await board.locator('.bn-heading').count(), 0);
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
      assert.equal(await scan.locator('#nbrd-entry-total').textContent(), '(3)');
      assert.equal(await scan.locator('#nbrd-section #nbrd-form').count(), 1, 'Tile redraw retains inline form');
      await scan.waitForFunction(() => document.querySelector('#nbrd-bn').value === '');
      if (await scan.locator('.nbrd-modal[open]').count()) await scan.getByRole('button', { name: 'Continue', exact: true }).click();
      await scan.locator('#dialog-ok').click();
      await board.getByRole('button', { name: 'Refresh', exact: true }).first().click();
      await check(3, 1, 2);
      await board.reload(); await check(3, 1, 2);
      await board.evaluate(() => window.testStreams[0].onopen());
      if (viewport.width === 1015) await board.screenshot({ path: '.verification/nbrd-sync-desktop.png', fullPage: true });
      else await board.screenshot({ path: '.verification/nbrd-sync-mobile.png', fullPage: true });
      await emergency.screenshot({ path: `.verification/scan2-${viewport.width}.png`, fullPage: true });
      // Keep the existing numeric BN order in dense responsive honeycomb panels.
      for (const count of [20, 30]) {
        rows.splice(0, rows.length, ...Array.from({ length: count }, (_, index) => ({
          rowNumber: index + 1, nbrdBn: String((index * 37 + 137) % 330).padStart(3, '0'),
          nbrdDetail: 'SANITIZED UI FIXTURE', nbrdResolved: index % 3 !== 0
        })));
        revision++; await broadcast();
        await check(count, Math.ceil(count / 3), count - Math.ceil(count / 3));
        for (const width of [320, 390, 640, 1015]) {
          for (const page of pages) {
            await page.bringToFront();
            await page.setViewportSize({ width, height: 844 });
            await page.waitForTimeout(80);
            const geometry = await page.locator('#nbrd-wrap .nbrd-bubbles, #nbrd-bns .nbrd-bubbles').evaluate(list => {
              const box = list.getBoundingClientRect();
              const tiles = [...list.children].map(tile => {
                const rect = tile.getBoundingClientRect();
                return { text: tile.textContent, left: rect.left, top: rect.top,
                  right: rect.right, bottom: rect.bottom, color: getComputedStyle(tile).color,
                  shape: getComputedStyle(tile).clipPath };
              });
              return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                height: box.height, scrollWidth: list.scrollWidth, width: list.clientWidth, tiles };
            });
            assert.deepEqual(geometry.tiles.map(tile => tile.text), rows.map(row => row.nbrdBn).sort((a,b) => Number(a) - Number(b)));
            assert.ok(geometry.scrollWidth <= geometry.width, JSON.stringify({url:page.url(),width,count,geometry}));
            assert.ok(geometry.height < (width <= 390 ? 400 : 720), '30 BNs fit in one compact panel');
            for (const tile of geometry.tiles) {
              assert.ok(tile.left >= geometry.left - .5 && tile.right <= geometry.right + .5);
              assert.ok(tile.top >= geometry.top && tile.bottom <= geometry.bottom + .5);
              assert.equal(tile.color, 'rgb(255, 255, 255)');
              assert.match(tile.shape, /nbrd-hexagon/);
            }
            const tops = [...new Set(geometry.tiles.map(tile => Math.round(tile.top)))];
            const first = geometry.tiles.filter(tile => Math.round(tile.top) === tops[0]);
            const second = geometry.tiles.filter(tile => Math.round(tile.top) === tops[1]);
            assert.equal(second.length, first.length - 1, 'offset row has one fewer tile');
            assert.ok(second[0].left > first[0].left, 'second row starts half a tile later');
            assert.equal(first.length, 6); assert.equal(second.length, 5);
            assert.ok(first[0].left - geometry.left <= 4, "tiles fill the panel width");
            assert.ok(geometry.right - first[5].right <= 4, "no wide side gutters");
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          }
          if (count === 30) await board.screenshot({ path: '.verification/nbrd-honeycomb-' + width + '.png', fullPage: true });
        }
      }
      rows.splice(0); revision++; await broadcast(); await check(0, 0, 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: desktop/mobile pages retain resolved/pending BN bubbles without statistics; Manual shows a live dot instead of Live/Scanned text; status changes, additions, refresh, reload and clearing stay synchronized.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
