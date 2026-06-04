const { google } = require('googleapis');

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
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}(?::\d{2})?$/);
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
const REPORT_SHEETS = {
  vip: {
    gid: 1703169759,
    headers: ['Flight Date', 'Flight #', 'Passenger Name', 'BN', 'Seat', 'BAGS'],
    fields: ['flightDate', 'flightNo', 'passenger', 'bn', 'seat', 'bags'],
    readOnly: true
  },
  wheelchair: {
    gid: 910713958,
    headers: ['Recorded At', 'Date', 'Flight', 'Flight Date', 'Passenger', 'BN', 'Seat', 'Wheelchair Type', 'Key'],
    fields: ['recordedAt', 'date', 'flightNo', 'flightDate', 'passenger', 'bn', 'seat', 'wheelchairType', 'key']
  }
};
const reportSheetTitles = {};
let reportSheetAccessBlocked = false;

function getReportSheetConfig(type) {
  return REPORT_SHEETS[String(type || '').toLowerCase()] || null;
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
    row?.wheelchairType || ''
  ].map((value) => String(value || '').trim().toUpperCase()).join('|');
}

function scanMarkerKey(type, isoDate) {
  return `__SCAN__|${String(type || '').toLowerCase()}|${isoDate}`;
}

async function getReportSheetTitle(type) {
  const config = getReportSheetConfig(type);
  if (!config) return '';
  if (!reportSheetTitles[type]) {
    reportSheetTitles[type] = await resolveSheetTitleByGid(REPORT_SHEET_ID, config.gid);
  }
  return reportSheetTitles[type] || '';
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
  const config = getReportSheetConfig(type);
  return Boolean(config?.headers?.every((header, index) => String(values?.[index] || '').trim() === header));
}

function reportRowFromSheet(type, values) {
  const config = getReportSheetConfig(type);
  const row = {};
  config.fields.forEach((field, index) => {
    row[field] = values[index] || '';
  });
  if (type === 'vip') {
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
    if (parsed.key === scanMarkerKey(type, isoDate)) {
      scanned = true;
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


async function appendVipReportRows(rows) {
  if (reportSheetAccessBlocked) return { appended: 0 };
  const config = getReportSheetConfig('vip');
  const title = await getReportSheetTitle('vip');
  if (!config || !title) return { appended: 0 };
  const sheetRows = await getReportSheetRows('vip');
  const existingKeys = new Set();
  const startIndex = sheetRows.length && isReportHeaderRow('vip', sheetRows[0]) ? 1 : 0;
  for (let i = startIndex; i < sheetRows.length; i += 1) {
    if (isReportHeaderRow('vip', sheetRows[i])) continue;
    const parsed = reportRowFromSheet('vip', sheetRows[i]);
    existingKeys.add([
      parsed.flightDate,
      parsed.flightNo,
      parsed.passenger,
      parsed.bn,
      parsed.seat,
      parsed.bags
    ].map((value) => String(value || '').trim().toUpperCase()).join('|'));
  }

  const values = [];
  for (const row of rows || []) {
    const normalized = {
      flightDate: String(row.flightDate || '').trim().toUpperCase(),
      flightNo: String(row.flightNo || '').trim().toUpperCase(),
      passenger: String(row.passenger || '').trim().toUpperCase(),
      bn: String(row.bn || '').trim().padStart(3, '0'),
      seat: String(row.seat || '').trim().toUpperCase(),
      bags: String(row.bags || '').trim().toUpperCase()
    };
    if (!normalized.flightDate || !normalized.flightNo || !normalized.passenger) continue;
    const key = config.fields.map((field) => normalized[field] || '').join('|').toUpperCase();
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
  const markerKey = scanMarkerKey(type, isoDate);
  if (!existingKeys.has(markerKey)) {
    const marker = { recordedAt: new Date().toISOString(), date: isoDate, passenger: '__SCAN_COMPLETE__', source: 'SCAN', key: markerKey };
    values.push(sheetValuesFromReportRow(type, marker));
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


async function hasNextDayInfoEmail(flightNo, subjectDate, expectedSubject = '') {
  const normalizedFlightNo = String(flightNo || '').trim().toUpperCase();
  const normalizedSubjectDate = String(subjectDate || '').trim();
  const subject = String(expectedSubject || `${normalizedFlightNo} ${normalizedSubjectDate} flight information details`).trim();
  if (!normalizedFlightNo || !normalizedSubjectDate || !subject) return false;

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const userId = process.env.NEXT_DAY_INFO_GMAIL_USER || 'laxhmmu@gmail.com';
    const exactSubject = subject.replace(/"/g, '');
    const q = `subject:"${exactSubject}" newer_than:30d`;
    const result = await gmail.users.messages.list({
      userId,
      q,
      maxResults: 10,
      fields: 'messages/id'
    });
    return Array.isArray(result.data.messages) && result.data.messages.length > 0;
  } catch (err) {
    console.error('Gmail next day info subject search error:', err.message || err);
    return false;
  }
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
  getStoredReportRows,
  appendStoredReportRows,
  appendVipReportRows,
  pruneStoredReportRows
};
