require('dotenv').config();

const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName,

  findByFFNumber,

  findByBagtag

} = require('./flightParser');

const {

  parsePDLog,

  findPDByFFNumber

} = require('./pdParser');

const {

  getLatestFlightLog,

  getFlightLogByDate,
  get240InfoByBnAndFlightDate,
  getSyBagInfoByDate,
  getSalesReportMeta,
  downloadSalesReportByFlight,
  getNextDayInfoEmail,
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

} = require('./googleDrive');

const {

  Client,

  GatewayIntentBits

} = require('discord.js');

const fbLookup =
  require('./fbLookup');
const { findSYInfo } = require('./syParser');
const DEFAULT_PERMISSIONS = {
  canViewTravelDocs: true,
  canViewMembership: true,
  canViewTicket: true,
  canViewBags: true,
  canViewInbound: true,
  canViewOutbound: true,
  canViewCheckinDetails: true,
  canView240Info: true,
  canViewSpecialService: true,
  canViewSpecialMeals: true,
  canViewLoungeAccess: true,
  canViewGuestAccess: true,
  canViewPaidService: true
};


function isoDateToLogDateParts(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = months[Number(match[2]) - 1];
  if (!monthName) return null;
  return { date: `${match[3]}${monthName}`, yearSuffix: match[1].slice(-2) };
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function monthNameToNumber(monthName) {
  const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  return months[String(monthName || '').slice(0, 3).toUpperCase()] || '';
}

function flightDateToIsoDate(flightDate) {
  const match = String(flightDate || '').toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const month = monthNameToNumber(match?.[2]);
  if (!match || !month) return '';
  return `20${match[3]}-${month}-${match[1]}`;
}

function sectionTimestampToIsoDate(section) {
  const match = String(section || '').match(/^(\d{4})\s+([A-Z][a-z]+)\s+(\d{1,2}),/);
  const month = monthNameToNumber(match?.[2]);
  if (!match || !month) return '';
  return `${match[1]}-${month}-${String(match[3]).padStart(2, '0')}`;
}

function sectionTimestampToMs(section) {
  const match = String(section || '').match(/^(\d{4})\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+[^,]+,\s+(\d{2}):(\d{2}):(\d{2})/);
  const month = monthNameToNumber(match?.[2]);
  if (!match || !month) return 0;
  return Date.UTC(Number(match[1]), Number(month) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

function splitReportSections(log) {
  return String(log || '')
    .split(/(?=\n?\d{4}\s+[A-Z][a-z]+\s+\d{1,2},\s+[A-Z][a-z]+,\s+\d{2}:\d{2}:\d{2}\s*\n>)/g)
    .map((content) => content.trim())
    .filter(Boolean);
}

function cleanVipName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\+$/g, '')
    .replace(/\s+/g, '')
    .replace(/\/+$/g, '');
}

function cleanVipPassengerName(value) {
  return cleanVipName(value).replace(/\/+$/g, '');
}

function extractVipNameCandidate(section) {
  const namMatch = String(section || '').match(/^\s*NAM\s+([A-Z][A-Z/]+VIP)\b/im);
  if (namMatch) return { name: cleanVipPassengerName(namMatch[1]), source: 'NAM' };

  const passengerLine = String(section || '').match(/^\s*\d+\.\s*([A-Z][A-Z/]+(?:VIP)?\+?)\b.*?\bBN\s*\d{1,3}\b/im);
  const passengerName = cleanVipName(passengerLine?.[1]);
  if (passengerName.endsWith('VIP')) return { name: cleanVipPassengerName(passengerName), source: 'Passenger Line' };

  return null;
}

function extractBagsForVip(section) {
  const bagTags = [];
  const bagTagMatch = String(section || '').match(/\bBAGTAG\/([^\n\r]+)/i);
  if (bagTagMatch) {
    bagTagMatch[1].replace(/\b(\d{6,})(?:\/([A-Z]{3}))?\b/gi, (value, tag, destination) => {
      bagTags.push(`${tag}${destination ? `/${String(destination).toUpperCase()}` : ''}`);
      return value;
    });
  }
  return bagTags.length ? bagTags.join(' /') : '';
}

function extractVipPassengersFromLog(log, isoDate) {
  const latestByPassengerFlight = new Map();

  for (const section of splitReportSections(log)) {
    if (!/\bPR:\s*[A-Z0-9]+\//i.test(section)) continue;
    const vip = extractVipNameCandidate(section);
    if (!vip?.name) continue;

    const sectionIsoDate = sectionTimestampToIsoDate(section);
    if (sectionIsoDate !== isoDate) continue;

    const prMatch = section.match(/\bPR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    const flightDate = prMatch?.[2]?.toUpperCase() || '';

    const bn = section.match(/\bBN\s*(\d{1,3})\b/i)?.[1]?.replace(/^0+(?=\d)/, '') || '';
    const passengerLine = section.match(/^\s*\d+\.[^\n\r]*/im)?.[0] || '';
    const seat = (
      passengerLine.match(/\bBN\s*\d{1,3}\s+\*?(\d{1,3}[A-Z])\b/i)?.[1] ||
      passengerLine.match(/\bSNR?\s*(\d{1,3}[A-Z])\b/i)?.[1] ||
      ''
    ).toUpperCase();
    const row = {
      date: isoDate,
      flightNo: prMatch?.[1]?.toUpperCase() || '',
      flightDate,
      passenger: vip.name,
      bn,
      seat,
      bags: extractBagsForVip(section),
      source: vip.source,
      timestampMs: sectionTimestampToMs(section)
    };
    if (row.flightNo === 'MU586' && (!row.bn || !row.seat)) continue;
    const key = `${row.flightNo}|${row.flightDate}|${row.passenger}`;
    const existing = latestByPassengerFlight.get(key);
    if (!existing || row.timestampMs >= existing.timestampMs) latestByPassengerFlight.set(key, row);
  }

  return Array.from(latestByPassengerFlight.values())
    .sort((a, b) => (a.flightNo || '').localeCompare(b.flightNo || '') || Number(a.bn || 0) - Number(b.bn || 0) || (a.passenger || '').localeCompare(b.passenger || ''));
}

async function getLogForIsoDate(isoDate) {
  if (isoDate === todayIsoUtc()) return getLatestFlightLog();
  const parts = isoDateToLogDateParts(isoDate);
  if (!parts) return null;
  return getFlightLogByDate(parts.date, parts.yearSuffix);
}

function isoDateToSyDate(isoDate) {
  const parts = isoDateToLogDateParts(isoDate);
  return parts?.date || '';
}

function reportPassengerName(row) {
  return row?.name || row?.passengerName || row?.paxName || row?.passenger || '';
}

function extractInadRowsFromSy(syInfo, isoDate) {
  const byBn = new Map([...(syInfo?.seatMapRecords || []), ...(syInfo?.bnAudit || [])]
    .map((row) => [String(row.bn || '').padStart(3, '0'), row.passengerRecord || row]));
  const seen = new Set();
  return [...byBn.entries()].flatMap(([bn, row]) => {
    const services = [
      ...(Array.isArray(row.specialServices) ? row.specialServices : []),
      ...(Array.isArray(row.passengerRecord?.specialServices) ? row.passengerRecord.specialServices : [])
    ].map((code) => String(code || '').toUpperCase());
    if (!services.includes('INAD')) return [];
    const out = {
      date: isoDate,
      flightNo: syInfo.flightNo || '',
      flightDate: syInfo.flightDate || '',
      passenger: reportPassengerName(row),
      bn,
      seat: row.seat || row.passengerRecord?.seat || '',
      ticketNumber: row.ticketNumber || row.ticketNo || row.passengerRecord?.ticketNumber || row.passengerRecord?.ticketNo || '',
      service: 'INAD'
    };
    out.key = `inad|${out.date}|${out.flightNo}|${out.flightDate}|${out.passenger}|${out.bn}|${out.seat}|${out.ticketNumber}|${out.service}`.toUpperCase();
    if (seen.has(out.key)) return [];
    seen.add(out.key);
    return [out];
  });
}

function extractWheelchairRowsFromSy(syInfo, isoDate) {
  const byBn = new Map([...(syInfo?.seatMapRecords || []), ...(syInfo?.bnAudit || [])]
    .map((row) => [String(row.bn || '').padStart(3, '0'), row.passengerRecord || row]));
  return (syInfo?.wchList || []).map((row) => {
    const merged = { ...(byBn.get(String(row.bn || '').padStart(3, '0')) || {}), ...row };
    const wheelchairType = Array.isArray(merged.codes)
      ? merged.codes.join('/')
      : (Array.isArray(merged.specialServices) ? merged.specialServices.filter((code) => /^WCH/i.test(code)).join('/') : (merged.code || merged.wheelchairType || 'WCH'));
    const out = {
      date: isoDate,
      flightNo: syInfo.flightNo || '',
      flightDate: syInfo.flightDate || '',
      passenger: reportPassengerName(merged),
      bn: merged.bn || '',
      seat: merged.seat || '',
      wheelchairType: wheelchairType || 'WCH'
    };
    out.key = `wheelchair|${out.date}|${out.flightNo}|${out.flightDate}|${out.passenger}|${out.bn}|${out.seat}|${out.wheelchairType}`.toUpperCase();
    return out;
  });
}


function compactReportValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value || '').trim();
}

function psmMsgRowsFromSyInfo(syInfo) {
  if (!syInfo?.flightNo || !syInfo?.flightDate) return [];
  return (syInfo.psmList || []).map((row) => {
    const lines = (Array.isArray(row.psmLines) ? row.psmLines : [row.text || row.raw || row.message])
      .filter(Boolean)
      .map((line) => String(line || '').trim())
      .filter((line) => /^\s*(?:PSM|MSG)(?:\b|-)/i.test(line));
    const detail = lines.join('\n');
    return {
      flightDate: syInfo.flightDate,
      flightNo: syInfo.flightNo,
      passenger: reportPassengerName(row),
      bn: String(row.bn || '').padStart(3, '0'),
      seat: String(row.seat || '').toUpperCase(),
      bags: compactReportValue(row.bagtags || row.bagTags || row.bags),
      type: lines.some((line) => /^\s*MSG/i.test(line)) ? 'MSG' : 'PSM',
      detail
    };
  }).filter((row) => row.passenger && row.detail);
}

async function syncPsmMsgRowsFromSyInfo(syInfo) {
  const rows = psmMsgRowsFromSyInfo(syInfo);
  if (!rows.length) return { appended: 0, found: 0 };
  const result = await appendPsmMsgReportRows(rows);
  return { ...result, found: rows.length };
}

async function syncServiceReportRowsFromSyInfo(syInfo, isoDate) {
  const wchRows = extractWheelchairRowsFromSy(syInfo, isoDate);
  const inadRows = extractInadRowsFromSy(syInfo, isoDate);
  const [wheelchair, inad] = await Promise.all([
    appendStoredReportRows('wheelchair', isoDate, wchRows),
    appendStoredReportRows('inad', isoDate, inadRows)
  ]);
  return {
    wheelchair: { ...wheelchair, found: wchRows.length },
    inad: { ...inad, found: inadRows.length }
  };
}


async function syncTodayPsmMsgReportRows() {
  const log = await getLatestFlightLog();
  if (!log) return { appended: 0, found: 0 };
  const syInfo = findSYInfo(log, null, { preferredFlightNo: 'MU586' });
  if (!syInfo) return { appended: 0, found: 0 };
  return syncPsmMsgRowsFromSyInfo(syInfo);
}

async function syncVipRowsFromLog(log, isoDate) {
  const rows = extractVipPassengersFromLog(log, isoDate || todayIsoUtc());
  if (!rows.length) return { appended: 0, found: 0 };
  const result = await appendVipReportRows(rows);
  return { ...result, found: rows.length };
}

async function syncVipRowsForIsoDate(isoDate) {
  const log = await getLogForIsoDate(isoDate);
  if (!log) return { appended: 0, found: 0 };
  return syncVipRowsFromLog(log, isoDate);
}

async function syncTodayVipReportRows() {
  return syncVipRowsForIsoDate(todayIsoUtc());
}

async function scanVipReportRows(isoDate) {
  const log = await getLogForIsoDate(isoDate);
  if (!log) return [];
  return extractVipPassengersFromLog(log, isoDate).map((row) => ({
    ...row,
    key: `vip|${row.date}|${row.flightNo}|${row.flightDate}|${row.passenger}`.toUpperCase()
  }));
}

async function scanSyServiceReportRows(type, isoDate) {
  const log = await getLogForIsoDate(isoDate);
  if (!log) return [];
  const syDate = isoDateToSyDate(isoDate);
  if (!syDate) return [];
  const syInfo = findSYInfo(log, syDate, { preferredFlightNo: 'MU586' });
  if (!syInfo) return [];
  return type === 'inad' ? extractInadRowsFromSy(syInfo, isoDate) : extractWheelchairRowsFromSy(syInfo, isoDate);
}

async function loadStoredReportRows(type, isoDate, options = {}) {
  const normalizedType = String(type || '').toLowerCase();
  const stored = await getStoredReportRows(normalizedType, isoDate);
  if (normalizedType === 'vip') return { rows: stored.rows, source: 'sheet', scanned: true };
  if (stored.scanned && !options.forceRefresh) return { rows: stored.rows, source: 'sheet', scanned: true };
  const rows = await scanSyServiceReportRows(normalizedType, isoDate);
  await appendStoredReportRows(normalizedType, isoDate, rows);
  const refreshed = await getStoredReportRows(normalizedType, isoDate);
  return { rows: refreshed.rows.length ? refreshed.rows : rows, source: 'scan', scanned: true };
}

async function syncTodayReportSheets() {
  for (const type of ['wheelchair', 'inad']) {
    try {
      await loadStoredReportRows(type, todayIsoUtc(), { forceRefresh: true });
      await pruneStoredReportRows(type);
    } catch (err) {
      console.warn(`${type} report sheet sync skipped:`, err?.message || err);
    }
  }
  try {
    await syncTodayPsmMsgReportRows();
  } catch (err) {
    console.warn('PSM/MSG report sheet sync skipped:', err?.message || err);
  }
  try {
    await syncTodayVipReportRows();
  } catch (err) {
    console.warn('VIP report sheet sync skipped:', err?.message || err);
  }
}

async function resolveAuthContextFromRequest(req) {
  return { permissions: { ...DEFAULT_PERMISSIONS }, uid: null, claims: {} };
}

function applyPermissionFilter(pax, permissions, info240) {
  const filtered = {
    ...pax,
    permissions
  };

  filtered.info240 = info240;

  return filtered;
}

function findPassengerByFFFromRecord(log, query) {
  const ff = query.replace(/\s+/g, '').toUpperCase();
  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  for (const section of sections) {

    const ffMatch =
      section.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);

    if (!ffMatch) continue;

    const currentFF =
      `${ffMatch[1]}${ffMatch[2]}`
        .replace(/\s+/g, '')
        .toUpperCase();

    if (currentFF !== ff) continue;

    const paxMatch =
      section.match(/\n\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:N\d\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);

    const prMatch =
      section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

    return {
      bn: (paxMatch?.[2] || '---').padStart(3, '0'),
      name: (paxMatch?.[1] || 'UNKNOWN').replace(/\+$/, ''),
      seat: paxMatch?.[3] || '---',
      cabin: /^\d+/.test(paxMatch?.[3] || '') ? 'Economy' : 'Economy',
      flight: prMatch?.[1] || '',
      flightDate: (prMatch?.[2] || '').substring(0, 5),
      ffCarrier: ffMatch[1],
      ffNumber: ffMatch[2],
      ffTier: ffMatch[3],
      lounge: {
        eligible: true,
        guest: ffMatch[3] === 'V'
      }
    };
  }

  return null;
}



