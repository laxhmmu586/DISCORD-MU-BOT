const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('PIR PDF preserves Chinese and other Unicode passenger names', () => {
  assert.doesNotMatch(server, /replace\(\/\[\\u3400-\\u9FFF/);
  assert.match(server, /Buffer\.from\(run, 'utf16le'\)\.swap16\(\)\.toString\('hex'\)/);
  assert.match(server, /\/F2 \$\{size\} Tf/);
  assert.match(server, /\/BaseFont \/STSong-Light/);
  assert.match(server, /\/Encoding \/UniGB-UCS2-H/);
  assert.match(server, /\/F2 \$\{unicodeFontId\} 0 R/);
});

test('PIR PDF keeps Latin runs in Helvetica inside mixed-language fields', () => {
  assert.match(server, /safe\.match\(\/\[\\x20-\\x7E\]\+\|\[\^\\x20-\\x7E\]\+\/g\)/);
  assert.match(server, /command = `BT \/F1 \$\{size\} Tf/);
  assert.match(server, /command = `BT \/F2 \$\{size\} Tf/);
  assert.match(server, /\.join\('\\n'\)/);
});
