const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

// ===============================
// Google Auth
// ===============================
const auth = new google.auth.GoogleAuth({

  credentials: {

    client_email:
      process.env.GOOGLE_CLIENT_EMAIL,

    private_key:
      process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, '\n')
  },

  scopes: [

    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ]
});

// ===============================
// Drive Client
// ===============================
const drive =
  google.drive({

    version: 'v3',

    auth
  });

const sheets =
  google.sheets({
    version: 'v4',
    auth
  });


const FULL_SHEET_ID =
  '1FjdIg_b1iIfcAbCsxGBmIMnhFxA70sRo7cs4Vr4OLpc';

const FSC_RATE_SHEET_ID =
  process.env.FSC_RATE_SHEET_ID || '1-BnQrtRj6-uTgoC89uj8zQ1dZTcSh96QFRH-_Tf4JEQ';
const FSC_RATE_SHEET_GID =
  Number(process.env.FSC_RATE_SHEET_GID || 1436143706);
const FSC_RATE_CELL =
  process.env.FSC_RATE_CELL || 'I8';
const SY_BOOKING_SHEET_ID =
  process.env.SY_BOOKING_SHEET_ID || FSC_RATE_SHEET_ID;
const SY_BOOKING_SHEET_GID =
  Number(process.env.SY_BOOKING_SHEET_GID || 701688915);
const SY_BOOKING_RANGE =
  process.env.SY_BOOKING_RANGE || 'F7:F9';

const ENABLE_240_SHEET =
  String(process.env.ENABLE_240_SHEET || 'true').toLowerCase() !== 'false';

const CBS_SHEET_ID = process.env.CBS_SHEET_ID || '10oEQypkoaNvosREqT-mNw8zsyrQxln2EwsBUuS9OtsU';
const CBS_SHEET_GID = Number(process.env.CBS_SHEET_GID || 0);
const CBS_NOTIFICATION_EMAILS = (process.env.CBS_NOTIFICATION_EMAILS || 'laxhmmu@gmail.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CBS_HEADERS = [
  'Case Number',
  'Case Type',
  'Status',
  'Passenger Name',
  'Email',
  'Phone',
  'Ticket Number',
  'Class Of Travel',
  'Flight Route',
  'Bag Tag',
  'Permanent Address',
  'Temporary Address',
  'Temporary Address Valid Until',
  'Address Available',
  'AHL Bag Description',
  'AHL Bag Brand Tag',
  'AHL Bag Type',
  'AHL Features',
  'AHL Other Features',
  'AHL Contents',
  'DPR Damage Level',
  'DPR Bag Info',
  'DPR Bag Type',
  'DPR Inner Damage',
  'Contents Details',
  'Issue Date',
  'Passenger Signature',
  'Submit Date',
  'Updated At',
  'Update Note',
  'Destination On Bags',
  'Departure Origin',
  'Update History'
];
let cbsSheetTitle = '';
let cbsSheetCache = { loadedAt: 0, rows: [] };
const CBS_UPDATE_HISTORY_FILE = process.env.CBS_UPDATE_HISTORY_FILE || path.join(__dirname, 'data', 'cbs-update-history.json');
let cbsUpdateHistoryCache = { loadedAt: 0, data: null };
const CBS_MISSING_BAG_SHEET_GID = Number(process.env.CBS_MISSING_BAG_SHEET_GID || 1145829442);
const CBS_MISSING_BAG_HEADERS = ['Bag Tag', 'Passenger Name', 'Destination', 'Airline', 'Source Email Date', 'Source Attachment', 'Recorded At', 'Case Number', 'Case Created At', 'Acknowledged At'];
const CBS_SCAN_SHEET_ID = process.env.CBS_SCAN_SHEET_ID || '1bfIeytT6UMdvWXimeg4s1HVuXHqmpYZx53ufsbes6Ms';
const CBS_SCAN_SHEET_GID = Number(process.env.CBS_SCAN_SHEET_GID || 0);
const TRANSIT_240_SHEET_ID = process.env.TRANSIT_240_SHEET_ID || '1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ';
const TRANSIT_240_SHEET_GID = Number(process.env.TRANSIT_240_SHEET_GID || 527537258);
const TRANSIT_240_HEADERS = ['Submit Date', 'Passenger Name', 'Seat Number', 'BN Number', 'Passport Nationality Code', 'Passport Expiration Date', 'Itinerary'];
let transit240SheetTitle = '';
const CBS_SCAN_HEADERS = ['BN', 'Seat', 'Flight', 'Raw Scan', 'Scanned At'];
const CBS_SCAN_INFANT_HEADERS = ['Infant BN', 'Infant Seat', 'Infant Flight', 'Infant Raw Scan', 'Infant Scanned At'];
let cbsScanSheetTitle = '';
let cbsScanSheetCache = { loadedAt: 0, rows: [] };
let cbsScanAppendQueue = Promise.resolve();
let cbsMissingBagSheetTitle = '';
let cbsMissingBagSheetCache = { loadedAt: 0, rows: [] };

let fullSheetCache = {
  loadedAt: 0,
  rows: []
};

let syBagSheetCache = {
  loadedAt: 0,
  rows: []
};
let syBagSheetTitle = '';

let sheetAccessBlocked = false;

const NOTES_DRIVE_FILE_ID = process.env.NOTES_DRIVE_FILE_ID || '';
const NOTES_DRIVE_FILE_NAME = process.env.NOTES_DRIVE_FILE_NAME || 'mufc-notes-store.json';
let notesDriveFileId = NOTES_DRIVE_FILE_ID;

async function resolveNotesDriveFileId() {
  if (notesDriveFileId) return notesDriveFileId;
  const escapedName = NOTES_DRIVE_FILE_NAME.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `name='${escapedName}' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
    pageSize: 1,
    orderBy: 'modifiedTime desc'
  });
  notesDriveFileId = response.data.files?.[0]?.id || '';
  return notesDriveFileId;
}

async function readNotesDriveStore() {
  const fileId = await resolveNotesDriveFileId();
  if (!fileId) return { notes: [] };
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  const parsed = JSON.parse(response.data || '{}');
  return parsed && typeof parsed === 'object' && Array.isArray(parsed.notes) ? parsed : { notes: [] };
}

async function writeNotesDriveStore(store) {
  const body = JSON.stringify(store && typeof store === 'object' ? store : { notes: [] }, null, 2) + '\n';
  const media = { mimeType: 'application/json', body: Readable.from([body]) };
  const fileId = await resolveNotesDriveFileId();
  if (fileId) {
    await drive.files.update({ fileId, media });
    return { fileId };
  }
  const created = await drive.files.create({
    requestBody: { name: NOTES_DRIVE_FILE_NAME, mimeType: 'application/json' },
    media,
    fields: 'id'
  });
  notesDriveFileId = created.data.id || '';
  return { fileId: notesDriveFileId };
}


function normalizeBn(value) {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  if (!digits) return '';
  return digits.padStart(3, '0');
}

function normalizeFlightDate(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!m) return '';
  const month = Number(m[1]);
  const day = Number(m[2]);
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][month - 1];
  if (!mon || !day) return '';
  return `${String(day).padStart(2, '0')}${mon}`;
}


function escapeSheetTitle(title) {
  return `'${String(title || '').replace(/'/g, "''")}'`;
}

function extractFscExchangeRate(value) {
  const match = String(value || '').match(/\bRATE\s+BSR\s+1\s*CNY\s*=\s*(\d+(?:\.\d+)?)\s*USD\b/i);
  return match?.[1] || '';
}

async function updateFscExchangeRate(rate) {
  const normalizedRate = String(rate || '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalizedRate)) {
    throw new Error('Invalid FSC exchange rate.');
  }

  const title = await resolveSheetTitleByGid(FSC_RATE_SHEET_ID, FSC_RATE_SHEET_GID);
  if (!title) {
    throw new Error(`Sheet gid ${FSC_RATE_SHEET_GID} was not found in spreadsheet ${FSC_RATE_SHEET_ID}.`);
  }
  const range = `${escapeSheetTitle(title)}!${FSC_RATE_CELL}`;
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: FSC_RATE_SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[normalizedRate]] }
  });

  return {
    rate: normalizedRate,
    spreadsheetId: FSC_RATE_SHEET_ID,
    gid: FSC_RATE_SHEET_GID,
    cell: FSC_RATE_CELL,
    sheetTitle: title,
    updatedRange: res.data.updatedRange || range
  };
}

function normalizeSyBookingCounts(counts) {
  if (!Array.isArray(counts) || counts.length !== 3) {
    throw new Error('Invalid SY booking counts.');
  }

  return counts.map((value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) throw new Error('Invalid SY booking count.');
    return String(Number(digits));
  });
}

async function updateSyBookingCounts(counts) {
  const [first, business, economy] = normalizeSyBookingCounts(counts);
  const title = await resolveSheetTitleByGid(SY_BOOKING_SHEET_ID, SY_BOOKING_SHEET_GID);
  if (!title) {
    throw new Error(`Sheet gid ${SY_BOOKING_SHEET_GID} was not found in spreadsheet ${SY_BOOKING_SHEET_ID}.`);
  }

  const range = `${escapeSheetTitle(title)}!${SY_BOOKING_RANGE}`;
  const values = [[first], [business], [economy]];
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: SY_BOOKING_SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });

  return {
    counts: { first, business, economy },
    spreadsheetId: SY_BOOKING_SHEET_ID,
    gid: SY_BOOKING_SHEET_GID,
    range: SY_BOOKING_RANGE,
    sheetTitle: title,
    updatedRange: res.data.updatedRange || range
  };
}

async function getFullSheetRows() {
  if (!ENABLE_240_SHEET || sheetAccessBlocked) {
    return [];
  }

  const ttlMs = 5 * 60 * 1000;
  if (Date.now() - fullSheetCache.loadedAt < ttlMs && fullSheetCache.rows.length) {
    return fullSheetCache.rows;
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: FULL_SHEET_ID,
      range: 'FULL!A:N'
    });

    const rows = res.data.values || [];
    fullSheetCache = {
      loadedAt: Date.now(),
      rows
    };
    return rows;
  } catch (err) {
    const reason =
      err?.errors?.[0]?.reason ||
      err?.response?.data?.error?.errors?.[0]?.reason ||
      '';

    if (reason === 'accessNotConfigured' || err?.code === 403) {
      sheetAccessBlocked = true;
      console.warn(
        '240 info lookup disabled: Google Sheets API unavailable/disabled for current project.'
      );
      return [];
    }

    throw err;
  }
}

async function get240InfoByBnAndFlightDate({ bn, flightDate }) {
  try {
    const rows = await getFullSheetRows();
    if (!rows.length) return null;

    const targetBn = normalizeBn(bn);
    const targetDate = String(flightDate || '').toUpperCase();

    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i];
      const rowDate = normalizeFlightDate(row[0]);
      const rowBn = normalizeBn(row[7]);

      if (rowDate !== targetDate || rowBn !== targetBn) continue;

      return {
        passportCountry: row[9] || '',
        passportExpiry: row[10] || '',
        leaveChinaAt: row[11] || '',
        destination: row[12] || '',
        agentSubmitter: row[13] || ''
      };
    }

    return null;
  } catch (err) {
    console.error('240 info lookup error:', err?.message || err);
    return null;
  }
}


function normalizeTimestampToIsoDate(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!m) return '';
  const mm = String(Number(m[1])).padStart(2, '0');
  const dd = String(Number(m[2])).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

async function resolveSheetTitleByGid(spreadsheetId, gid) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))'
  });
  const sheet = (meta.data.sheets || []).find(s => String(s?.properties?.sheetId) === String(gid));
  return sheet?.properties?.title || '';
}


function normalizeFlightToken(value) {
  const m = String(value || '').toUpperCase().match(/(\d{2})([A-Z]{3})(\d{2})?/);
  if (!m) return '';
  return `${m[1]}${m[2]}`;
}

async function getSyBagSheetRows() {
  if (sheetAccessBlocked) return [];
  const ttlMs = 5 * 60 * 1000;
  if (Date.now() - syBagSheetCache.loadedAt < ttlMs && syBagSheetCache.rows.length) return syBagSheetCache.rows;

  if (!syBagSheetTitle) syBagSheetTitle = await resolveSheetTitleByGid(FULL_SHEET_ID, 1199056804);
  if (!syBagSheetTitle) return [];

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FULL_SHEET_ID,
    range: `${syBagSheetTitle}!A:W`
  });

  const rows = res.data.values || [];
  syBagSheetCache = { loadedAt: Date.now(), rows };
  return rows;
}

async function getSyBagInfoByDate(isoDate, flightDateRaw = '') {
  try {
    const rows = await getSyBagSheetRows();
    if (rows.length <= 1) return null;

    const normalizeReportType = (value) => String(value || '').trim().toUpperCase();
    const classifyReportType = (value) => {
      const normalized = normalizeReportType(value).replace(/\s+/g, ' ');
      if (normalized.includes('RUSH') && normalized.includes('BAG')) return 'RUSH BAGS';
      if (normalized.includes('NOT') && normalized.includes('LOAD') && normalized.includes('BAG')) return 'NOT LOAD BAGS';
      return '';
    };
    const buildRushRow = (row) => [14, 15, 16, 17, 18].map((idx) => row[idx] || '');

    const buildNotLoadRow = (row) => [20, 21, 22].map((idx) => row[idx] || '');

    const collectRushRowsForMatcher = (matcher) => {
      const values = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!matcher(row) || classifyReportType(row[1]) !== 'RUSH BAGS') continue;
        const columns = buildRushRow(row);
        if (columns.some((v) => String(v || '').trim() !== '')) values.push(columns);
      }
      return values;
    };

    const collectNotLoadRowsForMatcher = (matcher) => {
      const values = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!matcher(row) || classifyReportType(row[1]) !== 'NOT LOAD BAGS') continue;
        const columns = buildNotLoadRow(row);
        if (columns.some((v) => String(v || '').trim() !== '')) values.push(columns);
      }
      return values;
    };

    const buildPayload = (matcher) => {
      const rushRows = collectRushRowsForMatcher(matcher);
      const rushBags = rushRows.length
        ? {
          type: 'RUSH BAGS',
          headers: ['RUSH TAG NUMBER', 'ORIGINAL TAG NUMBER', 'RUSH TO WHERE', 'AKE NUMBER', 'REMARK'],
          rows: rushRows,
          columns: rushRows[rushRows.length - 1],
          hasData: true
        }
        : null;
      const notLoadRows = collectNotLoadRowsForMatcher(matcher);
      const notLoadBags = notLoadRows.length
        ? {
          type: 'NOT LOAD BAGS',
          headers: ['TAG NUMBER', 'LOAD OR NOT', 'COMMENT'],
          rows: notLoadRows,
          hasData: true
        }
        : null;
      if (!rushBags && !notLoadBags) return null;
      return {
        rushBags,
        notLoadBags,
        unloadBags: notLoadBags ? notLoadBags.rows : [],
        hasData: Boolean(rushBags?.hasData || notLoadBags?.hasData)
      };
    };

    // Keep this aligned with 240 date matching logic: compare by flight token (DDMMM)
    // from timestamp, ignoring time and year.
    const targetToken = normalizeFlightToken(flightDateRaw);
    if (targetToken) {
      const tokenMatch = buildPayload((row) => normalizeFlightDate(row[0]) === targetToken);
      if (tokenMatch) return tokenMatch;
    }

    // Fallback: exact ISO date match when token is unavailable.
    const isoMatch = buildPayload((row) => normalizeTimestampToIsoDate(row[0]) === isoDate);
    if (isoMatch) return isoMatch;

    return null;
  } catch (err) {
    console.error('SY bag sheet lookup error:', err?.message || err);
    return null;
  }
}

// ===============================
// Download File
// ===============================
async function downloadLog(fileId) {

  const response =
    await drive.files.get({

      fileId,

      alt: 'media'

    }, {

      responseType: 'text'
    });

  return response.data;
}

// ===============================
// Get Today Log
// ===============================
function isLogFileName(name = '') {
  return String(name || '').trim().toLowerCase().endsWith('.log');
}
const SALES_REPORT_FOLDER_ID = '1-RLbv_BU9rnsaaPy8UUkbN6FkhA5YqGf';

