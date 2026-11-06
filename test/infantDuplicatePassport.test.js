const test = require('node:test');
const assert = require('node:assert/strict');
const { findSYInfo } = require('../syParser');

function record(bn, body) {
  return [`>FB ${bn}`, `PR: MU586/05NOV26*LAX,BN${bn} PNR RL TESTXX`,
    `1. TEST/PERSON BN${bn} *31D S PVG BAG2/45/0`, ...body].join('\n');
}
function parse(records) {
  return findSYInfo(['2026 November 06, Friday, 08:55:37', '>SY',
    'SY: MU586/05NOV26 LAX/0 CI1145/NAM',
    '777/773L/B7367 GTD/130 POS/GATE BN300 AK00000 CD00000',
    'BDT1145 SD1230 ED1230 CI1145', ...records].join('\n'), '05NOV26', { preferredFlightNo: 'MU586' });
}
const adult = [
  'ET TKNE/7810000000001/1 ET TKNE/INF7810000000002/1',
  'INF-TEST/INFANT', 'PSPT-A12345678/USA/02MAY24/M//INF',
  'PSPT-B12345678/IND/15MAR91/M/',
  'PAX INFO :IND/DOB/910315/POB//GENDER/M',
  'PASSPORT :B12345678/P/NAT/IND//360624/IND/N/A'
];
const child = ['ET TKNE/7810000000003/1', 'PSPT-A12345678/USA/02MAY24/M/',
  'PAX INFO :USA/DOB/240502/POB//GENDER/M',
  'PASSPORT :A12345678/P/NAT/USA//290820/USA/N/A'];

test('infant PSPT matches child PASSPORT with different DOB notation and no infant expiry', () => {
  const sy = parse([record('296', adult), record('297', child)]);
  assert.deepEqual(sy.govAqq.duplicatePassports, [{ passportNo: 'A12345678', dob: '240502', passportExpiry: '290820', bns: ['296', '297'] }]);
  for (const bn of ['296', '297']) assert.match(sy.bnAudit.find(row => row.bn === bn).apiReason, /Duplicate Passport \(296,297\)/);
});

test('infant comparison uses infant ticket and never the accompanying adult ticket', () => {
  const sameAsAdult = child.map(line => line.replace('7810000000003', '7810000000001'));
  assert.equal(parse([record('296', adult), record('297', sameAsAdult)]).govAqq.duplicatePassports.length, 1);
  const sameAsInfant = child.map(line => line.replace('7810000000003', '7810000000002'));
  assert.deepEqual(parse([record('296', adult), record('297', sameAsInfant)]).govAqq.duplicatePassports, []);
});

test('different infant passport or known DOB does not match; one BN is not duplicated', () => {
  for (const changed of [adult.map(line => line.replace('A12345678', 'Z12345678')), adult.map(line => line.replace('02MAY24', '02FEB26'))]) {
    assert.deepEqual(parse([record('296', changed), record('297', child)]).govAqq.duplicatePassports, []);
  }
  assert.deepEqual(parse([record('296', [...child, 'PSPT-A12345678/USA/02MAY24/M//INF'])]).govAqq.duplicatePassports, []);
});

test('latest replacement and deleted passenger records clear infant duplicate matches', () => {
  const changed = adult.map(line => line.replace('A12345678', 'Z12345678'));
  for (const replacement of [record('296', changed), record('296', ['DELETED'])]) {
    const sy = parse([record('296', adult), record('297', child), '2026 November 06, Friday, 08:56:37', replacement]);
    assert.deepEqual(sy.govAqq.duplicatePassports, []);
  }
});

test('primary passenger duplicates retain expiry, DOB and same-ticket checks', () => {
  assert.equal(parse([record('296', child), record('297', child.map(line=>line.replace('7810000000003','7810000000004')))]).govAqq.duplicatePassports.length,1);
  for(const other of [child,child.map(line=>line.replace('290820','300820')),child.map(line=>line.replace('240502','260202'))]) {
    assert.deepEqual(parse([record('296',child),record('297',other)]).govAqq.duplicatePassports,[]);
  }
});
