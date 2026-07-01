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
  getCbsMissingBagReports,
  markCbsMissingBagCase,
  acknowledgeCbsMissingBag,
  sendCbsCaseEmail,
  appendCbsScanRecord,
  appendCbsScanNbrdBns,
  getCbsScanRecords,
  setCbsScanRecordEntered,
  setCbsScanRecordsEntered,
  readNotesDriveStore,
  writeNotesDriveStore

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
  (syInfo?.crewApis?.steps || []).forEach((step) => {
    if (step?.key && step.complete) preflightStepCache.set(preflightCacheKey(syInfo, isoDate, step.key), { ...step });
  });
}

function applyCachedCompletedPreflightSteps(syInfo, isoDate) {
  (syInfo?.crewApis?.steps || []).forEach((step) => {
    if (step?.key) applyCachedPreflightStep(syInfo, isoDate, step.key);
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


async function refreshSyPreflightEmailChecks(syInfo, isoDate) {
  const gdQuery = syInfo.crewApis?.gdCheckQuery || null;
  const gdStep = syInfo.crewApis?.steps?.find((step) => step.key === 'gdCheck');
  if (!applyCachedPreflightStep(syInfo, isoDate, 'gdCheck') && gdStep && gdQuery?.flightNo && gdQuery?.flightDate) {
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
  } else if (gdStep && !gdQuery?.flightNo) {
    gdStep.searched = true;
    gdStep.reason = 'Missing flight number, flight date, or CWD crew list for GD search.';
  }

  const nextDayQuery = syInfo.crewApis?.nextDayInfoQuery || null;
  const nextDayStep = syInfo.crewApis?.steps?.find((step) => step.key === 'nextDayInfo');
  if (!applyCachedPreflightStep(syInfo, isoDate, 'nextDayInfo') && nextDayStep && nextDayQuery?.flightNo && nextDayQuery?.flightDate) {
    const nextDaySubject = nextDayQuery.emailSubject || `${nextDayQuery.flightNo} ${nextDayQuery.flightDate} flight information details`;
    const nextDayEmail = await getNextDayInfoEmail(nextDayQuery.flightNo, nextDayQuery.emailSubjectDate || nextDayQuery.flightDate, nextDaySubject);
    nextDayStep.complete = Boolean(nextDayEmail.sent || nextDayEmail.found);
    nextDayStep.time = nextDayEmail.sentAt ? nextDayEmail.sentAt.slice(11, 19) : '';
    nextDayStep.searched = true;
    nextDayStep.details = nextDayEmail.details || {};
    nextDayStep.detailText = nextDayStep.complete ? (nextDayEmail.detailText || '') : '';
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
  } else if (nextDayStep && !nextDayQuery?.flightNo) {
    nextDayStep.searched = true;
    nextDayStep.reason = 'Missing flight number or next-day email subject date for Gmail search.';
  }
}



const deferredSyRefreshes = new Map();

async function refreshDeferredSyData(syInfo, log, isoDate) {
  const key = preflightCacheKey(syInfo, isoDate, 'deferredSyData');
  if (deferredSyRefreshes.has(key)) return deferredSyRefreshes.get(key);

  const work = (async () => {
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

    await refreshSyPreflightEmailChecks(syInfo, isoDate);
  })().finally(() => {
    deferredSyRefreshes.delete(key);
  });

  deferredSyRefreshes.set(key, work);
  return work;
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

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '60mb';

app.use(
  express.json({ limit: JSON_BODY_LIMIT })
);

app.use(
  express.static('public')
);

app.get(['/scan.html', '/scan'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'public', 'scan.html'));
});

app.get(['/m-board.html', '/m-board'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'public', 'm-board.html'));
});

const REVIEW_STORE_PATH = path.join(__dirname, 'securityReviews.json');
const WARNING_ACK_STORE_PATH = path.join(__dirname, 'warningAcknowledgements.json');
const NOTES_STORE_PATH = path.join(__dirname, 'notesStore.json');
const NOTES_EDITOR_EMAIL = 'lake@mu.com';
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



async function readNotesStore() {
  return readNotesDriveStore();
}

async function writeNotesStore(store) {
  await writeNotesDriveStore(store);
}

