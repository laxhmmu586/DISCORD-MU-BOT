const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJcsyRows } = require('../syParser');

test('parses JCSY rows whose business count uses two digits', () => {
  const rows = parseJcsyRows([
    'MU1111 /HHL/            00/00/002 00/00/000+00 00/00/000+00 00/00/002 000/0000',
    'MU0725 /HKG/     2100+1 00/01/003 00/00/000+00 00/00/000+00 00/01/003 000/0000',
    'FM9529 /WNZ/     2225+1 00/03/001 00/00/000+00 00/00/000+00 00/03/001 000/0000'
  ].join('\n'));

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ first, business, economy, total }) => ({ first, business, economy, total })), [
    { first: 0, business: 0, economy: 2, total: 2 },
    { first: 0, business: 1, economy: 3, total: 4 },
    { first: 0, business: 3, economy: 1, total: 4 }
  ]);
});