const REPORT_SHEET_ID = '1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ';
const SALES_REPORT_SOURCE_SHEET_ID = '1VDIRN77cKZMQPXQ1ZLY-8lp8VI44tpFD5oU1Q9YAzYs';
const SALES_REPORT_SOURCE_GID = 2078248111;
const SALES_REPORT_DETAIL_SHEET_NAME = '销售日报明细表';
const TEST_BAGGAGE_SHEET_ID = '1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ';
const TEST_BAGGAGE_GID = 1340163844;
const TEST_BAGGAGE_HEADERS = [
  'Bag Tag',
  'Direction',
  'Flight',
  'Date',
  'Bag Type',
  'Location',
  'Status',
  'Comment',
  'Rush Tag Number',
  'Rush To Where',
  'AKE Number',
  'World Tracer File #',
  'Tracking Number',
  'Shipping Fee',
  'Submitted By',
  'Submitted At',
  'Last Updated By',
  'Last Updated At',
  'Update History'
];
let testBaggageSheetTitle = '';
let testBaggageSheetAccessBlocked = false;
let testBaggageSheetCache = { loadedAt: 0, rows: [] };
const REPORT_SHEETS = {
  vip: {
    gid: 1703169759,
    headers: ['Flight Date', 'Flight #', 'Passenger Name', 'BN', 'Seat', 'BAGS'],
    fields: ['flightDate', 'flightNo', 'passenger', 'bn', 'seat', 'bags'],
    readOnly: true
  },
  wheelchair: {
    gid: 268414514,
    headers: ['Recorded At', 'Date', 'Flight', 'Flight Date', 'Passenger', 'BN', 'Seat', 'Wheelchair Type', 'Key'],
    fields: ['recordedAt', 'date', 'flightNo', 'flightDate', 'passenger', 'bn', 'seat', 'wheelchairType', 'key']
  },
  inad: {
    gid: 1507379454,
    headers: ['Recorded At', 'Date', 'Flight', 'Flight Date', 'Passenger', 'BN', 'Seat', 'Ticket Number', 'Service', 'Key'],
    fields: ['recordedAt', 'date', 'flightNo', 'flightDate', 'passenger', 'bn', 'seat', 'ticketNumber', 'service', 'key']
  },
  psmMsg: {
    gid: 101743110,
    headers: ['Recorded At', 'Flight Date', 'Flight #', 'Passenger Name', 'BN', 'Seat', 'BAGS', 'Type', 'Detail', 'Key'],
    fields: ['recordedAt', 'flightDate', 'flightNo', 'passenger', 'bn', 'seat', 'bags', 'type', 'detail', 'key']
  },
  salesDetails: {
    gid: 1069298005,
    headers: ['Date', 'EMD', 'Value', 'Type', 'Flight', 'Report Date', 'File Name', 'Key'],
    fields: ['date', 'emd', 'value', 'type', 'flightNo', 'reportDate', 'fileName', 'key']
  }
};
const reportSheetTitles = {};
let reportSheetAccessBlocked = false;
let salesReportSourceSheetTitle = '';

function normalizeTestBagTag(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isValidTestBagTag(value) {
  return /^[A-Z]{2}\d{6}$/.test(normalizeTestBagTag(value));
}

function sanitizeSheetText(value, maxLength = 500) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function safeParseHistory(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getTestBaggageSheetTitle() {
  if (!testBaggageSheetTitle) {
    testBaggageSheetTitle = await resolveSheetTitleByGid(TEST_BAGGAGE_SHEET_ID, TEST_BAGGAGE_GID);
  }
  return testBaggageSheetTitle || '';
}

async function getTestBaggageSheetRows(options = {}) {
  if (testBaggageSheetAccessBlocked) return [];
  const ttlMs = 30 * 1000;
  if (!options.forceRefresh && Date.now() - testBaggageSheetCache.loadedAt < ttlMs && testBaggageSheetCache.rows.length) {
    return testBaggageSheetCache.rows;
  }
  try {
    const title = await getTestBaggageSheetTitle();
    if (!title) return [];
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: TEST_BAGGAGE_SHEET_ID,
      range: `${title}!A:S`
    });
    const rows = res.data.values || [];
    testBaggageSheetCache = { loadedAt: Date.now(), rows };
    return rows;
  } catch (err) {
    const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason || '';
    if (reason === 'accessNotConfigured' || err?.code === 403) {
      testBaggageSheetAccessBlocked = true;
      console.warn('Test baggage sheet lookup disabled: Google Sheets API unavailable or not shared with service account.');
      return [];
    }
    throw err;
  }
}

async function ensureTestBaggageSheetHeaders(rows) {
  if (testBaggageSheetAccessBlocked) return;
  const title = await getTestBaggageSheetTitle();
  if (!title) return;
  const firstRow = rows?.[0] || [];
  const hasHeaders = TEST_BAGGAGE_HEADERS.every((header, index) => String(firstRow[index] || '').trim() === header);
  if (hasHeaders) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: TEST_BAGGAGE_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [TEST_BAGGAGE_HEADERS] }
  });
  testBaggageSheetCache = { loadedAt: 0, rows: [] };
}

function testBaggageRowFromSheet(values, rowNumber) {
  const row = {};
  TEST_BAGGAGE_HEADERS.forEach((header, index) => {
    const field = header
      .toLowerCase()
      .replace(/#/g, 'number')
      .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/[^a-z0-9]/g, '');
    row[field] = values[index] || '';
  });
  row.bagTag = normalizeTestBagTag(values[0]);
  row.history = safeParseHistory(values[18]);
  row.rowNumber = rowNumber;
  return row;
}

function testBaggageValuesFromRecord(record) {
  return [
    normalizeTestBagTag(record.bagTag),
    sanitizeSheetText(record.direction, 40),
    sanitizeSheetText(record.flight, 20).toUpperCase(),
    sanitizeSheetText(record.date, 20),
    sanitizeSheetText(record.bagType, 80),
    sanitizeSheetText(record.location, 120),
    sanitizeSheetText(record.status, 80),
    sanitizeSheetText(record.comment, 500),
    sanitizeSheetText(record.rushTagNumber, 80),
    sanitizeSheetText(record.rushToWhere, 120),
    sanitizeSheetText(record.akeNumber, 80),
    sanitizeSheetText(record.worldTracerFileNumber, 120),
    sanitizeSheetText(record.trackingNumber, 160),
    sanitizeSheetText(record.shippingFee, 80),
    sanitizeSheetText(record.submittedBy, 160),
    sanitizeSheetText(record.submittedAt, 40),
    sanitizeSheetText(record.lastUpdatedBy, 160),
    sanitizeSheetText(record.lastUpdatedAt, 40),
    JSON.stringify(Array.isArray(record.history) ? record.history : [])
  ];
}

async function findTestBaggageByTag(bagTag) {
  const normalizedTag = normalizeTestBagTag(bagTag);
  if (!isValidTestBagTag(normalizedTag)) return null;
  const rows = await getTestBaggageSheetRows({ forceRefresh: true });
  await ensureTestBaggageSheetHeaders(rows);
  for (let i = 1; i < rows.length; i += 1) {
    if (normalizeTestBagTag(rows[i]?.[0]) === normalizedTag) {
      return testBaggageRowFromSheet(rows[i], i + 1);
    }
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (normalizeTestBagTag(rows[i]?.[8]) === normalizedTag) {
      return testBaggageRowFromSheet(rows[i], i + 1);
    }
  }
  for (let i = 1; i < rows.length; i += 1) {
    const history = safeParseHistory(rows[i]?.[18]);
    const hasRushTagMatch = history.some((entry) => normalizeTestBagTag(entry?.details?.rushTagNumber) === normalizedTag);
    if (hasRushTagMatch) return testBaggageRowFromSheet(rows[i], i + 1);
  }
  return null;
}


function sheetCellHeader(headers, index) {
  return String(headers?.[index] || TEST_BAGGAGE_HEADERS[index] || `Column ${String.fromCharCode(65 + index)}`).trim() || `Column ${String.fromCharCode(65 + index)}`;
}

function baggageReportDetails(values, headers) {
  const detail = {};
  (values || []).forEach((value, index) => {
    const cleaned = sanitizeSheetText(value, 500);
    if (cleaned) detail[`${String.fromCharCode(65 + index)} - ${sheetCellHeader(headers, index)}`] = cleaned;
  });
  return detail;
}

function baggageReportDateOnly(value) {
  const raw = sanitizeSheetText(value, 80);
  const iso = normalizeSheetDateToIso(raw);
  if (iso) return iso;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match ? match[1] : raw;
}

function baggageReportSheetNodes(values, headers, row = {}) {
  const details = baggageReportDetails(values, headers);
  const nodes = [{
    label: 'Create',
    at: row.submitDate || row.submittedAt || '',
    details
  }];
  const currentStatus = sanitizeSheetText(row.currentStatus || row.status || '', 120);
  if (currentStatus) {
    nodes.push({
      label: currentStatus,
      at: row.lastUpdated || row.lastUpdatedAt || '',
      details
    });
  }
  return nodes;
}

async function getTestBaggageReportRows(options = {}) {
  const rows = await getTestBaggageSheetRows({ forceRefresh: true });
  const hasKnownHeaders = TEST_BAGGAGE_HEADERS.every((header, index) => String(rows?.[0]?.[index] || '').trim() === header);
  const hasSheetHeaders = !hasKnownHeaders && /submit|date|bag|status|updated/i.test((rows?.[0] || []).join('|'));
  const headers = hasKnownHeaders || hasSheetHeaders ? rows[0] : TEST_BAGGAGE_HEADERS;
  const startIndex = hasKnownHeaders || hasSheetHeaders ? 1 : 0;
  const fromIso = normalizeSheetDateToIso(options.from);
  const toIso = normalizeSheetDateToIso(options.to);
  const bagTagNeedle = normalizeTestBagTag(options.bagTag || '');
  const hasSearch = Boolean(fromIso || toIso || bagTagNeedle);
  const result = (rows || [])
    .slice(startIndex)
    .map((values, offset) => {
      const rowNumber = startIndex + offset + 1;
      const mapped = testBaggageRowFromSheet(values || [], rowNumber);
      const bagTagFromA = normalizeTestBagTag(values?.[0] || '');
      const submitDate = sanitizeSheetText(values?.[15] || mapped.submittedAt || mapped.date || '', 80);
      const submitDateIso = normalizeSheetDateToIso(submitDate);
      const rawLastUpdated = sanitizeSheetText(values?.[17] || mapped.lastUpdatedAt || values?.[16] || mapped.submittedAt || '', 80);
      const lastUpdated = baggageReportDateOnly(rawLastUpdated);
      const row = {
        ...mapped,
        rowNumber,
        submitDate,
        submitDateIso,
        bagTag: isValidTestBagTag(bagTagFromA) ? bagTagFromA : mapped.bagTag,
        flight: sanitizeSheetText(values?.[2] || mapped.flight || '', 20).toUpperCase(),
        currentStatus: sanitizeSheetText(values?.[6] || mapped.status || '', 120),
        lastUpdated,
        rawLastUpdated,
        raw: values || []
      };
      row.sheetNodes = baggageReportSheetNodes(values || [], headers, row);
      return row;
    })
    .filter((row) => row.bagTag || row.currentStatus || row.lastUpdated || row.submitDate || (Array.isArray(row.history) && row.history.length))
    .filter((row) => !bagTagNeedle || normalizeTestBagTag(row.bagTag).includes(bagTagNeedle))
    .filter((row) => {
      if (!fromIso && !toIso) return true;
      if (!row.submitDateIso) return false;
      return (!fromIso || row.submitDateIso >= fromIso) && (!toIso || row.submitDateIso <= toIso);
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.rawLastUpdated || a.lastUpdated || a.lastUpdatedAt || a.submittedAt || a.submitDate || '') || 0;
      const bTime = Date.parse(b.rawLastUpdated || b.lastUpdated || b.lastUpdatedAt || b.submittedAt || b.submitDate || '') || 0;
      return bTime - aTime;
    });
  return hasSearch ? result : result.slice(0, 20);
}

async function appendTestBaggageRecord(record) {
  if (testBaggageSheetAccessBlocked) return { created: false };
  const normalizedTag = normalizeTestBagTag(record?.bagTag);
  if (!isValidTestBagTag(normalizedTag)) throw new Error('Bag tag must match MU123456 format');
  const title = await getTestBaggageSheetTitle();
  if (!title) throw new Error('Test baggage sheet not found');
  const rows = await getTestBaggageSheetRows({ forceRefresh: true });
  await ensureTestBaggageSheetHeaders(rows);
  const existing = await findTestBaggageByTag(normalizedTag);
  if (existing) return { created: false, record: existing };
  const now = new Date().toISOString();
  const direction = sanitizeSheetText(record.direction, 20).toLowerCase() === 'outbound' ? 'Outbound' : 'Inbound';
  const cleanRecord = {
    bagTag: normalizedTag,
    direction,
    flight: sanitizeSheetText(record.flight, 20).toUpperCase(),
    date: sanitizeSheetText(record.date, 20),
    bagType: sanitizeSheetText(record.bagType, 80),
    location: sanitizeSheetText(record.location, 120),
    status: sanitizeSheetText(record.status, 80) || (direction === 'Inbound' ? 'Bag location update' : ''),
    comment: sanitizeSheetText(record.comment, 500),
    rushTagNumber: sanitizeSheetText(record.rushTagNumber, 80),
    rushToWhere: sanitizeSheetText(record.rushToWhere, 120),
    akeNumber: sanitizeSheetText(record.akeNumber, 80),
    worldTracerFileNumber: sanitizeSheetText(record.worldTracerFileNumber, 120),
    trackingNumber: sanitizeSheetText(record.trackingNumber, 160),
    shippingFee: sanitizeSheetText(record.shippingFee, 80),
    submittedBy: sanitizeSheetText(record.submittedBy, 160),
    submittedAt: now,
    lastUpdatedBy: sanitizeSheetText(record.submittedBy, 160),
    lastUpdatedAt: now,
    history: [{
      type: `${direction} created`,
      by: sanitizeSheetText(record.submittedBy, 160),
      at: now,
      details: {
        flight: sanitizeSheetText(record.flight, 20).toUpperCase(),
        date: sanitizeSheetText(record.date, 20),
        bagType: sanitizeSheetText(record.bagType, 80),
        location: sanitizeSheetText(record.location, 120),
        status: sanitizeSheetText(record.status, 80) || (direction === 'Inbound' ? 'Bag location update' : ''),
        comment: sanitizeSheetText(record.comment, 500),
        rushTagNumber: sanitizeSheetText(record.rushTagNumber, 80),
        rushToWhere: sanitizeSheetText(record.rushToWhere, 120),
        akeNumber: sanitizeSheetText(record.akeNumber, 80),
        worldTracerFileNumber: sanitizeSheetText(record.worldTracerFileNumber, 120),
        trackingNumber: sanitizeSheetText(record.trackingNumber, 160),
        shippingFee: sanitizeSheetText(record.shippingFee, 80)
      }
    }]
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId: TEST_BAGGAGE_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [testBaggageValuesFromRecord(cleanRecord)] }
  });
  testBaggageSheetCache = { loadedAt: 0, rows: [] };
  return { created: true, record: await findTestBaggageByTag(normalizedTag) };
}