function sanitizeNoteText(value, max = 20000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

function sanitizeNote(note) {
  const now = new Date().toISOString();
  const id = sanitizeNoteText(note?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, 120) || `${Date.now()}`;
  return {
    id,
    section: sanitizeNoteText(note?.section || 'General', 120).trim() || 'General',
    title: sanitizeNoteText(note?.title || 'Untitled', 200).trim() || 'Untitled',
    content: sanitizeNoteText(note?.content || '', 20000),
    updatedAt: sanitizeNoteText(note?.updatedAt || now, 60) || now
  };
}

function sanitizeNotesList(notes) {
  const seen = new Set();
  return (Array.isArray(notes) ? notes : [])
    .map(sanitizeNote)
    .filter((note) => {
      if (seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    })
    .slice(0, 1000);
}

function requestEditorEmail(req) {
  return String(req.body?.editorEmail || req.headers['x-editor-email'] || '').trim().toLowerCase();
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



app.get('/notes', async (req, res) => {
  try {
    const store = await readNotesStore();
    return res.json({ notes: sanitizeNotesList(store.notes) });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Notes lookup failed' });
  }
});

app.post('/notes', async (req, res) => {
  try {
    if (requestEditorEmail(req) !== NOTES_EDITOR_EMAIL) {
      return res.status(403).json({ error: 'Only lake@mu.com can edit notes' });
    }
    const notes = sanitizeNotesList(req.body?.notes);
    const store = { notes, updatedAt: new Date().toISOString(), updatedBy: NOTES_EDITOR_EMAIL };
    await writeNotesStore(store);
    return res.json({ ok: true, notes: store.notes, updatedAt: store.updatedAt });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Notes save failed' });
  }
});

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

function normalizeCbsBagTag(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/^([A-Z]{2})(\d{6,})$/);
  if (match) return `${match[1]}${match[2].slice(-6)}`;
  return normalized;
}

function normalizeCbsBagTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,/]+/);
  return source.map((item) => normalizeCbsBagTag(item)).filter(Boolean).join(' / ');
}

async function makeCbsCaseNumber() {
  const today = todayIsoUtc();
  const yy = today.slice(2, 4);
  const mm = today.slice(5, 7);
  const monthKey = today.slice(0, 7);
  const prefix = `LAX MU${yy}${mm}`;
  const cases = await getCbsCases().catch(() => []);
  const usedSequences = new Set();
  let sameMonthRows = 0;
  cases.forEach((row) => {
    const caseNumber = String(row.caseNumber || '').toUpperCase();
    const match = caseNumber.match(new RegExp(`^${prefix}(\\d{2})$`));
    if (match) usedSequences.add(Number(match[1]));
    if (match || String(row.submittedAt || row.submitDate || '').startsWith(monthKey)) sameMonthRows += 1;
  });
  let nextSequence = Math.max(0, sameMonthRows, ...usedSequences) + 1;
  while (usedSequences.has(nextSequence)) nextSequence += 1;
  return `${prefix}${String(nextSequence).padStart(2, '0')}`;
}

