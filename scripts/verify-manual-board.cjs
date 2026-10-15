// Local browser fixtures only: no requests or writes reach operational services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { operationalDate } = require('../flightContext');
const root = path.join(__dirname, '../public/public');
const output = process.env.MANUAL_BOARD_OUTPUT || path.join(__dirname, '../.verification/manual-board');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const fixture = () => [
      ...Array.from({ length: 17 }, (_, i) => ({ rowNumber: i + 100, bn: String(i + 1).padStart(3, '0'), seat: '10A', flight: 'MU586', entered: false })),
      { rowNumber: 200, infantBn: '021', infantSeat: 'INF', infantFlight: 'MU586' },
      { rowNumber: 201, infantBn: '034', infantSeat: 'INF', infantFlight: 'MU586' },
      { rowNumber: 300, nbrdBn: '099', nbrdDetail: 'TEST', nbrdResolved: false },
    ];
    let rows = fixture(), failOpen = false, recordsGate = null;
    const writes = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'api.mufcapp.net') {
        assert.equal(url.searchParams.get('flightNo'), 'MU586');
        assert.equal(url.searchParams.get('flightDate'), operationalDate());
        if (url.pathname === '/cbs-scan/live-state') return route.fulfill({ json: { live: false } });
        if (url.pathname === '/cbs-scan/records') {
          if (recordsGate) await recordsGate;
          return route.fulfill({ json: { ok: true, live: false, rows } });
        }
        if (url.pathname === '/cbs-scan/records/entered') {
          const body = request.postDataJSON();
          writes.push(body);
          if (failOpen && !body.entered) return route.fulfill({ status: 503, json: { error: 'Fixture save failed' } });
          for (const row of rows) if (body.rowNumbers.includes(row.rowNumber)) row.entered = body.entered;
          return route.fulfill({ json: { ok: true } });
        }
        throw Error('Unexpected API: ' + url.pathname);
      }
      if (url.pathname === '/__/firebase/init.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.firebase={apps:[{}],auth:()=>({onAuthStateChanged:fn=>fn({})})};' });
      if (url.hostname !== 'www.mufcapp.net') return route.fulfill({ contentType: 'text/javascript', body: '' });
      const file = path.join(root, url.pathname);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Missing fixture asset' });
      const ext = path.extname(file);
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[ext], body: fs.readFileSync(file) });
    });
    await context.addInitScript(({ date }) => sessionStorage.setItem('mufc-online-flight', JSON.stringify({ flightNo: 'MU586', flightDate: date })), { date: operationalDate() });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const cells = page.locator('#table-wrap .bn-cell');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [320, 390, 640, 1015]) {
      rows = fixture(); writes.length = 0;
      await page.setViewportSize({ width, height: 844 });
      await page.goto('https://www.mufcapp.net/m-board.html');
      await cells.last().waitFor();
      assert.equal(await cells.count(), 17);
      assert.equal(await page.locator('.bn-heading').count(), 0, 'Neither scan view displays a BN heading');
      assert.equal(await page.locator('#boarding-panel').isVisible(), true);
      assert.equal(await page.locator('#infant-panel').isVisible(), false);
      assert.deepEqual(await cells.allTextContents(), rows.filter(row => row.bn).map(row => row.bn));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const geometry = await cells.evaluateAll(items => items.slice(0, 3).map(item => ({ x: item.getBoundingClientRect().x, y: item.getBoundingClientRect().y })));
      assert.equal(geometry[0].y, geometry[1].y);
      assert.ok(geometry[1].x > geometry[0].x && geometry[2].y > geometry[0].y);
      await cells.nth(7).click();
      await page.waitForFunction(() => document.querySelector('#status').textContent === 'Marked through BN 008.');
      assert.deepEqual(writes[0], { rowNumbers: [100, 101, 102, 103, 104, 105, 106, 107], entered: true });
      assert.deepEqual(writes[1], { rowNumbers: [108, 109, 110, 111, 112, 113, 114, 115, 116], entered: false });
      assert.equal(await page.locator('#table-wrap .is-entered').count(), 8);
      const style = await cells.nth(7).evaluate(cell => {
        const surface = getComputedStyle(cell), strip = getComputedStyle(cell, '::before');
        return { radius: surface.borderRadius, background: surface.backgroundColor, color: surface.color, strip: strip.backgroundColor, width: strip.width };
      });
      assert.deepEqual(style, { radius: '10px', background: 'rgba(225, 243, 235, 0.81)', color: 'rgb(17, 103, 66)', strip: 'rgb(0, 135, 68)', width: '20px' });
      await page.screenshot({ path: path.join(output, `boarding-${width}.png`), fullPage: true });
      await page.getByRole('tab', { name: 'Infant', exact: true }).click();
      assert.equal(await page.locator('#boarding-panel').isVisible(), false);
      assert.equal(await page.locator('#infant-panel').isVisible(), true);
      assert.deepEqual(await page.locator('#infant-wrap .bn-cell').allTextContents(), ['021', '034']);
      assert.equal(writes.length, 2, 'Switching tabs must not save statuses');
      await page.screenshot({ path: path.join(output, `infant-${width}.png`), fullPage: true });
      rows.push({ rowNumber: 202, infantBn: '046', infantSeat: 'INF' });
      await page.evaluate(rows => applyLiveBoard({ revision: 1, rows }), rows);
      assert.equal(await page.locator('#infant-panel').isVisible(), true, 'Live refresh retains selected tab');
      assert.deepEqual(await page.locator('#infant-wrap .bn-cell').allTextContents(), ['021', '034', '046']);
      await page.getByRole('tab', { name: 'Infant', exact: true }).focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#boarding-panel').isVisible(), true);
      assert.equal(await page.locator('#table-wrap .is-entered').count(), 8);
      await page.reload();
      await cells.last().waitFor();
      assert.equal(await page.locator('#table-wrap .is-entered').count(), 8, 'Persisted cutoff survives reload');
    }
    // Selecting an earlier left-column BN reopens all subsequent records.
    await cells.nth(2).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Marked through BN 003.');
    assert.equal(await page.locator('#table-wrap .is-entered').count(), 3);
    // The first save can succeed while the second fails: recover actual saved state.
    failOpen = true;
    await cells.nth(5).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Fixture save failed');
    assert.equal(await page.locator('#table-wrap .is-entered').count(), 6);
    failOpen = false;
    // Reconciliation refreshes text, removals and order without duplicating cells.
    rows = rows.filter(row => row.bn !== '002');
    [rows[0], rows[1]] = [rows[1], rows[0]];
    rows[0].bn = '<004>';
    await page.evaluate(rows => applyLiveBoard({ revision: 2, rows }), rows);
    assert.equal(await cells.count(), 16);
    assert.deepEqual(await cells.allTextContents(), rows.filter(row => row.bn).map(row => row.bn));
    assert.equal(await cells.first().locator('*').count(), 0, 'BN is displayed as text, never HTML');
    await page.evaluate(() => applyLiveBoard({ revision: 1, rows: [] }));
    assert.equal(await cells.count(), 16, 'Old live snapshots cannot clear newer records');
    await page.evaluate(() => renderRows([]));
    assert.equal(await cells.count(), 0);
    assert.match(await page.locator('#table-wrap').textContent(), /No boarding scan rows/);
    await page.getByRole('tab', { name: 'Infant', exact: true }).click();
    assert.match(await page.locator('#infant-wrap').textContent(), /No infant scans/);
    // Both refresh controls retain the selected tab and show its latest record.
    for (const width of [320, 390, 640, 1015]) {
      rows = fixture();
      rows.push(...Array.from({ length: 80 }, (_, i) => ({ rowNumber: 400 + i, bn: String(100 + i) })));
      rows.push(...Array.from({ length: 40 }, (_, i) => ({ rowNumber: 600 + i, infantBn: String(200 + i) })));
      await page.setViewportSize({ width, height: 844 });
      await page.goto('https://www.mufcapp.net/m-board.html');
      await cells.last().waitFor();
      for (const tab of ['Boarding', 'Infant']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        const panelId = tab === 'Boarding' ? 'boarding-panel' : 'infant-panel';
        for (const buttonId of ['bottom-refresh', 'refresh']) {
          let release;
          recordsGate = new Promise(resolve => { release = resolve; });
          await page.locator('#' + buttonId).click();
          await page.waitForFunction(() => [...document.querySelectorAll('.refresh-board')].every(button => button.disabled));
          const writesBefore = writes.length;
          const bn = tab === 'Boarding' ? '301' : '302';
          rows.push(tab === 'Boarding' ? { rowNumber: 800 + rows.length, bn } : { rowNumber: 800 + rows.length, infantBn: bn });
          release(); recordsGate = null;
          await page.waitForFunction(() => [...document.querySelectorAll('.refresh-board')].every(button => !button.disabled));
          assert.equal(await page.locator('#' + panelId).isVisible(), true);
          const last = page.locator('#' + panelId + ' .bn-cell').last();
          assert.equal(await last.textContent(), bn);
          await page.waitForFunction(panelId => {
            const cells = document.querySelectorAll('#' + panelId + ' .bn-cell');
            const rect = cells[cells.length - 1].getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }, panelId);
          // A subsequent stream update must preserve the refreshed position.
          await page.evaluate(rows => applyLiveBoard({ revision: 5, rows }), rows);
          assert.equal(await last.evaluate(cell => {
            const rect = cell.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }), true, 'Live reconciliation keeps the latest record in the viewport');
          assert.equal(writes.length, writesBefore, 'Refreshing never changes boarding statuses');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.screenshot({ path: path.join(output, `refresh-${tab.toLowerCase()}-${buttonId}-${width}.png`), fullPage: false });
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('Manual board tabs, two columns, save cutoff, and top/bottom Refresh to latest Boarding/Infant record passed at 320/390/640/1015px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