async function updateTestBaggageRecord(bagTag, update) {
  if (testBaggageSheetAccessBlocked) return { updated: false };
  const existing = await findTestBaggageByTag(bagTag);
  if (!existing) return { updated: false, notFound: true };
  const title = await getTestBaggageSheetTitle();
  if (!title) throw new Error('Test baggage sheet not found');
  const now = new Date().toISOString();
  const updateType = sanitizeSheetText(update?.type, 40).toLowerCase();
  const updatedBy = sanitizeSheetText(update?.updatedBy, 160);
  const details = {};
  const next = {
    ...existing,
    history: Array.isArray(existing.history) ? existing.history : []
  };

  if (updateType === 'rush') {
    next.status = 'Rush';
    next.rushTagNumber = sanitizeSheetText(update.rushTagNumber, 80);
    next.rushToWhere = sanitizeSheetText(update.rushToWhere, 120);
    next.akeNumber = sanitizeSheetText(update.akeNumber, 80);
    next.worldTracerFileNumber = sanitizeSheetText(update.worldTracerFileNumber, 120);
    next.comment = sanitizeSheetText(update.comment, 500);
    Object.assign(details, {
      rushTagNumber: next.rushTagNumber,
      rushToWhere: next.rushToWhere,
      akeNumber: next.akeNumber,
      worldTracerFileNumber: next.worldTracerFileNumber,
      comment: next.comment
    });
  } else if (updateType === 'location') {
    next.status = 'Bag location update';
    next.location = sanitizeSheetText(update.location, 120);
    details.location = next.location;
  } else if (updateType === 'shipping') {
    next.status = 'Shipping';
    next.trackingNumber = sanitizeSheetText(update.trackingNumber, 160);
    next.shippingFee = sanitizeSheetText(update.shippingFee, 80);
    Object.assign(details, {
      trackingNumber: next.trackingNumber,
      shippingFee: next.shippingFee
    });
  } else {
    throw new Error('Invalid update type');
  }

  next.lastUpdatedBy = updatedBy;
  next.lastUpdatedAt = now;
  next.history = [
    ...next.history,
    {
      type: updateType,
      by: updatedBy,
      at: now,
      details
    }
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: TEST_BAGGAGE_SHEET_ID,
    range: `${title}!A${existing.rowNumber}:S${existing.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [testBaggageValuesFromRecord(next)] }
  });
  testBaggageSheetCache = { loadedAt: 0, rows: [] };
  return { updated: true, record: await findTestBaggageByTag(existing.bagTag) };
}

function normalizeReportSheetType(type) {
  const normalized = String(type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'psmmsg') return 'psmMsg';
  if (normalized === 'salesdetail' || normalized === 'salesdetails') return 'salesDetails';
  if (normalized === 'wch') return 'wheelchair';
  return normalized;
}

function getReportSheetConfig(type) {
  return REPORT_SHEETS[normalizeReportSheetType(type)] || null;
}

function buildStoredReportKey(type, row) {
  const normalizedType = String(type || '').toLowerCase();
  if (row?.key) return String(row.key);
  if (normalizedType === 'salesdetails') {
    return [
      normalizedType,
      row?.date || '',
      row?.emd || '',
      row?.value || '',
      row?.type || '',
      row?.flightNo || '',
      row?.reportDate || ''
    ].map((value) => String(value || '').trim().toUpperCase()).join('|');
  }
  return [
    normalizedType,
    row?.date || '',
    row?.flightNo || '',
    row?.flightDate || '',
    row?.passenger || '',
    row?.bn || '',
    row?.seat || '',
    row?.wheelchairType || '',
    row?.ticketNumber || '',
    row?.service || ''
  ].map((value) => String(value || '').trim().toUpperCase()).join('|');
}

function scanMarkerKey(type, isoDate) {
  return `__SCAN__|${String(type || '').toLowerCase()}|${isoDate}`;
}

async function getReportSheetTitle(type) {
  const normalizedType = normalizeReportSheetType(type);
  const config = getReportSheetConfig(normalizedType);
  if (!config) return '';
  if (!reportSheetTitles[normalizedType]) {
    reportSheetTitles[normalizedType] = await resolveSheetTitleByGid(REPORT_SHEET_ID, config.gid);
  }
  return reportSheetTitles[normalizedType] || '';
}

async function getReportSheetRows(type) {
  if (reportSheetAccessBlocked) return [];
  const config = getReportSheetConfig(type);
  if (!config) return [];
  try {
    const title = await getReportSheetTitle(type);
    if (!title) return [];
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: REPORT_SHEET_ID,
      range: `${title}!A:${String.fromCharCode(64 + config.headers.length)}`
    });
    return res.data.values || [];
  } catch (err) {
    const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason || '';
    if (reason === 'accessNotConfigured' || err?.code === 403) {
      reportSheetAccessBlocked = true;
      console.warn('Report sheet lookup disabled: Google Sheets API unavailable or not shared with service account.');
      return [];
    }
    throw err;
  }
}

async function ensureReportSheetHeaders(type, rows) {
  if (reportSheetAccessBlocked) return;
  const config = getReportSheetConfig(type);
  const title = await getReportSheetTitle(type);
  if (!config || !title) return;
  const firstRow = rows?.[0] || [];
  const hasHeaders = config.headers.every((header, index) => String(firstRow[index] || '').trim() === header);
  if (hasHeaders) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: REPORT_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [config.headers] }
  });
}

function normalizeSheetDateToIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;

  match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  }

  match = raw.toUpperCase().match(/^(\d{1,2})[-\s]?([A-Z]{3})[-\s]?(\d{2}|\d{4})?$/);
  if (match) {
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const month = months[match[2]];
    const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(new Date().getUTCFullYear());
    if (month) return `${year}-${month}-${String(Number(match[1])).padStart(2, '0')}`;
  }

  return '';
}

function isReportHeaderRow(type, values) {
  const joined = (values || []).map((value) => String(value || '').trim().toLowerCase()).join('|');
  if (!joined) return true;
  if (type === 'vip') return /flight date/.test(joined) && /passenger/.test(joined);
  if (normalizeReportSheetType(type) === 'psmMsg') return /flight date/.test(joined) && /detail/.test(joined);
  const config = getReportSheetConfig(type);
  return Boolean(config?.headers?.every((header, index) => String(values?.[index] || '').trim() === header));
}

function reportRowFromSheet(type, values) {
  const config = getReportSheetConfig(type);
  const row = {};
  config.fields.forEach((field, index) => {
    row[field] = values[index] || '';
  });
  const normalizedType = normalizeReportSheetType(type);
  if (type === 'vip' || normalizedType === 'psmMsg') {
    const displayDate = row.flightDate || row.date || '';
    const isoDate = normalizeSheetDateToIso(displayDate);
    row.displayDate = displayDate;
    row.date = isoDate || displayDate;
    row.flightDate = displayDate;
    row.flightNo = String(row.flightNo || '').trim().toUpperCase();
    row.passenger = String(row.passenger || '').trim();
    row.bn = String(row.bn || '').trim().padStart(3, '0').replace(/^0+$/, '');
    row.seat = String(row.seat || '').trim().toUpperCase();
    row.bags = String(row.bags || '').trim();
    row.type = String(row.type || '').trim().toUpperCase();
    row.detail = String(row.detail || '').trim();
  } else if (normalizedType === 'salesDetails') {
    row.date = normalizeSheetDateToIso(row.date) || String(row.date || '').trim();
    row.emd = String(row.emd || '').trim();
    row.value = Number(String(row.value || '').replace(/[^0-9.-]+/g, '')) || 0;
    row.type = String(row.type || '').trim().toUpperCase();
    row.flightNo = String(row.flightNo || '').trim().toUpperCase();
    row.reportDate = normalizeSheetDateToIso(row.reportDate) || String(row.reportDate || '').trim();
    row.fileName = String(row.fileName || '').trim();
  } else if (normalizedType === 'wheelchair' || normalizedType === 'inad') {
    const isoDate = normalizeSheetDateToIso(row.date);
    row.date = isoDate || String(row.date || '').trim();
    row.displayDate = row.date;
    row.flightNo = String(row.flightNo || '').trim().toUpperCase();
    row.flightDate = String(row.flightDate || '').trim().toUpperCase();
    row.passenger = String(row.passenger || '').trim();
    row.bn = String(row.bn || '').trim().padStart(3, '0').replace(/^0+$/, '');
    row.seat = String(row.seat || '').trim().toUpperCase();
    row.wheelchairType = String(row.wheelchairType || '').trim().toUpperCase();
    row.ticketNumber = String(row.ticketNumber || '').trim().toUpperCase();
    row.service = String(row.service || '').trim().toUpperCase();
  }
  return row;
}

function sheetValuesFromReportRow(type, row) {
  const config = getReportSheetConfig(type);
  const normalized = {
    ...row,
    recordedAt: row.recordedAt || new Date().toISOString(),
    key: buildStoredReportKey(type, row)
  };
  return config.fields.map((field) => normalized[field] || '');
}

async function getStoredReportRows(type, isoDate) {
  const config = getReportSheetConfig(type);
  if (!config) return { rows: [], scanned: false };
  const rows = await getReportSheetRows(type);
  if (!config.readOnly) await ensureReportSheetHeaders(type, rows);
  let scanned = false;
  const dataRows = [];
  const startIndex = rows.length && isReportHeaderRow(type, rows[0]) ? 1 : 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (isReportHeaderRow(type, rows[i])) continue;
    const parsed = reportRowFromSheet(type, rows[i]);
    if (String(parsed.key || '').startsWith('__SCAN__') || parsed.passenger === '__SCAN_COMPLETE__') {
      if (!isoDate || parsed.key === scanMarkerKey(type, isoDate)) scanned = true;
      continue;
    }
    if (isoDate && parsed.date !== isoDate) continue;
    dataRows.push(parsed);
  }
  return { rows: dataRows, scanned: config.readOnly ? true : scanned };
}


function reportRetentionCutoffIso() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - 18);
  return date.toISOString().slice(0, 10);
}

async function pruneStoredReportRows(type) {
  if (reportSheetAccessBlocked) return { deleted: 0 };
  const config = getReportSheetConfig(type);
  if (!config) return { deleted: 0 };
  const title = await getReportSheetTitle(type);
  if (!title) return { deleted: 0 };
  const rows = await getReportSheetRows(type);
  if (rows.length <= 1) return { deleted: 0 };
  const cutoff = reportRetentionCutoffIso();
  const deleteIndexes = [];
  for (let i = 1; i < rows.length; i += 1) {
    const parsed = reportRowFromSheet(type, rows[i]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && parsed.date < cutoff) deleteIndexes.push(i);
  }
  if (!deleteIndexes.length) return { deleted: 0 };
  const requests = deleteIndexes.reverse().map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId: config.gid,
        dimension: 'ROWS',
        startIndex: rowIndex,
        endIndex: rowIndex + 1
      }
    }
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: REPORT_SHEET_ID,
    requestBody: { requests }
  });
  return { deleted: deleteIndexes.length };
}



async function getVipReportRows(isoDate = '') {
  const rows = await getReportSheetRows('vip');
  const dataRows = [];
  const startIndex = rows.length && isReportHeaderRow('vip', rows[0]) ? 1 : 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (isReportHeaderRow('vip', rows[i])) continue;
    const parsed = reportRowFromSheet('vip', rows[i]);
    if (isoDate && parsed.date !== isoDate) continue;
    dataRows.push(parsed);
  }
  return dataRows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.flightNo || '').localeCompare(String(b.flightNo || '')) || Number(a.bn || 0) - Number(b.bn || 0) || String(a.passenger || '').localeCompare(String(b.passenger || '')));
}

async function getPsmMsgReportRows(fromIsoDate, toIsoDate = fromIsoDate) {
  const from = String(fromIsoDate || '').trim();
  const to = String(toIsoDate || from).trim();
  const rows = await getReportSheetRows('psmMsg');
  await ensureReportSheetHeaders('psmMsg', rows);
  const dataRows = [];
  const startIndex = rows.length && isReportHeaderRow('psmMsg', rows[0]) ? 1 : 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (isReportHeaderRow('psmMsg', rows[i])) continue;
    const parsed = reportRowFromSheet('psmMsg', rows[i]);
    if (from && parsed.date < from) continue;
    if (to && parsed.date > to) continue;
    dataRows.push(parsed);
  }
  return dataRows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.flightNo || '').localeCompare(String(b.flightNo || '')) || Number(a.bn || 0) - Number(b.bn || 0));
}

async function getInadReportRows() {
  const rows = await getReportSheetRows('inad');
  await ensureReportSheetHeaders('inad', rows);
  const dataRows = [];
  const startIndex = rows.length && isReportHeaderRow('inad', rows[0]) ? 1 : 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (isReportHeaderRow('inad', rows[i])) continue;
    const parsed = reportRowFromSheet('inad', rows[i]);
    if (String(parsed.key || '').startsWith('__SCAN__') || parsed.passenger === '__SCAN_COMPLETE__') continue;
    dataRows.push(parsed);
  }
  return dataRows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.flightNo || '').localeCompare(String(b.flightNo || '')) || Number(a.bn || 0) - Number(b.bn || 0));
}

async function getWheelchairReportRows(fromIsoDate, toIsoDate = fromIsoDate) {
  const from = String(fromIsoDate || '').trim();
  const to = String(toIsoDate || from).trim();
  const rows = await getReportSheetRows('wheelchair');
  await ensureReportSheetHeaders('wheelchair', rows);
  const dataRows = [];
  const startIndex = rows.length && isReportHeaderRow('wheelchair', rows[0]) ? 1 : 0;
  for (let i = startIndex; i < rows.length; i += 1) {
    if (isReportHeaderRow('wheelchair', rows[i])) continue;
    const parsed = reportRowFromSheet('wheelchair', rows[i]);
    if (String(parsed.key || '').startsWith('__SCAN__') || parsed.passenger === '__SCAN_COMPLETE__') continue;
    if (from && parsed.date < from) continue;
    if (to && parsed.date > to) continue;
    dataRows.push(parsed);
  }
  return dataRows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.flightNo || '').localeCompare(String(b.flightNo || '')) || Number(a.bn || 0) - Number(b.bn || 0));
}

async function appendVipReportRows(rows) {
  if (reportSheetAccessBlocked) return { appended: 0 };
  const config = getReportSheetConfig('vip');
  const title = await getReportSheetTitle('vip');
  if (!config || !title) return { appended: 0 };
  const sheetRows = await getReportSheetRows('vip');
  await ensureReportSheetHeaders('vip', sheetRows);
  const existingKeys = new Set();
  const startIndex = sheetRows.length && isReportHeaderRow('vip', sheetRows[0]) ? 1 : 0;
  for (let i = startIndex; i < sheetRows.length; i += 1) {
    if (isReportHeaderRow('vip', sheetRows[i])) continue;
    const parsed = reportRowFromSheet('vip', sheetRows[i]);
    existingKeys.add([
      parsed.flightDate,
      parsed.flightNo,
      parsed.passenger
    ].map((value) => String(value || '').trim().toUpperCase()).join('|'));
  }

  const values = [];
  const newestRows = [...(rows || [])].sort((a, b) => Number(b?.timestampMs || 0) - Number(a?.timestampMs || 0));
  for (const row of newestRows) {
    const normalized = {
      flightDate: String(row.flightDate || '').trim().toUpperCase(),
      flightNo: String(row.flightNo || '').trim().toUpperCase(),
      passenger: String(row.passenger || '').trim().toUpperCase(),
      bn: String(row.bn || '').trim().replace(/^0+(?=\d)/, ''),
      seat: String(row.seat || '').trim().toUpperCase(),
      bags: String(row.bags || '').trim().toUpperCase()
    };
    if (!normalized.flightDate || !normalized.flightNo || !normalized.passenger) continue;
    if (normalized.flightNo === 'MU586' && (!normalized.bn || !normalized.seat)) continue;
    const key = [normalized.flightDate, normalized.flightNo, normalized.passenger].join('|').toUpperCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    values.push(config.fields.map((field) => normalized[field] || ''));
  }

  if (!values.length) return { appended: 0 };
  await sheets.spreadsheets.values.append({
    spreadsheetId: REPORT_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return { appended: values.length };
}


function buildPsmMsgKey(row) {
  return [
    'psmMsg',
    row?.flightDate || '',
    row?.flightNo || '',
    row?.passenger || '',
    row?.bn || '',
    row?.seat || '',
    row?.bags || '',
    row?.type || '',
    row?.detail || ''
  ].map((value) => String(value || '').trim().toUpperCase()).join('|');
}

function reportPsmMsgRowFromSheet(values) {
  const row = {};
  const config = getReportSheetConfig('psmMsg');
  config.fields.forEach((field, index) => {
    row[field] = values[index] || '';
  });
  row.flightDate = String(row.flightDate || '').trim().toUpperCase();
  row.flightNo = String(row.flightNo || '').trim().toUpperCase();
  row.passenger = String(row.passenger || '').trim().toUpperCase();
  row.bn = String(row.bn || '').trim().padStart(3, '0').replace(/^0+$/, '');
  row.seat = String(row.seat || '').trim().toUpperCase();
  row.bags = String(row.bags || '').trim().toUpperCase();
  row.type = String(row.type || '').trim().toUpperCase();
  row.detail = String(row.detail || '').trim().toUpperCase();
  row.key = row.key || buildPsmMsgKey(row);
  return row;
}

async function appendPsmMsgReportRows(rows) {
  if (reportSheetAccessBlocked) return { appended: 0 };
  const config = getReportSheetConfig('psmMsg');
  const title = await getReportSheetTitle('psmMsg');
  if (!config || !title) return { appended: 0 };
  const sheetRows = await getReportSheetRows('psmMsg');
  await ensureReportSheetHeaders('psmMsg', sheetRows);
  const existingKeys = new Set();
  const startIndex = sheetRows.length && isReportHeaderRow('psmMsg', sheetRows[0]) ? 1 : 0;
  for (let i = startIndex; i < sheetRows.length; i += 1) {
    if (isReportHeaderRow('psmMsg', sheetRows[i])) continue;
    const parsed = reportPsmMsgRowFromSheet(sheetRows[i]);
    existingKeys.add(String(parsed.key || buildPsmMsgKey(parsed)).trim().toUpperCase());
  }

  const values = [];
  for (const row of rows || []) {
    const normalized = {
      recordedAt: row.recordedAt || new Date().toISOString(),
      flightDate: String(row.flightDate || '').trim().toUpperCase(),
      flightNo: String(row.flightNo || '').trim().toUpperCase(),
      passenger: String(row.passenger || '').trim().toUpperCase(),
      bn: String(row.bn || '').trim().padStart(3, '0'),
      seat: String(row.seat || '').trim().toUpperCase(),
      bags: String(row.bags || '').trim().toUpperCase(),
      type: String(row.type || '').trim().toUpperCase(),
      detail: String(row.detail || '').trim().toUpperCase()
    };
    if (!normalized.flightDate || !normalized.flightNo || !normalized.passenger || !normalized.detail) continue;
    normalized.key = row.key || buildPsmMsgKey(normalized);
    const key = String(normalized.key || '').trim().toUpperCase();
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    values.push(config.fields.map((field) => normalized[field] || ''));
  }

  if (!values.length) return { appended: 0 };
  await sheets.spreadsheets.values.append({
    spreadsheetId: REPORT_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return { appended: values.length };
}

async function appendStoredReportRows(type, isoDate, rows) {
  if (reportSheetAccessBlocked) return { appended: 0 };
  const config = getReportSheetConfig(type);
  if (!config || config.readOnly) return { appended: 0 };
  const title = await getReportSheetTitle(type);
  if (!title) return { appended: 0 };
  const sheetRows = await getReportSheetRows(type);
  await ensureReportSheetHeaders(type, sheetRows);
  const existingKeys = new Set(sheetRows.slice(1).map((row) => reportRowFromSheet(type, row).key).filter(Boolean));
  const values = [];
  for (const row of rows || []) {
    const key = buildStoredReportKey(type, row);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    values.push(sheetValuesFromReportRow(type, { ...row, key }));
  }
  if (!values.length) return { appended: 0 };
  await sheets.spreadsheets.values.append({
    spreadsheetId: REPORT_SHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return { appended: values.length };
}

function normalizeFlightCode(flightNo) {
  return String(flightNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toIsoDateFromFlightDate(flightDate) {
  const m = String(flightDate || '').toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!m) return '';
  const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const mm = months[m[2]];
  if (!mm) return '';
  return `20${m[3]}-${mm}-${m[1]}`;
}


async function getSalesReportSourceSheetTitle() {
  if (!salesReportSourceSheetTitle) {
    salesReportSourceSheetTitle = await resolveSheetTitleByGid(SALES_REPORT_SOURCE_SHEET_ID, SALES_REPORT_SOURCE_GID);
  }
  return salesReportSourceSheetTitle || SALES_REPORT_DETAIL_SHEET_NAME;
}

async function readSalesReportSourceValues() {
  const title = await getSalesReportSourceSheetTitle();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SALES_REPORT_SOURCE_SHEET_ID,
    range: `${title}!A:U`,
    valueRenderOption: 'FORMATTED_VALUE'
  });
  return res.data.values || [];
}

function salesDetailRowFromValues(values, file = {}) {
  const date = normalizeSheetDateToIso(values?.[0]) || String(values?.[0] || '').trim();
  const emd = String(values?.[1] || '').trim();
  const rawValue = values?.[5] ?? '';
  const type = String(values?.[20] || '').trim().toUpperCase();
  if (!date || !emd || !type || /^date$/i.test(date) || /^emd$/i.test(emd)) return null;
  const value = typeof rawValue === 'number' ? rawValue : Number(String(rawValue || '').replace(/[^0-9.-]+/g, ''));
  const row = { date, emd, value: Number.isFinite(value) ? value : 0, type, flightNo: file.flightNo || '', reportDate: file.reportDate || date, fileName: file.name || '' };
  row.key = buildStoredReportKey('salesDetails', row);
  return row;
}


function normalizedHeaderLabel(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function salesDetailRowsFromSourceValues(rows = []) {
  const parsed = [];
  let columns = null;
  for (const values of rows) {
    const labels = (values || []).map(normalizedHeaderLabel);
    const emdIndex = labels.indexOf('EMD');
    const valueIndex = labels.indexOf('VALUE');
    const dateIndex = labels.indexOf('DATE');
    const typeIndexes = labels.map((label, index) => (label === 'TYPE' ? index : -1)).filter((index) => index >= 0);
    if (emdIndex >= 0 && valueIndex >= 0 && dateIndex >= 0 && typeIndexes.length) {
      columns = { dateIndex, emdIndex, valueIndex, typeIndex: typeIndexes[typeIndexes.length - 1] };
      continue;
    }
    if (!columns) continue;
    const row = salesDetailRowFromValues([
      values[columns.dateIndex],
      values[columns.emdIndex],
      '',
      '',
      '',
      values[columns.valueIndex],
      ...Array(14).fill(''),
      values[columns.typeIndex]
    ], { name: 'Daily Sales Report' });
    if (row) parsed.push(row);
  }
  return parsed;
}

async function syncSalesDetailsFromSourceSheet(fromIsoDate, toIsoDate) {
  const sourceRows = await readSalesReportSourceValues();
  const sheetRows = await getReportSheetRows('salesDetails');
  await ensureReportSheetHeaders('salesDetails', sheetRows);
  const existing = new Set(sheetRows.slice(1).map((row) => String(row[7] || '').trim()).filter(Boolean));
  const values = [];
  for (const row of salesDetailRowsFromSourceValues(sourceRows)) {
    if (!row || row.date < fromIsoDate || row.date > toIsoDate || existing.has(row.key)) continue;
    existing.add(row.key);
    values.push(sheetValuesFromReportRow('salesDetails', row));
  }
  if (values.length) {
    const title = await getReportSheetTitle('salesDetails');
    await sheets.spreadsheets.values.append({
      spreadsheetId: REPORT_SHEET_ID,
      range: `${title}!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });
  }
  return { source: 'dailySheet', appended: values.length };
}

