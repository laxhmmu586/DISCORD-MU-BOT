const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const assets = path.join(__dirname, '../public/public');
    await page.route('https://nbrd.test/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (name === 'nbrd-review.js' || name === 'nbrd-review.css') {
        return route.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : 'text/css', body: fs.readFileSync(path.join(assets, name), 'utf8') });
      }
      return route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><link rel="stylesheet" href="/nbrd-review.css"><script src="/nbrd-review.js"></script><div id="nbrd"></div>' });
    });
    await page.goto('https://nbrd.test/');
    for (const viewport of [{ width: 899, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        window.fixtureRows = ['194', '201', '135', '264', '268', '131'].map(nbrdBn => ({ nbrdBn, nbrdDetail: 'TEST ' + nbrdBn, nbrdResolved: nbrdBn === '201' }));
        window.review ||= NbrdReview.create({ container: document.querySelector('#nbrd'), apiBase: '' });
        review.render(fixtureRows);
      });
      const tiles = page.locator('#nbrd .nbrd-bubble');
      assert.deepEqual(await tiles.allTextContents(), ['131', '135', '194', '201', '264', '268']);
      assert.equal(await page.locator('#nbrd .is-resolved').textContent(), '201');
      assert.deepEqual(await page.evaluate(() => fixtureRows.map(row => row.nbrdBn)), ['194', '201', '135', '264', '268', '131']);
      await tiles.first().click();
      assert.equal(await page.locator('.nbrd-modal h2').textContent(), 'NBRD · BN 131');
      assert.match(await page.locator('.nbrd-modal').textContent(), /TEST 131/);
      await page.locator('.nbrd-back').click();
      await page.evaluate(() => { review.verify(); });
      assert.deepEqual(await page.locator('.nbrd-preview .nbrd-bubble').allTextContents(), ['131', '135', '194', '264', '268']);
      await page.locator('.nbrd-back').click();
      await page.evaluate(() => review.render([{ nbrdBn: '100' }, { nbrdBn: '2' }, { nbrdBn: '010' }]));
      assert.deepEqual(await tiles.allTextContents(), ['002', '010', '100']);
    }
    console.log('NBRD numeric order, pending preview, row details, resolved state and input preservation passed at desktop/mobile sizes.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