function extractSeatAfterBnText(text) {
  return (String(text || '').match(/\bBN\s*\d{1,3}\b\s+\*?(\d{1,3}[A-Z])\b/i)?.[1] || '').toUpperCase();
}

function findPassengerFromPRRecord(log, mode, query) {
  const normalized = String(query || '').trim().toUpperCase();
  const normalizedBN = normalized.replace(/^0+/, '') || '0';

  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  const targetSection = sections.find(section => {
    const prLine = section.split(/\r?\n/).find(line => line.includes('PR:')) || '';

    if (mode === 'BN') {
      return new RegExp(`,BN0*${normalizedBN}\\b`, 'i').test(prLine);
    }

    if (mode === 'SEAT') {
      return new RegExp(`\\b${normalized}\\b`, 'i').test(section);
    }

    return section.toUpperCase().includes(normalized);
  });

  if (!targetSection) return null;

  const bnMatch = targetSection.match(/\bBN(\d{1,3})\b/i);
  const passengerLine = targetSection.split(/\r?\n/).find(line => /^\s*\d+\.\s*/.test(line)) || '';
  const paxMatch =
    passengerLine.match(/^\s*\d+\.\s+\d?([A-Z\/]+\+?)/i) ||
    targetSection.match(/\d+\.\s+\d?([A-Z\/]+\+?)/i);
  const seatFromRecord =
    extractSeatAfterBnText(passengerLine) ||
    (targetSection.match(/\bSN\s*(\d{1,3}[A-Z])\b/i)?.[1] || '').toUpperCase();
  const prMatch = targetSection.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

  return {
    bn: (bnMatch?.[1] || '---').padStart(3, '0'),
    name: (paxMatch?.[1] || 'UNKNOWN').replace(/\+$/, ''),
    seat: seatFromRecord || '---',
    cabin: 'Economy',
    flight: prMatch?.[1] || '',
    flightDate: (prMatch?.[2] || '').substring(0, 5),
    lounge: { eligible: false, guest: false }
  };
}