async function getSalesDetailsReportRows(fromIsoDate, toIsoDate, options = {}) {
  let sync = { source: 'dailySheet', appended: 0, errors: [] };
  if (options.sync !== false) {
    try {
      sync = await syncSalesDetailsFromSourceSheet(fromIsoDate, toIsoDate);
    } catch (err) {
      sync = { source: 'dailySheet', appended: 0, errors: [err?.message || 'Sales details sync failed'] };
    }
  }
  const rows = await getReportSheetRows('salesDetails');
  await ensureReportSheetHeaders('salesDetails', rows);
  const dataRows = [];
  for (let i = rows.length && isReportHeaderRow('salesDetails', rows[0]) ? 1 : 0; i < rows.length; i += 1) {
    if (isReportHeaderRow('salesDetails', rows[i])) continue;
    const row = reportRowFromSheet('salesDetails', rows[i]);
    if (row.date >= fromIsoDate && row.date <= toIsoDate) dataRows.push(row);
  }
  const totals = {};
  for (const row of dataRows) {
    const type = row.type || 'UNKNOWN';
    if (!totals[type]) totals[type] = { amount: 0, count: 0 };
    totals[type].amount += Number(row.value) || 0;
    totals[type].count += 1;
  }
  return { rows: dataRows, totals: Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([type, total]) => ({ type, amount: Math.round(total.amount * 100) / 100, count: total.count })), sync };
}

async function findSalesReportFile(flightNo, flightDate) {
  const normalizedFlightNo = normalizeFlightCode(flightNo);
  const isoDate = toIsoDateFromFlightDate(flightDate);
  if (!normalizedFlightNo || !isoDate) return null;
  const exactName = `Sales Report ${normalizedFlightNo} ${isoDate}.xls`;
  const res = await drive.files.list({
    q: `'${SALES_REPORT_FOLDER_ID}' in parents and trashed = false and name = '${exactName.replace(/'/g, "\\'")}'`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    pageSize: 1,
    orderBy: 'modifiedTime desc'
  });
  return res.data.files?.[0] || null;
}

async function getSalesReportMeta(flightNo, flightDate) {
  try {
    const file = await findSalesReportFile(flightNo, flightDate);
    if (!file) return { available: false };
    return { available: true, fileId: file.id, fileName: file.name };
  } catch (err) {
    console.error('Sales report lookup error:', err?.message || err);
    return { available: false };
  }
}

async function downloadSalesReportByFlight(flightNo, flightDate) {
  const file = await findSalesReportFile(flightNo, flightDate);
  if (!file) return null;
  const response = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
  return { fileName: file.name, content: response.data };
}

async function downloadLogsInFolder(folderId, label) {

  const files = [];
  let pageToken = null;

  do {
    const res =
      await drive.files.list({

        q:
          `'${folderId}' in parents and trashed = false`,

        fields:
          'nextPageToken,files(id,name,modifiedTime,mimeType)',

        orderBy:
          'name',

        pageSize:
          1000,

        pageToken
      });

    files.push(...(res.data.files || []).filter((file) => isLogFileName(file.name)));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  if (!files.length) {
    console.log(`${label} .log files not found`);
    return null;
  }

  files.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const logs = [];

  for (const file of files) {
    console.log(
      `Using ${label} log ${file.name}:`,
      file.modifiedTime || ''
    );

    const content =
      await downloadLog(file.id);

    logs.push(content);
  }

  return logs.join('\n');
}

async function getLatestFlightLog() {

  try {

    const folderId =
      process.env.TODAY_FOLDER_ID;

    return await downloadLogsInFolder(
      folderId,
      'TODAY'
    );

  } catch (err) {

    console.error(
      'Today Log Error:',
      err
    );

    return null;
  }
}


function envFirst(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function getNextDayInfoGmailClient() {
  const requestedAuthMode = envFirst('AUTH_MODE', 'NEXT_DAY_INFO_GMAIL_AUTH_MODE').toLowerCase();
  const refreshToken = envFirst('GOOGLE_REFRESH_TOKEN', 'GMAIL_REFRESH_TOKEN');
  const gmailUser = envFirst('GMAIL_USER', 'NEXT_DAY_INFO_GMAIL_USER');
  if (refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      envFirst('GOOGLE_CLIENT_ID', 'GMAIL_CLIENT_ID') || '30017158772-k1frki5rvjl2u0t905gavmuskgnolpgc.apps.googleusercontent.com',
      envFirst('GOOGLE_CLIENT_SECRET', 'GMAIL_CLIENT_SECRET') || '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',
      envFirst('GOOGLE_REDIRECT_URI', 'GMAIL_REDIRECT_URI') || 'http://localhost'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return {
      gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
      userId: gmailUser || 'me',
      authMode: 'oauth',
      hasRefreshToken: true,
      requestedAuthMode
    };
  }

  if (requestedAuthMode === 'oauth') {
    throw new Error('AUTH_MODE=oauth but GOOGLE_REFRESH_TOKEN/GMAIL_REFRESH_TOKEN is not configured.');
  }

  return {
    gmail: google.gmail({ version: 'v1', auth }),
    userId: gmailUser || 'laxhmmu@gmail.com',
    authMode: 'service-account',
    hasRefreshToken: false,
    requestedAuthMode
  };
}

function nextDayInfoGmailErrorReason(err, authMode, userId) {
  const message = err?.message || String(err || 'Unknown Gmail error');
  const details = [];
  if (authMode === 'service-account') {
    details.push('GOOGLE_REFRESH_TOKEN/GMAIL_REFRESH_TOKEN is not configured, so the app fell back to service-account Gmail auth. Service accounts cannot read a normal Gmail Sent mailbox unless Google Workspace domain-wide delegation is configured. Set GOOGLE_REFRESH_TOKEN from get-token.js/test-gmail.js for the mailbox that sends NEXTDAY INFO.');
  }
  if (/precondition/i.test(message)) {
    details.push('Gmail returned a precondition error before searching messages; this usually means the selected auth method is not allowed to access the requested mailbox.');
  }
  if (userId && authMode === 'oauth' && userId !== 'me') {
    details.push('OAuth Gmail searches normally use userId "me", but GMAIL_USER is also supported for your .env. Only set GMAIL_USER/NEXT_DAY_INFO_GMAIL_USER to a different mailbox with delegated access.');
  }
  return [`Gmail API error: ${message}`, ...details].join(' ');
}

function gmailSearchYmd(value, timeZone = process.env.NEXT_DAY_INFO_GMAIL_TIME_ZONE || 'America/Los_Angeles') {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function decodeGmailBody(data = '') {
  if (!data) return '';
  try {
    return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function extractGmailTextParts(payload) {
  if (!payload) return [];
  const parts = [];
  const walk = (part) => {
    if (!part) return;
    const mimeType = String(part.mimeType || '').toLowerCase();
    const bodyText = decodeGmailBody(part.body?.data || '');
    if (bodyText && (mimeType === 'text/plain' || !part.parts?.length)) {
      parts.push(bodyText);
    }
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  return parts;
}

function normalizeGmailText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function parseNextDayInfoDetails(text = '') {
  const normalized = normalizeGmailText(text);
  const fields = [
    ['firstClass', 'First Class'],
    ['businessClass', 'Business Class'],
    ['economyClass', 'Economy Class'],
    ['internationalTransfer', 'International Transfer'],
    ['domesticTransfer', 'Domestic Transfer'],
    ['overnightPassengers', 'Overnight passengers']
  ];
  const details = {};
  fields.forEach(([key, label]) => {
    const pattern = `${label.replace(/ /g, '\\s+')}\\s*:\\s*(\\d+)`;
    const match = normalized.match(new RegExp(pattern, 'i'));
    details[key] = match?.[1] || '';
  });
  return details;
}

function buildNextDayInfoDetailLines(details = {}) {
  const rows = [
    ['First Class', details.firstClass],
    ['Business Class', details.businessClass],
    ['Economy Class', details.economyClass],
    ['', ''],
    ['International Transfer', details.internationalTransfer],
    ['Domestic Transfer', details.domesticTransfer],
    ['Overnight passengers', details.overnightPassengers]
  ];
  return rows.map(([label, value]) => (label ? `${label}: ${value || '--'}` : '')).join('\n');
}

async function getNextDayInfoEmail(flightNo, subjectDate, expectedSubject = '') {
  const normalizedFlightNo = String(flightNo || '').trim().toUpperCase();
  const normalizedSubjectDate = String(subjectDate || '').trim();
  const subject = String(expectedSubject || `${normalizedFlightNo} ${normalizedSubjectDate} flight information details`).trim();
  const empty = (extra = {}) => ({
    found: false,
    sent: false,
    subject,
    details: {},
    detailText: '',
    sentAt: '',
    messageId: '',
    reason: '',
    query: '',
    authMode: '',
    userId: '',
    searchDate: '',
    rawMatchCount: 0,
    todayMatchCount: 0,
    ...extra
  });
  if (!normalizedFlightNo || !normalizedSubjectDate || !subject) {
    return empty({ reason: 'Missing flight number, subject date, or expected email subject.' });
  }

  let gmail = null;
  let userId = envFirst('GMAIL_USER', 'NEXT_DAY_INFO_GMAIL_USER');
  let authMode = envFirst('AUTH_MODE', 'NEXT_DAY_INFO_GMAIL_AUTH_MODE').toLowerCase();
  let todayYmd = gmailSearchYmd(new Date());
  let q = '';

  try {
    ({ gmail, userId, authMode } = getNextDayInfoGmailClient());
    const exactSubject = subject.replace(/"/g, '');
    q = `in:sent subject:"${exactSubject}" newer_than:2d`;
    const result = await gmail.users.messages.list({
      userId,
      q,
      maxResults: 10,
      fields: 'messages(id,internalDate)'
    });
    const rawMessages = Array.isArray(result.data.messages) ? result.data.messages : [];
    const messages = rawMessages.filter((message) => gmailSearchYmd(Number(message.internalDate)) === todayYmd);
    if (!messages.length) {
      const reason = rawMessages.length
        ? `Found ${rawMessages.length} recent sent subject match(es), but none were sent today (${todayYmd}).`
        : `No sent Gmail message matched the expected subject today (${todayYmd}).`;
      console.log(`NEXTDAY INFO Gmail search not complete using ${authMode}: ${reason} Subject: ${subject} Query: ${q}`);
      return empty({
        reason,
        query: q,
        authMode,
        userId,
        searchDate: todayYmd,
        rawMatchCount: rawMessages.length,
        todayMatchCount: messages.length
      });
    }

    const full = await gmail.users.messages.get({
      userId,
      id: messages[0].id,
      format: 'full',
      fields: 'id,internalDate,payload(headers,mimeType,body(data),parts(mimeType,body(data),parts(mimeType,body(data))))'
    });
    const text = extractGmailTextParts(full.data.payload).join('\n');
    const details = parseNextDayInfoDetails(text);
    const detailText = buildNextDayInfoDetailLines(details);
    const sentAtDate = Number(full.data.internalDate) ? new Date(Number(full.data.internalDate)) : null;
    return {
      found: true,
      sent: true,
      subject,
      details,
      detailText,
      sentAt: sentAtDate ? sentAtDate.toISOString() : '',
      messageId: full.data.id || messages[0].id || '',
      reason: '',
      query: q,
      authMode,
      userId,
      searchDate: todayYmd,
      rawMatchCount: rawMessages.length,
      todayMatchCount: messages.length
    };
  } catch (err) {
    const reason = nextDayInfoGmailErrorReason(err, authMode, userId);
    console.error('Gmail next day info subject search error:', reason);
    return empty({
      reason,
      query: q,
      authMode,
      userId,
      searchDate: todayYmd
    });
  }
}


function collectGmailParts(payload, predicate, collected = []) {
  if (!payload) return collected;
  if (predicate(payload)) collected.push(payload);
  (payload.parts || []).forEach((part) => collectGmailParts(part, predicate, collected));
  return collected;
}

function xmlDecode(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)));
}

function extractZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return {};
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return {};
  const entries = {};
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && offset + 46 <= buffer.length; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      try {
        entries[name] = method === 8 ? zlib.inflateRawSync(compressed).toString('utf8') : compressed.toString('utf8');
      } catch {
        entries[name] = compressed.toString('utf8');
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}


function stripSpreadsheetCellText(value = '') {
  return xmlDecode(String(value || '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlColumnBText(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const views = [source.toString('utf8'), source.toString('latin1'), source.toString('utf16le')];
  const bValues = [];
  views.forEach((html) => {
    if (!/<t[dh]\b/i.test(html)) return;
    html.replace(/<tr\b[\s\S]*?<\/tr>/gi, (row) => {
      const cells = [];
      row.replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, (match, cell) => {
        cells.push(stripSpreadsheetCellText(cell));
        return match;
      });
      if (cells[1]) bValues.push(cells[1]);
      return row;
    });
  });
  return Array.from(new Set(bValues)).join(' ');
}

function splitDelimitedLine(line = '') {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (ch === '\t' || ch === ',')) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function extractDelimitedColumnBText(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const views = [source.toString('utf8'), source.toString('latin1'), source.toString('utf16le')];
  const bValues = [];
  views.forEach((text) => {
    text.split(/\r?\n/).forEach((line) => {
      if (!/[\t,]/.test(line)) return;
      const cells = splitDelimitedLine(line);
      if (cells[1]) bValues.push(stripSpreadsheetCellText(cells[1]));
    });
  });
  return Array.from(new Set(bValues.filter(Boolean))).join(' ');
}

function extractXlsxColumnBText(buffer) {
  const entries = extractZipEntries(buffer);
  const names = Object.keys(entries);
  if (!names.length) return '';
  const sharedStrings = [];
  const sharedXml = entries['xl/sharedStrings.xml'] || '';
  sharedXml.replace(/<si[\s\S]*?<\/si>/g, (si) => {
    const parts = [];
    si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (match, text) => parts.push(xmlDecode(text)));
    sharedStrings.push(parts.join(''));
    return si;
  });
  const bValues = [];
  names
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()
    .forEach((name) => {
      const xml = entries[name];
      xml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (match, attrs, body) => {
        const cellRef = attrs.match(/\br="([A-Z]+)\d+"/i)?.[1]?.toUpperCase();
        if (cellRef !== 'B') return match;
        const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || '';
        let value = '';
        if (type === 'inlineStr') {
          const parts = [];
          body.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m, text) => parts.push(xmlDecode(text)));
          value = parts.join('');
        } else {
          const raw = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
          value = type === 's' ? (sharedStrings[Number(raw)] || '') : raw;
        }
        if (value) bValues.push(value);
        return match;
      });
    });
  return bValues.join(' ');
}

function cfbSectorOffset(sectorId, sectorSize) {
  return (sectorId + 1) * sectorSize;
}

function cfbReadChain(buffer, fat, startSector, sectorSize, maxBytes = Number.MAX_SAFE_INTEGER) {
  const chunks = [];
  const seen = new Set();
  let sector = startSector;
  while (sector >= 0 && sector < fat.length && sector !== 0xfffffffe && sector !== 0xffffffff && !seen.has(sector)) {
    seen.add(sector);
    const offset = cfbSectorOffset(sector, sectorSize);
    if (offset < 0 || offset >= buffer.length) break;
    chunks.push(buffer.slice(offset, Math.min(offset + sectorSize, buffer.length)));
    if (chunks.reduce((sum, item) => sum + item.length, 0) >= maxBytes) break;
    sector = fat[sector];
  }
  return Buffer.concat(chunks).slice(0, maxBytes);
}

function extractCfbStreams(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512) return {};
  const signature = buffer.slice(0, 8).toString('hex');
  if (signature !== 'd0cf11e0a1b11ae1') return {};
  const sectorShift = buffer.readUInt16LE(30);
  const sectorSize = 1 << sectorShift;
  const fatSectorCount = buffer.readUInt32LE(44);
  const firstDirSector = buffer.readUInt32LE(48);
  const firstDifatSector = buffer.readUInt32LE(68);
  const difatSectorCount = buffer.readUInt32LE(72);
  const fatSectors = [];
  for (let i = 0; i < 109; i += 1) {
    const sector = buffer.readUInt32LE(76 + (i * 4));
    if (sector !== 0xffffffff) fatSectors.push(sector);
  }
  let difat = firstDifatSector;
  for (let i = 0; i < difatSectorCount && difat !== 0xffffffff && difat !== 0xfffffffe; i += 1) {
    const offset = cfbSectorOffset(difat, sectorSize);
    const entriesPerDifat = (sectorSize / 4) - 1;
    for (let j = 0; j < entriesPerDifat; j += 1) {
      const sector = buffer.readUInt32LE(offset + (j * 4));
      if (sector !== 0xffffffff) fatSectors.push(sector);
    }
    difat = buffer.readUInt32LE(offset + (entriesPerDifat * 4));
  }
  const fat = [];
  fatSectors.slice(0, fatSectorCount || fatSectors.length).forEach((sector) => {
    const offset = cfbSectorOffset(sector, sectorSize);
    for (let pos = offset; pos + 4 <= Math.min(offset + sectorSize, buffer.length); pos += 4) {
      fat.push(buffer.readUInt32LE(pos));
    }
  });
  const dirBuffer = cfbReadChain(buffer, fat, firstDirSector, sectorSize);
  const streams = {};
  for (let offset = 0; offset + 128 <= dirBuffer.length; offset += 128) {
    const nameLength = dirBuffer.readUInt16LE(offset + 64);
    if (nameLength < 2) continue;
    const name = dirBuffer.slice(offset, offset + nameLength - 2).toString('utf16le');
    const type = dirBuffer.readUInt8(offset + 66);
    if (type !== 2 && type !== 5) continue;
    const startSector = dirBuffer.readUInt32LE(offset + 116);
    const size = Number(dirBuffer.readBigUInt64LE ? dirBuffer.readBigUInt64LE(offset + 120) : BigInt(dirBuffer.readUInt32LE(offset + 120)));
    if (type === 2 && startSector !== 0xffffffff && size > 0) {
      streams[name] = cfbReadChain(buffer, fat, startSector, sectorSize, size);
    }
  }
  return streams;
}

