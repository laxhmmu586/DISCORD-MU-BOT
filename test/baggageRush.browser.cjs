const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), express = require('express');
const { createApiGuard, captureBody } = require('../desktopProtection');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const app = express(), saved = [];
  let fail = false, discordFailure = false;
  app.use(express.json({ verify:captureBody }));
  app.use(createApiGuard({ authenticate:async req => {
    if (req.get('Authorization') !== 'Bearer fixture') throw Error('login');
    return { uid:'agent', email:'fixture@example.test' };
  } }));
  app.post('/cbs-worldtracer-cases', async (req, res) => {
    if (fail) return res.status(500).json({ error:'Fixture storage unavailable' });
    saved.push(req.body);
    await new Promise(resolve => setTimeout(resolve, 100));
    res.status(201).json({ created:true, record:req.body,
      ...(discordFailure ? { discordError:'Fixture Discord unavailable' } : { discord:{ sent:true } }) });
  });
  app.get('/profile-api', (_req, res) => res.json({ state:'ready', profile:{ name:'Fixture Employee', station:'LAX', account:'MU' } }));
  app.use(require('../has/static').withShared(path.join(__dirname, '../public/public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser, page;
  try {
    browser = await chromium.launch({ channel:'msedge', headless:true });
    page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.route('**/www.gstatic.com/**', route => route.fulfill({ body:'', contentType:'text/javascript' }));
    await page.route('**/__/firebase/init.js', route => route.fulfill({ contentType:'text/javascript', body:`window.MU_API_BASE=${JSON.stringify(origin)};const user={uid:'agent',email:'fixture@example.test',providerData:[],getIdToken:async()=>'fixture'};window.firebase={apps:[{}],auth:()=>({currentUser:user,onAuthStateChanged:fn=>{setTimeout(()=>fn(user),0);return()=>{};}})};` }));
    fs.mkdirSync('.verification/baggage-rush', { recursive:true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height:1000 });
      await page.goto(origin + '/baggage.html');
      const launcher = page.locator('#departure-rush-button'), panel = page.locator('#departure-rush-panel');
      assert.equal(await launcher.evaluate(node => node.tagName), 'BUTTON');
      assert(await panel.isHidden());
      await launcher.click();
      assert.equal(page.url(), origin + '/baggage.html');
      assert.equal(await launcher.getAttribute('aria-expanded'), 'true');
      const form = panel.locator('form'), status = panel.locator('[role=status]');
      const cbs = fs.readFileSync(path.join(__dirname, '../public/public/cbs.html'), 'utf8');
      assert(await form.evaluate((form, cbs) => {
        const original = new DOMParser().parseFromString(cbs, 'text/html').querySelector('#worldtracer-form');
        const fields = node => [...node.querySelectorAll('input[name]')].map(input => ({
          name:input.name, required:input.required, pattern:input.pattern, min:input.minLength, max:input.maxLength,
          label:input.closest('label').querySelector('span').textContent, placeholder:input.placeholder
        }));
        return JSON.stringify(fields(form)) === JSON.stringify(fields(original));
      }, cbs), 'Mirror all named CBS Rush Bag creation fields');
      assert.equal(await form.locator('[data-flight-date]').inputValue(), await page.evaluate(() => ymdFromDate(new Date())));
      assert.equal(await form.locator('[data-flight-number]').inputValue(), 'MU586');
      assert.equal(await form.locator('[data-flight-from]').inputValue(), 'LAX');
      assert.equal(await form.locator('[data-flight-to]').inputValue(), 'PVG');
      const before = saved.length;
      await form.locator('[type=submit]').click();
      assert.equal(saved.length, before, 'Required tags prevent a request');
      await form.locator('[name=originalTagNumber]').fill('dl123456');
      await form.locator('[name=rushTagNumber]').fill('3u515289');
      await panel.locator('#departure-rush-add-flight').click();
      await form.locator('[data-flight-date]').nth(1).fill('2026-11-09');
      await form.locator('[data-flight-number]').nth(1).fill('MU5101');
      await form.locator('[data-flight-from]').nth(1).fill('PVG');
      await form.locator('[data-flight-to]').nth(1).fill('PEK');
      await panel.screenshot({ path:'.verification/baggage-rush/form-' + width + '.png' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      fail = true;
      await form.locator('[type=submit]').click();
      await status.filter({ hasText:'Fixture storage unavailable' }).waitFor();
      assert.equal(await form.locator('[name=originalTagNumber]').inputValue(), 'DL123456');
      assert.equal(await form.locator('[data-rush-flight-row]').count(), 2);
      fail = false;
      // Two synchronous submit events exercise the in-flight duplicate guard.
      await form.evaluate(form => { form.requestSubmit(); form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); });
      await status.filter({ hasText:'Discord notification sent.' }).waitFor();
      assert.equal(saved.length, before + 1);
      assert.equal(saved.at(-1).worldTracerFileNumber, '');
      assert.equal(saved.at(-1).originalTagNumber, 'DL123456');
      assert.equal(saved.at(-1).rushTagNumber, '3U515289');
      assert.equal(saved.at(-1).flightRows.length, 2);
      assert.deepEqual(saved.at(-1).flightRows[1], { flightDate:'2026-11-09', flightNumber:'MU5101', from:'PVG', to:'PEK' });
      assert.equal(await form.locator('[name=originalTagNumber]').inputValue(), '');
      assert.equal(await form.locator('[data-rush-flight-row]').count(), 1);
      await form.locator('[data-remove-rush-flight]').click();
      assert.equal(await form.locator('[data-rush-flight-row]').count(), 1);
      assert.equal(await form.locator('[data-flight-number]').inputValue(), '');
      await panel.locator('#departure-rush-add-flight').click();
      await form.locator('[data-remove-rush-flight]').last().click();
      assert.equal(await form.locator('[data-rush-flight-row]').count(), 1);
      await panel.locator('#departure-rush-close').click();
      assert(await panel.isHidden());
      assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
    }
    await page.reload();
    await page.locator('#departure-rush-button').click();
    const form = page.locator('#departure-rush-form');
    await form.locator('[name=originalTagNumber]').fill('B6123456');
    await form.locator('[name=rushTagNumber]').fill('MU123456');
    await form.locator('[name=worldTracerFileNumber]').fill(' laxmu12345 ');
    discordFailure = true;
    await form.locator('[type=submit]').click();
    await page.locator('#departure-rush-status').filter({ hasText:'Rush Bag saved to CBS. Discord notification failed:' }).waitFor();
    assert.equal(saved.at(-1).worldTracerFileNumber, 'LAXMU12345');
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile inline CBS form parity, authentication, itinerary editing, validation, save, retry, duplicate prevention and Discord feedback.');
  } catch (error) {
    console.error('Page:', page?.url(), await page?.locator('body').innerText().catch(() => 'unavailable'));
    await page?.screenshot({ path:'.verification/baggage-rush/failure.png', fullPage:true }).catch(() => {});
    throw error;
  } finally { await browser?.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
