const { chromium } = require('playwright');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const app = express();
  app.use(express.static('public/public'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  let browser;
  const out = '.verification/cbs-3d-artwork';
  fs.mkdirSync(out, { recursive: true });
  try {
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let checked = 0;
    for (const width of [320, 390, 900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ['zh', 'en']) {
        for (const type of ['service', 'AHL', 'DPR']) {
          const path = type === 'service' ? 'cbs-form.html' : `pir-form.html?type=${type}`;
          await page.goto(`http://127.0.0.1:${server.address().port}/${path}${path.includes('?') ? '&' : '?'}lang=${lang}`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => [...document.images].filter(img => img.classList.contains('choice-art') || img.classList.contains('report-heading-baggage')).every(img => img.complete && img.naturalWidth > 0));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow: ${width}/${lang}/${type}`);
          if (type === 'service') {
            assert.equal(await page.locator('.service-hero').count(), 1);
            assert.equal(await page.locator('.service-hero .choices').count(), 0);
            const hero = await page.locator('.service-hero').evaluate(el => getComputedStyle(el).backgroundImage);
            assert.match(hero, /cbs-3d-hero.webp/);
            const asset = await page.request.get(`http://127.0.0.1:${server.address().port}/assets/cbs-3d-hero.webp`);
            assert.equal(asset.status(), 200);
            for (const kind of ['AHL', 'DPR']) {
              const href = await page.locator(`a[href*="type=${kind}"]`).getAttribute('href');
              const target = new URL(href, page.url());
              assert.equal(target.searchParams.get('lang'), lang);
            }
            await page.locator('#language-toggle').click();
            assert.equal(await page.locator('html').getAttribute('lang'), lang === 'en' ? 'zh-CN' : 'en');
            await page.locator('#language-toggle').click();
          } else {
            const art = page.locator('.report-heading-baggage');
            assert.match(await art.getAttribute('src'), new RegExp(`cbs-3d-${type === 'AHL' ? 'delayed' : 'damaged'}-header.webp`));
            const boxes = await page.locator('.page-title').evaluate(el => {
              const keys = ['h1', 'p', 'img'];
              return keys.map(key => { const r = el.querySelector(key).getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}; });
            });
            const image = boxes[2];
            for (const text of boxes.slice(0, 2)) assert(text.right <= image.x + 1 || text.bottom <= image.y + 1 || text.x >= image.right - 1, `header overlap: ${width}/${lang}/${type}`);
            await page.locator('#case-type').evaluate(el => { el.value = el.value === 'AHL' ? 'DPR' : 'AHL'; el.dispatchEvent(new Event('change', { bubbles: true })); });
            await page.waitForFunction(() => {const i=document.querySelector('.report-heading-baggage');return i.complete && i.naturalWidth>0;});
            assert.match(await art.getAttribute('src'), new RegExp(`cbs-3d-${type === 'AHL' ? 'damaged' : 'delayed'}-header.webp`));
            await page.locator('#case-type').evaluate(el => { el.value = el.value === 'AHL' ? 'DPR' : 'AHL'; el.dispatchEvent(new Event('change', { bubbles: true })); });
          }
          if ([390, 1280].includes(width) && lang === 'zh') await page.screenshot({ path: `${out}/${type}-${width}.png`, fullPage: true });
          checked++;
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(`Passed ${checked} artwork viewport/language/page checks, bilingual links, type switching, image loading, header spacing, and browser errors.`);
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