function findPDPassengerByFFFromLog(log, query) {
  const ff =
    query.replace(/\s+/g, '').toUpperCase();

  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  for (const section of sections) {
    if (!section.includes('PD:')) continue;

    const rows =
      section.split(/\r?\n/);

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      const m =
        line.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);

      if (!m) continue;

      const current =
        `${m[1]}${m[2]}`
          .replace(/\s+/g, '')
          .toUpperCase();

      if (current !== ff) continue;

      let name = 'PD MEMBER';
      let bn = '---';
      let seat = '---';

      for (let j = i - 1; j >= 0; j--) {
        const pax =
          rows[j].match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);

        if (pax) {
          name = pax[1]?.replace(/\+$/, '') || name;
          if (pax[2]) bn = pax[2].padStart(3, '0');
          if (pax[3]) seat = pax[3];
          break;
        }
      }

      const flightMatch =
        section.match(/PD:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

      return {
        name,
        bn,
        seat,
        cabin: 'Elite',
        flight: flightMatch?.[1] || '',
        flightDate: (flightMatch?.[2] || '').substring(0, 5),
        ffCarrier: m[1],
        ffNumber: m[2],
        ffTier: m[3],
        membershipStatus: m[3] === 'V' ? 'Platinum' : m[3] === 'G' ? 'Gold' : m[3] === 'S' ? 'Silver' : '',
        lounge: {
          eligible: true,
          guest: m[3] === 'V'
        }
      };
    }
  }

  return null;
}

