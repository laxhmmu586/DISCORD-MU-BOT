const test = require('node:test');
const assert = require('node:assert/strict');
const { findSYInfo } = require('../syParser');

const header = [
  '2026 October 14, Wednesday, 12:17:00', '> sy',
  'SY: MU586/14OCT26 LAX/0 CI1145/NAM',
  '777/773L/B0000 GTD/130 POS/GATE BN299 AK00000 CD00000',
  'BDT1145 SD1230 ED1230 CI1145'
];
const paid = 'ASVC- C/0AA/PDBG/2PC CNY2970-0 A/EMDA-7810000000002/1-C';

// Sanitized structure of the supplied record, without the baggage waiver so
// these assertions exercise the purchased allowance itself.
function record(bn = '071', remarks = [paid], bagCount = 3) {
  const tags = Array.from({ length: bagCount }, (_, i) => `/${3781000000 + i}/SHE`).join(' ');
  return [
    '2026 October 14, Wednesday, 12:17:18', `>fb ${Number(bn)}`,
    `PR: MU586/14OCT26*LAX,BN${Number(bn)} PNR RL TESTXX`,
    `1. TEST/PASSENGER BN${bn} *68D S PVG WEB ASR BAG${bagCount}/69/0 OSR`,
    'FF/MU 600000000000/C FBA/1PC',
    'ET TKNE/7810000000001/1 R68D',
    ...remarks,
    'PASSPORT :XX1234567/P/NAT/CHN/900101/350730/CHN/N/A',
    'CKIN CLIENT PURCHASED 2 EXTRA BG ONLINE',
    `BAGTAG${tags}`,
    'O/MU5603/15OCT BN023 35A B SHE'
  ];
}
function rows(...records) {
  return findSYInfo([...header, ...records.flat()].join('\n'), '14OCT26', { preferredFlightNo: 'MU586' }).bnAudit;
}

test('ASVC PDBG/2PC adds two pieces to FBA/1PC for three checked bags', () => {
  const row = rows(record())[0];
  assert.equal(row.bagStatus, 'pass');
  assert.match(row.bagReason, /FBA 1PC \+ paid extra 2PC = 3PC; checked bags: 3PC/);
  assert.match(row.bagReason, /destination matches outbound SHE/);
  assert.doesNotMatch(row.bagReason, /waiver/);
});

test('purchased pieces do not waive an excess bag or destination mismatch', () => {
  const excess = rows(record('071', [paid], 4))[0];
  assert.equal(excess.bagStatus, 'fail');
  assert.match(excess.bagReason, /= 3PC; checked bags: 4PC/);
  const mismatch = record().map(line => line.replace('B SHE', 'B HKT'));
  assert.equal(rows(mismatch)[0].bagStatus, 'review');
});

test('repeated ASVC display does not double the purchased allowance', () => {
  const row = rows(record('071', [paid, `  ${paid.toLowerCase().replaceAll(' ', '  ')}`], 4))[0];
  assert.equal(row.bagStatus, 'fail');
  assert.match(row.bagReason, /paid extra 2PC = 3PC/);
});

test('distinct paid services add their quantities and stay within their BN', () => {
  const second = paid.replace('/2PC', '/1PC').replace('7810000000002', '7810000000003');
  const result = rows(record('071', [paid, second], 4), record('072', [], 3));
  assert.equal(result.find(row => Number(row.bn) === 71).bagStatus, 'pass');
  assert.match(result.find(row => Number(row.bn) === 71).bagReason, /paid extra 3PC = 4PC/);
  assert.equal(result.find(row => Number(row.bn) === 72).bagStatus, 'fail');
  assert.match(result.find(row => Number(row.bn) === 72).bagReason, /FBA 1PC = 1PC/);
});

test('ASVC reads explicit piece counts including zero and spaced lowercase formats', () => {
  for (const count of [0, 1, 2, 3, 12]) {
    const service = paid.replace('/2PC', `/ ${count} pc`).toLowerCase();
    const row = rows(record('071', [service], count + 1))[0];
    assert.equal(row.bagStatus, 'pass', service);
    assert.match(row.bagReason, new RegExp(`= ${count + 1}PC; checked bags: ${count + 1}PC`));
  }
});

test('malformed or non-piece ASVC quantities cannot grant extra pieces', () => {
  for (const quantity of ['2KG', '2PCX', '-2PC', 'PC', '']) {
    const row = rows(record('071', [paid.replace('2PC', quantity)], 2))[0];
    assert.equal(row.bagStatus, 'fail', quantity);
    assert.match(row.bagReason, /FBA 1PC = 1PC/);
  }
});

test('bare PDBG and existing XBAG total-allowance behavior remain supported', () => {
  for (const remark of [paid.replace('/2PC', ''), 'CKIN PDBG']) {
    const row = rows(record('071', [remark], 2))[0];
    assert.equal(row.bagStatus, 'pass');
    assert.match(row.bagReason, /paid extra 1PC = 2PC/);
  }
  const row = rows(record('071', ['XBAG/3PC'], 3))[0];
  assert.equal(row.bagStatus, 'pass');
  assert.match(row.bagReason, /paid extra 2PC = 3PC/);
});

test('the full supplied PSM structure retains its waiver and independent checks', () => {
  const input = record('071', ['PSM-EXBG0PCQTQK 2BAGS ASVC ONLINE', paid]);
  const row = rows(input.map(line => line.replace('ET TKNE/7810000000001/1 R68D', '')))[0];
  assert.equal(row.bagStatus, 'pass');
  assert.match(row.bagReason, /EXBG0PC waiver/);
  assert.equal(row.tkStatus, 'fail');
});
