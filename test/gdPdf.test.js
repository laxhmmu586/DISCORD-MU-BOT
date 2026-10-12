const test = require('node:test');
const assert = require('node:assert/strict');
const { compareGdPdfText, extractGdPdfText, normalizeFlightDate } = require('../gdPdf');

const expected = { flightNo: 'MU586', flightDate: '11OCT26', aircraftRegistration: 'B-7868' };
const crew = [{ no: 1, passport: 'SE1234567' }, { no: 2, passport: 'E12345678' }];
const text = 'GENERAL DECLARATION\nMarks of Nationality & Registration B7868 Flight No. MU586 Date 2026-10-11\nFLIGHT ROUTING\nPASSPORT NO\nCA TEST CN 900101 M SE1234567\nFO TEST CN 900101 F E12345678\nTTL 2\nDECLARATION OF HEALTH';

test('all passports and SY header fields must match', () => {
  const result = compareGdPdfText(text, crew, expected);
  assert.equal(result.complete, true);
  assert.equal(result.matched, 2);
  for (const [from, to, field] of [['MU586', 'MU578', 'flightNo'], ['2026-10-11', '2026-10-12', 'flightDate'], ['B7868', 'B9999', 'aircraftRegistration']]) {
    const mismatch = compareGdPdfText(text.replace(from, to), crew, expected);
    assert.equal(mismatch.complete, false);
    assert.match(mismatch.reason, new RegExp(field));
  }
});

test('missing SY or PDF fields never pass', () => {
  for (const field of Object.keys(expected)) {
    assert.equal(compareGdPdfText(text, crew, { ...expected, [field]: '' }).complete, false);
  }
  assert.equal(compareGdPdfText(text.replace('B7868', ''), crew, expected).complete, false);
  assert.equal(compareGdPdfText(text, [], expected).complete, false);
  assert.equal(compareGdPdfText(text, [{ passport: '' }], expected).complete, false);
});

test('passports require an exact token in the crew table', () => {
  assert.equal(compareGdPdfText(text.replace('SE1234567', 'SE12345678'), crew, expected).complete, false);
  const movedOutsideTable = text.replace('SE1234567', '') + '\nSE1234567';
  assert.equal(compareGdPdfText(movedOutsideTable, crew, expected).complete, false);
});

test('date normalization accepts SY and ISO formats and rejects invalid dates', () => {
  assert.equal(normalizeFlightDate('11OCT2026'), '2026-10-11');
  assert.equal(normalizeFlightDate('11OCT26'), '2026-10-11');
  assert.equal(normalizeFlightDate('2026-02-30'), '');
  assert.equal(normalizeFlightDate('31FEB26'), '');
});

test('extra and duplicate passports require verification', () => {
  assert.equal(compareGdPdfText(text.replace('TTL 2', 'SE7654321\nTTL 3'), crew, expected).complete, false);
  const duplicate = compareGdPdfText(text.replace('TTL 2', 'SE1234567\nTTL 3'), crew, expected);
  assert.equal(duplicate.complete, false);
  assert.deepEqual(duplicate.duplicatePassports, ['SE1234567']);
  assert.equal(compareGdPdfText(text, [crew[0], crew[0], crew[1]], expected).complete, false);
});

// Build a small synthetic PDF without storing real crew travel documents in Git.
function pdfWithCells(rows) {
  const stream = rows.map((row, index) => row.map((cell, column) =>
    `BT /F1 10 Tf 1 0 0 1 ${30 + column * 160} ${750 - index * 25} Tm (${cell}) Tj ET`).join('\n')).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('real PDF extraction preserves adjacent cell boundaries', async () => {
  const pdf = pdfWithCells([
    ['Registration B7868', 'Flight No. MU586', 'Date 2026-10-11'],
    ['FLIGHT ROUTING'], ['PASSPORT NO'], ['TEST CN 900101 M', 'SE1234567'], ['TTL 1']
  ]);
  const extracted = await extractGdPdfText(pdf);
  assert.equal(compareGdPdfText(extracted, [crew[0]], expected).complete, true);
});

test('invalid and textless PDFs fail extraction', async () => {
  await assert.rejects(extractGdPdfText(Buffer.from('broken')));
  await assert.rejects(extractGdPdfText(pdfWithCells([[' ']])), /no readable text/);
});

test('PDF extraction works in a clean deployment without pdfjs-dist installed', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const prefix = path.join(os.tmpdir(), 'gd-pdf-runtime-');
  const directory = fs.mkdtempSync(prefix);
  try {
    fs.copyFileSync(require.resolve('../gdPdf'), path.join(directory, 'gdPdf.js'));
    fs.cpSync(path.join(__dirname, '../vendor'), path.join(directory, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'sample.pdf'), pdfWithCells([
      ['Registration B7868', 'Flight No. MU586', 'Date 2026-10-11'],
      ['FLIGHT ROUTING'], ['PASSPORT NO'], ['TEST CN 900101 M', 'SE1234567'], ['TTL 1']
    ]));
    const result = spawnSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      try { require.resolve('pdfjs-dist'); throw new Error('Test requires an isolated deployment'); }
      catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
      const { extractGdPdfText, compareGdPdfText } = require('./gdPdf');
      extractGdPdfText(fs.readFileSync('sample.pdf')).then(text => {
        const result = compareGdPdfText(text, [{ passport: 'SE1234567' }], {
          flightNo: 'MU586', flightDate: '11OCT26', aircraftRegistration: 'B-7868'
        });
        if (!result.complete) throw new Error(result.reason);
        console.log('ISOLATED_PDF_MATCHED');
      }).catch(err => { console.error(err); process.exitCode = 1; });
    `], { cwd: directory, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /ISOLATED_PDF_MATCHED/);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
