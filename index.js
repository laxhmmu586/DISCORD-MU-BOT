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
  appendCbsCase,
  getCbsCases,
  updateCbsCase,
  sendCbsCaseEmail

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

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Los_Angeles';

function todayIsoUtc() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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

function hasVipServiceMarker(section) {
  return /(?:^|\s)PSM-\/VIP(?:\s|$)/im.test(section)
    || /(?:^|[\s/])VIP(?:[\s/]|$)/i.test(section);
}

function extractVipNameCandidate(section) {
  const text = String(section || '');
  const namMatch = text.match(/^\s*NAM\s+([A-Z][A-Z/]+VIP)\b/im);
  if (namMatch) return { name: cleanVipPassengerName(namMatch[1]), source: 'NAM' };

  const passengerLine = text.match(/^\s*\d+\.\s*([A-Z][A-Z/]+(?:VIP)?\+?)\b.*?\bBN\s*\d{1,3}\b/im);
  const passengerName = cleanVipName(passengerLine?.[1]);
  if (passengerName.endsWith('VIP')) return { name: cleanVipPassengerName(passengerName), source: 'Passenger Line' };

  if (passengerName && hasVipServiceMarker(text)) {
    return { name: cleanVipPassengerName(passengerName), source: 'VIP Service' };
  }

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

const fscRateSheetSyncCache = new Map();
const syBookingSheetSyncCache = new Map();
const preflightStepCache = new Map();

function preflightCacheKey(syInfo, isoDate, stepKey) {
  return [syInfo?.flightNo || 'SY', isoDate || todayIsoUtc(), stepKey].join('|');
}

function findCrewApiStep(syInfo, stepKey) {
  return syInfo?.crewApis?.steps?.find((step) => step.key === stepKey) || null;
}

function rememberCompletedPreflightSteps(syInfo, isoDate) {
  ['crewApis', 'net'].forEach((stepKey) => {
    const step = findCrewApiStep(syInfo, stepKey);
    if (step?.complete) preflightStepCache.set(preflightCacheKey(syInfo, isoDate, stepKey), { ...step });
  });
}

function applyCachedPreflightStep(syInfo, isoDate, stepKey) {
  const step = findCrewApiStep(syInfo, stepKey);
  const cached = preflightStepCache.get(preflightCacheKey(syInfo, isoDate, stepKey));
  if (!step || !cached?.complete) return false;
  Object.assign(step, { ...cached, cached: true });
  return true;
}

function cacheCompletedPreflightStep(syInfo, isoDate, stepKey) {
  const step = findCrewApiStep(syInfo, stepKey);
  if (step?.complete) preflightStepCache.set(preflightCacheKey(syInfo, isoDate, stepKey), { ...step });
}

async function syncFscRateFromTodaySyLog(log, isoDate) {
  if (isoDate !== todayIsoUtc()) return { skipped: true, reason: 'not today' };
  const cached = fscRateSheetSyncCache.get(isoDate);
  if (cached?.rate) return { ...cached, skipped: true, reason: 'already synced' };

  const rate = extractFscExchangeRate(log);
  if (!rate) return { skipped: true, reason: 'rate not found' };

  try {
    const result = await updateFscExchangeRate(rate);
    const synced = { ...result, skipped: false };
    fscRateSheetSyncCache.set(isoDate, synced);
    return synced;
  } catch (err) {
    return { skipped: true, rate, error: err?.message || 'Sheet sync failed' };
  }
}

function syBookingCountsFromRetMatch(matchArray) {
  if (!Array.isArray(matchArray) || matchArray.length < 4) return null;
  return [matchArray[1], matchArray[2], matchArray[3]];
}

async function syncSyBookingFromTodaySy(syInfo, isoDate) {
  if (isoDate !== todayIsoUtc()) return { skipped: true, reason: 'not today' };
  const cached = syBookingSheetSyncCache.get(isoDate);
  if (cached?.counts) return { ...cached, skipped: true, reason: 'already synced' };

  const counts = syBookingCountsFromRetMatch(syInfo?.reservationTicketed);
  if (!counts) return { skipped: true, reason: 'RET booking not found' };

  try {
    const result = await updateSyBookingCounts(counts);
    const synced = { ...result, skipped: false };
    syBookingSheetSyncCache.set(isoDate, synced);
    return synced;
  } catch (err) {
    return { skipped: true, counts: { first: counts[0], business: counts[1], economy: counts[2] }, error: err?.message || 'Sheet sync failed' };
  }
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
const WARNING_ACK_STORE_PATH = path.join(__dirname, 'warningAcknowledgements.json');
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


async function readWarningAckStore() {
  try {
    const raw = await fs.readFile(WARNING_ACK_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { acknowledgements: {} };
  } catch (err) {
    if (err?.code === 'ENOENT') return { acknowledgements: {} };
    throw err;
  }
}

async function writeWarningAckStore(store) {
  await fs.writeFile(WARNING_ACK_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function pruneWarningAckStore(store) {
  const cutoff = reviewCutoffIso();
  const acknowledgements = store.acknowledgements && typeof store.acknowledgements === 'object' ? store.acknowledgements : {};
  Object.entries(acknowledgements).forEach(([flightKey, rows]) => {
    if (!rows || typeof rows !== 'object') {
      delete acknowledgements[flightKey];
      return;
    }
    Object.entries(rows).forEach(([warningKey, ackList]) => {
      if (!Array.isArray(ackList)) {
        delete rows[warningKey];
        return;
      }
      rows[warningKey] = ackList.filter((ack) => ack?.at && ack.at >= cutoff && ack.by);
      if (!rows[warningKey].length) delete rows[warningKey];
    });
    if (!Object.keys(rows).length) delete acknowledgements[flightKey];
  });
  store.acknowledgements = acknowledgements;
  return store;
}

function sanitizeWarningKey(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 500).toUpperCase();
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


app.get('/warning-acknowledgements', async (req, res) => {
  try {
    const flightNo = String(req.query.flightNo || '').toUpperCase();
    const flightDate = String(req.query.flightDate || '').toUpperCase();
    if (!flightNo || !flightDate) return res.status(400).json({ error: 'Missing flightNo or flightDate' });
    const store = pruneWarningAckStore(await readWarningAckStore());
    await writeWarningAckStore(store);
    const key = reviewFlightKey(flightNo, flightDate);
    return res.json({ acknowledgements: store.acknowledgements[key] || {} });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Warning acknowledgement lookup failed' });
  }
});

app.post('/warning-acknowledgements', async (req, res) => {
  try {
    const flightNo = String(req.body?.flightNo || '').toUpperCase();
    const flightDate = String(req.body?.flightDate || '').toUpperCase();
    const warningKey = sanitizeWarningKey(req.body?.warningKey);
    const reviewer = sanitizeReviewer(req.body?.reviewer);
    if (!flightNo || !flightDate || !warningKey || !reviewer) {
      return res.status(400).json({ error: 'Missing flightNo, flightDate, warningKey, or reviewer' });
    }
    const store = pruneWarningAckStore(await readWarningAckStore());
    const key = reviewFlightKey(flightNo, flightDate);
    store.acknowledgements[key] = store.acknowledgements[key] || {};
    const existing = Array.isArray(store.acknowledgements[key][warningKey]) ? store.acknowledgements[key][warningKey] : [];
    const now = new Date().toISOString();
    const next = existing.filter((ack) => String(ack?.by || '').toLowerCase() !== reviewer.toLowerCase());
    next.push({ by: reviewer, at: now });
    store.acknowledgements[key][warningKey] = next;
    await writeWarningAckStore(store);
    return res.json({ ok: true, acknowledgements: store.acknowledgements[key][warningKey] });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Warning acknowledgement save failed' });
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


function sanitizeCbsText(value, maxLength = 1000) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function makeCbsCaseNumber() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(2, 14);
  return `CBS-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function pdfEscape(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createSimplePdf(lines) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const pageWidth = 612;
  const pageHeight = 792;
  const content = [];
  content.push('0.93 0.95 0.98 rg 0 0 612 792 re f');
  content.push('0 0 0 RG 1 w 36 36 540 720 re S');
  content.push('BT /F1 18 Tf 72 738 Td (CHINA EASTERN AIRLINES) Tj ET');
  content.push('BT /F1 16 Tf 252 710 Td (PROPERTY IRREGULARITY REPORT) Tj ET');
  content.push('BT /F1 10 Tf 420 692 Td (To be issued in BLOCK LETTERS) Tj ET');
  let y = 662;
  const write = (label, value, x = 56, width = 500) => {
    const safeLabel = pdfEscape(label);
    const safeValue = pdfEscape(value || '');
    content.push(`0 0 0 RG 0.5 w ${x} ${y - 5} ${width} 18 re S`);
    content.push(`BT /F1 8 Tf ${x + 4} ${y + 1} Td (${safeLabel}) Tj ET`);
    content.push(`BT /F1 10 Tf ${x + 135} ${y + 1} Td (${safeValue}) Tj ET`);
    y -= 24;
  };
  lines.forEach((item) => write(item[0], item[1]));
  content.push('0 0 0 RG 0.8 w 56 130 500 90 re S');
  content.push('BT /F1 10 Tf 64 202 Td (Baggage sketch / damage reference) Tj ET');
  content.push('56 170 500 0 l S');
  content.push('0 0 0 RG 1 w 92 150 64 32 re S 188 150 64 32 re S 292 148 18 54 re S 326 148 18 54 re S');
  content.push('BT /F1 8 Tf 103 138 Td (SIDE 1) Tj ET BT /F1 8 Tf 199 138 Td (SIDE 2) Tj ET BT /F1 8 Tf 286 138 Td (END 1) Tj ET BT /F1 8 Tf 322 138 Td (END 2) Tj ET');
  content.push('BT /F1 9 Tf 56 84 Td (This report does not involve any acknowledgement of liability.) Tj ET');
  content.push('BT /F1 9 Tf 56 64 Td (Agent signature ____________________    Passenger signature ____________________) Tj ET');
  const stream = content.join('\n');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const streamId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  const pageId = addObject(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

function buildCbsEmailHtml(record) {
  return `<p>Dear Passenger,</p><p>We apologize sincerely for the baggage irregularity reported upon arrival. Your case has been created and the attached PIR PDF is provided for your records.</p><p><strong>Case Number:</strong> ${record.caseNumber}<br><strong>Status:</strong> ${record.status}</p><p>China Eastern Airlines</p>`;
}

function cbsPdfLines(record) {
  return [
    ['Reference Number', record.caseNumber],
    ['Case Type', record.caseType],
    ['Status', record.status],
    ['Passenger name', record.passengerName],
    ['Email', record.email],
    ['Phone', record.phone],
    ['Flight routing', record.flightRoute],
    ['Baggage tag number', record.bagTag],
    ['Permanent address', record.permanentAddress],
    ['Temporary address', record.temporaryAddress],
    ['Bag description', record.ahlBagDescription || record.dprBagInfo],
    ['Bag type', record.ahlBagType || record.dprBagType],
    ['Damage level', record.dprDamageLevel],
    ['Contents / inner damage', record.ahlContents || record.dprInnerDamage]
  ];
}



app.get('/cbs-cases', async (req, res) => {
  try {
    const rows = await getCbsCases();
    return res.json({ rows });
  } catch (err) {
    console.error('CBS case list error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case lookup failed' });
  }
});

app.post('/cbs-cases', async (req, res) => {
  try {
    const body = req.body || {};
    const email = sanitizeCbsText(body.email, 160).toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid passenger email is required' });
    const passengerName = sanitizeCbsText(body.passengerName, 160);
    if (!passengerName) return res.status(400).json({ error: 'Passenger name is required' });
    const caseType = sanitizeCbsText(body.caseType, 10).toUpperCase();
    if (!['AHL', 'DPR'].includes(caseType)) return res.status(400).json({ error: 'Case type must be AHL or DPR' });
    const now = new Date().toISOString();
    const record = {
      caseNumber: makeCbsCaseNumber(),
      caseType,
      status: 'Open',
      passengerName,
      email,
      phone: sanitizeCbsText(body.phone, 80),
      flightRoute: sanitizeCbsText(body.flightRoute, 240),
      bagTag: sanitizeCbsText(body.bagTag, 80).toUpperCase(),
      permanentAddress: sanitizeCbsText(body.permanentAddress, 500),
      temporaryAddress: sanitizeCbsText(body.temporaryAddress, 500),
      temporaryAddressValidUntil: sanitizeCbsText(body.temporaryAddressValidUntil, 40),
      addressAvailable: sanitizeCbsText(body.addressAvailable, 20),
      ahlBagDescription: sanitizeCbsText(body.ahlBagDescription, 500),
      ahlBagBrandTag: sanitizeCbsText(body.ahlBagBrandTag, 200),
      ahlBagType: sanitizeCbsText(body.ahlBagType, 160),
      ahlFeatures: sanitizeCbsText(body.ahlFeatures, 500),
      ahlOtherFeatures: sanitizeCbsText(body.ahlOtherFeatures, 500),
      ahlContents: sanitizeCbsText(body.ahlContents, 1000),
      dprDamageLevel: sanitizeCbsText(body.dprDamageLevel, 40),
      dprBagInfo: sanitizeCbsText(body.dprBagInfo, 500),
      dprBagType: sanitizeCbsText(body.dprBagType, 160),
      dprInnerDamage: sanitizeCbsText(body.dprInnerDamage, 1000),
      submittedAt: now,
      updatedAt: now,
      updateNote: 'Case created'
    };
    await appendCbsCase(record);
    const pdfBuffer = createSimplePdf(cbsPdfLines(record));
    let emailResults = [];
    let emailError = '';
    try {
      emailResults = await sendCbsCaseEmail({
        passengerEmail: record.email,
        subject: `China Eastern Baggage Case ${record.caseNumber}`,
        html: buildCbsEmailHtml(record),
        pdfBuffer,
        filename: `${record.caseNumber}.pdf`
      });
    } catch (mailErr) {
      emailError = mailErr?.message || 'Email send failed';
      console.error('CBS case email error:', mailErr);
    }
    return res.status(201).json({ created: true, record, emailResults, emailError });
  } catch (err) {
    console.error('CBS case create error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case save failed' });
  }
});

app.post('/cbs-cases/:caseNumber/update', async (req, res) => {
  try {
    const status = sanitizeCbsText(req.body?.status, 80) || 'Open';
    const updateNote = sanitizeCbsText(req.body?.updateNote, 500);
    const result = await updateCbsCase(req.params.caseNumber, { status, updateNote });
    if (result.notFound) return res.status(404).json({ error: 'Case not found' });
    return res.json(result);
  } catch (err) {
    console.error('CBS case update error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case update failed' });
  }
});

app.get('/test-baggage-report', async (req, res) => {
  try {
    const rows = await getTestBaggageReportRows({ from: req.query.from, to: req.query.to, bagTag: req.query.bagTag });
    return res.json({ rows, source: 'sheet' });
  } catch (err) {
    console.error('Test baggage report error:', err);
    return res.status(500).json({ error: err?.message || 'Baggage report lookup failed' });
  }
});

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
      status: cleanBodyText(req.body?.status, 80) || (direction === 'inbound' ? 'Bag location update' : ''),
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
        rememberCompletedPreflightSteps(syInfo, isoDate);
        applyCachedPreflightStep(syInfo, isoDate, 'crewApis');
        applyCachedPreflightStep(syInfo, isoDate, 'net');
        try {
          syInfo.fscRateSheetSync = await syncFscRateFromTodaySyLog(log, isoDate);
        } catch (err) {
          console.warn('FSC exchange rate sheet sync skipped:', err?.message || err);
          syInfo.fscRateSheetSync = { skipped: true, error: err?.message || 'Sheet sync failed' };
        }
        try {
          syInfo.bookingSheetSync = await syncSyBookingFromTodaySy(syInfo, isoDate);
        } catch (err) {
          console.warn('SY booking sheet sync skipped:', err?.message || err);
          syInfo.bookingSheetSync = { skipped: true, error: err?.message || 'Sheet sync failed' };
        }
        try {
          syInfo.fscRateSheetSync = await syncFscRateFromTodaySyLog(log, isoDate);
        } catch (err) {
          console.warn('FSC exchange rate sheet sync skipped:', err?.message || err);
          syInfo.fscRateSheetSync = { skipped: true, error: err?.message || 'Sheet sync failed' };
        }
        try {
          syInfo.bookingSheetSync = await syncSyBookingFromTodaySy(syInfo, isoDate);
        } catch (err) {
          console.warn('SY booking sheet sync skipped:', err?.message || err);
          syInfo.bookingSheetSync = { skipped: true, error: err?.message || 'Sheet sync failed' };
        }
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
        const gdQuery = syInfo.crewApis?.gdCheckQuery || null;
        const gdStep = syInfo.crewApis?.steps?.find((step) => step.key === 'gdCheck');
        if (applyCachedPreflightStep(syInfo, isoDate, 'gdCheck')) {
          // Reuse completed GD CHECK result from an earlier refresh.
        } else if (gdStep && gdQuery?.flightNo && gdQuery?.flightDate) {
          const gdSubject = gdQuery.emailSubject || `GD for ${gdQuery.flightNo}/${gdQuery.flightDate}`;
          const gdResult = await getGdCheckEmail(gdQuery.flightNo, gdQuery.emailSubjectDate || gdQuery.flightDate, gdQuery.crew || [], gdSubject);
          gdStep.complete = Boolean(gdResult.complete);
          gdStep.time = gdResult.sentAt ? gdResult.sentAt.slice(11, 19) : '';
          gdStep.searched = true;
          gdStep.details = gdResult;
          gdStep.detailText = gdResult.detailText || '';
          gdStep.reason = gdResult.reason || '';
          gdStep.searchQuery = gdResult.query || '';
          gdStep.authMode = gdResult.authMode || '';
          gdStep.gmailUser = gdResult.userId || '';
          gdStep.searchDate = gdResult.searchDate || '';
          gdStep.subject = gdSubject;
          gdStep.tooltip = gdStep.complete
            ? `GD CHECK complete: ${gdResult.matched || 0}/${gdResult.total || 0} crew matched`
            : `GD CHECK issue: ${gdResult.reason || gdSubject}`;
          cacheCompletedPreflightStep(syInfo, isoDate, 'gdCheck');
        } else if (gdStep) {
          const reason = 'Missing flight number, flight date, or CWD crew list for GD search.';
          gdStep.complete = false;
          gdStep.searched = true;
          gdStep.reason = reason;
          gdStep.detailText = `Reason: ${reason}`;
          gdStep.tooltip = `GD CHECK not searched: ${reason}`;
        }
        const nextDayQuery = syInfo.crewApis?.nextDayInfoQuery || null;
        const nextDayStep = syInfo.crewApis?.steps?.find((step) => step.key === 'nextDayInfo');
        if (applyCachedPreflightStep(syInfo, isoDate, 'nextDayInfo')) {
          // Reuse completed NEXTDAY INFO result from an earlier refresh.
        } else if (nextDayStep && nextDayQuery?.flightNo && nextDayQuery?.flightDate) {
          const nextDaySubject = nextDayQuery.emailSubject || `${nextDayQuery.flightNo} ${nextDayQuery.flightDate} flight information details`;
          const nextDayEmail = await getNextDayInfoEmail(nextDayQuery.flightNo, nextDayQuery.emailSubjectDate || nextDayQuery.flightDate, nextDaySubject);
          nextDayStep.complete = Boolean(nextDayEmail.sent || nextDayEmail.found);
          nextDayStep.time = nextDayEmail.sentAt ? nextDayEmail.sentAt.slice(11, 19) : '';
          nextDayStep.searched = true;
          nextDayStep.details = nextDayEmail.details || {};
          const diagnosticLines = [
            ['Reason', nextDayEmail.reason],
            ['Expected Subject', nextDaySubject],
            ['Gmail Query', nextDayEmail.query],
            ['Auth Mode', nextDayEmail.authMode],
            ['Gmail User', nextDayEmail.userId],
            ['Search Date', nextDayEmail.searchDate],
            ['Recent Matches', nextDayEmail.rawMatchCount === undefined ? '' : String(nextDayEmail.rawMatchCount)],
            ['Today Matches', nextDayEmail.todayMatchCount === undefined ? '' : String(nextDayEmail.todayMatchCount)]
          ].filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `${label}: ${value}`).join('\n');
          nextDayStep.detailText = nextDayStep.complete ? (nextDayEmail.detailText || '') : diagnosticLines;
          nextDayStep.reason = nextDayEmail.reason || '';
          nextDayStep.searchQuery = nextDayEmail.query || '';
          nextDayStep.authMode = nextDayEmail.authMode || '';
          nextDayStep.gmailUser = nextDayEmail.userId || '';
          nextDayStep.searchDate = nextDayEmail.searchDate || '';
          nextDayStep.subject = nextDaySubject;
          nextDayStep.tooltip = nextDayStep.complete
            ? `NEXTDAY INFO sent email found: ${nextDaySubject}`
            : `NEXTDAY INFO not found: ${nextDayEmail.reason || nextDaySubject}`;
          cacheCompletedPreflightStep(syInfo, isoDate, 'nextDayInfo');
        } else if (nextDayStep) {
          const reason = 'Missing flight number or next-day email subject date for Gmail search.';
          nextDayStep.complete = false;
          nextDayStep.searched = true;
          nextDayStep.reason = reason;
          nextDayStep.detailText = `Reason: ${reason}`;
          nextDayStep.tooltip = `NEXTDAY INFO not searched: ${reason}`;
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