function extractXlsWorkbookText(buffer) {
  const streams = extractCfbStreams(buffer);
  const workbook = streams.Workbook || streams.Book || streams['WORKBOOK'] || streams['BOOK'];
  if (!workbook) return '';
  return [workbook.toString('latin1'), workbook.toString('utf8'), workbook.toString('utf16le')]
    .join(' ')
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSpreadsheetText(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  return [
    extractXlsxColumnBText(source),
    extractXlsColumnBText(source),
    extractHtmlColumnBText(source),
    extractDelimitedColumnBText(source)
  ].filter(Boolean).join(' ');
}


function readBiffUnicodeString(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset + 3 > buffer.length) return { value: '', nextOffset: offset };
  const charCount = buffer.readUInt16LE(offset);
  const flags = buffer.readUInt8(offset + 2);
  let pos = offset + 3;
  const isUtf16 = Boolean(flags & 0x01);
  const hasExtended = Boolean(flags & 0x04);
  const hasRichText = Boolean(flags & 0x08);
  let richRuns = 0;
  let extendedSize = 0;
  if (hasRichText && pos + 2 <= buffer.length) {
    richRuns = buffer.readUInt16LE(pos);
    pos += 2;
  }
  if (hasExtended && pos + 4 <= buffer.length) {
    extendedSize = buffer.readUInt32LE(pos);
    pos += 4;
  }
  const byteLength = charCount * (isUtf16 ? 2 : 1);
  if (pos + byteLength > buffer.length) return { value: '', nextOffset: buffer.length };
  const value = buffer.slice(pos, pos + byteLength).toString(isUtf16 ? 'utf16le' : 'latin1');
  pos += byteLength + (richRuns * 4) + extendedSize;
  return { value, nextOffset: Math.min(pos, buffer.length) };
}

function parseBiffSstStrings(workbook) {
  const strings = [];
  for (let pos = 0; pos + 4 <= workbook.length;) {
    const opcode = workbook.readUInt16LE(pos);
    const length = workbook.readUInt16LE(pos + 2);
    const dataStart = pos + 4;
    const dataEnd = Math.min(dataStart + length, workbook.length);
    if (opcode !== 0x00fc) {
      pos = dataEnd;
      continue;
    }
    const chunks = [workbook.slice(dataStart, dataEnd)];
    let next = dataEnd;
    while (next + 4 <= workbook.length && workbook.readUInt16LE(next) === 0x003c) {
      const continueLength = workbook.readUInt16LE(next + 2);
      chunks.push(workbook.slice(next + 4, Math.min(next + 4 + continueLength, workbook.length)));
      next += 4 + continueLength;
    }
    const sst = Buffer.concat(chunks);
    const uniqueCount = sst.length >= 8 ? sst.readUInt32LE(4) : 0;
    let offset = 8;
    for (let i = 0; i < uniqueCount && offset < sst.length; i += 1) {
      const parsed = readBiffUnicodeString(sst, offset);
      strings.push(parsed.value);
      if (parsed.nextOffset <= offset) break;
      offset = parsed.nextOffset;
    }
    pos = next;
  }
  return strings;
}

function extractXlsColumnBText(buffer) {
  const streams = extractCfbStreams(buffer);
  const workbook = streams.Workbook || streams.Book || streams['WORKBOOK'] || streams['BOOK'];
  if (!workbook) return '';
  const sharedStrings = parseBiffSstStrings(workbook);
  const bValues = [];
  for (let pos = 0; pos + 4 <= workbook.length;) {
    const opcode = workbook.readUInt16LE(pos);
    const length = workbook.readUInt16LE(pos + 2);
    const dataStart = pos + 4;
    const dataEnd = Math.min(dataStart + length, workbook.length);
    if (opcode === 0x00fd && dataStart + 10 <= dataEnd) {
      const col = workbook.readUInt16LE(dataStart + 2);
      if (col === 1) {
        const sstIndex = workbook.readUInt32LE(dataStart + 6);
        const value = sharedStrings[sstIndex] || '';
        if (value) bValues.push(value);
      }
    } else if (opcode === 0x0204 && dataStart + 8 <= dataEnd) {
      const col = workbook.readUInt16LE(dataStart + 2);
      if (col === 1) {
        const parsed = readBiffUnicodeString(workbook.slice(dataStart + 6, dataEnd), 0);
        const fallbackLength = workbook.readUInt8(dataStart + 6);
        const fallback = dataStart + 7 + fallbackLength <= dataEnd ? workbook.slice(dataStart + 7, dataStart + 7 + fallbackLength).toString('latin1') : '';
        const value = parsed.value || fallback;
        if (value) bValues.push(value);
      }
    }
    pos = dataEnd;
  }
  return bValues.join(' ');
}

function isSpreadsheetAttachment(filename = '', mimeType = '') {
  const lowerName = String(filename || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  return /\.(xls|xlsx|xlsm|xlsb|csv)$/i.test(lowerName) || /excel|spreadsheet|sheet|csv/.test(lowerMime);
}

function gdAttachmentType(filename = '', mimeType = '') {
  return isSpreadsheetAttachment(filename, mimeType) ? 'Spreadsheet B column' : 'Attachment';
}


function readBiffUnicodeString(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset + 3 > buffer.length) return { value: '', nextOffset: offset };
  const charCount = buffer.readUInt16LE(offset);
  const flags = buffer.readUInt8(offset + 2);
  let pos = offset + 3;
  const isUtf16 = Boolean(flags & 0x01);
  const hasExtended = Boolean(flags & 0x04);
  const hasRichText = Boolean(flags & 0x08);
  let richRuns = 0;
  let extendedSize = 0;
  if (hasRichText && pos + 2 <= buffer.length) {
    richRuns = buffer.readUInt16LE(pos);
    pos += 2;
  }
  if (hasExtended && pos + 4 <= buffer.length) {
    extendedSize = buffer.readUInt32LE(pos);
    pos += 4;
  }
  const byteLength = charCount * (isUtf16 ? 2 : 1);
  if (pos + byteLength > buffer.length) return { value: '', nextOffset: buffer.length };
  const value = buffer.slice(pos, pos + byteLength).toString(isUtf16 ? 'utf16le' : 'latin1');
  pos += byteLength + (richRuns * 4) + extendedSize;
  return { value, nextOffset: Math.min(pos, buffer.length) };
}

function parseBiffSstStrings(workbook) {
  const strings = [];
  for (let pos = 0; pos + 4 <= workbook.length;) {
    const opcode = workbook.readUInt16LE(pos);
    const length = workbook.readUInt16LE(pos + 2);
    const dataStart = pos + 4;
    const dataEnd = Math.min(dataStart + length, workbook.length);
    if (opcode !== 0x00fc) {
      pos = dataEnd;
      continue;
    }
    const chunks = [workbook.slice(dataStart, dataEnd)];
    let next = dataEnd;
    while (next + 4 <= workbook.length && workbook.readUInt16LE(next) === 0x003c) {
      const continueLength = workbook.readUInt16LE(next + 2);
      chunks.push(workbook.slice(next + 4, Math.min(next + 4 + continueLength, workbook.length)));
      next += 4 + continueLength;
    }
    const sst = Buffer.concat(chunks);
    const uniqueCount = sst.length >= 8 ? sst.readUInt32LE(4) : 0;
    let offset = 8;
    for (let i = 0; i < uniqueCount && offset < sst.length; i += 1) {
      const parsed = readBiffUnicodeString(sst, offset);
      strings.push(parsed.value);
      if (parsed.nextOffset <= offset) break;
      offset = parsed.nextOffset;
    }
    pos = next;
  }
  return strings;
}

function extractXlsColumnBText(buffer) {
  const streams = extractCfbStreams(buffer);
  const workbook = streams.Workbook || streams.Book || streams['WORKBOOK'] || streams['BOOK'];
  if (!workbook) return '';
  const sharedStrings = parseBiffSstStrings(workbook);
  const bValues = [];
  for (let pos = 0; pos + 4 <= workbook.length;) {
    const opcode = workbook.readUInt16LE(pos);
    const length = workbook.readUInt16LE(pos + 2);
    const dataStart = pos + 4;
    const dataEnd = Math.min(dataStart + length, workbook.length);
    if (opcode === 0x00fd && dataStart + 10 <= dataEnd) {
      const col = workbook.readUInt16LE(dataStart + 2);
      if (col === 1) {
        const sstIndex = workbook.readUInt32LE(dataStart + 6);
        const value = sharedStrings[sstIndex] || '';
        if (value) bValues.push(value);
      }
    } else if (opcode === 0x0204 && dataStart + 8 <= dataEnd) {
      const col = workbook.readUInt16LE(dataStart + 2);
      if (col === 1) {
        const parsed = readBiffUnicodeString(workbook.slice(dataStart + 6, dataEnd), 0);
        const fallbackLength = workbook.readUInt8(dataStart + 6);
        const fallback = dataStart + 7 + fallbackLength <= dataEnd ? workbook.slice(dataStart + 7, dataStart + 7 + fallbackLength).toString('latin1') : '';
        const value = parsed.value || fallback;
        if (value) bValues.push(value);
      }
    }
    pos = dataEnd;
  }
  return bValues.join(' ');
}

