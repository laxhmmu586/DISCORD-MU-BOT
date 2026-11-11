const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const db = new Database(':memory:');
  const rows = [
    { id: 'publisher', name: 'MU SUPERVISOR', position: 'Supervisor', station: 'LAX', account: 'MU', email: 'publisher@example.test' },
    { id: 'main', name: 'MU EMPLOYEE', position: 'Agent', station: 'LAX', account: 'MU', email: 'main@example.test' },
    { id: 'cross', name: 'CROSS ACCOUNT EMPLOYEE', position: 'Agent', station: 'LAX', account: 'CZ', additionalAccounts: [{ station: 'LAX', account: 'MU' }], email: 'cross@example.test' },
  ];
  const app = express(), employees = { db, get: () => ({ employees: rows }) };
  app.get('/has-page-api/read-sign/access', (_req, res) => res.json({ canAccess: true }));
  const service = require('../has/server/readSign').registerReadSign(app, {
    employees, profiles: { linked: user => rows.find(person => person.id === user.uid) },
    authenticate: async req => ({ uid: req.headers.authorization?.replace('Bearer ', '') }), send: async () => {},
  });
  app.use(require('../has/static').withShared(path.resolve('public/public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function pageFor(uid, width) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.route('https://www.gstatic.com/**', route => route.fulfill({ body: '' }));
    await page.route('**/__/firebase/init.js', route => route.fulfill({ body: '' }));
    await page.addInitScript(({ base, uid }) => {
      window.MU_API_BASE = base;
      const user = { uid, email: uid + '@example.test', providerData: [], getIdToken: async () => uid };
      window.firebase = { apps: [{}], auth: () => ({ currentUser: user, onAuthStateChanged: fn => fn(user) }) };
    }, { base, uid });
    return page;
  }
  async function compose(page, subject) {
    await page.locator('#publish-memo').click();
    await page.locator('#memo-subject').fill(subject);
    await page.locator('#memo-body').fill('Please read and sign.');
    await page.locator('#memo-deadline').fill('2099-12-30T12:00');
  }
  try {
    for (const width of [390, 1280]) {
      const page = await pageFor('publisher', width), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/read-sign.html');
      await compose(page, 'Main audience ' + width);
      assert(await page.locator('#compose-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
      const account = page.locator('#memo-account');
      assert(await account.isEnabled());
      assert.deepEqual(await account.locator('option').allTextContents(), [
        'All LAX / MU (including Cross Account)', 'Main Account LAX / MU',
      ]);
      assert.equal(await account.inputValue(), JSON.stringify(['LAX', 'MU']));
      const files = [
        { name: 'keep.txt', mimeType: 'text/plain', buffer: Buffer.from('Keep this document') },
        { name: 'remove.txt', mimeType: 'text/plain', buffer: Buffer.from('Do not publish this document') },
      ];
      await page.locator('#memo-files').setInputFiles(files);
      await page.getByRole('button', { name: 'Remove attachment remove.txt', exact: true }).click();
      assert.equal(await page.locator('#memo-file-list li').count(), 1);
      await page.getByRole('button', { name: 'Review before publishing' }).click();
      await page.locator('#compose-preview').waitFor({ state: 'visible' });
      const preview = await page.locator('#compose-preview-text').textContent();
      assert(preview.includes('Main Account LAX / MU')); assert(preview.includes('keep.txt')); assert(!preview.includes('remove.txt'));
      await page.locator('#edit-draft').click();
      await page.locator('#memo-files').setInputFiles(files[1]);
      assert.equal(await page.locator('#memo-file-list li').count(), 2);
      await page.getByRole('button', { name: 'Remove attachment remove.txt', exact: true }).click();
      await page.getByRole('button', { name: 'Review before publishing' }).click();
      await page.locator('#confirm-publish').click();
      await page.locator('#compose-dialog').waitFor({ state: 'hidden' });
      const main = service.store.list({ uid: 'publisher' }).memos.find(memo => memo.subject === 'Main audience ' + width);
      assert.deepEqual(service.store.get(main.id).attachments.map(file => file.name), ['keep.txt']);
      assert.deepEqual(service.store.get(main.id).roster.map(person => person.id), ['publisher', 'main']);

      await compose(page, 'All audience ' + width);
      assert.equal(await page.locator('#memo-file-list li').count(), 0);
      await account.selectOption('LAX_MU_ALL');
      await page.locator('#memo-files').setInputFiles(files);
      await page.getByRole('button', { name: 'Remove attachment keep.txt', exact: true }).click();
      await page.getByRole('button', { name: 'Remove attachment remove.txt', exact: true }).click();
      await page.getByRole('button', { name: 'Review before publishing' }).click();
      assert((await page.locator('#compose-preview-text').textContent()).includes('All LAX / MU (including Cross Account)'));
      await page.locator('#confirm-publish').click();
      await page.locator('#compose-dialog').waitFor({ state: 'hidden' });
      const all = service.store.list({ uid: 'publisher' }).memos.find(memo => memo.subject === 'All audience ' + width);
      assert.equal(service.store.get(all.id).attachments.length, 0);
      assert.deepEqual(service.store.get(all.id).roster.map(person => person.id), ['publisher', 'main', 'cross']);
      assert.deepEqual(errors, []);
      await page.close();

      const cross = await pageFor('cross', width);
      await cross.goto(base + '/read-sign.html?memo=' + all.id);
      await cross.locator('#rs-sign-box').waitFor({ state: 'visible' });
      await cross.locator('#rs-ack').check();
      await cross.locator('#rs-canvas').scrollIntoViewIfNeeded();
      const canvas = await cross.locator('#rs-canvas').boundingBox();
      await cross.mouse.move(canvas.x + 20, canvas.y + 20); await cross.mouse.down();
      for (let point = 0; point < 8; point++) await cross.mouse.move(canvas.x + 20 + point * 15, canvas.y + 25 + point % 2 * 35);
      await cross.mouse.up(); await cross.locator('#save-signature').click();
      await cross.locator('#rs-signed-receipt').waitFor({ state: 'visible', timeout: 5000 }).catch(async error => {
        console.error('Signature status:', await cross.locator('#rs-status').textContent());
        throw error;
      });
      assert.equal(service.store.read({ uid: 'cross' }, all.id).myStatus, 'signed');
      assert(!service.store.list({ uid: 'cross' }).memos.some(memo => memo.id === main.id));
      await cross.close();
    }
    console.log('PASS mobile and desktop attachment removal/reselection, both LAX/MU recipient choices, publication, and Cross Account signing');
  } finally {
    await browser.close(); service.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve)); db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