// ===============================
// Express
// ===============================
const app =
  express();

const allowedOrigins = [
  "https://china-eastern.web.app",
  "https://www.mufcapp.net",
  "https://mufcapp.net"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(
  express.json()
);

app.use(
  express.static('public')
);

const REVIEW_STORE_PATH = path.join(__dirname, 'securityReviews.json');
const REVIEW_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function reviewCutoffIso() {
  return new Date(Date.now() - REVIEW_RETENTION_MS).toISOString();
}

function reviewFlightKey(flightNo, flightDate) {
  return `${String(flightNo || '').trim().toUpperCase()}/${String(flightDate || '').trim().toUpperCase()}`;
}

async function readReviewStore() {
  try {
    const raw = await fs.readFile(REVIEW_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { reviews: {} };
  } catch (err) {
    if (err?.code === 'ENOENT') return { reviews: {} };
    throw err;
  }
}

async function writeReviewStore(store) {
  await fs.writeFile(REVIEW_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function pruneReviewStore(store) {
  const cutoff = reviewCutoffIso();
  const reviews = store.reviews && typeof store.reviews === 'object' ? store.reviews : {};
  Object.entries(reviews).forEach(([flightKey, rows]) => {
    if (!rows || typeof rows !== 'object') {
      delete reviews[flightKey];
      return;
    }
    Object.entries(rows).forEach(([bn, review]) => {
      if (!review?.updatedAt || review.updatedAt < cutoff) delete rows[bn];
    });
    if (!Object.keys(rows).length) delete reviews[flightKey];
  });
  store.reviews = reviews;
  return store;
}

function sanitizeReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['pass', 'fail'].includes(normalized) ? normalized : '';
}

function sanitizeReviewComment(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 500);
}

function sanitizeReviewer(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
}


const ALLOWED_ORIGINS = [
  'https://china-eastern.web.app',
  'https://china-eastern.firebaseapp.com',
  'https://mufcapp.net',
  'https://www.mufcapp.net',
  'https://api.mufcapp.net',
  process.env.WEB_ORIGIN
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ===============================
// Discord Client
// ===============================
const client =
  new Client({

    intents: [

      GatewayIntentBits.Guilds,

      GatewayIntentBits.GuildMessages,

      GatewayIntentBits.MessageContent
    ]
  });

// ===============================
// FB Lookup
// ===============================
fbLookup(client);

// ===============================
// Discord Login
// ===============================
client.login(
  process.env.DISCORD_TOKEN
);

client.once(

  'clientReady',

  () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );
  }
);


app.get('/security-reviews', async (req, res) => {
  try {
    const flightNo = String(req.query.flightNo || '').toUpperCase();
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || !flightDate) return res.status(400).json({ error: 'Missing flightNo or flightDate' });
    const store = pruneReviewStore(await readReviewStore());
    await writeReviewStore(store);
    const key = reviewFlightKey(flightNo, flightDate);
    return res.json({ reviews: store.reviews[key] || {} });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Security review lookup failed' });
  }
});

