const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public', 'public');
const helper = fs.readFileSync(path.join(publicDir, 'attachment-drop.js'), 'utf8');

test('all attachment forms load the shared drag-and-drop helper', () => {
  for (const filename of ['cbs.html', 'pir-form.html', 'contact-form.html', 'wrong-baggage-form.html', '240.html']) {
    const page = fs.readFileSync(path.join(publicDir, filename), 'utf8');
    assert.match(page, /<script src="\/public\/attachment-drop\.js"><\/script>/, filename);
  }
});

test('attachment drop helper transfers dropped files and triggers existing previews', () => {
  assert.match(helper, /document\.addEventListener\('dragover'/);
  assert.match(helper, /document\.addEventListener\('drop'/);
  assert.match(helper, /target\.input\.multiple \? files : files\.slice\(0, 1\)/);
  assert.match(helper, /target\.input\.files = transfer\.files/);
  assert.match(helper, /dispatchEvent\(new Event\('change', \{ bubbles:true \}\)\)/);
  assert.match(helper, /is-file-dragging/);
});