function isSpreadsheetAttachment(filename = '', mimeType = '') {
  const lowerName = String(filename || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  return /\.(xls|xlsx|xlsm|xlsb|csv)$/i.test(lowerName) || /excel|spreadsheet|sheet|csv/.test(lowerMime);
}

function gdAttachmentType(filename = '', mimeType = '') {
  return isSpreadsheetAttachment(filename, mimeType) ? 'Spreadsheet B column' : 'Attachment';
}

function normalizeGdComparable(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function compareGdCrew(crew = [], attachmentText = '') {
  const normalizedAttachment = normalizeGdComparable(attachmentText);
  const compactAttachment = normalizedAttachment.replace(/\s+/g, '');
  const expectedPassports = crew
    .map((row) => ({ no: row.no, passport: String(row.passport || '').toUpperCase() }))
    .filter((row) => row.passport);
  const gdPassports = Array.from(new Set((normalizedAttachment.match(/\b[A-Z]{1,3}\d{5,9}\b/g) || []).map((item) => item.toUpperCase())));
  const missing = expectedPassports.filter((row) => !compactAttachment.includes(row.passport));
  return {
    complete: expectedPassports.length > 0 && missing.length === 0,
    matched: expectedPassports.length - missing.length,
    total: expectedPassports.length,
    missing,
    extraPassports: [],
    gdPassports
  };
}

function buildGdCheckDetailText(result) {
  const lines = [
    `GD Result: ${result.complete ? 'MATCHED' : 'NOT MATCHED'}`,
    `Crew Matched: ${result.matched || 0}/${result.total || 0}`,
    result.reason ? `Reason: ${result.reason}` : '',
    `Expected Subject: ${result.subject || ''}`,
    result.query ? `Gmail Query: ${result.query}` : '',
    result.authMode ? `Auth Mode: ${result.authMode}` : '',
    result.userId ? `Gmail User: ${result.userId}` : '',
    result.searchDate ? `Search Date: ${result.searchDate}` : '',
    result.sentAt ? `Latest Email Time: ${result.sentAt}` : '',
    result.attachmentName ? `Attachment: ${result.attachmentName}` : '',
    result.attachmentType ? `Attachment Type: ${result.attachmentType}` : '',
    Array.isArray(result.checkedAttachments) && result.checkedAttachments.length
      ? `Checked Attachments: ${result.checkedAttachments.map((item) => `${item.name || 'attachment'} [${item.type || 'Spreadsheet B column'}] ${item.matched || 0}/${item.total || 0} passports:${item.extractedPassports || 0}`).join(' | ')}`
      : ''
  ].filter(Boolean);
  if (Array.isArray(result.missing) && result.missing.length) {
    lines.push('Missing Passports:');
    result.missing.forEach((row) => {
      lines.push(`${row.no || ''}. ${row.passport || ''} (passport not matched)`);
    });
  }
  if (Array.isArray(result.extraPassports) && result.extraPassports.length) {
    lines.push(`Attachment Passports: ${result.extraPassports.slice(0, 20).join(', ')}`);
  }
  return lines.join('\n');
}

async function getGdCheckEmail(flightNo, subjectDate, crew = [], expectedSubject = '') {
  const normalizedFlightNo = String(flightNo || '').trim().toUpperCase();
  const normalizedSubjectDate = String(subjectDate || '').trim().toUpperCase();
  const subject = String(expectedSubject || `GD for ${normalizedFlightNo}/${normalizedSubjectDate}`).trim();
  const empty = (extra = {}) => ({
    found: false,
    complete: false,
    subject,
    detailText: '',
    reason: '',
    query: '',
    authMode: '',
    userId: '',
    searchDate: gmailSearchYmd(new Date()),
    attachmentName: '',
    sentAt: '',
    matched: 0,
    total: Array.isArray(crew) ? crew.length : 0,
    missing: [],
    extraPassports: [],
    attachmentType: '',
    checkedAttachments: [],
    ...extra
  });
  if (!normalizedFlightNo || !normalizedSubjectDate || !subject) {
    const result = empty({ reason: 'Missing flight number, flight date, or GD email subject.' });
    result.detailText = buildGdCheckDetailText(result);
    return result;
  }
  if (!Array.isArray(crew) || !crew.length) {
    const result = empty({ reason: 'No CWD crew/passport rows found in today log.' });
    result.detailText = buildGdCheckDetailText(result);
    return result;
  }

  let gmail = null;
  let userId = envFirst('GMAIL_USER', 'NEXT_DAY_INFO_GMAIL_USER');
  let authMode = envFirst('AUTH_MODE', 'NEXT_DAY_INFO_GMAIL_AUTH_MODE').toLowerCase();
  const searchDate = gmailSearchYmd(new Date());
  let q = '';
  try {
    ({ gmail, userId, authMode } = getNextDayInfoGmailClient());
    const exactSubject = subject.replace(/"/g, '');
    q = `subject:"${exactSubject}" newer_than:2d has:attachment`;
    const list = await gmail.users.messages.list({ userId, q, maxResults: 10, fields: 'messages(id,internalDate)' });
    const messages = (Array.isArray(list.data.messages) ? list.data.messages : [])
      .sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));
    if (!messages.length) {
      const result = empty({ reason: 'No Gmail message with the expected GD subject and attachment was found in the last 2 days.', query: q, authMode, userId, searchDate });
      result.detailText = buildGdCheckDetailText(result);
      return result;
    }

    const checkedAttachments = [];
    let bestResult = null;
    let latestSentAt = '';
    let messagesWithSpreadsheet = 0;
    for (const message of messages) {
      const full = await gmail.users.messages.get({
        userId,
        id: message.id,
        format: 'full',
        fields: 'id,internalDate,payload(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data))))'
      });
      const sentAtDate = Number(full.data.internalDate) ? new Date(Number(full.data.internalDate)) : null;
      const sentAt = sentAtDate ? sentAtDate.toISOString() : '';
      if (!latestSentAt && sentAt) latestSentAt = sentAt;
      const gdAttachmentParts = collectGmailParts(full.data.payload, (part) => (
        Boolean(part.body?.attachmentId || part.body?.data)
          && isSpreadsheetAttachment(part.filename || '', part.mimeType || '')
      ));
      if (!gdAttachmentParts.length) continue;
      messagesWithSpreadsheet += 1;
      for (const part of gdAttachmentParts) {
        let data = part.body?.data || '';
        if (part.body?.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({ userId, messageId: full.data.id || message.id, id: part.body.attachmentId });
          data = attachment.data.data || '';
        }
        const attachmentBuffer = Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const attachmentType = gdAttachmentType(part.filename || '', part.mimeType || '');
        const attachmentText = extractSpreadsheetText(attachmentBuffer);
        const comparison = compareGdCrew(crew, attachmentText);
        checkedAttachments.push({
          name: part.filename || 'GD spreadsheet attachment',
          type: attachmentType,
          matched: comparison.matched,
          total: comparison.total,
          complete: comparison.complete,
          extractedPassports: comparison.gdPassports.length,
          sentAt
        });
        const candidate = {
          found: true,
          complete: comparison.complete,
          subject,
          detailText: '',
          reason: comparison.complete ? '' : `${attachmentType} is missing one or more CWD passport numbers.`,
          query: q,
          authMode,
          userId,
          searchDate,
          attachmentName: part.filename || `${attachmentType} attachment`,
          attachmentType,
          sentAt,
          checkedAttachments,
          ...comparison
        };
        if (candidate.complete) {
          candidate.detailText = buildGdCheckDetailText(candidate);
          return candidate;
        }
        if (!bestResult || candidate.matched > bestResult.matched) bestResult = candidate;
      }
    }
    if (bestResult) {
      bestResult.checkedAttachments = checkedAttachments;
      bestResult.reason = checkedAttachments.length > 1
        ? 'No GD attachment matched every CWD passport number; showing the closest attachment.'
        : bestResult.reason;
      bestResult.detailText = buildGdCheckDetailText(bestResult);
      return bestResult;
    }
    const result = empty({ reason: messagesWithSpreadsheet ? 'GD spreadsheet attachments were found but could not be read.' : 'GD email thread was found, but no .xls/.xlsx/.xlsm/.xlsb/.csv attachment was found in the matched messages.', query: q, authMode, userId, searchDate, sentAt: latestSentAt });
    result.detailText = buildGdCheckDetailText(result);
    return result;
  } catch (err) {
    const result = empty({ reason: nextDayInfoGmailErrorReason(err, authMode, userId), query: q, authMode, userId, searchDate });
    result.detailText = buildGdCheckDetailText(result);
    return result;
  }
}

async function hasNextDayInfoEmail(flightNo, subjectDate, expectedSubject = '') {
  const result = await getNextDayInfoEmail(flightNo, subjectDate, expectedSubject);
  return Boolean(result.sent || result.found);
}

// ===============================
// Get Archive Log
// Example:
// 11MAY
// ===============================
async function getFlightLogByDate(date, yearSuffix) {

  try {

    const archiveRoot =
      process.env.ARCHIVE_FOLDER_ID;

    // ===========================
    // Folder Name
    // ===========================
    const resolvedYearSuffix =
      String(yearSuffix || new Date().getUTCFullYear().toString().slice(-2))
        .padStart(2, '0');

    const folderName =
      `MU586 ${date}${resolvedYearSuffix}`;

    // ===========================
    // Find Date Folder
    // ===========================
    const folderRes =
      await drive.files.list({

        q:
          `'${archiveRoot}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,

        fields:
          'files(id,name)',

        pageSize:
          1
      });

    const folder =
      folderRes.data.files[0];

    if (!folder) {

      console.log(
        'Archive folder not found:',
        folderName
      );

      return null;
    }

    console.log(
      'Using ARCHIVE:',
      folderName
    );

    return await downloadLogsInFolder(
      folder.id,
      `ARCHIVE ${folderName}`
    );

  } catch (err) {

    console.error(
      'Archive Error:',
      err
    );

    return null;
  }
}


async function getCbsScanSheetTitle() {
  if (!cbsScanSheetTitle) cbsScanSheetTitle = await resolveSheetTitleByGid(CBS_SCAN_SHEET_ID, CBS_SCAN_SHEET_GID);
  return cbsScanSheetTitle || 'Sheet1';
}

async function getCbsScanSheetRows(options = {}) {
  const ttlMs = 5 * 1000;
  if (!options.forceRefresh && Date.now() - cbsScanSheetCache.loadedAt < ttlMs && cbsScanSheetCache.rows.length) return cbsScanSheetCache.rows;
  const title = await getCbsScanSheetTitle();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:R`
  });
  const rows = res.data.values || [];
  cbsScanSheetCache = { loadedAt: Date.now(), rows };
  return rows;
}

async function ensureCbsScanSheetHeaders(rows) {
  const firstRow = rows?.[0] || [];
  const hasHeaders = CBS_SCAN_HEADERS.every((header, index) => String(firstRow[index] || '').trim() === header);
  const hasNbrdHeaders = ['NBRD BN', 'CKIN NBRD Detail'].every((header, index) => String(firstRow[index + 11] || '').trim() === header);
  const hasInfantHeaders = CBS_SCAN_INFANT_HEADERS.every((header, index) => String(firstRow[index + 13] || '').trim() === header);
  const title = await getCbsScanSheetTitle();
  let updated = false;
  if (!hasHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CBS_SCAN_SHEET_ID,
      range: `${escapeSheetTitle(title)}!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CBS_SCAN_HEADERS] }
    });
    updated = true;
  }
  if (!hasNbrdHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CBS_SCAN_SHEET_ID,
      range: `${escapeSheetTitle(title)}!L1:M1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['NBRD BN', 'CKIN NBRD Detail']] }
    });
    updated = true;
  }
  if (!hasInfantHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CBS_SCAN_SHEET_ID,
      range: `${escapeSheetTitle(title)}!N1:R1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CBS_SCAN_INFANT_HEADERS] }
    });
    updated = true;
  }
  if (updated) cbsScanSheetCache = { loadedAt: 0, rows: [] };
  return updated;
}

function normalizeCbsScanBn(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : '';
}

function formatCbsScanSheetBn(value) {
  const normalized = normalizeCbsScanBn(value);
  return normalized ? normalized.slice(-3) : '';
}

function normalizeCbsScanNbrdDetail(value = '') {
  return String(value || '').trim().replace(/^CKIN\/NBRD:\s*/i, '').trim();
}

function normalizeCbsScanNbrdEntry(value) {
  if (value && typeof value === 'object') {
    return {
      bn: normalizeCbsScanBn(value.bn),
      detail: normalizeCbsScanNbrdDetail(value.detail || value.message || value.info || '')
    };
  }
  return { bn: normalizeCbsScanBn(value), detail: '' };
}

async function writeCbsScanNbrdDetail(title, rowNumber, bn, detail = '') {
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    range: `${escapeSheetTitle(title)}!L${rowNumber}:M${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[formatCbsScanSheetBn(bn), detail]] }
  });
  cbsScanSheetCache = { loadedAt: 0, rows: [] };
}

async function appendCbsScanNbrdBn(title, bn, dataRows, detail = '') {
  const existingIndex = dataRows.findIndex((row) => normalizeCbsScanBn(row[11]) === bn);
  if (existingIndex !== -1) {
    const rowNumber = existingIndex + 2;
    if (detail && normalizeCbsScanNbrdDetail(dataRows[existingIndex][12]) !== detail) await writeCbsScanNbrdDetail(title, rowNumber, bn, detail);
    return false;
  }
  const nextOffset = dataRows.findIndex((row) => !normalizeCbsScanBn(row[11]));
  const rowNumber = nextOffset === -1 ? dataRows.length + 2 : nextOffset + 2;
  await writeCbsScanNbrdDetail(title, rowNumber, bn, detail);
  return true;
}

async function clearCbsScanNbrdRows(title) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    range: `${escapeSheetTitle(title)}!L2:M`
  });
  cbsScanSheetCache = { loadedAt: 0, rows: [] };
}

async function deleteCbsScanNbrdBn(rowNumber, bn = '') {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) throw new Error('Invalid NBRD row number.');
  const expectedBn = normalizeCbsScanBn(bn);
  const title = await getCbsScanSheetTitle();
  const rows = await getCbsScanSheetRows({ forceRefresh: true });
  await ensureCbsScanSheetHeaders(rows);
  const freshRows = await getCbsScanSheetRows({ forceRefresh: true });
  const row = freshRows[targetRow - 1] || [];
  const rowBn = normalizeCbsScanBn(row[11]);
  if (!rowBn) {
    const err = new Error('NBRD row not found.');
    err.code = 'NBRD_NOT_FOUND';
    throw err;
  }
  if (expectedBn && rowBn !== expectedBn) {
    const err = new Error('NBRD row does not match requested BN.');
    err.code = 'NBRD_MISMATCH';
    throw err;
  }
  await sheets.spreadsheets.values.clear({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    range: `${escapeSheetTitle(title)}!L${targetRow}:M${targetRow}`
  });
  cbsScanSheetCache = { loadedAt: 0, rows: [] };
  return { deleted: true, rowNumber: targetRow, bn: formatCbsScanSheetBn(rowBn) };
}

async function appendCbsScanNbrdBns(values = [], options = {}) {
  const entriesByBn = new Map();
  for (const value of (Array.isArray(values) ? values : [values])) {
    const entry = normalizeCbsScanNbrdEntry(value);
    if (entry.bn) entriesByBn.set(entry.bn, entry);
  }
  const entries = [...entriesByBn.values()];
  const title = await getCbsScanSheetTitle();
  const rows = await getCbsScanSheetRows({ forceRefresh: true });
  await ensureCbsScanSheetHeaders(rows);
  if (options.replace) await clearCbsScanNbrdRows(title);
  if (!entries.length) return { added: [], existing: [], cleared: Boolean(options.replace) };
  let dataRows = (await getCbsScanSheetRows({ forceRefresh: true })).slice(1);
  const added = [];
  const existing = [];
  for (const entry of entries) {
    const didAdd = await appendCbsScanNbrdBn(title, entry.bn, dataRows, entry.detail);
    (didAdd ? added : existing).push(entry.bn);
    dataRows = (await getCbsScanSheetRows({ forceRefresh: true })).slice(1);
  }
  return { added, existing, cleared: Boolean(options.replace) };
}

function isCbsScanEnteredCell(cell = {}) {
  const color = cell.userEnteredFormat?.backgroundColor || cell.effectiveFormat?.backgroundColor || {};
  const red = Number(color.red || 0);
  const green = Number(color.green || 0);
  const blue = Number(color.blue || 0);
  return green > red + 0.03 && green > blue + 0.03;
}

async function getCbsScanEnteredRowNumbers(title) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    ranges: [`${escapeSheetTitle(title)}!A2:C`],
    includeGridData: true,
    fields: 'sheets(data(rowData(values(userEnteredFormat(backgroundColor),effectiveFormat(backgroundColor)))))'
  });
  const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData || [];
  const entered = new Set();
  rowData.forEach((row, index) => {
    if ((row.values || []).some(isCbsScanEnteredCell)) entered.add(index + 2);
  });
  return entered;
}

