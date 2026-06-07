const { google } = require('googleapis');
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
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.readonly'
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

const ENABLE_240_SHEET =
  String(process.env.ENABLE_240_SHEET || 'true').toLowerCase() !== 'false';

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
const LOG_NAMES = [
  'Flight Control.log',
  'Lake.log',
  'Ticketing.log'
];
const SALES_REPORT_FOLDER_ID = '1-RLbv_BU9rnsaaPy8UUkbN6FkhA5YqGf';

const REPORT_SHEET_ID = '1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ';
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
  }
};
const reportSheetTitles = {};
let reportSheetAccessBlocked = false;

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
    status: sanitizeSheetText(record.status, 80),
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
        status: sanitizeSheetText(record.status, 80),
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
  if (normalized === 'wch') return 'wheelchair';
  return normalized;
}

function getReportSheetConfig(type) {
  return REPORT_SHEETS[normalizeReportSheetType(type)] || null;
}

function buildStoredReportKey(type, row) {
  const normalizedType = String(type || '').toLowerCase();
  if (row?.key) return String(row.key);
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
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;

  match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  }

  match = raw.toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2}|\d{4})?$/);
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

  const logs = [];

  for (const logName of LOG_NAMES) {

    const res =
      await drive.files.list({

        q:
          `'${folderId}' in parents and name = '${logName}' and trashed = false`,

        fields:
          'files(id,name,modifiedTime)',

        orderBy:
          'modifiedTime desc',

        pageSize:
          1
      });

    const file =
      res.data.files[0];

    if (!file) {

      console.log(
        `${label} ${logName} not found`
      );

      continue;
    }

    console.log(
      `Using ${label} ${logName}:`,
      file.modifiedTime || ''
    );

    const content =
      await downloadLog(file.id);

    logs.push(content);
  }

  if (!logs.length) {
    return null;
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

function extractSpreadsheetText(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const views = [
    source.toString('latin1'),
    source.toString('utf8'),
    source.toString('utf16le')
  ];
  return views
    .join(' ')
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGdComparable(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function compareGdCrew(crew = [], spreadsheetText = '') {
  const normalizedSheet = normalizeGdComparable(spreadsheetText);
  const compactSheet = normalizedSheet.replace(/\s+/g, '');
  const gdPassports = Array.from(new Set((normalizedSheet.match(/\b[A-Z]{1,3}\d{5,9}\b/g) || []).map((item) => item.toUpperCase())));
  const missing = [];
  crew.forEach((row) => {
    const passport = String(row.passport || '').toUpperCase();
    const passportFound = passport ? compactSheet.includes(passport) : false;
    if (!passportFound) {
      missing.push({ ...row, passportFound });
    }
  });
  return {
    complete: crew.length > 0 && missing.length === 0,
    matched: crew.length - missing.length,
    total: crew.length,
    missing,
    extraPassports: [],
    gdPassports
  };
}

function buildGdCheckDetailText(result) {
  const lines = [
    `Expected Subject: ${result.subject || ''}`,
    result.query ? `Gmail Query: ${result.query}` : '',
    result.authMode ? `Auth Mode: ${result.authMode}` : '',
    result.userId ? `Gmail User: ${result.userId}` : '',
    result.searchDate ? `Search Date: ${result.searchDate}` : '',
    result.attachmentName ? `Attachment: ${result.attachmentName}` : '',
    `Crew Matched: ${result.matched || 0}/${result.total || 0}`
  ].filter(Boolean);
  if (result.reason) lines.unshift(`Reason: ${result.reason}`);
  if (Array.isArray(result.missing) && result.missing.length) {
    lines.push('Missing Passports:');
    result.missing.slice(0, 20).forEach((row) => {
      const issues = row.passportFound ? '' : 'passport';
      lines.push(`${row.no || ''}. ${row.name || ''} ${row.passport || ''} (${issues || 'not matched'})`);
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
    matched: 0,
    total: Array.isArray(crew) ? crew.length : 0,
    missing: [],
    extraPassports: [],
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
    const messages = Array.isArray(list.data.messages) ? list.data.messages : [];
    if (!messages.length) {
      const result = empty({ reason: 'No Gmail message with the expected GD subject and spreadsheet attachment was found in the last 2 days.', query: q, authMode, userId, searchDate });
      result.detailText = buildGdCheckDetailText(result);
      return result;
    }

    for (const message of messages) {
      const full = await gmail.users.messages.get({
        userId,
        id: message.id,
        format: 'full',
        fields: 'id,internalDate,payload(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data))))'
      });
      const spreadsheetParts = collectGmailParts(full.data.payload, (part) => {
        const filename = String(part.filename || '').toLowerCase();
        const mimeType = String(part.mimeType || '').toLowerCase();
        return Boolean(part.body?.attachmentId || part.body?.data)
          && (filename.endsWith('.xls') || filename.endsWith('.xlsx') || /excel|spreadsheet|sheet/.test(mimeType));
      });
      for (const part of spreadsheetParts) {
        let data = part.body?.data || '';
        if (part.body?.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({ userId, messageId: full.data.id || message.id, id: part.body.attachmentId });
          data = attachment.data.data || '';
        }
        const spreadsheetText = extractSpreadsheetText(Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
        const comparison = compareGdCrew(crew, spreadsheetText);
        const sentAtDate = Number(full.data.internalDate) ? new Date(Number(full.data.internalDate)) : null;
        const result = {
          found: true,
          complete: comparison.complete,
          subject,
          detailText: '',
          reason: comparison.complete ? '' : 'GD spreadsheet is missing one or more CWD passport numbers.',
          query: q,
          authMode,
          userId,
          searchDate,
          attachmentName: part.filename || 'GD spreadsheet attachment',
          sentAt: sentAtDate ? sentAtDate.toISOString() : '',
          ...comparison
        };
        result.detailText = buildGdCheckDetailText(result);
        return result;
      }
    }
    const result = empty({ reason: 'GD email was found, but no .xls/.xlsx spreadsheet attachment was found.', query: q, authMode, userId, searchDate });
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


function collectGmailParts(payload, predicate, collected = []) {
  if (!payload) return collected;
  if (predicate(payload)) collected.push(payload);
  (payload.parts || []).forEach((part) => collectGmailParts(part, predicate, collected));
  return collected;
}

function decodePdfString(value = '') {
  return String(value || '')
    .replace(/\\([nrtbf()\\])/g, (match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\(\d{1,3})/g, (match, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPdfStrings(text = '') {
  const out = [];
  const literalRe = /\((?:\\.|[^\\()])*\)/g;
  let match;
  while ((match = literalRe.exec(text))) {
    const decoded = decodePdfString(match[0].slice(1, -1));
    if (decoded) out.push(decoded);
  }
  const hexRe = /<([0-9A-Fa-f\s]{4,})>/g;
  while ((match = hexRe.exec(text))) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length % 2) continue;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    const decoded = Buffer.from(bytes).toString('latin1').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
    if (/[A-Za-z0-9]/.test(decoded)) out.push(decoded);
  }
  return out.join(' ');
}

function extractPdfText(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer || '');
  const chunks = [raw];
  const streamRe = /<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match;
  while ((match = streamRe.exec(raw))) {
    const dict = match[1] || '';
    const streamBuffer = Buffer.from(match[2] || '', 'latin1');
    if (/FlateDecode/i.test(dict)) {
      try {
        chunks.push(zlib.inflateSync(streamBuffer).toString('latin1'));
      } catch {
        chunks.push(streamBuffer.toString('latin1'));
      }
    } else {
      chunks.push(streamBuffer.toString('latin1'));
    }
  }
  return chunks.map(extractPdfStrings).join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeGdComparable(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function compareGdCrew(crew = [], pdfText = '') {
  const normalizedPdf = normalizeGdComparable(pdfText);
  const compactPdf = normalizedPdf.replace(/\s+/g, '');
  const gdPassports = Array.from(new Set((normalizedPdf.match(/\b[A-Z]{1,3}\d{5,9}\b/g) || []).map((item) => item.toUpperCase())));
  const missing = [];
  crew.forEach((row) => {
    const passport = String(row.passport || '').toUpperCase();
    const passportFound = passport ? compactPdf.includes(passport) : false;
    if (!passportFound) {
      missing.push({ ...row, passportFound });
    }
  });
  return {
    complete: crew.length > 0 && missing.length === 0,
    matched: crew.length - missing.length,
    total: crew.length,
    missing,
    extraPassports: [],
    gdPassports
  };
}

function buildGdCheckDetailText(result) {
  const lines = [
    `Expected Subject: ${result.subject || ''}`,
    result.query ? `Gmail Query: ${result.query}` : '',
    result.authMode ? `Auth Mode: ${result.authMode}` : '',
    result.userId ? `Gmail User: ${result.userId}` : '',
    result.searchDate ? `Search Date: ${result.searchDate}` : '',
    result.attachmentName ? `Attachment: ${result.attachmentName}` : '',
    `Crew Matched: ${result.matched || 0}/${result.total || 0}`
  ].filter(Boolean);
  if (result.reason) lines.unshift(`Reason: ${result.reason}`);
  if (Array.isArray(result.missing) && result.missing.length) {
    lines.push('Missing Passports:');
    result.missing.slice(0, 20).forEach((row) => {
      const issues = row.passportFound ? '' : 'passport';
      lines.push(`${row.no || ''}. ${row.name || ''} ${row.passport || ''} (${issues || 'not matched'})`);
    });
  }
  if (Array.isArray(result.extraPassports) && result.extraPassports.length) {
    lines.push(`Extra GD Passports: ${result.extraPassports.slice(0, 20).join(', ')}`);
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
    matched: 0,
    total: Array.isArray(crew) ? crew.length : 0,
    missing: [],
    extraPassports: [],
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
    const messages = Array.isArray(list.data.messages) ? list.data.messages : [];
    if (!messages.length) {
      const result = empty({ reason: 'No Gmail message with the expected GD subject and attachment was found in the last 2 days.', query: q, authMode, userId, searchDate });
      result.detailText = buildGdCheckDetailText(result);
      return result;
    }

    for (const message of messages) {
      const full = await gmail.users.messages.get({
        userId,
        id: message.id,
        format: 'full',
        fields: 'id,internalDate,payload(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data),parts(filename,mimeType,body(attachmentId,data))))'
      });
      const pdfParts = collectGmailParts(full.data.payload, (part) => {
        const filename = String(part.filename || '').toLowerCase();
        const mimeType = String(part.mimeType || '').toLowerCase();
        return Boolean(part.body?.attachmentId || part.body?.data) && (mimeType === 'application/pdf' || filename.endsWith('.pdf'));
      });
      for (const part of pdfParts) {
        let data = part.body?.data || '';
        if (part.body?.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({ userId, messageId: full.data.id || message.id, id: part.body.attachmentId });
          data = attachment.data.data || '';
        }
        const pdfText = extractPdfText(Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
        const comparison = compareGdCrew(crew, pdfText);
        const sentAtDate = Number(full.data.internalDate) ? new Date(Number(full.data.internalDate)) : null;
        const result = {
          found: true,
          complete: comparison.complete,
          subject,
          detailText: '',
          reason: comparison.complete ? '' : 'GD PDF is missing one or more CWD passport numbers.',
          query: q,
          authMode,
          userId,
          searchDate,
          attachmentName: part.filename || 'GD PDF attachment',
          sentAt: sentAtDate ? sentAtDate.toISOString() : '',
          ...comparison
        };
        result.detailText = buildGdCheckDetailText(result);
        return result;
      }
    }
    const result = empty({ reason: 'GD email was found, but no PDF attachment was found.', query: q, authMode, userId, searchDate });
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
  hasNextDayInfoEmail,
  getNextDayInfoEmail,
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
  appendTestBaggageRecord,
  updateTestBaggageRecord
};
