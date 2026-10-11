let pdfJs;

function normalizeRegistration(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '');
}

function normalizeFlightDate(value) {
  const text = String(value || '').trim().toUpperCase();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
  }
  match = text.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2}|\d{4})$/);
  if (!match) return '';
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(match[2]) + 1;
  return normalizeFlightDate(`${match[3].length === 2 ? '20' : ''}${match[3]}-${String(month).padStart(2, '0')}-${match[1]}`);
}

function compareGdPdfText(text, crew, expected = {}) {
  const normalized = String(text || '').toUpperCase();
  const header = normalized.split(/FLIGHT\s+ROUTING/)[0];
  const actual = {
    flightNo: header.match(/FLIGHT\s*NO\.?\s*:?\s*([A-Z]{2}\s*\d{1,4})\b/)?.[1]?.replace(/\s/g, '') || '',
    flightDate: normalizeFlightDate(header.match(/\bDATE\s*:?\s*(\d{4}-\d{2}-\d{2})\b/)?.[1]),
    aircraftRegistration: normalizeRegistration(header.match(/REGISTRATION\s*:?\s*(B\s*-?\s*[A-Z0-9]{4,5})\b/)?.[1])
  };
  const fields = ['flightNo', 'flightDate', 'aircraftRegistration'].map((key) => {
    const value = key === 'flightDate' ? normalizeFlightDate(expected[key])
      : key === 'aircraftRegistration' ? normalizeRegistration(expected[key])
        : String(expected[key] || '').toUpperCase().replace(/\s/g, '');
    return { key, expected: value, actual: actual[key], matched: Boolean(value && actual[key] && value === actual[key]) };
  });
  // Read only the crew table; numbers elsewhere in the declaration cannot satisfy a passport check.
  const table = normalized.split(/FLIGHT\s+ROUTING/)[1]?.split(/\bTTL\b|DECLARATION\s+OF\s+HEALTH/)[0] || '';
  const gdPassports = table.match(/\b[A-Z]{1,3}\d{5,9}\b/g) || [];
  const passports = new Set(gdPassports);
  const expectedCrew = (crew || []).map(row => ({ no: row.no, passport: String(row.passport || '').trim().toUpperCase() }));
  const missing = expectedCrew.filter(row => !row.passport || !passports.has(row.passport));
  const missingCrewDocuments = expectedCrew.some(row => !row.passport);
  const extraPassports = [...passports].filter(passport => !expectedCrew.some(row => row.passport === passport));
  const duplicatePassports = [...passports].filter(passport => gdPassports.filter(value => value === passport).length > 1);
  const duplicateCrewPassports = expectedCrew.some((row, index) => row.passport && expectedCrew.findIndex(other => other.passport === row.passport) !== index);
  const reasons = fields.filter(field => !field.matched).map(field =>
    `${field.key}: SY=${field.expected || '(missing)'}, PDF=${field.actual || '(missing)'}`);
  if (!expectedCrew.length) reasons.push('No CWD crew/passport rows found.');
  if (missingCrewDocuments) reasons.push('One or more CWD crew rows have no passport number.');
  if (missing.length) reasons.push(`${missing.length} CWD passport(s) not matched in PDF.`);
  if (extraPassports.length) reasons.push(`${extraPassports.length} extra passport(s) in PDF.`);
  if (duplicatePassports.length) reasons.push('Duplicate passport numbers in PDF.');
  if (duplicateCrewPassports) reasons.push('Duplicate passport numbers in CWD.');
  return {
    complete: expectedCrew.length > 0 && reasons.length === 0,
    matched: expectedCrew.length - missing.length,
    total: expectedCrew.length,
    missing,
    extraPassports,
    duplicatePassports,
    gdPassports,
    fields,
    reason: reasons.join('; ')
  };
}

async function extractGdPdfText(buffer) {
  pdfJs ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = await pdfJs;
  const loading = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
  try {
    const document = await loading.promise;
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      // PDF cells have independent text objects. Preserve boundaries so adjacent
      // gender/DOB cells cannot become part of a passport number.
      let previousY;
      pages.push(content.items.filter(item => typeof item.str === 'string').map(item => {
        const y = item.transform[5];
        const separator = previousY === undefined || y === previousY ? ' ' : '\n';
        previousY = y;
        return separator + item.str;
      }).join(''));
      page.cleanup();
    }
    const text = pages.join('\n');
    if (!text.trim()) throw new Error('PDF has no readable text; scanned PDFs require OCR/manual verification.');
    return text;
  } finally {
    await loading.destroy();
  }
}

module.exports = { compareGdPdfText, extractGdPdfText, normalizeFlightDate, normalizeRegistration };