async function getCbsScanRecords() {
  const rows = await getCbsScanSheetRows({ forceRefresh: true });
  await ensureCbsScanSheetHeaders(rows);
  const title = await getCbsScanSheetTitle();
  const freshRows = await getCbsScanSheetRows({ forceRefresh: true });
  const enteredRows = await getCbsScanEnteredRowNumbers(title);
  return freshRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    bn: formatCbsScanSheetBn(row[0]),
    seat: String(row[1] || '').trim(),
    flight: String(row[2] || '').trim(),
    scannedAt: String(row[4] || '').trim(),
    entered: enteredRows.has(index + 2),
    nbrdBn: formatCbsScanSheetBn(row[11]),
    nbrdDetail: normalizeCbsScanNbrdDetail(row[12]),
    infantBn: formatCbsScanSheetBn(row[13]),
    infantSeat: String(row[14] || '').trim(),
    infantFlight: String(row[15] || '').trim(),
    infantScannedAt: String(row[17] || '').trim(),
  })).filter((row) => row.bn || row.seat || row.flight || row.scannedAt || row.nbrdBn || row.nbrdDetail || row.infantBn || row.infantSeat || row.infantFlight || row.infantScannedAt);
}

function cbsScanEnteredRepeatCellRequest(rowNumber, entered = false) {
  const targetRow = Number(rowNumber);
  if (!Number.isInteger(targetRow) || targetRow < 2) throw new Error('Invalid scan row number.');
  const backgroundColor = entered ? { red: 0.91, green: 0.97, blue: 0.93 } : { red: 1, green: 1, blue: 1 };
  return {
    repeatCell: {
      range: {
        sheetId: CBS_SCAN_SHEET_GID,
        startRowIndex: targetRow - 1,
        endRowIndex: targetRow,
        startColumnIndex: 0,
        endColumnIndex: 3
      },
      cell: { userEnteredFormat: { backgroundColor } },
      fields: 'userEnteredFormat.backgroundColor'
    }
  };
}

async function setCbsScanRecordsEntered(rowNumbers = [], entered = false) {
  const uniqueRows = [...new Set((Array.isArray(rowNumbers) ? rowNumbers : [rowNumbers]).map(Number))]
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber >= 2);
  if (!uniqueRows.length) throw new Error('No valid scan row numbers.');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    requestBody: { requests: uniqueRows.map((rowNumber) => cbsScanEnteredRepeatCellRequest(rowNumber, entered)) }
  });
  cbsScanSheetCache = { loadedAt: 0, rows: [] };
  return { rowNumbers: uniqueRows, entered: Boolean(entered) };
}

async function setCbsScanRecordEntered(rowNumber, entered = false) {
  const result = await setCbsScanRecordsEntered([rowNumber], entered);
  return { rowNumber: result.rowNumbers[0], entered: result.entered };
}

function throwCbsScanNbrdMessage(bn, detail = '') {
  const message = detail ? `NBRD message: ${detail}` : 'NBRD message';
  const err = new Error(message);
  err.code = 'NBRD_MESSAGE';
  err.bn = formatCbsScanSheetBn(bn);
  err.detail = detail;
  throw err;
}

function queueCbsScanAppend(work) {
  const run = cbsScanAppendQueue.catch(() => {}).then(work);
  cbsScanAppendQueue = run.catch(() => {});
  return run;
}

async function appendCbsScanRecord(record = {}) {
  return queueCbsScanAppend(() => appendCbsScanRecordNow(record));
}

async function appendCbsScanRecordNow(record = {}) {
  const bn = normalizeCbsScanBn(record.bn);
  if (!bn) throw new Error('Invalid BN.');
  const seat = String(record.seat || '').trim().toUpperCase();
  const flight = String(record.flight || '').trim().toUpperCase();
  const rawScan = String(record.rawScan || record.raw || '').trim();
  const scannedAt = record.scannedAt || new Date().toISOString();
  const title = await getCbsScanSheetTitle();
  const rows = await getCbsScanSheetRows({ forceRefresh: true });
  const headersUpdated = await ensureCbsScanSheetHeaders(rows);
  const dataRows = (headersUpdated ? await getCbsScanSheetRows({ forceRefresh: true }) : rows).slice(1);
  const nbrdExisting = dataRows.find((row) => normalizeCbsScanBn(row[11]) === bn);
  if (nbrdExisting) throwCbsScanNbrdMessage(bn, String(nbrdExisting[12] || '').trim());
  const isInfant = record.isInfant === true || seat === 'INF';
  const bnColumnIndex = isInfant ? 13 : 0;
  const existing = dataRows.find((row) => normalizeCbsScanBn(row[bnColumnIndex]) === bn);
  if (existing) {
    const err = new Error(`Duplicate BN ${formatCbsScanSheetBn(bn)}.`);
    err.code = 'DUPLICATE_BN';
    throw err;
  }
  const scanColumnStart = isInfant ? 13 : 0;
  const scanRangeColumns = isInfant ? 'N:R' : 'A:E';
  const lastScanOffset = dataRows.reduce((lastIndex, row, index) => (
    row.slice(scanColumnStart, scanColumnStart + 5).some((cell) => String(cell || '').trim()) ? index : lastIndex
  ), -1);
  const rowNumber = lastScanOffset + 3;
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SCAN_SHEET_ID,
    range: `${escapeSheetTitle(title)}!${scanRangeColumns.replace(':', `${rowNumber}:`)}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[formatCbsScanSheetBn(bn), seat, flight, rawScan, scannedAt]] }
  });
  cbsScanSheetCache = { loadedAt: 0, rows: [] };
  return { bn: formatCbsScanSheetBn(bn), seat, flight, rowNumber, scannedAt, isInfant };
}

async function getTransit240SheetTitle() {
  if (!transit240SheetTitle) transit240SheetTitle = await resolveSheetTitleByGid(TRANSIT_240_SHEET_ID, TRANSIT_240_SHEET_GID);
  return transit240SheetTitle || 'Sheet1';
}

async function ensureTransit240Headers(title) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: TRANSIT_240_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A1:G1`
  }).catch(() => ({ data: { values: [] } }));
  const firstRow = res.data.values?.[0] || [];
  const hasHeaders = TRANSIT_240_HEADERS.every((header, index) => String(firstRow[index] || '').trim() === header);
  if (!hasHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: TRANSIT_240_SHEET_ID,
      range: `${escapeSheetTitle(title)}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [TRANSIT_240_HEADERS] }
    });
  }
}


async function hasTransit240RecordByBn(bn) {
  const normalizedBn = String(bn || '').trim();
  if (!normalizedBn) return false;
  const title = await getTransit240SheetTitle();
  await ensureTransit240Headers(title);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: TRANSIT_240_SHEET_ID,
    range: `${escapeSheetTitle(title)}!D2:D`
  }).catch(() => ({ data: { values: [] } }));
  return (res.data.values || []).some((row) => String(row?.[0] || '').trim() === normalizedBn);
}

async function appendTransit240Record(record = {}) {
  const title = await getTransit240SheetTitle();
  await ensureTransit240Headers(title);
  const submittedAt = record.submittedAt || new Date().toISOString();
  const itinerary = Array.isArray(record.itinerary) ? record.itinerary.join(' → ') : String(record.itinerary || '').trim();
  const values = [[
    submittedAt,
    String(record.passengerName || '').trim(),
    String(record.seatNumber || '').trim().toUpperCase(),
    String(record.bnNumber || '').trim(),
    String(record.nationalityCode || '').trim().toUpperCase(),
    String(record.passportExpiry || '').trim(),
    itinerary
  ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: TRANSIT_240_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return { submittedAt, itinerary };
}

async function getCbsSheetTitle() {
  if (!cbsSheetTitle) cbsSheetTitle = await resolveSheetTitleByGid(CBS_SHEET_ID, CBS_SHEET_GID);
  return cbsSheetTitle || 'Sheet1';
}

async function getCbsSheetRows(options = {}) {
  const ttlMs = 15 * 1000;
  if (!options.forceRefresh && Date.now() - cbsSheetCache.loadedAt < ttlMs && cbsSheetCache.rows.length) return cbsSheetCache.rows;
  const title = await getCbsSheetTitle();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:AG`
  });
  const rows = res.data.values || [];
  cbsSheetCache = { loadedAt: Date.now(), rows };
  return rows;
}

async function ensureCbsSheetHeaders(rows) {
  const firstRow = rows?.[0] || [];
  const hasHeaders = CBS_HEADERS.every((header, index) => String(firstRow[index] || '').trim() === header);
  if (hasHeaders) return;
  const title = await getCbsSheetTitle();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A1:AG1`,
    valueInputOption: 'RAW',
    requestBody: { values: [CBS_HEADERS] }
  });
  cbsSheetCache = { loadedAt: 0, rows: [] };
}

function extractCbsBagTagFromUpdateNote(updateNote = '') {
  return String(updateNote || '').match(/\bBag tag:\s*([^|]+)/i)?.[1]?.trim() || '';
}

function cbsBagTagMatchKeys(value = '') {
  const keys = new Set();
  String(value || '')
    .toUpperCase()
    .split(/\s*\/\s*|[,;\n]+/)
    .map((item) => item.replace(/\s+/g, '').trim())
    .filter(Boolean)
    .forEach((tag) => {
      keys.add(tag);
      const carrierMatch = tag.match(/^([A-Z]{2})(\d{6,})$/);
      const numeric = carrierMatch ? carrierMatch[2] : (tag.match(/^(\d{6,})$/)?.[1] || '');
      if (numeric) {
        keys.add(numeric);
        keys.add(numeric.slice(-6));
        keys.add(`MU${numeric.slice(-6)}`);
      }
    });
  return keys;
}

function cbsBagTagsMatch(a = '', b = '') {
  const aKeys = cbsBagTagMatchKeys(a);
  const bKeys = cbsBagTagMatchKeys(b);
  if (!aKeys.size || !bKeys.size) return false;
  return [...aKeys].some((key) => bKeys.has(key));
}

function isCbsCaseUpdatedAfterMissingLink(row = {}) {
  const status = String(row.status || '').trim().toLowerCase();
  const note = String(row.updateNote || '').trim();
  if (status && status !== 'open') return true;
  return Boolean(note && !/^Created from Missing Bag Report row\b/i.test(note));
}

function cbsRecordFromSheet(values, rowNumber) {
  const row = {};
  CBS_HEADERS.forEach((header, index) => {
    const key = header.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()).replace(/[^a-z0-9]/g, '');
    row[key] = values[index] || '';
  });
  row.caseNumber = row.caseNumber || values.find((value) => /^LAX\s*MU\d{6,}$/i.test(String(value || '').trim())) || '';
  row.caseType = row.caseType || values.find((value) => /^(AHL|DPR)$/i.test(String(value || '').trim())) || '';
  row.bagTag = row.bagTag || values[9] || extractCbsBagTagFromUpdateNote(row.updateNote) || values.find((value) => /^[A-Z]{2}\d{6,}(\s*\/\s*[A-Z]{2}\d{6,})*$/i.test(String(value || '').trim())) || '';
  row.submittedAt = row.submittedAt || row.submitDate || values[27] || '';
  row.updateHistory = row.updateHistory || values[32] || '';
  row.rowNumber = rowNumber;
  return row;
}

function cbsValuesFromRecord(record) {
  return [
    record.caseNumber,
    record.caseType,
    record.status,
    record.passengerName,
    record.email,
    record.phone,
    record.ticketNumber,
    record.classOfTravel,
    record.flightRoute,
    record.bagTag,
    record.permanentAddress,
    record.temporaryAddress,
    record.temporaryAddressValidUntil,
    record.addressAvailable,
    record.ahlBagDescription,
    record.ahlBagBrandTag,
    record.ahlBagType,
    record.ahlFeatures,
    record.ahlOtherFeatures,
    record.ahlContents,
    record.dprDamageLevel,
    record.dprBagInfo,
    record.dprBagType,
    record.dprInnerDamage,
    record.contentsDetails,
    record.issueDate,
    record.passengerSignature,
    record.submittedAt,
    record.updatedAt,
    record.updateNote,
    record.destinationOnBags,
    record.departureOrigin,
    record.updateHistory || ''
  ];
}

async function appendCbsCase(record) {
  const title = await getCbsSheetTitle();
  const rows = await getCbsSheetRows({ forceRefresh: true });
  await ensureCbsSheetHeaders(rows);
  await sheets.spreadsheets.values.append({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:AG`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [cbsValuesFromRecord(record)] }
  });
  cbsSheetCache = { loadedAt: 0, rows: [] };
  return record;
}

function isCbsHeaderRow(values = []) {
  const normalized = values.map((value) => String(value || '').trim().toLowerCase());
  return normalized.includes('case number') || normalized.includes('case id') || normalized.includes('passenger name');
}

function normalizeCbsHistoryCaseNumber(caseNumber) {
  return String(caseNumber || '').trim().toUpperCase();
}

function sanitizeCbsUpdateEvent(event = {}, fallback = {}) {
  const key = sanitizeSheetText(event.key || fallback.key, 40).toLowerCase() || 'update';
  const fields = Array.isArray(event.fields) ? event.fields : [];
  return {
    key,
    title: sanitizeSheetText(event.title || fallback.title || 'Update', 120),
    status: sanitizeSheetText(fallback.status || event.status, 80),
    at: sanitizeSheetText(fallback.at || event.at || new Date().toISOString(), 40),
    fields: fields.map((field) => Array.isArray(field) ? [sanitizeSheetText(field[0], 120), sanitizeSheetText(field[1], 500)] : null).filter((field) => field && field[0] && field[1]),
    note: sanitizeSheetText(fallback.note || event.note, 1000)
  };
}

function parseCbsUpdateHistory(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((event) => sanitizeCbsUpdateEvent(event)).filter((event) => event.at || event.note || event.fields.length) : [];
  } catch (_) {
    return [];
  }
}

function stringifyCbsUpdateHistory(events = []) {
  return sanitizeSheetText(JSON.stringify((Array.isArray(events) ? events : []).slice(-100)), 20000);
}

function cbsEventsFromUpdateNote(row = {}) {
  const note = String(row.updateNote || '').trim();
  if (!note || /^case created$/i.test(note)) return [];
  const timestampedParts = note.match(/\[[^\]]+\]\s*[^\[]+/g);
  const parts = (timestampedParts || note.split(/\s*\|\|\s*/)).map((item) => item.trim()).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^\[([^\]]+)\]\s*(.*)$/);
    const at = match ? match[1] : row.updatedAt;
    const body = match ? match[2] : part;
    const pieces = body.split('|').map((item) => item.trim()).filter(Boolean);
    const type = pieces.shift() || 'Update';
    const key = /rush/i.test(type) ? 'rush' : (/location/i.test(type) ? 'location' : (/ship/i.test(type) ? 'shipping' : (/world\s*tracer|worldtracer/i.test(type) ? 'worldtracer' : 'update')));
    const fields = pieces.map((piece) => {
      const split = piece.split(/:\s*/);
      return split.length > 1 ? [split.shift(), split.join(': ')] : ['Detail', piece];
    });
    return sanitizeCbsUpdateEvent({ key, title: key === 'update' ? type : `Update ${type.replace(/_/g, ' ')}`, fields }, { at, status: row.status, note: body });
  });
}

function attachCbsUpdateHistory(rows = []) {
  return rows.map((row) => {
    const storedEvents = parseCbsUpdateHistory(row.updateHistory);
    const legacyEvents = storedEvents.length ? [] : cbsEventsFromUpdateNote(row);
    const updateEvents = [...legacyEvents, ...storedEvents];
    const latestEvent = updateEvents[updateEvents.length - 1];
    return {
      ...row,
      status: latestEvent?.status || row.status,
      updatedAt: latestEvent?.at || row.updatedAt,
      updateEvents
    };
  });
}

async function getCbsCases() {
  const rows = await getCbsSheetRows({ forceRefresh: true });
  const cases = rows
    .map((values, index) => ({ values: values || [], rowNumber: index + 1 }))
    .filter(({ values }) => !isCbsHeaderRow(values))
    .map(({ values, rowNumber }) => cbsRecordFromSheet(values, rowNumber))
    .filter((row) => row.caseNumber || row.caseType || row.passengerName || row.email || row.phone || row.bagTag || row.submittedAt);
  return attachCbsUpdateHistory(cases);
}