function pdfSafeText(value) {
  return String(value || '')
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfEscape(value) {
  return pdfSafeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfText(content, x, y, size = 9) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(content)}) Tj ET`;
}

function pdfBoxText(content, x, y, w, h, size = 8) {
  return [
    `0 0 0 RG 0.5 w ${x} ${y} ${w} ${h} re S`,
    pdfText(content, x + 4, y + Math.max(5, Math.floor(h / 2) - 3), size)
  ];
}

function jpegFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[1], 'base64');
  for (let i = 0; i < buffer.length - 9; i += 1) {
    if (buffer[i] === 0xFF && [0xC0, 0xC2].includes(buffer[i + 1])) {
      return { buffer, width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
    }
  }
  return { buffer, width: 560, height: 180 };
}

function createPirPdf(record) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const damageImage = jpegFromDataUrl(record.damageSketch);
  const signatureImage = jpegFromDataUrl(record.passengerSignatureDataUrl);
  const imageRefs = {};
  if (damageImage) imageRefs.Damage = addObject(`<< /Type /XObject /Subtype /Image /Width ${damageImage.width} /Height ${damageImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${damageImage.buffer.length} >>\nstream\n${damageImage.buffer.toString('binary')}\nendstream`);
  if (signatureImage) imageRefs.Signature = addObject(`<< /Type /XObject /Subtype /Image /Width ${signatureImage.width} /Height ${signatureImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${signatureImage.buffer.length} >>\nstream\n${signatureImage.buffer.toString('binary')}\nendstream`);
  const content = [];
  content.push('0.97 0.98 1 rg 0 0 612 792 re f');
  content.push('0 0 0 RG 0 0 0 rg 1 w 36 36 540 720 re S');
  content.push(pdfText('PROPERTY IRREGULARITY REPORT (PIR)', 54, 724, 15));
  content.push(pdfText(`CASE ID: ${record.caseNumber || ''}`, 410, 724, 10));
  content.push(pdfText(`CASE TYPE: ${record.caseType || ''}`, 410, 710, 10));
  content.push(pdfText('FOR INQUIRIES PLEASE EMAIL:', 390, 696, 9));
  content.push(pdfText('LAXHMMU@GMAIL.COM', 390, 682, 9));
  const section = (title, y) => {
    content.push('0.78 0.78 0.78 rg');
    content.push(`44 ${y} 524 18 re f`);
    content.push('0 0 0 rg');
    content.push(pdfText(title, 50, y + 5, 10));
  };
  const box = (x, y, w, h, text, size = 8) => {
    content.push(`0 0 0 RG 0.5 w ${x} ${y} ${w} ${h} re S`);
    if (text) content.push(pdfText(text, x + 5, y + h - 13, size));
  };
  const coded = (code, label, value, x, y, w, h) => {
    box(x, y, 26, h, code, 8);
    box(x + 26, y, w - 26, h, [label, value || ''].filter(Boolean).join(' ').slice(0, 95), 7.5);
  };
  section('PASSENGER INFORMATION', 642);
  coded('NM', 'Passenger Name', record.passengerName, 52, 612, 318, 24);
  coded('PA', 'Address', record.permanentAddress, 52, 574, 318, 38);
  coded('TA', 'Temporary Address', record.temporaryAddress, 52, 536, 318, 38);
  coded('PN', 'Phone', record.phone, 382, 602, 170, 22);
  coded('TK', 'Ticket', record.ticketNumber, 382, 580, 170, 22);
  coded('CL', '', record.classOfTravel, 382, 558, 84, 22);
  coded('OR', 'Origin', record.departureOrigin, 466, 558, 86, 22);
  coded('EA', 'Email', record.email, 382, 536, 170, 22);
  section('FLIGHT / BAGGAGE INFORMATION', 506);
  coded('BR', 'Baggage Routing', record.flightRoute, 52, 476, 500, 26);
  coded('TN', 'Bag Tag Number', record.bagTag, 52, 450, 500, 26);
  coded('DB', 'Destination on Bags', record.destinationOnBags, 52, 424, 500, 26);
  coded('BD', 'Baggage Details', record.ahlBagDescription || record.dprBagInfo, 52, 386, 500, 38);
  coded('CD', 'Contents / Inner Damage', record.contentsDetails || record.dprInnerDamage, 52, 348, 500, 38);
  if (damageImage) {
    box(52, 242, 500, 96, 'Damage Sketch', 8);
    content.push(`q 280 0 0 78 166 252 cm /Damage Do Q`);
  }
  section('CONTENTS', 214);
  box(52, 186, 160, 24, 'CATEGORY', 8);
  box(212, 186, 340, 24, 'DESCRIPTION', 8);
  const items = Array.isArray(record.contentsRows) && record.contentsRows.length
    ? record.contentsRows
    : String(record.contentsDetails || '').split(/\s+\/\s+/).filter(Boolean).map((value) => ({ category: '', description: value }));
  let itemY = 162;
  for (let index = 0; index < 4; index += 1) {
    const item = items[index] || {};
    box(52, itemY, 160, 24, String(item.category || '').slice(0, 24), 8);
    box(212, itemY, 340, 24, String(item.description || '').slice(0, 64), 8);
    itemY -= 24;
  }
  section('SIGNATURE', 72);
  content.push(pdfText(`Date of issue ${record.issueDate || ''}`, 56, 50, 9));
  if (signatureImage) {
    box(390, 42, 160, 28, '', 8);
    content.push(`q 150 0 0 24 395 44 cm /Signature Do Q`);
  } else {
    content.push(pdfText('Passenger Signature __________________________', 330, 50, 9));
  }
  const stream = content.join('\n');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const streamId = addObject(`<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`);
  const xObjectEntries = [imageRefs.Damage ? `/Damage ${imageRefs.Damage} 0 R` : '', imageRefs.Signature ? `/Signature ${imageRefs.Signature} 0 R` : ''].filter(Boolean).join(' ');
  const resources = `<< /Font << /F1 ${fontId} 0 R >> ${xObjectEntries ? `/XObject << ${xObjectEntries} >>` : ''} >>`;
  const pageId = addObject(`<< /Type /Page /Parent ${objects.length + 2} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${streamId} 0 R >>`);
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

function cbsPassengerMessageHtml(language, caseType = 'AHL') {
  const isDpr = String(caseType || '').toUpperCase() === 'DPR';
  if (language === 'zh' && isDpr) {
    return [
      '<h2>尊敬的旅客：</h2>',
      '<p>对于您的托运行李在运输过程中发生损坏，我们深表歉意，并感谢您的理解与配合。</p>',
      '<p>为了尽快协助您处理此次行李损坏事件，本公司将根据相关规定对行李损坏情况进行调查及评估。请您妥善保留损坏行李、行李牌（Bag Tag）、登机牌及其他相关文件，以便后续核实及处理。</p>',
      '<p>如需进一步检查、维修评估或提交补充资料，我们的工作人员将与您联系并提供协助。您也可随时致电本公司当地办事处查询处理进度，我们的地勤人员将竭诚为您提供所需信息。</p>',
      '<p>若您委托他人代为办理相关手续，请确保受委托人携带您的亲笔授权委托书、行李损坏报告单、您的护照（或护照复印件）以及受委托人本人的有效身份证件。</p>',
      '<p>再次对本次行李损坏给您带来的不便表示诚挚歉意。我们将尽最大努力协助您完成后续处理，并感谢您的理解与支持。</p>',
      '<p>中国东方航空公司</p>'
    ].join('');
  }
  if (isDpr) {
    return [
      '<h2>Dear Passenger,</h2>',
      '<p>We sincerely apologize for the damage to your checked baggage during transportation and appreciate your understanding and cooperation.</p>',
      '<p>To assist you as quickly as possible, we will investigate and assess the damage to your baggage in accordance with applicable regulations and procedures. Please retain the damaged baggage, baggage claim tag (Bag Tag), boarding pass, and any other relevant documents for verification and processing purposes.</p>',
      '<p>Should further inspection, repair assessment, or additional documentation be required, our staff will contact you and provide the necessary assistance. You may also contact our local office at any time to inquire about the status of your claim. Our ground service staff will be pleased to assist you with any information you may need.</p>',
      '<p>If you authorize another person to handle the claim on your behalf, the authorized representative must present your signed authorization letter, the baggage damage report, your passport (or a copy of your passport), and the representative\'s valid identification document.</p>',
      '<p>Once again, we sincerely apologize for the inconvenience caused by the damage to your baggage. We will make every effort to assist you with the resolution of this matter and appreciate your patience and understanding.</p>',
      '<p>China Eastern Airlines</p>'
    ].join('');
  }
  if (language === 'zh') {
    return [
      '<h2>亲爱的旅客：</h2>',
      '<p>我们对您到达目的地后未能即时领回所交运的行李深表歉意，并谨此保证本公司将竭尽所能找回您的行李。</p>',
      '<p>从您报失开始，我们立即采用已接驳全球各航空公司之电脑行李查询系统展开追查服务，并将于寻获后告知您。我们会尽力向您报告进展情况。如欲查询，您也可致电我们在各地的办事处，我们的地勤人员当乐意提供所需资料。</p>',
      '<p>一旦您的行李安然寻回，我们会立即通知您，并在当地政府有关当局许可之情况下尽快安排送回。如果行李由于海关问题或因破损需您来提取时，请带好行李报失单和护照。</p>',
      '<p>如果您委托他人前来领取您的行李，必须让受委托人带上您的亲笔委托书、行李报失单、您的护照、（或影印本）及其本人的身份证。</p>',
      '<p>再次对由于行李意外引致的不便表示歉意。</p>',
      '<p>中国东方航空公司</p>'
    ].join('');
  }
  return [
    '<h2>Dear Passenger,</h2>',
    '<p>We sincerely apologize that your checked baggage was not available upon your arrival. Please be assured that every possible step is being taken to locate your missing baggage or articles.</p>',
    '<p>Tracing efforts began as soon as you reported the delay to our Baggage Service Agent using the IATA WorldTracer worldwide baggage tracing computer system.</p>',
    '<p>Our ground staff will keep you informed of the progress. If you have any questions, please feel free to contact us at any time. We will be pleased to provide any further information you may require.</p>',
    '<p>As soon as your baggage is located, we will notify you and arrange delivery where permitted by local government authorities. If your baggage requires customs clearance or must be collected because of damage, please bring the P.I.R. form and your passport to the airport.</p>',
    '<p>If someone else collects the baggage on your behalf, they should bring a letter of authorization, your passport or a photocopy of it, the P.I.R. form, and their ID card.</p>',
    '<p>Once again, please accept our sincere apologies for this unfortunate incident and the inconvenience it has caused.</p>',
    '<p>Yours sincerely,<br>China Eastern Airlines</p>'
  ].join('');
}

function buildCbsEmailHtml(record) {
  return `${cbsPassengerMessageHtml(record.language, record.caseType)}<p><strong>Case ID:</strong> ${record.caseNumber}</p>`;
}

function buildCbsFlightRoute(body) {
  const rows = Array.isArray(body.flightRows) ? body.flightRows : [];
  const normalizedRows = rows.map((row) => ({
    flightNo: sanitizeCbsText(row?.flightNo, 20).toUpperCase(),
    flightDate: sanitizeCbsText(row?.flightDate, 20).toUpperCase(),
    destination: sanitizeCbsText(row?.destination, 20).toUpperCase()
  })).filter((row) => row.flightNo || row.flightDate || row.destination);
  if (normalizedRows.length) {
    return normalizedRows.map((row) => [row.flightNo, row.flightDate, row.destination].filter(Boolean).join(' ')).join(' / ');
  }
  return sanitizeCbsText(body.flightRoute, 240).toUpperCase();
}

function buildCbsContentsRows(body) {
  const rows = Array.isArray(body.contentsRows) ? body.contentsRows : [];
  return rows.map((row) => ({
    category: sanitizeCbsText(row?.category, 80),
    description: sanitizeCbsText(row?.description, 300)
  })).filter((row) => row.category || row.description);
}

function cbsContentsText(rows) {
  return rows.map((row) => [row.category, row.description].filter(Boolean).join(': ')).join(' / ');
}


function cbsEmailErrorMessage(err) {
  const message = err?.message || 'Email send failed';
  if (/insufficient permission|insufficient authentication scopes|forbidden|permission/i.test(message)) {
    return 'Gmail insufficient permission. Please regenerate GOOGLE_REFRESH_TOKEN/GMAIL_REFRESH_TOKEN using get-token.js with gmail.send scope, then redeploy/restart.';
  }
  return message;
}

function cbsPdfLines(record) {
  return [
    ['Reference Number', record.caseNumber],
    ['Case Type', record.caseType],
    ['Status', record.status],
    ['Passenger name', record.passengerName],
    ['Email', record.email],
    ['Phone', record.phone],
    ['Origin', record.departureOrigin],
    ['Flight routing', record.flightRoute],
    ['Baggage tag number', record.bagTag],
    ['Destination on Bags', record.destinationOnBags],
    ['Permanent address', record.permanentAddress],
    ['Temporary address', record.temporaryAddress],
    ['Bag description', record.ahlBagDescription || record.dprBagInfo],
    ['Bag type', record.ahlBagType || record.dprBagType],
    ['Damage level', record.dprDamageLevel],
    ['Contents / inner damage', record.ahlContents || record.dprInnerDamage]
  ];
}



function sanitizeCbsAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  const maxAttachments = 8;
  const maxTotalBytes = 10 * 1024 * 1024;
  let totalBytes = 0;
  return list.slice(0, maxAttachments).map((item, index) => {
    const filename = sanitizeCbsText(item?.filename, 120) || `attachment-${index + 1}`;
    const mimeType = sanitizeCbsText(item?.mimeType, 120) || 'application/octet-stream';
    const contentBase64 = String(item?.contentBase64 || '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) return null;
    const bytes = Math.floor((contentBase64.length * 3) / 4);
    totalBytes += bytes;
    if (totalBytes > maxTotalBytes) return null;
    const attachmentType = sanitizeCbsText(item?.attachmentType, 40);
    return { filename, mimeType, contentBase64, attachmentType };
  }).filter(Boolean);
}


function missingRequiredCbsAttachmentTypes(attachments = []) {
  const uploadedTypes = new Set(attachments.map((item) => String(item.attachmentType || '').trim().toLowerCase()));
  return ['passport', 'boardingpass', 'bagtag'].filter((type) => !uploadedTypes.has(type));
}


function buildCbsUpdateFields(update = {}) {
  const type = sanitizeCbsText(update.type, 40).toLowerCase();
  if (!['worldtracer', 'rush', 'location', 'shipping', 'closed'].includes(type)) return null;
  const comment = sanitizeCbsText(update.comment, 500);
  if (type === 'worldtracer') {
    const fileNumber = sanitizeCbsText(update.fileNumber || update.worldTracerFileNumber, 120).toUpperCase();
    if (!fileNumber) return null;
    return { status: 'WorldTracer', updateNote: `WORLDTRACER | File number: ${fileNumber}`, updateEvent: { key: 'worldtracer', title: 'Update WorldTracer', fields: [['File Number', fileNumber]] } };
  }
  if (type === 'rush') {
    const rushTagNumber = sanitizeCbsText(update.rushTagNumber, 80).toUpperCase();
    const rushToWhere = sanitizeCbsText(update.rushToWhere, 120).toUpperCase();
    const akeNumber = sanitizeCbsText(update.akeNumber, 80).toUpperCase();
    const worldTracerFileNumber = sanitizeCbsText(update.worldTracerFileNumber, 120).toUpperCase();
    if (!rushTagNumber || !rushToWhere || !akeNumber) return null;
    return { status: 'Rush', updateNote: `RUSH | Rush tag: ${rushTagNumber} | Rush to: ${rushToWhere} | AKE: ${akeNumber}${worldTracerFileNumber ? ` | WorldTracer: ${worldTracerFileNumber}` : ''}${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'rush', title: 'Update Rush', fields: [['Rush Tag Number', rushTagNumber], ['Rush To Where', rushToWhere], ['AKE Number', akeNumber], ...(worldTracerFileNumber ? [['WorldTracer', worldTracerFileNumber]] : []), ...(comment ? [['Comment', comment]] : [])] } };
  }
  if (type === 'location') {
    const location = sanitizeCbsText(update.location, 160).toUpperCase();
    if (!location) return null;
    return { status: 'Bag Location Update', updateNote: `BAG LOCATION UPDATE | Location: ${location}${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'location', title: 'Update Bag Location', fields: [['Location', location], ...(comment ? [['Comment', comment]] : [])] } };
  }
  if (type === 'closed') {
    return { status: 'Closed', updateNote: `CASE CLOSE${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'closed', title: 'Case Close', fields: comment ? [['Comment', comment]] : [] } };
  }
  const trackingNumber = sanitizeCbsText(update.trackingNumber, 160).toUpperCase();
  const shippingTo = sanitizeCbsText(update.shippingTo, 300);
  if (!trackingNumber || !shippingTo) return null;
  return { status: 'Shipping', updateNote: `SHIPPING | Tracking: ${trackingNumber} | Ship to: ${shippingTo}${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'shipping', title: 'Update Shipping', fields: [['Tracking Number', trackingNumber], ['Ship To', shippingTo], ...(comment ? [['Comment', comment]] : [])] } };
}



app.get('/cbs-missing-bags', async (req, res) => {
  try {
    const sync = String(req.query?.sync || 'true').toLowerCase() !== 'false';
    const result = await getCbsMissingBagReports({ sync });
    return res.json(result);
  } catch (err) {
    console.error('CBS missing bag report error:', err);
    return res.status(500).json({ error: err?.message || 'CBS missing bag report failed' });
  }
});

app.post('/cbs-missing-bags/:rowNumber/create-case', async (req, res) => {
  try {
    const rowNumber = Number(req.params.rowNumber);
    const report = await getCbsMissingBagReports({ sync: false });
    const missing = (report.rows || []).find((row) => Number(row.rowNumber) === rowNumber);
    if (!missing) return res.status(404).json({ error: 'Missing bag row not found' });
    if (missing.caseNumber) return res.json({ created: false, caseNumber: missing.caseNumber, record: missing });
    if (!normalizeCbsBagTags(missing.bagTag || req.body?.bagTag)) return res.status(400).json({ error: 'Bag tag is required to create a case' });
    const now = new Date().toISOString();
    const caseNumber = await makeCbsCaseNumber();
    const bagTag = normalizeCbsBagTags(missing.bagTag || req.body?.bagTag);
    const record = {
      caseNumber,
      caseType: 'AHL',
      status: 'Open',
      passengerName: sanitizeCbsText(missing.passengerName, 160) || 'UNKNOWN',
      email: '',
      phone: '',
      ticketNumber: '',
      classOfTravel: '',
      departureOrigin: '',
      language: 'en',
      flightRoute: '',
      bagTag,
      destinationOnBags: sanitizeCbsText(missing.destination, 80).toUpperCase(),
      permanentAddress: '',
      temporaryAddress: '',
      temporaryAddressValidUntil: '',
      addressAvailable: '',
      ahlBagDescription: 'Created from Missing Bag Report',
      ahlBagBrandTag: '',
      ahlBagType: '',
      ahlFeatures: '',
      ahlOtherFeatures: '',
      ahlContents: '',
      dprDamageLevel: '',
      dprBagInfo: '',
      dprBagType: '',
      dprInnerDamage: '',
      contentsRows: [],
      contentsDetails: '',
      issueDate: todayIsoUtc(),
      passengerSignature: '',
      passengerSignatureDataUrl: '',
      damageSketch: '',
      submittedAt: now,
      updatedAt: now,
      updateNote: `Created from Missing Bag Report row ${rowNumber} | Bag tag: ${bagTag}`
    };
    await appendCbsCase(record);
    await markCbsMissingBagCase(rowNumber, caseNumber);
    return res.status(201).json({ created: true, caseNumber, record });
  } catch (err) {
    console.error('CBS missing bag create case error:', err);
    return res.status(500).json({ error: err?.message || 'CBS missing bag case creation failed' });
  }
});


app.post('/cbs-missing-bags/:rowNumber/acknowledge', async (req, res) => {
  try {
    const result = await acknowledgeCbsMissingBag(req.params.rowNumber);
    if (result.notFound) return res.status(404).json({ error: 'Missing bag row not found' });
    return res.json(result);
  } catch (err) {
    console.error('CBS missing bag acknowledge error:', err);
    return res.status(500).json({ error: err?.message || 'CBS missing bag acknowledge failed' });
  }
});


function parseCbsPdf417(rawValue = '') {
  const rawScan = String(rawValue || '').trim();
  const compact = rawScan.replace(/\s+/g, ' ');
  const flightMatch = compact.match(/\b(?:[A-Z]{6})?MU\s*(\d{3,4})\b/i);
  const flightNumber = flightMatch?.[1]?.padStart(4, '0') || '';
  if (!flightNumber) throw new Error('Flight not found.');
  if (flightNumber !== '0586') {
    const err = new Error('wrong flight');
    err.code = 'WRONG_FLIGHT';
    err.flight = flightNumber;
    throw err;
  }

  const detailMatch = rawScan.match(/(?:^|\D)0*(\d{1,3}[A-Z])(\d{3,4})\b/i);
  if (!detailMatch) throw new Error('Seat/BN segment not found.');
  const seat = detailMatch[1].toUpperCase().replace(/^0+(?=\d)/, '');
  return {
    flight: flightNumber,
    seat,
    bn: detailMatch[2],
    rawScan
  };
}

app.post('/cbs-scan', async (req, res) => {
  try {
    const parsed = parseCbsPdf417(req.body?.rawScan || req.body?.raw || req.body?.text || '');
    const saved = await appendCbsScanRecord(parsed);
    return res.json({ ok: true, ...saved });
  } catch (err) {
    const status = err?.code === 'DUPLICATE_BN' || err?.code === 'NBRD_MESSAGE' ? 409 : (err?.code === 'WRONG_FLIGHT' ? 400 : 422);
    return res.status(status).json({ error: err?.message || 'CBS scan save failed', code: err?.code || 'SCAN_ERROR', flight: err?.flight || '', bn: err?.bn || '', detail: err?.detail || '' });
  }
});


app.get('/cbs-scan/records', async (req, res) => {
  try {
    const rows = await getCbsScanRecords();
    return res.json({ ok: true, rows });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'CBS scan records load failed', code: err?.code || 'CBS_SCAN_RECORDS_ERROR' });
  }
});



app.post('/cbs-scan/records/entered', async (req, res) => {
  try {
    const result = await setCbsScanRecordsEntered(req.body?.rowNumbers || [], req.body?.entered === true);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'CBS scan rows update failed', code: err?.code || 'CBS_SCAN_ROWS_UPDATE_ERROR' });
  }
});

app.post('/cbs-scan/records/:rowNumber/entered', async (req, res) => {
  try {
    const result = await setCbsScanRecordEntered(req.params.rowNumber, req.body?.entered === true);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'CBS scan row update failed', code: err?.code || 'CBS_SCAN_ROW_UPDATE_ERROR' });
  }
});

app.post('/cbs-scan/nbrd-bns', async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : (Array.isArray(req.body?.bns) ? req.body.bns : [req.body?.bn].filter(Boolean));
    const result = await appendCbsScanNbrdBns(entries, { replace: req.body?.replace === true });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'NBRD BN save failed', code: err?.code || 'NBRD_SAVE_ERROR' });
  }
});

app.get('/cbs-cases', async (req, res) => {
  try {
    const rows = await getCbsCases();
    return res.json({ rows });
  } catch (err) {
    console.error('CBS case list error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case lookup failed' });
  }
});


app.post('/cbs-cases/from-baggage/:bagTag', async (req, res) => {
  try {
    const bagTag = normalizeTestBagTag(req.params.bagTag || req.body?.bagTag);
    if (!isValidTestBagTag(bagTag)) return res.status(400).json({ error: 'Bag tag must match MU123456 format' });
    const baggage = await findTestBaggageByTag(bagTag);
    if (!baggage) return res.status(404).json({ error: 'Baggage record not found' });
    const existingCase = (await getCbsCases()).find((row) => String(row.bagTag || '').split(/\s*\/\s*/).some((tag) => normalizeCbsBagTag(tag) === bagTag));
    if (existingCase?.caseNumber) return res.json({ created: false, caseNumber: existingCase.caseNumber, record: existingCase });
    const now = new Date().toISOString();
    const caseNumber = await makeCbsCaseNumber();
    const flightRoute = [baggage.flight, baggage.date].map((value) => sanitizeCbsText(value, 40)).filter(Boolean).join(' ');
    const record = {
      caseNumber,
      caseType: 'AHL',
      status: 'Open',
      passengerName: 'UNKNOWN',
      email: '',
      phone: '',
      ticketNumber: '',
      classOfTravel: '',
      departureOrigin: '',
      language: 'en',
      flightRoute,
      bagTag,
      destinationOnBags: '',
      permanentAddress: '',
      temporaryAddress: '',
      temporaryAddressValidUntil: '',
      addressAvailable: '',
      ahlBagDescription: 'Created from Baggage search',
      ahlBagBrandTag: '',
      ahlBagType: sanitizeCbsText(baggage.bagType, 160),
      ahlFeatures: '',
      ahlOtherFeatures: '',
      ahlContents: '',
      dprDamageLevel: '',
      dprBagInfo: '',
      dprBagType: '',
      dprInnerDamage: '',
      contentsRows: [],
      contentsDetails: '',
      issueDate: todayIsoUtc(),
      passengerSignature: '',
      passengerSignatureDataUrl: '',
      damageSketch: '',
      submittedAt: now,
      updatedAt: now,
      updateNote: `Created from Baggage search | Bag tag: ${bagTag} | Status: ${sanitizeCbsText(baggage.currentStatus || baggage.status, 120)} | Flight: ${flightRoute}`
    };
    await appendCbsCase(record);
    return res.status(201).json({ created: true, caseNumber, record });
  } catch (err) {
    console.error('CBS baggage create case error:', err);
    return res.status(500).json({ error: err?.message || 'CBS baggage case creation failed' });
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
    const firstFlight = Array.isArray(body.flightRows) ? body.flightRows[0] || {} : {};
    if (!sanitizeCbsText(body.phone, 80)) return res.status(400).json({ error: 'Phone is required' });
    if (!sanitizeCbsText(firstFlight.flightNo, 20) || !sanitizeCbsText(firstFlight.flightDate, 20) || !sanitizeCbsText(firstFlight.destination, 20)) return res.status(400).json({ error: 'First baggage routing row is required' });
    const normalizedBagTags = normalizeCbsBagTags(body.bagTags || body.bagTag);
    if (!normalizedBagTags) return res.status(400).json({ error: 'Bag tag is required' });
    if (caseType === 'AHL' && !sanitizeCbsText(body.ahlBagDescription, 500)) return res.status(400).json({ error: 'AHL baggage description is required' });
    if (!sanitizeCbsText(body.issueDate, 40)) return res.status(400).json({ error: 'Issue date is required' });
    if (!body.passengerSignature) return res.status(400).json({ error: 'Passenger signature is required' });
    const now = new Date().toISOString();
    let attachments = sanitizeCbsAttachments(body.attachments);
    const missingAttachmentTypes = missingRequiredCbsAttachmentTypes(attachments);
    if (missingAttachmentTypes.length) return res.status(400).json({ error: 'Passport, boarding pass, and bag tag receipt attachments are required' });
    const contentsRows = buildCbsContentsRows(body);
    const record = {
      caseNumber: await makeCbsCaseNumber(),
      caseType,
      status: 'Open',
      passengerName,
      email,
      phone: sanitizeCbsText(body.phone, 80),
      ticketNumber: sanitizeCbsText(body.ticketNumber, 80),
      classOfTravel: sanitizeCbsText(body.classOfTravel, 40).toUpperCase(),
      departureOrigin: sanitizeCbsText(body.departureOrigin, 40).toUpperCase(),
      language: sanitizeCbsText(body.language, 5) === 'zh' ? 'zh' : 'en',
      flightRoute: buildCbsFlightRoute(body),
      bagTag: normalizedBagTags,
      destinationOnBags: sanitizeCbsText(body.destinationOnBags, 80).toUpperCase(),
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
      contentsRows,
      contentsDetails: cbsContentsText(contentsRows),
      issueDate: sanitizeCbsText(body.issueDate, 40),
      passengerSignature: body.passengerSignature ? 'Included in report' : '',
      passengerSignatureDataUrl: body.passengerSignature,
      damageSketch: body.damageSketch,
      submittedAt: now,
      updatedAt: now,
      updateNote: 'Case created'
    };
    await appendCbsCase(record);
    const pdfBuffer = createPirPdf(record);
    let emailResults = [];
    let emailError = '';
    try {
      emailResults = await sendCbsCaseEmail({
        passengerEmail: record.email,
        subject: `China Eastern Baggage Case ${record.caseNumber}`,
        html: buildCbsEmailHtml(record),
        pdfBuffer,
        filename: `${record.caseNumber}.pdf`,
        attachments
      });
    } catch (mailErr) {
      emailError = cbsEmailErrorMessage(mailErr);
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
    const updateFields = buildCbsUpdateFields(req.body || {});
    if (!updateFields) return res.status(400).json({ error: 'Valid WORLDTRACER, RUSH, BAG LOCATION UPDATE, SHIPPING, or CASE CLOSE details are required' });
    const result = await updateCbsCase(req.params.caseNumber, updateFields);
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

        if (!log && !dateSuffixMatch?.[3]) {
          const previousYearSuffix = String(Number(yearSuffix) - 1).padStart(2, '0');
          log = await getFlightLogByDate(date, previousYearSuffix);
          if (log) yearSuffix = previousYearSuffix;
        }
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
        applyCachedCompletedPreflightSteps(syInfo, isoDate);
        syInfo.fscRateSheetSync = fscRateSheetSyncCache.get(isoDate) || { skipped: true, reason: 'sync pending' };
        syInfo.bookingSheetSync = syBookingSheetSyncCache.get(isoDate) || { skipped: true, reason: 'sync pending' };
        if (!applyCachedPreflightStep(syInfo, isoDate, 'gdCheck')) {
          const gdStep = syInfo.crewApis?.steps?.find((step) => step.key === 'gdCheck');
          if (gdStep) {
            gdStep.searched = false;
            gdStep.tooltip = 'GD CHECK will update in the background.';
          }
        }
        if (!applyCachedPreflightStep(syInfo, isoDate, 'nextDayInfo')) {
          const nextDayStep = syInfo.crewApis?.steps?.find((step) => step.key === 'nextDayInfo');
          if (nextDayStep) {
            nextDayStep.searched = false;
            nextDayStep.tooltip = 'NEXTDAY INFO will update in the background.';
          }
        }
        if (isoDate && isoDate !== todayIsoUtc()) {
          await refreshDeferredSyData(syInfo, log, isoDate);
          rememberCompletedPreflightSteps(syInfo, isoDate);
          applyCachedCompletedPreflightSteps(syInfo, isoDate);
        } else {
          await refreshSyPreflightEmailChecks(syInfo, isoDate);
          rememberCompletedPreflightSteps(syInfo, isoDate);
          applyCachedCompletedPreflightSteps(syInfo, isoDate);
          setImmediate(() => {
            refreshDeferredSyData(syInfo, log, isoDate).catch((err) => {
              console.warn('Deferred SY refresh skipped:', err?.message || err);
            });
          });
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
