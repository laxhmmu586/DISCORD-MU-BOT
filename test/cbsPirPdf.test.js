const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('PIR PDF draws Chinese and other Unicode names as portable glyph outlines', () => {
  assert.doesNotMatch(server, /replace\(\/\[\\u3400-\\u9FFF/);
  assert.match(server, /require\('@fontsource\/noto-sans-sc\/unicode\.json'\)/);
  assert.match(server, /fontkit\.openSync/);
  assert.match(server, /font\.glyphForCodePoint/);
  assert.match(server, /glyph\.path\.commands/);
  assert.doesNotMatch(server, /\/BaseFont \/STSong-Light/);
});

test('PIR PDF keeps Latin runs in Helvetica inside mixed-language fields', () => {
  assert.match(server, /safe\.match\(\/\[\\x20-\\x7E\]\+\|\[\^\\x20-\\x7E\]\+\/g\)/);
  assert.match(server, /command = `BT \/F1 \$\{size\} Tf/);
  assert.match(server, /pdfGlyphPath\(character, cursorX, y, size\)/);
});