async function updateCbsCase(caseNumber, update = {}) {
  const rows = await getCbsSheetRows({ forceRefresh: true });
  await ensureCbsSheetHeaders(rows);
  const normalizedCaseNumber = String(caseNumber || '').trim().toUpperCase();
  const rowIndex = rows.findIndex((row, index) => index > 0 && String(row?.[0] || '').trim().toUpperCase() === normalizedCaseNumber);
  if (rowIndex < 0) return { notFound: true };
  const current = cbsRecordFromSheet(rows[rowIndex] || [], rowIndex + 1);
  const now = new Date().toISOString();
  const incomingNote = sanitizeSheetText(update.updateNote, 1000);
  const next = {
    ...current,
    status: sanitizeSheetText(update.status, 80) || current.status || 'Open',
    updatedAt: now
  };
  const historyEvent = sanitizeCbsUpdateEvent(update.updateEvent, {
    status: next.status,
    at: now,
    note: incomingNote,
    title: next.status ? `Update ${next.status}` : 'Update'
  });
  const currentEvents = parseCbsUpdateHistory(current.updateHistory);
  const updateEvents = incomingNote ? currentEvents.concat(historyEvent).slice(-100) : currentEvents;
  next.updateHistory = stringifyCbsUpdateHistory(updateEvents);
  const title = await getCbsSheetTitle();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A${rowIndex + 1}:AG${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [cbsValuesFromRecord(next)] }
  });
  cbsSheetCache = { loadedAt: 0, rows: [] };
  return { updated: true, record: { ...next, updateEvents } };
}

async function getCbsMissingBagSheetTitle() {
  if (!cbsMissingBagSheetTitle) cbsMissingBagSheetTitle = await resolveSheetTitleByGid(CBS_SHEET_ID, CBS_MISSING_BAG_SHEET_GID);
  return cbsMissingBagSheetTitle || 'Missing Bag Report';
}

async function getCbsMissingBagSheetRows(options = {}) {
  const ttlMs = Number(options.ttlMs || 30000);
  if (!options.forceRefresh && Date.now() - cbsMissingBagSheetCache.loadedAt < ttlMs && cbsMissingBagSheetCache.rows.length) return cbsMissingBagSheetCache.rows;
  const title = await getCbsMissingBagSheetTitle();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:J`
  });
  const rows = res.data.values || [];
  cbsMissingBagSheetCache = { loadedAt: Date.now(), rows };
  return rows;
}

async function ensureCbsMissingBagHeaders(rows) {
  const firstRow = rows?.[0] || [];
  const hasHeaders = CBS_MISSING_BAG_HEADERS.every((header, index) => String(firstRow[index] || '').trim() === header);
  if (hasHeaders) return;
  const title = await getCbsMissingBagSheetTitle();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A1:J1`,
    valueInputOption: 'RAW',
    requestBody: { values: [CBS_MISSING_BAG_HEADERS] }
  });
  cbsMissingBagSheetCache = { loadedAt: 0, rows: [] };
}

function cbsMissingBagRecordFromSheet(values = [], rowNumber = 0) {
  return {
    rowNumber,
    bagTag: String(values[0] || '').trim(),
    passengerName: String(values[1] || '').trim(),
    destination: String(values[2] || '').trim().toUpperCase(),
    airline: String(values[3] || '').trim().toUpperCase(),
    sourceEmailDate: String(values[4] || '').trim(),
    sourceAttachment: String(values[5] || '').trim(),
    recordedAt: String(values[6] || '').trim(),
    caseNumber: String(values[7] || '').trim(),
    caseCreatedAt: String(values[8] || '').trim(),
    acknowledgedAt: String(values[9] || '').trim()
  };
}

function cbsMissingBagValues(record = {}) {
  return [
    sanitizeSheetText(record.bagTag, 80),
    sanitizeSheetText(record.passengerName, 160),
    sanitizeSheetText(record.destination, 40),
    sanitizeSheetText(record.airline, 40),
    sanitizeSheetText(record.sourceEmailDate, 80),
    sanitizeSheetText(record.sourceAttachment, 160),
    sanitizeSheetText(record.recordedAt, 80),
    sanitizeSheetText(record.caseNumber, 80),
    sanitizeSheetText(record.caseCreatedAt, 80),
    sanitizeSheetText(record.acknowledgedAt, 80)
  ];
}

function columnIndexFromCellRef(ref = '') {
  const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseXlsxRows(buffer) {
  const entries = extractZipEntries(buffer);
  const sharedXml = entries['xl/sharedStrings.xml'] || '';
  const sharedStrings = [];
  sharedXml.replace(/<si\b[\s\S]*?<\/si>/g, (si) => {
    const text = Array.from(si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((match) => xmlDecode(match[1])).join('');
    sharedStrings.push(text);
    return si;
  });
  const sheetName = Object.keys(entries).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) || 'xl/worksheets/sheet1.xml';
  const sheetXml = entries[sheetName] || '';
  const rows = [];
  sheetXml.replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, (rowMatch, rowXml) => {
    const row = [];
    rowXml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (cellMatch, attrs, cellXml) => {
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/i) || [])[1] || '';
      const col = columnIndexFromCellRef(ref);
      if (col < 0) return cellMatch;
      const type = (attrs.match(/\bt="([^"]+)"/i) || [])[1] || '';
      let value = '';
      const inline = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/i);
      const raw = (cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/i) || [])[1] || '';
      if (type === 's') value = sharedStrings[Number(raw)] || '';
      else if (type === 'inlineStr') value = inline ? xmlDecode(inline[1]) : '';
      else value = xmlDecode(raw);
      row[col] = String(value || '').trim();
      return cellMatch;
    });
    if (row.some(Boolean)) rows.push(row);
    return rowMatch;
  });
  return rows;
}

function parseCbsMissingBagRowsFromXlsx(buffer, meta = {}) {
  return parseXlsxRows(buffer)
    .map((row) => ({
      bagTag: String(row[0] || '').trim(),
      passengerName: String(row[1] || '').trim(),
      destination: String(row[2] || '').trim().toUpperCase(),
      airline: String(row[3] || '').trim().toUpperCase(),
      sourceEmailDate: meta.sourceEmailDate || '',
      sourceAttachment: meta.sourceAttachment || '',
      recordedAt: new Date().toISOString(),
      caseNumber: '',
      caseCreatedAt: '',
      acknowledgedAt: ''
    }))
    .filter((row) => row.bagTag && /MU/i.test(row.airline));
}

async function appendCbsMissingBagRows(records = []) {
  const rows = await getCbsMissingBagSheetRows({ forceRefresh: true });
  await ensureCbsMissingBagHeaders(rows);
  const existingTags = new Set(rows.slice(1).map((row) => String(row?.[0] || '').trim().toUpperCase()).filter(Boolean));
  const newRows = records.filter((record) => {
    const tag = String(record.bagTag || '').trim().toUpperCase();
    if (!tag || existingTags.has(tag)) return false;
    existingTags.add(tag);
    return true;
  });
  if (!newRows.length) return { appended: 0 };
  const title = await getCbsMissingBagSheetTitle();
  await sheets.spreadsheets.values.append({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: newRows.map(cbsMissingBagValues) }
  });
  cbsMissingBagSheetCache = { loadedAt: 0, rows: [] };
  return { appended: newRows.length };
}

async function syncCbsMissingBagReportsFromGmail() {
  let gmail = null;
  let userId = '';
  let authMode = '';
  const checkedAttachments = [];
  let appended = 0;
  let q = '';
  try {
    ({ gmail, userId, authMode } = getNextDayInfoGmailClient());
    q = 'from:dispatch@laxtec.com subject:"Early Bag Storage (EBS) Missed Bag Report" newer_than:7d has:attachment';
    const list = await gmail.users.messages.list({ userId, q, maxResults: 10, fields: 'messages(id,internalDate)' });
    const messages = (Array.isArray(list.data.messages) ? list.data.messages : [])
      .sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));
    for (const message of messages) {
      const full = await gmail.users.messages.get({
        userId,
        id: message.id,
        format: 'full',
        fields: 'id,internalDate,payload(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data))))'
      });
      const sentAtDate = Number(full.data.internalDate || message.internalDate) ? new Date(Number(full.data.internalDate || message.internalDate)) : null;
      const sentAt = sentAtDate ? sentAtDate.toISOString() : '';
      const parts = collectGmailParts(full.data.payload, (part) => (
        Boolean(part.body?.attachmentId || part.body?.data)
        && String(part.filename || '').toLowerCase().endsWith('.xlsx')
      ));
      for (const part of parts) {
        let data = part.body?.data || '';
        if (part.body?.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({ userId, messageId: full.data.id || message.id, id: part.body.attachmentId });
          data = attachment.data.data || '';
        }
        const buffer = Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const parsedRows = parseCbsMissingBagRowsFromXlsx(buffer, { sourceEmailDate: sentAt, sourceAttachment: part.filename || 'Missed Bags Report.xlsx' });
        const result = await appendCbsMissingBagRows(parsedRows);
        appended += result.appended || 0;
        checkedAttachments.push({ filename: part.filename || '', rows: parsedRows.length, appended: result.appended || 0 });
      }
    }
    return { synced: true, appended, checkedAttachments, query: q, authMode, userId };
  } catch (err) {
    console.error('CBS missing bag Gmail sync error:', err);
    return { synced: false, appended, checkedAttachments, query: q, authMode, userId, error: err?.message || 'Missing bag sync failed' };
  }
}

async function getCbsMissingBagReports(options = {}) {
  let sync = null;
  if (options.sync) sync = await syncCbsMissingBagReportsFromGmail();
  const rows = await getCbsMissingBagSheetRows({ forceRefresh: true });
  await ensureCbsMissingBagHeaders(rows);
  const cbsCases = await getCbsCases();
  const findLinkedCase = (missingRow) => {
    const explicitCaseNumber = String(missingRow.caseNumber || '').trim().toUpperCase();
    if (explicitCaseNumber) {
      const explicit = cbsCases.find((row) => String(row.caseNumber || '').trim().toUpperCase() === explicitCaseNumber);
      if (explicit) return explicit;
    }
    return cbsCases.find((row) => cbsBagTagsMatch(row.bagTag, missingRow.bagTag)) || null;
  };
  const records = rows
    .map((values, index) => ({ values: values || [], rowNumber: index + 1 }))
    .filter(({ rowNumber }) => rowNumber > 1)
    .map(({ values, rowNumber }) => cbsMissingBagRecordFromSheet(values, rowNumber))
    .filter((row) => row.bagTag || row.passengerName || row.destination || row.airline || row.caseNumber)
    .map((row) => {
      const linkedCase = findLinkedCase(row);
      return {
        ...row,
        linkedCaseNumber: linkedCase?.caseNumber || row.caseNumber || '',
        linkedCaseBagTag: linkedCase?.bagTag || '',
        linkedCaseStatus: linkedCase?.status || '',
        linkedCaseUpdated: Boolean(linkedCase && isCbsCaseUpdatedAfterMissingLink(linkedCase))
      };
    });
  return { rows: records, sync };
}

async function markCbsMissingBagCase(rowNumber, caseNumber) {
  const numericRow = Number(rowNumber);
  if (!Number.isInteger(numericRow) || numericRow < 2) return { notFound: true };
  const rows = await getCbsMissingBagSheetRows({ forceRefresh: true });
  await ensureCbsMissingBagHeaders(rows);
  const current = cbsMissingBagRecordFromSheet(rows[numericRow - 1] || [], numericRow);
  if (!current.bagTag) return { notFound: true };
  const next = { ...current, caseNumber, caseCreatedAt: new Date().toISOString() };
  const title = await getCbsMissingBagSheetTitle();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A${numericRow}:J${numericRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [cbsMissingBagValues(next)] }
  });
  cbsMissingBagSheetCache = { loadedAt: 0, rows: [] };
  return { updated: true, record: next };
}

async function acknowledgeCbsMissingBag(rowNumber) {
  const numericRow = Number(rowNumber);
  if (!Number.isInteger(numericRow) || numericRow < 2) return { notFound: true };
  const rows = await getCbsMissingBagSheetRows({ forceRefresh: true });
  await ensureCbsMissingBagHeaders(rows);
  const current = cbsMissingBagRecordFromSheet(rows[numericRow - 1] || [], numericRow);
  if (!current.bagTag) return { notFound: true };
  const next = { ...current, acknowledgedAt: new Date().toISOString() };
  const title = await getCbsMissingBagSheetTitle();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CBS_SHEET_ID,
    range: `${escapeSheetTitle(title)}!A${numericRow}:J${numericRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [cbsMissingBagValues(next)] }
  });
  cbsMissingBagSheetCache = { loadedAt: 0, rows: [] };
  return { updated: true, record: next };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeEmailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ');
}

function cbsBase64Lines(value) {
  return String(value || '').match(/.{1,76}/g)?.join('\r\n') || '';
}

function cbsAttachmentPart({ filename, mimeType, contentBase64 }) {
  return [
    `Content-Type: ${encodeEmailHeader(mimeType || 'application/octet-stream')}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encodeEmailHeader(filename || 'attachment')}"`,
    '',
    cbsBase64Lines(contentBase64)
  ];
}

function buildRawCbsEmail({ to, cc = [], subject, html, pdfBuffer, filename, attachments = [] }) {
  const boundary = `cbs_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [];
  const headers = [
    `To: ${encodeEmailHeader(to)}`,
    ...(ccList.length ? [`Cc: ${ccList.map(encodeEmailHeader).join(', ')}`] : []),
    `Subject: ${encodeEmailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    String(html || '').replace(/=/g, '=3D'),
    `--${boundary}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encodeEmailHeader(filename)}"`,
    '',
    cbsBase64Lines(pdfBuffer.toString('base64'))
  ];
  attachments.forEach((attachment) => {
    body.push(`--${boundary}`, ...cbsAttachmentPart(attachment));
  });
  body.push(`--${boundary}--`);
  return `${headers.join('\r\n')}\r\n\r\n${body.join('\r\n')}`;
}


function buildRawPlainEmail({ to, cc = [], subject, text }) {
  const toList = (Array.isArray(to) ? to : [to]).map((item) => String(item || '').trim()).filter(Boolean);
  const ccList = (Array.isArray(cc) ? cc : [cc]).map((item) => String(item || '').trim()).filter(Boolean);
  return [
    `To: ${toList.map(encodeEmailHeader).join(', ')}`,
    ...(ccList.length ? [`Cc: ${ccList.map(encodeEmailHeader).join(', ')}`] : []),
    `Subject: ${encodeEmailHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    cbsBase64Lines(Buffer.from(String(text || ''), 'utf8').toString('base64'))
  ].join('\r\n');
}

async function sendNextDayInfoEmail({ to = 'laxhmmu@gmail.com', cc = [], subject, text }) {
  const { gmail, userId, authMode } = getNextDayInfoGmailClient();
  const raw = buildRawPlainEmail({ to, cc, subject, text });
  const sent = await gmail.users.messages.send({
    userId,
    requestBody: { raw: base64UrlEncode(raw) }
  });
  return { to: Array.isArray(to) ? to : [to], cc: Array.isArray(cc) ? cc : [cc].filter(Boolean), id: sent.data.id || '', userId, authMode };
}

async function sendCbsCaseEmail({ passengerEmail, subject, html, pdfBuffer, filename, attachments = [] }) {
  const { gmail, userId } = getNextDayInfoGmailClient();
  const to = String(passengerEmail || '').trim();
  const cc = Array.from(new Set(CBS_NOTIFICATION_EMAILS.filter((email) => email && email.toLowerCase() !== to.toLowerCase())));
  const raw = buildRawCbsEmail({ to, cc, subject, html, pdfBuffer, filename, attachments });
  const sent = await gmail.users.messages.send({
    userId,
    requestBody: { raw: base64UrlEncode(raw) }
  });
  return [{ to, cc, id: sent.data.id || '' }];
}

// ===============================
// Exports
// ===============================
module.exports = {

  getLatestFlightLog,

  getFlightLogByDate,
  get240InfoByBnAndFlightDate,
  getSyBagInfoByDate,
  getSalesReportMeta,
  downloadSalesReportByFlight,
  getSalesDetailsReportRows,
  syncSalesDetailsFromSourceSheet,
  hasNextDayInfoEmail,
  getNextDayInfoEmail,
  sendNextDayInfoEmail,
  getGdCheckEmail,
  getStoredReportRows,
  getVipReportRows,
  getPsmMsgReportRows,
  getInadReportRows,
  getWheelchairReportRows,
  appendStoredReportRows,
  appendVipReportRows,
  appendPsmMsgReportRows,
  pruneStoredReportRows,
  findTestBaggageByTag,
  getTestBaggageReportRows,
  appendTestBaggageRecord,
  updateTestBaggageRecord,
  updateFscExchangeRate,
  extractFscExchangeRate,
  updateSyBookingCounts,
  normalizeSyBookingCounts,
  appendCbsCase,
  getCbsCases,
  updateCbsCase,
  getCbsMissingBagReports,
  markCbsMissingBagCase,
  acknowledgeCbsMissingBag,
  sendCbsCaseEmail,
  hasTransit240RecordByBn,
  appendTransit240Record,
  appendCbsScanRecord,
  appendCbsScanNbrdBns,
  deleteCbsScanNbrdBn,
  getCbsScanRecords,
  setCbsScanRecordEntered,
  setCbsScanRecordsEntered,
  readNotesDriveStore,
  writeNotesDriveStore
};
