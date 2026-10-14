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
    for (const width of [390, 430, 760]) {
      await page.setViewportSize({ width, height: 844 });
      const grid = page.locator('.security-bn-list');
      const button = page.locator('[data-security-index="18"]');
      await button.click();
      const savedScroll = await page.locator('#result-panel').evaluate(el => el._securityListScrollTop);
      assert.equal(await grid.isVisible(), false);
      assert.equal(await page.locator('.security-detail-side').evaluate(el => getComputedStyle(el).position), 'static');
      assert.equal(await page.locator('#result-panel').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      await page.screenshot({ path: path.join(output, `opened-${width}.png`) });
      await page.locator('.security-check-line').first().click();
      assert.equal(await grid.isVisible(), false, 'Reading details must not dismiss the passenger');
      const status = width === 430 ? 'fail' : 'pass';
      await page.locator(`[data-review-status="${status}"]`).click();
      await page.waitForFunction(expected => document.querySelector('.security-detail-side .record-badge')?.textContent === expected, status.toUpperCase());
      assert.equal(await grid.isVisible(), false, 'Saving review keeps the selected detail open');
      await page.locator('.record-header').scrollIntoViewIfNeeded();
      assert.equal(await grid.isVisible(), false, 'Passenger record scroll cannot expose underlying BN circles');
      await page.screenshot({ path: path.join(output, `passenger-${width}.png`) });
      await page.locator('[data-security-back]').click();
      assert.equal(await grid.isVisible(), true);
      assert.equal(await page.locator('.security-detail-side').count(), 0);
      assert.equal(await page.locator('#result-panel').evaluate(el => el.scrollTop), savedScroll);
      await page.locator('[data-security-index="319"]').click();
      assert.match(await page.locator('.security-detail-side').innerText(), /NO RECORD/);
      await page.locator('[data-security-back]').click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-security-index="18"]').click();
    assert.equal(await page.locator('.security-bn-list').isVisible(), true);
    assert.equal(await page.locator('[data-security-back]').isVisible(), false);
    const bounds = await page.locator('.panel-workspace').evaluate(el => {
      const [list, detail] = [...el.children].map(child => child.getBoundingClientRect());
      return { listRight: list.right, detailLeft: detail.left };
    });
    assert.ok(bounds.detailLeft >= bounds.listRight, 'Desktop retains two separate columns');
    assert.deepEqual(errors, []);
    console.log('PASS: 390/430/760px detail isolation, scrolling, review persistence, BN-list return, missing record and desktop columns.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
