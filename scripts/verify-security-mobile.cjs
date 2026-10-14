const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const root = path.resolve(__dirname, '../public/public');
    const output = path.resolve(__dirname, '../.verification/security-mobile');
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', day: '2-digit', month: 'short', year: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
      sessionStorage.setItem('mufc-online-flight', JSON.stringify({ flightNo: 'MU586', flightDate: parts.day + parts.month.toUpperCase() + parts.year }));
    });
    const errors = [];
    const reviews = {};
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/security-reviews') {
        if (route.request().method() === 'POST') {
          const { bn, status } = route.request().postDataJSON();
          reviews[bn] = { status, reviewer: 'TEST', updatedAt: '2026-10-14' };
          return route.fulfill({ json: { review: reviews[bn] } });
        }
        return route.fulfill({ json: { reviews } });
      }
      if (url.pathname === '/__/firebase/init.js') {
        return route.fulfill({ contentType: 'text/javascript', body: 'window.firebase={apps:[{}],auth:()=>({currentUser:{getIdToken:async()=>"test"},onAuthStateChanged(){}})};' });
      }
      if (url.hostname !== 'security.test') return route.fulfill({ body: '' });
      const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(file)) return route.fulfill({ json: { ok: true, rows: [] } });
      return route.fulfill({ path: file });
    });
    await page.goto('https://security.test/');
    await page.addStyleTag({ content: '.passenger-modal-backdrop,.passenger-modal { animation: none !important; }' });
    await page.evaluate(async () => {
      window.MU_API_BASE = location.origin;
      currentSy = { flightNo: 'MU586', flightDate: '14OCT26', bnAudit: Array.from({ length: 80 }, (_, index) => ({
        bn: String(index + 1).padStart(3, '0'), apiStatus: 'review', apiReason: 'missing API item',
        tkStatus: 'pass', tkReason: 'Adult ticket is present', visaStatus: 'pass', visaReason: 'No visa needed',
        bagStatus: 'pass', bagReason: 'Allowance: FBA 1PC + paid extra 2PC = 3PC; checked bags: 3PC; destination matches outbound KHN',
        passengerRecord: { name: 'TEST/PASSENGER', seat: '35A', destination: 'KHN' }
      })) };
      await renderSecurityCheck();
      setLoadingState(false);
    });
    for (const width of [390, 430, 760, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const grid = page.locator('.security-bn-list');
      const button = page.locator('[data-security-index="18"]');
      const popup = page.locator('.security-modal-backdrop');
      const modal = popup.locator('.passenger-modal');
      await button.click();
      await popup.waitFor();
      const savedScroll = await page.locator('#result-panel').evaluate(el => el.scrollTop);
      assert.equal(await grid.isVisible(), true, 'BN list stays behind the floating window');
      assert.equal(await popup.evaluate(el => getComputedStyle(el).position), 'fixed');
      assert.equal(await modal.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(8, 24, 40)');
      assert.equal(await modal.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      assert.equal(await page.locator('[data-security-back]').count(), 0);
      await page.screenshot({ path: path.join(output, `opened-${width}.png`) });
      await popup.locator('.security-check-line').first().click();
      await popup.waitFor({ state: 'detached' });
      assert.equal(await grid.isVisible(), true, 'Clicking window content closes only the popup');
      assert.equal(await page.locator('#result-panel').evaluate(el => el.scrollTop), savedScroll);
      await button.click();
      await popup.waitFor();
      await page.mouse.click(4, 4);
      await popup.waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-security-index]').count(), 320, 'Clicking outside preserves the BN list');
      await button.click();
      await popup.waitFor();
      const canScroll = await modal.evaluate(el => el.scrollHeight > el.clientHeight);
      const bounds = await modal.boundingBox();
      await page.mouse.move(bounds.x + 20, bounds.y + 220);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 20, bounds.y + 100, { steps: 10 });
      await page.mouse.up();
      assert.equal(await popup.isVisible(), true, 'Scrolling gesture must not dismiss the popup');
      if (canScroll) assert.ok(await modal.evaluate(el => el.scrollTop) > 0, `Scrollable detail at ${width}px must move`);
      await page.screenshot({ path: path.join(output, `passenger-${width}.png`) });
      await page.waitForFunction(() => document.querySelector('.security-modal-backdrop')?.dataset.dragging !== 'true');
      await modal.evaluate(el => { el.scrollTop = 0; });
      const status = width === 430 ? 'fail' : 'pass';
      await page.locator(`[data-review-status="${status}"]`).click();
      await popup.waitFor({ state: 'detached' });
      await page.waitForFunction(expected => document.querySelector('[data-security-index="18"]')?.classList.contains(`is-${expected}`), status);
      assert.equal(await grid.isVisible(), true);
      assert.equal(await page.locator('#result-panel').evaluate(el => el.scrollTop), savedScroll);
      await button.click();
      await popup.waitFor();
      assert.equal(await popup.locator('.record-badge').textContent(), status.toUpperCase());
      await page.mouse.click(4, 4);
      await page.locator('[data-security-index="319"]').click();
      await popup.waitFor();
      assert.match(await popup.innerText(), /NO RECORD/);
      await popup.locator('.record-title').click();
      await popup.waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 390/430/760/1440px floating dialog, opaque background, inside/outside click dismissal, drag scrolling, saved reviews and preserved BN list.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