app.post('/security-reviews', async (req, res) => {
  try {
    const flightNo = String(req.body?.flightNo || '').toUpperCase();
    const flightDate = String(req.body?.flightDate || '').toUpperCase();
    const bn = String(req.body?.bn || '').replace(/\D/g, '').padStart(3, '0');
    const status = sanitizeReviewStatus(req.body?.status);
    const comment = sanitizeReviewComment(req.body?.comment);
    const reviewer = sanitizeReviewer(req.body?.reviewer);
    if (!flightNo || !flightDate || !/^\d{3}$/.test(bn) || !status) {
      return res.status(400).json({ error: 'Missing flightNo, flightDate, BN, or status' });
    }
    const store = pruneReviewStore(await readReviewStore());
    const key = reviewFlightKey(flightNo, flightDate);
    store.reviews[key] = store.reviews[key] || {};
    store.reviews[key][bn] = { status, comment, reviewer, updatedAt: new Date().toISOString() };
    await writeReviewStore(store);
    return res.json({ ok: true, review: store.reviews[key][bn] });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Security review save failed' });
  }
});

// ===============================
// Search API
// ===============================

app.get('/stored-report', async (req, res) => {
  try {
    const type = String(req.query.type || '').trim().toLowerCase();
    const isoDate = String(req.query.date || '').trim();
    if (!['vip', 'wheelchair', 'inad'].includes(type)) return res.status(400).json({ error: 'Invalid report type' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return res.status(400).json({ error: 'Missing or invalid date' });
    const result = await loadStoredReportRows(type, isoDate);
    return res.json(result);
  } catch (err) {
    console.error('Stored report error:', err);
    return res.status(500).json({ error: err?.message || 'Stored report lookup failed' });
  }
});

app.get('/bagroom-report', async (req, res) => {
  try {
    const from = String(req.query.from || req.query.date || '').trim();
    const to = String(req.query.to || from).trim();
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) return res.status(400).json({ error: 'Missing or invalid date range' });
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const rows = [];
    for (const cursor = new Date(fromDate); cursor <= toDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (rows.length > 366) return res.status(400).json({ error: 'Date range is too large' });
      const isoDate = cursor.toISOString().slice(0, 10);
      const sheet = await getSyBagInfoByDate(isoDate);
      rows.push({ date: isoDate, bagSheet: sheet });
    }
    return res.json({ rows });
  } catch (err) {
    console.error('Bagroom report error:', err);
    return res.status(500).json({ error: err?.message || 'Bagroom report lookup failed' });
  }
});

function normalizeTestBagTag(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isValidTestBagTag(value) {
  return /^[A-Z]{2}\d{6}$/.test(normalizeTestBagTag(value));
}

function cleanBodyText(value, maxLength = 500) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

app.get('/test-baggage/:bagTag', async (req, res) => {
  try {
    const bagTag = normalizeTestBagTag(req.params.bagTag);
    if (!isValidTestBagTag(bagTag)) return res.status(400).json({ error: 'Bag tag must match MU123456 format' });
    const record = await findTestBaggageByTag(bagTag);
    return res.json({ found: Boolean(record), record });
  } catch (err) {
    console.error('Test baggage lookup error:', err);
    return res.status(500).json({ error: err?.message || 'Baggage lookup failed' });
  }
});

app.post('/test-baggage', async (req, res) => {
  try {
    const bagTag = normalizeTestBagTag(req.body?.bagTag);
    if (!isValidTestBagTag(bagTag)) return res.status(400).json({ error: 'Bag tag must match MU123456 format' });
    const direction = cleanBodyText(req.body?.direction, 20).toLowerCase();
    if (!['inbound', 'outbound'].includes(direction)) return res.status(400).json({ error: 'Direction must be inbound or outbound' });
    const date = cleanBodyText(req.body?.date, 20);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Missing or invalid date' });
    const flight = cleanBodyText(req.body?.flight, 20).toUpperCase();
    if (!/^[A-Z]{2}\d{1,4}[A-Z]?$/.test(flight)) return res.status(400).json({ error: 'Missing or invalid flight number' });
    const result = await appendTestBaggageRecord({
      bagTag,
      direction,
      flight,
      date,
      bagType: cleanBodyText(req.body?.bagType, 80),
      location: cleanBodyText(req.body?.location, 120),
      status: cleanBodyText(req.body?.status, 80),
      comment: cleanBodyText(req.body?.comment, 500),
      rushTagNumber: cleanBodyText(req.body?.rushTagNumber, 80),
      rushToWhere: cleanBodyText(req.body?.rushToWhere, 120),
      akeNumber: cleanBodyText(req.body?.akeNumber, 80),
      worldTracerFileNumber: cleanBodyText(req.body?.worldTracerFileNumber, 120),
      submittedBy: cleanBodyText(req.body?.submittedBy, 160)
    });
    return res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    console.error('Test baggage create error:', err);
    return res.status(500).json({ error: err?.message || 'Baggage save failed' });
  }
});

app.post('/test-baggage/:bagTag/update', async (req, res) => {
  try {
    const bagTag = normalizeTestBagTag(req.params.bagTag);
    if (!isValidTestBagTag(bagTag)) return res.status(400).json({ error: 'Bag tag must match MU123456 format' });
    const type = cleanBodyText(req.body?.type, 40).toLowerCase();
    if (!['rush', 'location', 'shipping'].includes(type)) return res.status(400).json({ error: 'Invalid update type' });
    const result = await updateTestBaggageRecord(bagTag, {
      type,
      updatedBy: cleanBodyText(req.body?.updatedBy, 160),
      rushTagNumber: cleanBodyText(req.body?.rushTagNumber, 80),
      rushToWhere: cleanBodyText(req.body?.rushToWhere, 120),
      akeNumber: cleanBodyText(req.body?.akeNumber, 80),
      worldTracerFileNumber: cleanBodyText(req.body?.worldTracerFileNumber, 120),
      comment: cleanBodyText(req.body?.comment, 500),
      location: cleanBodyText(req.body?.location, 120),
      trackingNumber: cleanBodyText(req.body?.trackingNumber, 160),
      shippingFee: cleanBodyText(req.body?.shippingFee, 80)
    });
    if (result.notFound) return res.status(404).json({ error: 'Bag not found' });
    return res.json(result);
  } catch (err) {
    console.error('Test baggage update error:', err);
    return res.status(500).json({ error: err?.message || 'Baggage update failed' });
  }
});

app.get('/vip-report', async (req, res) => {
  try {
    const isoDate = String(req.query.date || '').trim();
    if (isoDate && !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return res.status(400).json({ error: 'Invalid date' });
    const rows = await getVipReportRows(isoDate || '');
    return res.json({ rows, source: 'sheet', scanned: true });
  } catch (err) {
    console.error('VIP report error:', err);
    return res.status(500).json({ error: err?.message || 'VIP report lookup failed' });
  }
});


app.get('/psm-report', async (req, res) => {
  try {
    const from = String(req.query.from || req.query.date || '').trim();
    const to = String(req.query.to || from).trim();
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) return res.status(400).json({ error: 'Missing or invalid date range' });
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const rows = await getPsmMsgReportRows(from, to);
    return res.json({ rows, source: 'sheet' });
  } catch (err) {
    console.error('PSM report error:', err);
    return res.status(500).json({ error: err?.message || 'PSM report lookup failed' });
  }
});

app.get('/inad-report', async (req, res) => {
  try {
    const rows = await getInadReportRows();
    return res.json({ rows, source: 'sheet' });
  } catch (err) {
    console.error('INAD report error:', err);
    return res.status(500).json({ error: err?.message || 'INAD report lookup failed' });
  }
});

app.get('/wch-report', async (req, res) => {
  try {
    const from = String(req.query.from || req.query.date || '').trim();
    const to = String(req.query.to || from).trim();
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) return res.status(400).json({ error: 'Missing or invalid date range' });
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const rows = await getWheelchairReportRows(from, to);
    return res.json({ rows, source: 'sheet' });
  } catch (err) {
    console.error('WCH report error:', err);
    return res.status(500).json({ error: err?.message || 'WCH report lookup failed' });
  }
});

app.get(
  '/sales-report/meta',
  async (req, res) => {
    try {
      const flightNo = String(req.query.flightNo || '').toUpperCase();
      const flightDate = String(req.query.flightDate || '').toUpperCase();
      if (!flightNo || !flightDate) {
        return res.status(400).json({ error: 'Missing flightNo or flightDate' });
      }
      const meta = await getSalesReportMeta(flightNo, flightDate);
      return res.json(meta);
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'Sales report lookup failed' });
    }
  }
);

