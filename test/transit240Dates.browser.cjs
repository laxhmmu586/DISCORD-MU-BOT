const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1172, height: 1400 }, timezoneId: 'America/Los_Angeles' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-24T12:00:00-07:00') });
    let payload;
    await page.route('**/*', route => {
      if (route.request().method() === 'POST') {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { ok: true } });
      }
      const path = 'public/public' + new URL(route.request().url()).pathname;
      return fs.existsSync(path) ? route.fulfill({ path }) : route.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://localhost/240.html');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('input[type=date]').count(), 0);
    assert.equal(await page.locator('#passportYear').getAttribute('size'), null);
    assert.equal(await page.locator('.active-stop .airport-code').textContent(), 'PVG');
    assert.equal(await page.locator('.date-choice').count(), 11);
    assert.equal(await page.locator('.date-choice').first().getAttribute('data-date'), '2026-10-25');
    assert.equal(await page.locator('.date-choice').last().getAttribute('data-date'), '2026-11-04');
    await page.selectOption('#passportYear', '2028');
    await page.selectOption('#passportMonth', '02');
    await page.selectOption('#passportDay', '29');
    assert.equal(await page.locator('#passportExpiry').inputValue(), '2028-02-29');
    await page.selectOption('#passportYear', '2027');
    assert.equal(await page.locator('#passportDay option[value="29"]').count(), 0);
    assert.equal(await page.locator('#passportExpiry').inputValue(), '');
    await page.selectOption('#passportMonth', '01');
    await page.selectOption('#passportDay', '31');
    await page.selectOption('#passportMonth', '04');
    assert.equal(await page.locator('#passportExpiry').inputValue(), '');
    await page.selectOption('#passportDay', '30');
    await page.fill('#passengerName', 'TEST PASSENGER');
    await page.fill('#seatNumber', '10A');
    await page.fill('#bnNumber', '001');
    await page.selectOption('#nationalityCode', 'CAN');
    await page.fill('.stop-code', 'HKG');
    assert.equal(await page.locator('.active-stop .stop-code').inputValue(), 'HKG');
    assert.deepEqual(await page.locator('.stop-code').evaluate(input => {
      const fixed = getComputedStyle(document.querySelector('.airport-code'));
      const editable = getComputedStyle(input);
      return [editable.fontSize === fixed.fontSize, editable.fontWeight === fixed.fontWeight];
    }), [true, true]);
    await page.fill('.stop-code', '');
    assert.equal(await page.locator('.active-stop .airport-code').textContent(), 'PVG');
    await page.fill('.stop-code', 'TPE');
    assert.equal(await page.locator('.active-stop .stop-code').inputValue(), 'TPE');
    await page.fill('.stop-code', 'HKG');
    await page.locator('.date-choice').last().click();
    assert.equal(await page.locator('.date-choice[aria-pressed=true]').count(), 1);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Submitted.');
    assert.equal(payload.passportExpiry, '2027-04-30');
    assert.deepEqual(payload.itineraryDates, ['2026-11-04']);
    await page.click('#dialogOk');
    await page.click('#addStop');
    assert.equal(await page.locator('.stop-date-picker').count(), 2);
    await page.locator('.stop-code').first().fill('CAN');
    await page.locator('.stop-code').last().fill('HKG');
    await page.locator('.stop-date-picker').last().locator('.date-choice').first().click();
    assert.match(await page.locator('#itineraryError').textContent(), /chronological/);
    await page.locator('.stop button.danger:visible').last().click();
    await page.locator('.stop-code').fill('HKG');
    for (const width of [320, 390, 768, 1172]) {
      await page.setViewportSize({ width, height: 1400 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      assert(await page.locator('.date-choice').last().isVisible());
    }
    fs.mkdirSync('.verification', { recursive: true });
    await page.screenshot({ path: '.verification/transit-dates-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.screenshot({ path: '.verification/transit-dates-mobile.png', fullPage: true });
    await page.clock.setSystemTime(new Date('2026-11-05T12:00:00-08:00'));
    assert.equal(await page.evaluate(() => validateItinerary()), false);
    assert.match(await page.locator('#itineraryError').textContent(), /next 11 days/);
    assert.equal(await page.locator('.date-choice').first().getAttribute('data-date'), '2026-11-06');
    await page.click('#clearForm');
    assert.equal(await page.locator('#passportExpiry').inputValue(), '');
    assert.equal(await page.locator('#passportYear').inputValue(), '');
    assert.equal(await page.locator('.date-choice[aria-pressed=true]').count(), 0);
    assert.equal(await page.locator('.stop-date-picker').count(), 1);
    assert.deepEqual(errors, []);
    console.log('240 date pickers: date range, leap years, month lengths, submission, ordering, add/remove, reset, day rollover, and responsive layout passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
