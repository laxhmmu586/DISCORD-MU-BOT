const { google } = require('googleapis');

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

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
    ...GMAIL_SCOPES
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
    headers: ['FLIGHT DATE', 'FLIGHT #', 'NAME', 'BN', 'SEAT', 'BAGS', 'Key'],
    fields: ['flightDate', 'flightNo', 'passenger', 'bn', 'seat', 'bags', 'key']
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
    row?.bags || ''
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

function reportFlightDateToIso(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const flightDateIso = toIsoDateFromFlightDate(raw);
  if (flightDateIso) return flightDateIso;
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${String(slashMatch[1]).padStart(2, '0')}-${String(slashMatch[2]).padStart(2, '0')}`;
  }
  return '';
}

function reportRowFromSheet(type, values) {
  const config = getReportSheetConfig(type);
  const row = {};
  config.fields.forEach((field, index) => {
    row[field] = values[index] || '';
  });
  if (type === 'vip' && !row.date) row.date = reportFlightDateToIso(row.flightDate);
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
  await ensureReportSheetHeaders(type, rows);
  let scanned = false;
  const dataRows = [];
  for (let i = 1; i < rows.length; i += 1) {
    const parsed = reportRowFromSheet(type, rows[i]);
    if (parsed.key === scanMarkerKey(type, isoDate)) {
      scanned = true;
      continue;
    }
    if (parsed.date !== isoDate) continue;
    dataRows.push(parsed);
  }
  return { rows: dataRows, scanned };
}

async function getVipReportRowsFromSheet(isoDate = '') {
  const selectedDate = String(isoDate || '').trim();
  const hasDateFilter = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate);
  const rows = await getReportSheetRows('vip');
  const dataRows = [];
  for (let i = 0; i < rows.length; i += 1) {
    const parsed = reportRowFromSheet('vip', rows[i]);
    const isHeader = ['FLIGHT DATE', 'FLIGHT #', 'PASSENGER NAME', 'NAME'].includes(String(parsed.flightDate || '').trim().toUpperCase());
    if (isHeader || parsed.key === scanMarkerKey('vip', selectedDate) || parsed.passenger === '__SCAN_COMPLETE__') continue;
    if (hasDateFilter && parsed.date !== selectedDate) continue;
    if (![parsed.flightDate, parsed.flightNo, parsed.passenger, parsed.bn, parsed.seat, parsed.bags].some(Boolean)) continue;
    dataRows.push(parsed);
  }
  return { rows: dataRows, scanned: false, source: 'sheet' };
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

async function appendStoredReportRows(type, isoDate, rows, options = {}) {
  if (reportSheetAccessBlocked) return { appended: 0 };
  const config = getReportSheetConfig(type);
  if (!config) return { appended: 0 };
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
  if (options.addScanMarker !== false && !existingKeys.has(markerKey)) {
    const marker = { flightDate: isoDateToReportFlightDate(isoDate), flightNo: '__SCAN_COMPLETE__', passenger: '__SCAN_COMPLETE__', key: markerKey };
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

function isoDateToReportFlightDate(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${m[3]}${months[Number(m[2]) - 1] || ''}${m[1].slice(-2)}`;
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

async function findSalesReportFileByDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null;
  const res = await drive.files.list({
    q: `'${SALES_REPORT_FOLDER_ID}' in parents and trashed = false and name contains 'Sales Report' and name contains '${String(isoDate).replace(/'/g, "\\'")}'`,
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

async function downloadSalesReportByDate(isoDate) {
  const file = await findSalesReportFileByDate(isoDate);
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


function gmailClientForUser(userId) {
  const oauthClientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const oauthClientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauth2 = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
    oauth2.setCredentials({ refresh_token: oauthRefreshToken });
    return google.gmail({ version: 'v1', auth: oauth2 });
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey && userId) {
    return google.gmail({
      version: 'v1',
      auth: new google.auth.JWT(clientEmail, null, privateKey, GMAIL_SCOPES, userId)
    });
  }
  return google.gmail({ version: 'v1', auth });
}

function datePartsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

function todayGmailDateBounds() {
  const timeZone = process.env.NEXT_DAY_INFO_TIME_ZONE || 'America/Los_Angeles';
  const todayParts = datePartsInTimeZone(new Date(), timeZone);
  const start = new Date(Date.UTC(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day)));
  const end = new Date(start.getTime() + 86400000);
  const fmt = (date) => {
    const parts = datePartsInTimeZone(date, 'UTC');
    return `${parts.year}/${parts.month}/${parts.day}`;
  };
  return { after: fmt(start), before: fmt(end) };
}

function decodeGmailBody(data) {
  if (!data) return '';
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function collectGmailTextParts(payload, output = { plain: [], html: [] }) {
  if (!payload) return output;
  const mimeType = String(payload.mimeType || '').toLowerCase();
  const bodyText = decodeGmailBody(payload.body?.data || '');
  if (bodyText) {
    if (mimeType.includes('text/html')) output.html.push(bodyText);
    else output.plain.push(bodyText);
  }
  for (const part of payload.parts || []) collectGmailTextParts(part, output);
  return output;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractGmailMessageText(payload) {
  const parts = collectGmailTextParts(payload);
  const text = parts.plain.join('\n').trim() || htmlToText(parts.html.join('\n')).trim();
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseNextDayInfoBody(text) {
  const metric = (label) => String(text || '').match(new RegExp(`${label}\\s*:\\s*(\\d+)`, 'i'))?.[1] || '';
  return {
    firstClass: metric('First Class'),
    businessClass: metric('Business Class'),
    economyClass: metric('Economy Class'),
    internationalTransfer: metric('International Transfer'),
    domesticTransfer: metric('Domestic Transfer'),
    overnightPassengers: metric('Overnight passengers')
  };
}

function gmailSentTime(internalDate, dateHeader) {
  const date = internalDate ? new Date(Number(internalDate)) : new Date(dateHeader || '');
  if (Number.isNaN(date.getTime())) return { sentAt: '', sentTime: '' };
  const timeZone = process.env.NEXT_DAY_INFO_TIME_ZONE || 'America/Los_Angeles';
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    sentAt: date.toISOString(),
    sentTime: `${timeParts.hour || ''}${timeParts.minute || ''}`
  };
}

async function getNextDayInfoEmail(flightNo, subjectDate, expectedSubject = '') {
  const normalizedFlightNo = String(flightNo || '').trim().toUpperCase();
  const normalizedSubjectDate = String(subjectDate || '').trim();
  const subject = String(expectedSubject || `${normalizedFlightNo} ${normalizedSubjectDate} flight information details`).trim();
  if (!normalizedFlightNo || !normalizedSubjectDate || !subject) return null;

  try {
    const userId = process.env.NEXT_DAY_INFO_GMAIL_USER || 'laxhmmu@gmail.com';
    const gmail = gmailClientForUser(userId);
    const exactSubject = subject.replace(/"/g, '');
    const { after, before } = todayGmailDateBounds();
    const termQuery = `${normalizedFlightNo} ${normalizedSubjectDate} flight information details`
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `subject:"${term.replace(/"/g, '')}"`)
      .join(' ');
    const queries = [
      `in:sent subject:"${exactSubject}" after:${after} before:${before}`,
      `in:sent subject:"${exactSubject}" newer_than:14d`,
      `label:sent subject:"${exactSubject}" newer_than:14d`,
      `in:sent ${termQuery} newer_than:14d`,
      `${termQuery} newer_than:14d`
    ];

    const messageIds = new Set();
    for (const q of queries) {
      const result = await gmail.users.messages.list({
        userId,
        q,
        includeSpamTrash: false,
        maxResults: 10,
        fields: 'messages/id'
      });
      for (const message of result.data.messages || []) {
        if (message?.id) messageIds.add(message.id);
      }
      if (messageIds.size) break;
    }
    if (!messageIds.size) return null;

    const normalizedSubject = exactSubject.toUpperCase();
    const details = await Promise.all(Array.from(messageIds).map(async (id) => {
      const detail = await gmail.users.messages.get({
        userId,
        id,
        format: 'full',
        fields: 'id,internalDate,labelIds,payload(headers(name,value),mimeType,body(data),parts)'
      });
      const headers = detail.data.payload?.headers || [];
      const header = (name) => headers.find((item) => String(item.name || '').toLowerCase() === name.toLowerCase())?.value || '';
      const foundSubject = header('Subject') || subject;
      const body = extractGmailMessageText(detail.data.payload);
      return {
        id: detail.data.id || id,
        subject: foundSubject,
        from: header('From'),
        to: header('To'),
        labels: detail.data.labelIds || [],
        ...gmailSentTime(detail.data.internalDate, header('Date')),
        body,
        metrics: parseNextDayInfoBody(body)
      };
    }));

    const exactMatches = details.filter((item) => String(item.subject || '').trim().toUpperCase() === normalizedSubject);
    const sentMatches = (exactMatches.length ? exactMatches : details).filter((item) => !item.labels?.length || item.labels.includes('SENT'));
    return (sentMatches.length ? sentMatches : exactMatches).sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')))[0] || null;
  } catch (err) {
    console.error('Gmail next day info subject search error:', err.message || err);
    return null;
  }
}

async function hasNextDayInfoEmail(flightNo, subjectDate, expectedSubject = '') {
  return Boolean(await getNextDayInfoEmail(flightNo, subjectDate, expectedSubject));
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
  downloadSalesReportByDate,
  hasNextDayInfoEmail,
  getNextDayInfoEmail,
  getStoredReportRows,
  getVipReportRowsFromSheet,
  appendStoredReportRows,
  pruneStoredReportRows
};