app.get(
  '/sales-report/download',
  async (req, res) => {
    try {
      const flightNo = String(req.query.flightNo || '').toUpperCase();
      const flightDate = String(req.query.flightDate || '').toUpperCase();
      if (!flightNo || !flightDate) {
        return res.status(400).json({ error: 'Missing flightNo or flightDate' });
      }
      const result = await downloadSalesReportByFlight(flightNo, flightDate);
      if (!result) return res.status(404).json({ error: 'Sales report not found' });
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      return res.send(Buffer.from(result.content));
    } catch (err) {
      return res.status(500).json({ error: err?.message || 'Sales report download failed' });
    }
  }
);

app.get(

  '/search',

  async (req, res) => {

    try {

      const rawQuery =
        String(req.query.q || '')
          .trim()
          .toUpperCase();

      let q = rawQuery;

      q =
        q.replace(
          /^FF(?:\/|\s+)/i,
          ''
        );

      if (!q) {

        return res.json({

          error:
            'Missing query'
        });
      }

      // =========================
      // Date Search
      // Example:
      // 230/20APR
      // 7812545625555/20APR
      // MU5656565/20APR
      // 32A/20APR
      // =========================
      let date = null;
      let yearSuffix = null;

      const dateSuffixMatch =
        q.match(
          /^(.*)\/(\d{2}[A-Z]{3})(\d{2})?$/i
        );

      if (dateSuffixMatch) {

        q =
          dateSuffixMatch[1]
            .trim()
            .toUpperCase();

        date =
          dateSuffixMatch[2]
            .trim()
            .toUpperCase();

        yearSuffix =
          (dateSuffixMatch[3] || new Date().getUTCFullYear().toString().slice(-2))
            .trim()
            .toUpperCase();
      }

      const isSYRawQuery =
        /^SY\+?(?:\/\d{2}[A-Z]{3}(?:\d{2})?)?$/.test(
          rawQuery.replace(/\s+/g, '')
        );

      // =========================
      // Load Log
      // =========================
      let log = null;

      // Archive
      if (date) {

        log =
          await getFlightLogByDate(
            date,
            yearSuffix
          );
      }

      // Today
      else {

        log =
          await getLatestFlightLog();
      }

      if (!log) {

        return res.json({

          error:
            'Unable to load logs (Flight Control.log / Lake.log / Ticketing.log)'
        });
      }

      // =========================
      // Parse
      // =========================
      parseIncrementalLog(log);

      parsePDLog(log);

      const normalizedRaw = rawQuery.replace(/\s+/g, '');
      const syMatch = normalizedRaw.match(/^SY(\+)?(?:\/(\d{2}[A-Z]{3})(?:\d{2})?)?$/i);
      if (syMatch) {
        const preferNextDay = Boolean(syMatch[1]) && !date;
        const syDate = syMatch[2] ? syMatch[2].toUpperCase() : date;
        const syInfo = findSYInfo(log, syDate, { preferNextDay, preferredFlightNo: 'MU586' });
        if (!syInfo) {
          return res.json({ error: 'No SY section found for selected date.' });
        }
        const year = Number(yearSuffix || new Date().getUTCFullYear().toString().slice(-2));
        const fullYear = year >= 100 ? year : (year >= 70 ? 1900 + year : 2000 + year);
        const m = String(syInfo.flightDate || '').toUpperCase().match(/(\d{2})([A-Z]{3})(\d{2})?/);
        const months = { JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06', JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12' };
        const yearFromFlight = m?.[3] ? (2000 + Number(m[3])) : fullYear;
        const isoDate = m ? `${yearFromFlight}-${months[m[2]] || '01'}-${m[1]}` : '';
        const syBagInfo = isoDate ? await getSyBagInfoByDate(isoDate, syInfo.flightDate) : null;
        try {
          syInfo.psmMsgSheetSync = await syncPsmMsgRowsFromSyInfo(syInfo);
        } catch (err) {
          console.warn('PSM/MSG report sheet sync skipped:', err?.message || err);
          syInfo.psmMsgSheetSync = { appended: 0, found: (syInfo.psmList || []).length, error: err?.message || 'Sheet sync failed' };
        }
        try {
          syInfo.serviceSheetSync = await syncServiceReportRowsFromSyInfo(syInfo, isoDate || todayIsoUtc());
        } catch (err) {
          console.warn('INAD/WCH report sheet sync skipped:', err?.message || err);
          syInfo.serviceSheetSync = { error: err?.message || 'Sheet sync failed' };
        }
        try {
          syInfo.vipSheetSync = await syncVipRowsFromLog(log, isoDate || todayIsoUtc());
        } catch (err) {
          console.warn('VIP report sheet sync skipped:', err?.message || err);
          syInfo.vipSheetSync = { appended: 0, found: 0, error: err?.message || 'Sheet sync failed' };
        }
        const nextDayQuery = syInfo.crewApis?.nextDayInfoQuery || null;
        const nextDayStep = syInfo.crewApis?.steps?.find((step) => step.key === 'nextDayInfo');
        if (nextDayStep && nextDayQuery?.flightNo && nextDayQuery?.flightDate) {
          const nextDaySubject = nextDayQuery.emailSubject || `${nextDayQuery.flightNo} ${nextDayQuery.flightDate} flight information details`;
          const nextDayEmail = await getNextDayInfoEmail(nextDayQuery.flightNo, nextDayQuery.emailSubjectDate || nextDayQuery.flightDate, nextDaySubject);
          nextDayStep.complete = Boolean(nextDayEmail.sent || nextDayEmail.found);
          nextDayStep.time = nextDayEmail.sentAt ? nextDayEmail.sentAt.slice(11, 19) : '';
          nextDayStep.searched = true;
          nextDayStep.details = nextDayEmail.details || {};
          nextDayStep.detailText = nextDayEmail.detailText || '';
          nextDayStep.subject = nextDaySubject;
          nextDayStep.tooltip = nextDayStep.complete
            ? `NEXTDAY INFO sent email found: ${nextDaySubject}`
            : `NEXTDAY INFO sent email not found today in Sent mail: ${nextDaySubject}`;
        }
        const authContext = await resolveAuthContextFromRequest(req);
        return res.json({ sy: { ...syInfo, bagSheet: syBagInfo, permissions: authContext.permissions } });
      }
      if (isSYRawQuery) {
        return res.json({ error: 'SY query did not return SY payload.' });
      }


      let pax = null;
      const normalizedFF =
        q.replace(
          /\s+/g,
          ''
        );

      // =========================
      // BN Search
      // =========================
      if (
        /^\d{1,3}$/.test(q)
      ) {

        const bn =
          q.padStart(3, '0');

        pax =
          passengers[bn] ||
          findPassengerFromPRRecord(log, 'BN', bn);
      }

      // =========================
      // Ticket Search
      // =========================
      else if (
        /^\d{13}$/.test(q)
      ) {

        pax =
          Object.values(passengers)
            .find(p => {

              return (
                p.ticketNumber === q
              );
            });
      }

      // =========================
      // Bagtag Search
      // Examples:
      // 3781829629
      // DL861161
      // =========================
      else if (
        /^(?:\d{5,12}|[A-Z]{1,3}\s*\d{3,12})$/i.test(q)
      ) {

        pax =
          findByBagtag(q);
      }

      // =========================
      // Seat Search
      // =========================
      else if (
        /^\d+[A-Z]$/i.test(q)
      ) {

        pax =
          findBySeat(q) ||
          findPassengerFromPRRecord(log, 'SEAT', q);
      }

      // =========================
      // FF Search
      // =========================
      else if (

        /^[A-Z]{2}\s*\d+$/i
          .test(q)

      ) {

        pax =
          findByFFNumber(normalizedFF);

        if (!pax) {

          pax =
            findPDByFFNumber(normalizedFF);
        }

        if (pax && pax.name === 'PD MEMBER') {
          pax =
            findPDPassengerByFFFromLog(
              log,
              normalizedFF
            ) || pax;
        }

        if (!pax) {
          pax =
            findPassengerByFFFromRecord(
              log,
              normalizedFF
            );
        }
      }

      // =========================
      // Name Search
      // =========================
      else {

        pax =
          findByName(q) ||
          findPassengerFromPRRecord(log, 'NAME', q);
      }

      // =========================
      // Not Found
      // =========================
      if (!pax) {

        return res.json({

          error:
            'Passenger not found'
        });
      }

      // =========================
      // Membership Status
      // =========================
      let membershipStatus = '';

      if (pax.ffTier === 'V') {

        membershipStatus =
          'Platinum';
      }

      else if (
        pax.ffTier === 'G'
      ) {

        membershipStatus =
          'Gold';
      }

      else if (
        pax.ffTier === 'S'
      ) {

        membershipStatus =
          'Silver';
      }

      const authContext =
        await resolveAuthContextFromRequest(req);
      const permissions = authContext.permissions;

      pax.membershipStatus =
        permissions.canViewMembership ? membershipStatus : null;

      const info240 =
        permissions.canView240Info
          ? await get240InfoByBnAndFlightDate({
              bn: pax.bn,
              flightDate: pax.flightDate
            })
          : null;

      res.json(
        applyPermissionFilter(
          pax,
          permissions,
          info240
        )
      );

    }

    catch (err) {

      console.error(err);

      res.json({

        error:
          'Search failed'
      });
    }
  }
);


// ===============================
// Send Message API
// ===============================
app.post('/send', async (req, res) => {

  try {

    const {
      channelId,
      message
    } = req.body;

    if (!channelId) {

      return res.json({
        error: 'Missing channelId'
      });
    }

    const channel =
      await client.channels.fetch(channelId);

    if (!channel) {

      return res.json({
        error: 'Channel not found'
      });
    }

    if (req.body.embeds) {

  await channel.send({
    content: message || "",
    embeds: req.body.embeds
  });

} else {

  await channel.send(message);
}

    res.json({
      success: true
    });

  }

  catch (err) {

    console.error(err);

    res.json({
      error: 'Send failed'
    });
  }
});
// ===============================
// Start Server
// ===============================
const PORT =
  process.env.PORT || 3000;

app.listen(

  PORT,

  () => {

    console.log(
      `Server running on ${PORT}`
    );
    syncTodayReportSheets();
    setInterval(syncTodayReportSheets, 30 * 60 * 1000);
  }
);
