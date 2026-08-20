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
const { matchMuFlight } = require('./cbsScanParser');

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
  getSalesDetailsReportRows,
  syncSalesDetailsFromSourceSheet,
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
  appendCbsCase,
  appendWrongBaggageSubmission,
  getWrongBaggageSubmissions,
  updateWrongBaggageSubmission,
  appendContactFormSubmission,
  getContactFormSubmissions,
  appendCbsWorldTracerCase,
  getCbsWorldTracerCases,
  updateCbsWorldTracerCase,
  getCbsUnresolvedBaggageCases,
  resolveCbsUnresolvedBaggageCase,
  getCbsCases,
  updateCbsCase,
  getCbsMissingBagReports,
  markCbsMissingBagCase,
  acknowledgeCbsMissingBag,
  sendCbsCaseEmail,
  sendWrongBaggageCaseEmail,
  sendMisconnectionAssistanceEmail,
  getCbsBaggageChartImage,
  appendTransit240Record,
  appendCbsScanRecord,
  appendRecordScanRecord,
  appendCbsScanNbrdBns,
  deleteCbsScanNbrdBn,
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
const NEXTDAY_INFO_DISCORD_CHANNEL_ID = '1399400605742661702';
const TRANSIT_240_DISCORD_CHANNEL_ID = process.env.TRANSIT_240_DISCORD_CHANNEL_ID || '1365773224276660257';
const WRONG_BAGGAGE_DISCORD_CHANNEL_ID = process.env.WRONG_BAGGAGE_DISCORD_CHANNEL_ID || '1534758804535640227';
const CBS_DELAYED_LOST_DISCORD_CHANNEL_ID = process.env.CBS_DELAYED_LOST_DISCORD_CHANNEL_ID || '1534758703369289821';
const CBS_LOST_DISCORD_ROLE_ID = process.env.CBS_LOST_DISCORD_ROLE_ID || '1268619386948685877';
const CBS_DAMAGED_DISCORD_CHANNEL_ID = process.env.CBS_DAMAGED_DISCORD_CHANNEL_ID || process.env.CBS_ATTACHMENTS_DISCORD_CHANNEL_ID || '1527344986075693167';
const CONTACT_FORM_DISCORD_CHANNEL_ID = process.env.CONTACT_FORM_DISCORD_CHANNEL_ID || '1531867051755442266';
const CONTACT_FORM_DISCORD_ROLE_ID = process.env.CONTACT_FORM_DISCORD_ROLE_ID || '1252026975279906876';

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

function addIsoDays(isoDate, days) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}


function isoDateToEmailSubjectDate(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(match[2]) - 1];
  return month ? `${month}-${match[3]}` : '';
}

function retCountsFromSyInfo(syInfo) {
  const ret = syInfo?.reservationTicketed;
  if (!ret || ret.length < 4) return null;
  return {
    firstClass: String(Number(ret[1]) || 0),
    businessClass: String(Number(ret[2]) || 0),
    economyClass: String(Number(ret[3]) || 0)
  };
}

function transferCountsFromJcsy(jcsy) {
  const rows = Array.isArray(jcsy?.rows) ? jcsy.rows : [];
  if (!jcsy?.complete || !rows.length) return null;
  return rows.reduce((acc, row) => {
    const total = Number(row?.total) || 0;
    const hasDeparture = Boolean(String(row?.departure || row?.depart || '').trim());
    if (!hasDeparture || row?.overnight || row?.category === 'overnight' || row?.category === 'pvgOnly') acc.overnightPassengers += total;
    else if (row?.isDomestic || row?.market === 'Domestic' || row?.category === 'domestic') acc.domesticTransfer += total;
    else acc.internationalTransfer += total;
    return acc;
  }, { internationalTransfer: 0, domesticTransfer: 0, overnightPassengers: 0 });
}


function buildNextDayInfoDetailLines(details = {}) {
  return [
    `First Class: ${details.firstClass || '--'}`,
    `Business Class: ${details.businessClass || '--'}`,
    `Economy Class: ${details.economyClass || '--'}`,
    '',
    `International Transfer: ${details.internationalTransfer || '--'}`,
    `Domestic Transfer: ${details.domesticTransfer || '--'}`,
    `Overnight passengers: ${details.overnightPassengers || '--'}`
  ].join('\n');
}

function buildNextDayInfoEmailBody(subjectDate, details) {
  return [
    'To whom it may concern,',
    '',
    `Please see the list below for ${subjectDate} flight information details.`,
    '',
    `First Class:  ${details.firstClass}`,
    `Business Class:  ${details.businessClass}`,
    `Economy Class:  ${details.economyClass}`,
    '',
    '',
    'For Ops:',
    '',
    `International Transfer:  ${details.internationalTransfer}`,
    `Domestic Transfer:  ${details.domesticTransfer}`,
    `Overnight passengers:  ${details.overnightPassengers}`,
    '',
    'Thank you,',
    '',
    'CHINA EASTERN AIRLINES LAX STATION (BOT)'
  ].join('\n');
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
const salesDetailsSheetSyncCache = new Map();
const SALES_DETAILS_SYNC_RETRY_MS = 5 * 60 * 1000;
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


async function syncSalesDetailsFromTodaySy(isoDate) {
  if (isoDate !== todayIsoUtc()) return { skipped: true, reason: 'not today' };

  const cached = salesDetailsSheetSyncCache.get(isoDate);
  if (cached && Date.now() - cached.syncedAt < SALES_DETAILS_SYNC_RETRY_MS) {
    return { ...cached, skipped: true, reason: cached.reason || 'recently synced' };
  }

  try {
    const result = await syncSalesDetailsFromSourceSheet(isoDate, isoDate);
    const synced = { ...result, skipped: false, syncedAt: Date.now() };
    salesDetailsSheetSyncCache.set(isoDate, synced);
    return synced;
  } catch (err) {
    return { skipped: true, error: err?.message || 'Sales details sync failed' };
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
  "https://china-eastern.firebaseapp.com",
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

app.get(['/240.html', '/240'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'public', '240.html'));
});

app.get(['/contact-form.html', '/contact-form'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'public', 'contact-form.html'));
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

function pdfSafeText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfEscape(value) {
  return pdfSafeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfText(content, x, y, size = 9) {
  const safe = pdfSafeText(content);
  if (/[^\x20-\x7E]/.test(safe)) {
    const utf16Hex = Buffer.from(safe, 'utf16le').swap16().toString('hex').toUpperCase();
    return `BT /F2 ${size} Tf ${x} ${y} Td <${utf16Hex}> Tj ET`;
  }
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(safe)}) Tj ET`;
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
  content.push(pdfText(`CASE TYPE: ${record.caseType || ''}`, 410, 710, 10));
  content.push(pdfText('FOR INQUIRIES PLEASE EMAIL:', 390, 696, 9));
  content.push(pdfText('LAXHMMU@GMAIL.COM', 390, 682, 9));
  if (record.worldTracerFileNumber) content.push(pdfText(`WORLDTRACER: ${record.worldTracerFileNumber}`, 390, 664, 10));
  const section = (title, y) => {
    content.push('0.78 0.78 0.78 rg');
    content.push(`44 ${y} 524 18 re f`);
    content.push('0 0 0 rg');
    content.push(pdfText(title, 50, y + 5, 10));
  };
  const box = (x, y, w, h, text, size = 8) => {
    content.push(`0 0 0 RG 0.5 w ${x} ${y} ${w} ${h} re S`);
    if (text) {
      const safe = pdfSafeText(text);
      const maxChars = Math.max(12, Math.floor((w - 10) / (size * 0.52)));
      const words = safe.split(/\s+/);
      const lines = [];
      words.forEach((word) => {
        const current = lines[lines.length - 1] || '';
        if (!current || `${current} ${word}`.length > maxChars) lines.push(word);
        else lines[lines.length - 1] = `${current} ${word}`;
      });
      const maxLines = Math.max(1, Math.floor((h - 8) / (size + 2)));
      lines.slice(0, maxLines).forEach((line, index) => content.push(pdfText(line, x + 5, y + h - 13 - index * (size + 2), size)));
    }
  };
  const coded = (code, label, value, x, y, w, h) => {
    box(x, y, 26, h, code, 8);
    box(x + 26, y, w - 26, h, [label, value || ''].filter(Boolean).join(' '), 7.5);
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
  coded('BD', 'Baggage Details', record.ahlBagDescription || record.dprBagInfo, 52, 350, 500, 74);
  if (String(record.caseType).toUpperCase() === 'DPR') {
    coded('DL', 'Damage Level', record.dprDamageLevel, 52, 324, 500, 26);
    coded('ID', 'Inner Damage', record.dprInnerDamage, 52, 286, 500, 38);
    if (damageImage) {
      box(52, 170, 500, 104, 'Damage Sketch', 8);
      content.push(`q 280 0 0 82 166 180 cm /Damage Do Q`);
    }
  } else {
    coded('BT', 'Bag Type', record.ahlBagType, 52, 324, 500, 26);
    coded('BM', 'Bag Brand / Tag', record.ahlBagBrandTag, 52, 298, 500, 26);
    coded('FT', 'Features', record.ahlFeatures, 52, 260, 500, 38);
    coded('OF', 'Other Visible Features', record.ahlOtherFeatures, 52, 222, 500, 38);
  }
  const items = Array.isArray(record.contentsRows) && record.contentsRows.length
    ? record.contentsRows
    : String(record.contentsDetails || '').split(/\s+\/\s+/).filter(Boolean).map((value) => ({ category: '', description: value }));
  section('SIGNATURE', 122);
  content.push(pdfText(`Date of issue ${record.issueDate || ''}`, 56, 50, 9));
  if (signatureImage) {
    box(390, 42, 160, 28, '', 8);
    content.push(`q 150 0 0 24 395 44 cm /Signature Do Q`);
  } else {
    content.push(pdfText('Passenger Signature __________________________', 330, 50, 9));
  }
  const contentPages = [content];
  const chunkSize = 30;
  const contentChunks = items.length ? Array.from({ length: Math.ceil(items.length / chunkSize) }, (_, index) => items.slice(index * chunkSize, (index + 1) * chunkSize)) : [[]];
  contentChunks.forEach((chunk, pageIndex) => {
    const page = [];
    page.push('0.97 0.98 1 rg 0 0 612 792 re f');
    page.push('0 0 0 RG 0 0 0 rg 1 w 36 36 540 720 re S');
    page.push(pdfText('PROPERTY IRREGULARITY REPORT (PIR)', 54, 724, 15));
    page.push(pdfText(pageIndex ? `CONTENTS CONTINUED (${pageIndex + 1})` : 'CONTENTS / PACKED ITEMS', 54, 706, 12));
    page.push(pdfText(`Passenger: ${record.passengerName || ''}`, 54, 686, 10));
    page.push(pdfText(`Bag Tag: ${record.bagTag || ''}`, 54, 672, 10));
    page.push('0.78 0.78 0.78 rg');
    page.push('44 642 524 18 re f');
    page.push('0 0 0 rg');
    page.push(pdfText(pageIndex ? `CONTENTS CONTINUED (${pageIndex + 1})` : 'CONTENTS / PACKED ITEMS', 50, 647, 10));
    page.push('0 0 0 RG 0.5 w 52 614 160 22 re S');
    page.push(pdfText('CATEGORY', 58, 622, 8));
    page.push('0 0 0 RG 0.5 w 212 614 340 22 re S');
    page.push(pdfText('DESCRIPTION', 218, 622, 8));
    let y = 592;
    chunk.forEach((item) => {
      page.push(`0 0 0 RG 0.5 w 52 ${y} 160 18 re S`);
      page.push(pdfText(String(item.category || '').slice(0, 28), 58, y + 6, 7.5));
      page.push(`0 0 0 RG 0.5 w 212 ${y} 340 18 re S`);
      page.push(pdfText(String(item.description || '').slice(0, 80), 218, y + 6, 7.5));
      y -= 18;
    });
    if (!chunk.length) page.push(pdfText('No contents entered.', 58, 610, 9));
    contentPages.push(page);
  });
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const unicodeFontId = addObject('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [ << /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >> ] >>');
  const xObjectEntries = [imageRefs.Damage ? `/Damage ${imageRefs.Damage} 0 R` : '', imageRefs.Signature ? `/Signature ${imageRefs.Signature} 0 R` : ''].filter(Boolean).join(' ');
  const resources = `<< /Font << /F1 ${fontId} 0 R /F2 ${unicodeFontId} 0 R >> ${xObjectEntries ? `/XObject << ${xObjectEntries} >>` : ''} >>`;
  const streamIds = contentPages.map((page) => {
    const stream = page.join('\n');
    return addObject(`<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`);
  });
  const parentId = objects.length + streamIds.length + 1;
  const pageIds = streamIds.map((streamId) => addObject(`<< /Type /Page /Parent ${parentId} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${streamId} 0 R >>`));
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((pageId) => `${pageId} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
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
      '<p>China Eastern Airlines - LAX</p>'
    ].join('');
  }
  if (language === 'zh') {
    return [
      '<h2>亲爱的旅客：</h2>',
      '<p>我们对您到达目的地后未能即时领回所交运的行李深表歉意，并谨此保证本公司将竭尽所能找回您的行李。</p>',
      '<p>从您报失开始，我们立即采用已接驳全球各航空公司之电脑行李查询系统展开追查服务，并将于寻获后告知您。我们会尽力向您报告进展情况。</p>',
      '<p>一旦您的行李安然寻回，我们会立即通知您，并在当地政府有关当局许可之情况下尽快安排送回。如果行李由于海关问题或因破损需您来提取时，请带好行李报失单和护照。</p>',
      '<p>如果您委托他人前来领取您的行李，必须让受委托人带上您的亲笔委托书、行李报失单、您的护照、（或影印本）及其本人的身份证。</p>',
      '<p>再次对由于行李意外引致的不便表示歉意。</p>',
      '<p>中国东方航空公司</p>'
    ].join('');
  }
  return [
    '<h2>Dear Passenger,</h2>',
    '<p>We sincerely apologize that your checked baggage was not available for collection upon your arrival at your destination. Please be assured that we will make every effort to locate and return your baggage as soon as possible.</p>',
    '<p>Once your baggage was reported missing, we immediately initiated a tracing process through the worldwide computerized baggage tracing system used by participating airlines. We will notify you as soon as your baggage is located and will do our best to keep you informed of any updates regarding the tracing process.</p>',
    '<p>Once your baggage has been located, we will contact you immediately and, subject to local government and customs regulations, arrange for delivery as soon as possible. If you are required to collect your baggage in person due to customs requirements or because the baggage has been damaged, please bring your Property Irregularity Report (PIR)/baggage claim report and your passport with you.</p>',
    '<p>If you authorize another person to collect the baggage on your behalf, the authorized person must present the following documents: your signed authorization letter, your baggage claim report, your passport or a copy of your passport, and the authorized person’s valid identification.</p>',
    '<p>Once again, we sincerely apologize for the inconvenience caused by this baggage irregularity and appreciate your patience and understanding.</p>',
    '<p>Sincerely,<br>China Eastern Airlines</p>'
  ].join('');
}

function buildCbsEmailHtml(record) {
  return cbsPassengerMessageHtml(record.language, record.caseType);
}

function cbsEmailIsChinese(record = {}) {
  return /^zh(?:-|$)/i.test(String(record.language || '').trim());
}

function cbsPlainTextEmailHtml(text = '') {
  return String(text).split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
}

function worldTracerUpdateEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const isDpr = String(record?.caseType || '').toUpperCase() === 'DPR';
  if (isDpr && cbsEmailIsChinese(record)) return {
    subject: `【请勿回复】行李案件建案确认通知 – WorldTracer 案件编号：${fileNumber}`,
    html: `<p>尊敬的旅客：</p><p>您好！</p><p>您的行李案件已成功建立。</p><p><strong>WorldTracer 案件编号：${reference}</strong></p><p>我们将根据您所提供的信息进行后续查询及跟进。如案件有进一步进展，我们会主动与您联系并提供最新信息，请您耐心等候。</p><p><strong>如果您在建案后 7 天内仍未收到我们的进一步通知，请发送邮件至 <a href="mailto:laxllmu@chinaeastern-usa.com">laxllmu@chinaeastern-usa.com</a> 与我们联系，以便我们进一步跟进您的案件。</strong></p><p><strong>此邮件为系统自动发送，请勿直接回复此邮件。</strong></p><p>感谢您的耐心与理解。</p><p>此致<br><strong>中国东方航空</strong></p>`
  };
  if (isDpr) return {
    subject: `[DO NOT REPLY] Baggage Case Confirmation – WorldTracer Reference: ${fileNumber}`,
    html: `<p>Dear Passenger,</p><p>Your baggage case has been successfully created.</p><p><strong>WorldTracer Reference Number: ${reference}</strong></p><p>We will continue to trace and follow up on your case based on the information provided. We will contact you and provide further updates as soon as additional information becomes available.</p><p><strong>If you have not received any further updates from us within 7 days after your case was created, please contact us at <a href="mailto:laxllmu@chinaeastern-usa.com">laxllmu@chinaeastern-usa.com</a> so that we can further follow up on your case.</strong></p><p><strong>This is an automatically generated email. Please do not reply to this message.</strong></p><p>Thank you for your patience and understanding.</p><p>Sincerely,<br><strong>China Eastern Airlines</strong></p>`
  };
  if (cbsEmailIsChinese(record)) return {
    subject: `行李案件更新通知 – WorldTracer 案件编号：${fileNumber}`,
    html: `<p>尊敬的旅客：</p><p>您好！</p><p>您的行李案件现已更新至 WorldTracer 全球行李查询系统。</p><p><strong>WorldTracer 案件编号：${reference}</strong></p><p>请妥善保存此案件编号，以便后续查询或跟进行李处理进度时使用。</p><p>我们将继续跟进您的行李案件。如有进一步信息或进展，我们会及时与您联系。</p><p>感谢您的耐心与理解。</p><p>此致<br>中国东方航空</p>`
  };
  return {
    subject: `Baggage Case Update – WorldTracer Reference: ${fileNumber}`,
    html: `<p>Dear Passenger,</p><p>We would like to inform you that your baggage case has been updated in the WorldTracer baggage tracing system.</p><p><strong>WorldTracer Reference Number: ${reference}</strong></p><p>Please keep this reference number for your records, as it may be required for future inquiries or updates regarding your baggage case.</p><p>We will continue to follow up on your case and provide further updates when additional information becomes available.</p><p>Thank you for your patience and understanding.</p><p>Sincerely,<br>China Eastern Airlines</p>`
  };
}

function requestedBagsUpdateEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李案件更新通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Case Update – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们很高兴地通知您，您的行李已找到，目前正在安排转运中。\n\nWorldTracer 案件编号：${fileNumber}\n\n我们将持续跟进行李的转运情况。如有下一步进展，包括行李抵达或后续配送安排，我们会尽快与您联系并向您提供最新信息。\n\n后续行李将按照您在行李报失记录（Report）中登记的地址安排配送。\n\n如果您需要将行李配送至 Report 中登记地址以外的其他地址，请直接回复此邮件，并提供完整的新配送地址。\n\n如无需更改配送地址，则无需回复此邮件。\n\n感谢您的耐心与理解。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe are pleased to inform you that your baggage has been located and is currently being arranged for transfer.\n\nWorldTracer Reference Number: ${fileNumber}\n\nWe will continue to monitor the transfer status of your baggage. Once further information becomes available, including its arrival and delivery arrangements, we will contact you as soon as possible with an update.\n\nYour baggage will be delivered to the address currently listed in your baggage report.\n\nIf you would like your baggage to be delivered to a different address, please reply directly to this email and provide the complete new delivery address.\n\nIf no address change is needed, no reply is required.\n\nThank you for your patience and understanding.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function adcShippingUpdateEmail(record, fileNumber, shippingAddress = '') {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = address
    ? (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至以下地址：\n\nWorldTracer 案件编号：${fileNumber}\n\n配送地址：${address}\n\n请留意后续配送情况，并确保上述地址可以正常接收行李。\n\n如您发现配送地址有误，或配送过程中有任何问题，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and will be delivered to the following address:\n\nWorldTracer Reference Number: ${fileNumber}\n\nDelivery Address: ${address}\n\nPlease monitor the delivery status and ensure that the above address is available to receive your baggage.\n\nIf you notice any issues with the delivery address or experience any problems during the delivery process, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`)
    : (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至您在行李案件中所提供的地址。\n\nWorldTracer 案件编号：${fileNumber}\n\n请留意后续配送情况，并确保您所提供的地址可以正常接收行李。\n\n如配送过程中有任何更新或需要进一步确认的信息，我们会与您联系。\n\n如您有任何问题，请直接回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and is being delivered to the address you provided for your baggage case.\n\nWorldTracer Reference Number: ${fileNumber}\n\nPlease monitor the delivery and ensure that the address provided is available to receive the baggage.\n\nIf there are any updates or if additional information is required during the delivery process, we will contact you accordingly.\n\nIf you have any questions, please feel free to reply directly to this email.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`);
  const escapedText = text.replace(fileNumber, reference).replace(address, String(address).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])));
  return { subject, text, html: cbsPlainTextEmailHtml(escapedText) };
}

function fedexShippingUpdateEmail(record, fileNumber, trackingNumber, shippingAddress = '') {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const tracking = sanitizeCbsText(trackingNumber, 160).toUpperCase();
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已通过 FedEx 安排寄出${address ? '，并将配送至以下地址：' : '。'}\n\nWorldTracer 案件编号：${fileNumber}\nFedEx Tracking Number：${tracking}${address ? `\n配送地址：${address}` : ''}\n\n您可以使用上述 FedEx Tracking Number 查询最新配送进度。\n\n请留意后续配送情况${address ? '，并确保上述地址可以正常接收行李' : ''}。\n\n${address ? '如您发现配送地址有误，或配送过程中有任何问题' : '如配送过程中有任何问题'}，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped via FedEx${address ? ' and will be delivered to the following address:' : '.'}\n\nWorldTracer Reference Number: ${fileNumber}\nFedEx Tracking Number: ${tracking}${address ? `\nDelivery Address: ${address}` : ''}\n\nYou may use the FedEx tracking number above to check the latest delivery status of your baggage.\n\nPlease monitor the delivery status${address ? ' and ensure that the above address is available to receive your baggage' : ''}.\n\n${address ? 'If you notice any issues with the delivery address or experience any problems with the delivery' : 'If you experience any problems with the delivery'}, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  const htmlText = text.replace(fileNumber, escapeHtml(fileNumber)).replace(tracking, escapeHtml(tracking)).replace(address, escapeHtml(address));
  return { subject, text, html: cbsPlainTextEmailHtml(htmlText) };
}

function airportPickupClosureEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李案件结案通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Case Closure Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们确认您的行李已于机场领取完毕。\n\nWorldTracer 案件编号：${fileNumber}\n\n由于您的行李已成功领取，本次行李案件现已结案（Closed），我们将不再对该案件进行后续追踪。\n\n如您对本次行李案件仍有任何问题，请回复此邮件与我们联系。\n\n感谢您的耐心与配合，也再次对行李问题给您的旅程带来的不便表示歉意。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe confirm that your baggage has been successfully picked up at the airport.\n\nWorldTracer Reference Number: ${fileNumber}\n\nAs your baggage has been successfully collected, your baggage case is now closed, and no further tracing action is required.\n\nIf you have any remaining questions regarding this baggage case, please reply to this email and contact us.\n\nThank you for your patience and cooperation. We sincerely apologize again for any inconvenience caused by the baggage issue.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function passengerPaidShippingEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Shipping Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已按照您所提供的配送方式安排寄出。\n\nWorldTracer 案件编号：${fileNumber}\n\n由于本次配送方式由您提供，请您通过相应的承运商或配送服务查询后续运输及配送进度。\n\n行李交付给您所指定的承运商后，如有运输延误、配送状态或其他与运输相关的问题，请直接与相应承运商联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped using the shipping method provided by you.\n\nWorldTracer Reference Number: ${fileNumber}\n\nAs the shipping method was provided by you, please check the shipment and delivery status directly with the applicable carrier or delivery service.\n\nOnce the baggage has been handed over to your designated carrier, please contact the carrier directly regarding any shipping delays, delivery status, or other transportation-related matters.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function lostBaggageUpdateEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `【请勿回复 】行李遗失案件通知 – WorldTracer 案件编号：${fileNumber}` : `[DO NOT REPLY] Lost Baggage Case Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们非常遗憾地通知您，经过持续查询与追踪，目前仍未能找到您的行李。您的行李案件现已由延误行李（Delayed Baggage）转为遗失行李（Lost Baggage）案件。\n\nWorldTracer 案件编号：${fileNumber}\n\n对于行李遗失给您的旅程带来的不便，我们深表歉意。\n\n后续我们将根据遗失行李案件的处理流程继续跟进。如您在案件转为 Lost 后 7 天内仍未收到我们的进一步通知，请发送邮件至 laxllmu@chinaeastern-usa.com 与我们联系，以便我们进一步跟进您的案件。\n\n此邮件为系统自动发送，请勿直接回复此邮件。\n\n感谢您的耐心与理解。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe regret to inform you that despite our continued tracing efforts, we have not been able to locate your baggage. Your baggage case has now been changed from a Delayed Baggage case to a Lost Baggage case.\n\nWorldTracer Reference Number: ${fileNumber}\n\nWe sincerely apologize for the inconvenience caused by the loss of your baggage.\n\nWe will continue to follow up on your case in accordance with the lost baggage handling process. If you have not received any further updates from us within 7 days after your case was changed to Lost, please contact us at laxllmu@chinaeastern-usa.com so that we can further follow up on your case.\n\nThis is an automatically generated email. Please do not reply to this message.\n\nThank you for your patience and understanding.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function adcShippingUpdateEmail(record, fileNumber, shippingAddress = '') {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = address
    ? (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至以下地址：\n\nWorldTracer 案件编号：${fileNumber}\n\n配送地址：${address}\n\n请留意后续配送情况，并确保上述地址可以正常接收行李。\n\n如您发现配送地址有误，或配送过程中有任何问题，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and will be delivered to the following address:\n\nWorldTracer Reference Number: ${fileNumber}\n\nDelivery Address: ${address}\n\nPlease monitor the delivery status and ensure that the above address is available to receive your baggage.\n\nIf you notice any issues with the delivery address or experience any problems during the delivery process, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`)
    : (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至您在行李案件中所提供的地址。\n\nWorldTracer 案件编号：${fileNumber}\n\n请留意后续配送情况，并确保您所提供的地址可以正常接收行李。\n\n如配送过程中有任何更新或需要进一步确认的信息，我们会与您联系。\n\n如您有任何问题，请直接回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and is being delivered to the address you provided for your baggage case.\n\nWorldTracer Reference Number: ${fileNumber}\n\nPlease monitor the delivery and ensure that the address provided is available to receive the baggage.\n\nIf there are any updates or if additional information is required during the delivery process, we will contact you accordingly.\n\nIf you have any questions, please feel free to reply directly to this email.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`);
  const escapedText = text.replace(fileNumber, reference).replace(address, String(address).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])));
  return { subject, text, html: cbsPlainTextEmailHtml(escapedText) };
}

function fedexShippingUpdateEmail(record, fileNumber, trackingNumber, shippingAddress = '') {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const tracking = sanitizeCbsText(trackingNumber, 160).toUpperCase();
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已通过 FedEx 安排寄出${address ? '，并将配送至以下地址：' : '。'}\n\nWorldTracer 案件编号：${fileNumber}\nFedEx Tracking Number：${tracking}${address ? `\n配送地址：${address}` : ''}\n\n您可以使用上述 FedEx Tracking Number 查询最新配送进度。\n\n请留意后续配送情况${address ? '，并确保上述地址可以正常接收行李' : ''}。\n\n${address ? '如您发现配送地址有误，或配送过程中有任何问题' : '如配送过程中有任何问题'}，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped via FedEx${address ? ' and will be delivered to the following address:' : '.'}\n\nWorldTracer Reference Number: ${fileNumber}\nFedEx Tracking Number: ${tracking}${address ? `\nDelivery Address: ${address}` : ''}\n\nYou may use the FedEx tracking number above to check the latest delivery status of your baggage.\n\nPlease monitor the delivery status${address ? ' and ensure that the above address is available to receive your baggage' : ''}.\n\n${address ? 'If you notice any issues with the delivery address or experience any problems with the delivery' : 'If you experience any problems with the delivery'}, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  const htmlText = text.replace(fileNumber, escapeHtml(fileNumber)).replace(tracking, escapeHtml(tracking)).replace(address, escapeHtml(address));
  return { subject, text, html: cbsPlainTextEmailHtml(htmlText) };
}

function airportPickupClosureEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李案件结案通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Case Closure Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们确认您的行李已于机场领取完毕。\n\nWorldTracer 案件编号：${fileNumber}\n\n由于您的行李已成功领取，本次行李案件现已结案（Closed），我们将不再对该案件进行后续追踪。\n\n如您对本次行李案件仍有任何问题，请回复此邮件与我们联系。\n\n感谢您的耐心与配合，也再次对行李问题给您的旅程带来的不便表示歉意。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe confirm that your baggage has been successfully picked up at the airport.\n\nWorldTracer Reference Number: ${fileNumber}\n\nAs your baggage has been successfully collected, your baggage case is now closed, and no further tracing action is required.\n\nIf you have any remaining questions regarding this baggage case, please reply to this email and contact us.\n\nThank you for your patience and cooperation. We sincerely apologize again for any inconvenience caused by the baggage issue.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function passengerPaidShippingEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Shipping Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已按照您所提供的配送方式安排寄出。\n\nWorldTracer 案件编号：${fileNumber}\n\n由于本次配送方式由您提供，请您通过相应的承运商或配送服务查询后续运输及配送进度。\n\n行李交付给您所指定的承运商后，如有运输延误、配送状态或其他与运输相关的问题，请直接与相应承运商联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped using the shipping method provided by you.\n\nWorldTracer Reference Number: ${fileNumber}\n\nAs the shipping method was provided by you, please check the shipment and delivery status directly with the applicable carrier or delivery service.\n\nOnce the baggage has been handed over to your designated carrier, please contact the carrier directly regarding any shipping delays, delivery status, or other transportation-related matters.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function adcShippingUpdateEmail(record, fileNumber, shippingAddress = '') {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = address
    ? (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至以下地址：\n\nWorldTracer 案件编号：${fileNumber}\n\n配送地址：${address}\n\n请留意后续配送情况，并确保上述地址可以正常接收行李。\n\n如您发现配送地址有误，或配送过程中有任何问题，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and will be delivered to the following address:\n\nWorldTracer Reference Number: ${fileNumber}\n\nDelivery Address: ${address}\n\nPlease monitor the delivery status and ensure that the above address is available to receive your baggage.\n\nIf you notice any issues with the delivery address or experience any problems during the delivery process, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`)
    : (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至您在行李案件中所提供的地址。\n\nWorldTracer 案件编号：${fileNumber}\n\n请留意后续配送情况，并确保您所提供的地址可以正常接收行李。\n\n如配送过程中有任何更新或需要进一步确认的信息，我们会与您联系。\n\n如您有任何问题，请直接回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and is being delivered to the address you provided for your baggage case.\n\nWorldTracer Reference Number: ${fileNumber}\n\nPlease monitor the delivery and ensure that the address provided is available to receive the baggage.\n\nIf there are any updates or if additional information is required during the delivery process, we will contact you accordingly.\n\nIf you have any questions, please feel free to reply directly to this email.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`);
  const escapedText = text.replace(fileNumber, reference).replace(address, String(address).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])));
  return { subject, text, html: cbsPlainTextEmailHtml(escapedText) };
}

function fedexShippingUpdateEmail(record, fileNumber, trackingNumber, shippingAddress = '') {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const tracking = sanitizeCbsText(trackingNumber, 160).toUpperCase();
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已通过 FedEx 安排寄出${address ? '，并将配送至以下地址：' : '。'}\n\nWorldTracer 案件编号：${fileNumber}\nFedEx Tracking Number：${tracking}${address ? `\n配送地址：${address}` : ''}\n\n您可以使用上述 FedEx Tracking Number 查询最新配送进度。\n\n请留意后续配送情况${address ? '，并确保上述地址可以正常接收行李' : ''}。\n\n${address ? '如您发现配送地址有误，或配送过程中有任何问题' : '如配送过程中有任何问题'}，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped via FedEx${address ? ' and will be delivered to the following address:' : '.'}\n\nWorldTracer Reference Number: ${fileNumber}\nFedEx Tracking Number: ${tracking}${address ? `\nDelivery Address: ${address}` : ''}\n\nYou may use the FedEx tracking number above to check the latest delivery status of your baggage.\n\nPlease monitor the delivery status${address ? ' and ensure that the above address is available to receive your baggage' : ''}.\n\n${address ? 'If you notice any issues with the delivery address or experience any problems with the delivery' : 'If you experience any problems with the delivery'}, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  const htmlText = text.replace(fileNumber, escapeHtml(fileNumber)).replace(tracking, escapeHtml(tracking)).replace(address, escapeHtml(address));
  return { subject, text, html: cbsPlainTextEmailHtml(htmlText) };
}

function airportPickupClosureEmail(record, fileNumber) {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李案件结案通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Case Closure Notification – WorldTracer Reference: ${fileNumber}`;
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们确认您的行李已于机场领取完毕。\n\nWorldTracer 案件编号：${fileNumber}\n\n由于您的行李已成功领取，本次行李案件现已结案（Closed），我们将不再对该案件进行后续追踪。\n\n如您对本次行李案件仍有任何问题，请回复此邮件与我们联系。\n\n感谢您的耐心与配合，也再次对行李问题给您的旅程带来的不便表示歉意。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe confirm that your baggage has been successfully picked up at the airport.\n\nWorldTracer Reference Number: ${fileNumber}\n\nAs your baggage has been successfully collected, your baggage case is now closed, and no further tracing action is required.\n\nIf you have any remaining questions regarding this baggage case, please reply to this email and contact us.\n\nThank you for your patience and cooperation. We sincerely apologize again for any inconvenience caused by the baggage issue.\n\nSincerely,\nChina Eastern Airlines`;
  return { subject, text, html: cbsPlainTextEmailHtml(text.replace(fileNumber, reference)) };
}

function adcShippingUpdateEmail(record, fileNumber, shippingAddress = '') {
  const reference = String(fileNumber || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = address
    ? (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至以下地址：\n\nWorldTracer 案件编号：${fileNumber}\n\n配送地址：${address}\n\n请留意后续配送情况，并确保上述地址可以正常接收行李。\n\n如您发现配送地址有误，或配送过程中有任何问题，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and will be delivered to the following address:\n\nWorldTracer Reference Number: ${fileNumber}\n\nDelivery Address: ${address}\n\nPlease monitor the delivery status and ensure that the above address is available to receive your baggage.\n\nIf you notice any issues with the delivery address or experience any problems during the delivery process, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`)
    : (chinese
      ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已安排寄出，并将配送至您在行李案件中所提供的地址。\n\nWorldTracer 案件编号：${fileNumber}\n\n请留意后续配送情况，并确保您所提供的地址可以正常接收行李。\n\n如配送过程中有任何更新或需要进一步确认的信息，我们会与您联系。\n\n如您有任何问题，请直接回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
      : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped and is being delivered to the address you provided for your baggage case.\n\nWorldTracer Reference Number: ${fileNumber}\n\nPlease monitor the delivery and ensure that the address provided is available to receive the baggage.\n\nIf there are any updates or if additional information is required during the delivery process, we will contact you accordingly.\n\nIf you have any questions, please feel free to reply directly to this email.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`);
  const escapedText = text.replace(fileNumber, reference).replace(address, String(address).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])));
  return { subject, text, html: cbsPlainTextEmailHtml(escapedText) };
}

function fedexShippingUpdateEmail(record, fileNumber, trackingNumber, shippingAddress = '') {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const chinese = cbsEmailIsChinese(record);
  const subject = chinese ? `行李配送通知 – WorldTracer 案件编号：${fileNumber}` : `Baggage Delivery Notification – WorldTracer Reference: ${fileNumber}`;
  const tracking = sanitizeCbsText(trackingNumber, 160).toUpperCase();
  const address = sanitizeCbsText(shippingAddress, 300);
  const text = chinese
    ? `尊敬的旅客：\n\n您好！\n\n我们通知您，您的行李已通过 FedEx 安排寄出${address ? '，并将配送至以下地址：' : '。'}\n\nWorldTracer 案件编号：${fileNumber}\nFedEx Tracking Number：${tracking}${address ? `\n配送地址：${address}` : ''}\n\n您可以使用上述 FedEx Tracking Number 查询最新配送进度。\n\n请留意后续配送情况${address ? '，并确保上述地址可以正常接收行李' : ''}。\n\n${address ? '如您发现配送地址有误，或配送过程中有任何问题' : '如配送过程中有任何问题'}，请尽快回复此邮件与我们联系。\n\n感谢您的耐心与配合。\n\n此致\n中国东方航空`
    : `Dear Passenger,\n\nWe would like to inform you that your baggage has been shipped via FedEx${address ? ' and will be delivered to the following address:' : '.'}\n\nWorldTracer Reference Number: ${fileNumber}\nFedEx Tracking Number: ${tracking}${address ? `\nDelivery Address: ${address}` : ''}\n\nYou may use the FedEx tracking number above to check the latest delivery status of your baggage.\n\nPlease monitor the delivery status${address ? ' and ensure that the above address is available to receive your baggage' : ''}.\n\n${address ? 'If you notice any issues with the delivery address or experience any problems with the delivery' : 'If you experience any problems with the delivery'}, please reply to this email as soon as possible.\n\nThank you for your patience and cooperation.\n\nSincerely,\nChina Eastern Airlines`;
  const htmlText = text.replace(fileNumber, escapeHtml(fileNumber)).replace(tracking, escapeHtml(tracking)).replace(address, escapeHtml(address));
  return { subject, text, html: cbsPlainTextEmailHtml(htmlText) };
}

function buildCbsFlightRoute(body) {
  const rows = Array.isArray(body.flightRows) ? body.flightRows : [];
  const normalizedRows = rows.map((row) => ({
    flightNo: sanitizeCbsText(row?.flightNo, 20).toUpperCase(),
    flightDate: sanitizeCbsText(row?.flightDate, 20).toUpperCase(),
    origin: sanitizeCbsText(row?.origin, 20).toUpperCase(),
    destination: sanitizeCbsText(row?.destination, 20).toUpperCase()
  })).filter((row) => row.flightNo || row.flightDate || row.origin || row.destination);
  if (normalizedRows.length) {
    return normalizedRows.map((row) => [row.flightNo, row.flightDate, row.origin, row.destination].filter(Boolean).join(' ')).join(' / ');
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
  const maxTotalBytes = 22 * 1024 * 1024;
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
  return ['boardingpass', 'bagtag'].filter((type) => !uploadedTypes.has(type));
}



function sanitizeCbsDiscordAttachmentName(attachment = {}, index = 0) {
  const rawType = sanitizeCbsText(attachment.attachmentType, 40).toLowerCase() || 'document';
  const safeType = rawType.replace(/[^a-z0-9_-]/gi, '_') || 'document';
  const fallback = `cbs-${safeType}-${index + 1}`;
  const original = sanitizeCbsText(attachment.filename, 120) || fallback;
  return String(original).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) || fallback;
}

function buildCbsDiscordAttachmentFiles(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment, index) => {
      const contentBase64 = String(attachment?.contentBase64 || '').replace(/\s/g, '');
      if (!contentBase64) return null;
      return {
        attachment: Buffer.from(contentBase64, 'base64'),
        name: sanitizeCbsDiscordAttachmentName(attachment, index)
      };
    })
    .filter(Boolean);
}

async function sendCbsAttachmentsToDiscord(record, attachments = [], pdfBuffer = null) {
  const files = buildCbsDiscordAttachmentFiles(attachments);
  if (pdfBuffer?.length) {
    files.unshift({ attachment: pdfBuffer, name: 'baggage-report.pdf' });
  }
  if (!files.length) return { sent: false, reason: 'No CBS attachments to post.' };
  const channelId = String(record?.caseType || '').toUpperCase() === 'DPR'
    ? CBS_DAMAGED_DISCORD_CHANNEL_ID
    : CBS_DELAYED_LOST_DISCORD_CHANNEL_ID;
  const channel = await client.channels.fetch(channelId);
  if (!channel) return { sent: false, reason: 'Discord channel not found.' };
  const attachmentCounts = attachments.reduce((counts, attachment) => {
    const type = sanitizeCbsText(attachment?.attachmentType, 40) || 'document';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  const summary = Object.entries(attachmentCounts).map(([type, count]) => `${type}: ${count}`).join(' / ') || '—';
  await channel.send({
    content: [
      'CBS baggage case attachments',
      `Passenger: ${record.passengerName || '—'}`,
      `Bag tag: ${record.bagTag || '—'}`,
      `Type: ${record.caseType || '—'}`,
      `Files: PDF report + ${summary}`
    ].join('\n'),
    files
  });
  return { sent: true, channelId, fileCount: files.length };
}

async function sendDprWorldTracerUpdateToDiscord(record, fileNumber) {
  if (String(record?.caseType || '').trim().toUpperCase() !== 'DPR') {
    return { sent: false, reason: 'Discord WorldTracer updates are only sent for DPR cases.' };
  }
  const channel = await client.channels.fetch(CBS_DAMAGED_DISCORD_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    return { sent: false, reason: 'DPR Discord channel was not found or is not text based.' };
  }
  await channel.send({
    content: [
      'DPR WorldTracer update',
      `Passenger Name: ${sanitizeCbsText(record.passengerName, 160) || '—'}`,
      `Bag Tag: ${sanitizeCbsText(record.bagTag, 160) || '—'}`,
      `Email: ${sanitizeCbsText(record.email, 160) || '—'}`,
      `Phone: ${sanitizeCbsText(record.phone, 80) || '—'}`,
      `WorldTracer File #: ${sanitizeCbsText(fileNumber, 120) || '—'}`
    ].join('\n'),
    allowedMentions: { parse: [] }
  });
  return { sent: true, channelId: CBS_DAMAGED_DISCORD_CHANNEL_ID };
}

async function sendLostBaggageUpdateToDiscord(fileNumber) {
  const channel = await client.channels.fetch(CBS_DELAYED_LOST_DISCORD_CHANNEL_ID);
  if (!channel?.isTextBased()) return { sent: false, reason: 'Delayed/lost baggage Discord channel was not found or is not text based.' };
  await channel.send({
    content: [`<@&${CBS_LOST_DISCORD_ROLE_ID}>`, '⚠️ BAGGAGE CASE – LOST', '', `WorldTracer Ref: ${sanitizeCbsText(fileNumber, 120) || '—'}`, '', 'Baggage has not been located and the case has been updated from DELAYED → LOST.', '', 'Passenger has been notified by email'].join('\n'),
    allowedMentions: { parse: [], roles: [CBS_LOST_DISCORD_ROLE_ID] }
  });
  return { sent: true, channelId: CBS_DELAYED_LOST_DISCORD_CHANNEL_ID };
}

function sanitizeContactAttachments(value) {
  const input = Array.isArray(value) ? value : [];
  const maxFileBytes = 8 * 1024 * 1024;
  let totalBytes = 0;
  return input.slice(0, 10).map((item, index) => {
    const contentBase64 = String(item?.contentBase64 || '').replace(/\s/g, '');
    if (!contentBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) return null;
    const bytes = Buffer.byteLength(contentBase64, 'base64');
    totalBytes += bytes;
    if (bytes > maxFileBytes || totalBytes > 22 * 1024 * 1024) return null;
    return {
      filename: sanitizeCbsText(item?.filename, 120) || `attachment-${index + 1}`,
      mimeType: sanitizeCbsText(item?.mimeType, 120) || 'application/octet-stream',
      contentBase64
    };
  }).filter(Boolean);
}

async function sendContactFormToDiscord(record, attachments) {
  const channel = await client.channels.fetch(CONTACT_FORM_DISCORD_CHANNEL_ID);
  if (!channel?.isTextBased()) throw new Error('Contact form Discord channel was not found or is not text based.');
  const files = buildCbsDiscordAttachmentFiles(attachments);
  const content = record.language === 'en'
    ? [`<@&${CONTACT_FORM_DISCORD_ROLE_ID}>`, '**Misconnection Passenger Assistance Request**', `Date: ${record.date}`, `Name: ${record.name}`, `Seat number: ${record.seatNumber}`, `Passport number: ${record.ticketNumber}`, `Email: ${record.email}`, `Mobile Number: ${record.phone}`, `Attachments: ${record.attachmentNames || 'None'}`]
    : [`<@&${CONTACT_FORM_DISCORD_ROLE_ID}>`, '**未能衔接后续航班旅客协助请求**', `日期：${record.date}`, `姓名：${record.name}`, `座位号：${record.seatNumber}`, `护照号：${record.ticketNumber}`, `电子邮箱：${record.email}`, `手机号码：${record.phone}`, `附件：${record.attachmentNames || '无'}`];
  await channel.send({
    content: content.join('\n'),
    files,
    allowedMentions: { parse: [], roles: [CONTACT_FORM_DISCORD_ROLE_ID] }
  });
  return { sent: true, channelId: CONTACT_FORM_DISCORD_CHANNEL_ID, fileCount: files.length };
}

async function sendWrongBaggageFormToDiscord(record, attachments) {
  const channel = await client.channels.fetch(WRONG_BAGGAGE_DISCORD_CHANNEL_ID);
  if (!channel?.isTextBased()) throw new Error('CBS attachments Discord channel was not found or is not text based.');
  await channel.send({
    content: [
      '**Wrong Baggage Pick-up Report / 误取行李申报**',
      `Name / 姓名: ${record.name}`,
      `Seat number / 座位号: ${record.seatNumber}`,
      `Baggage tag / 行李牌号码: ${record.bagTagNumber}`,
      `Email / 电子邮箱: ${record.email}`,
      `Mobile number / 手机号码: ${record.phone}`,
      `Additional information / 其他信息: ${record.additionalInformation || '—'}`,
      `Language / 语言: ${record.language}`
    ].join('\n'),
    files: buildCbsDiscordAttachmentFiles(attachments),
    allowedMentions: { parse: [] }
  });
  return { sent: true, channelId: WRONG_BAGGAGE_DISCORD_CHANNEL_ID, fileCount: attachments.length };
}

app.post('/wrong-baggage-submissions', async (req, res) => {
  try {
    const body = req.body || {};
    const record = {
      submittedAt: new Date().toISOString(),
      name: sanitizeCbsText(body.name, 160),
      seatNumber: sanitizeCbsText(body.seatNumber, 20).toUpperCase(),
      bagTagNumber: sanitizeCbsText(body.bagTagNumber, 40).toUpperCase(),
      email: sanitizeCbsText(body.email, 160).toLowerCase(),
      phone: sanitizeCbsText(body.phone, 80),
      additionalInformation: sanitizeCbsText(body.additionalInformation, 1000),
      language: sanitizeCbsText(body.language, 5) === 'en' ? 'en' : 'zh'
    };
    if (!record.name || !record.seatNumber || !record.bagTagNumber || !record.phone || !isValidEmail(record.email)) {
      return res.status(400).json({ error: 'Name, seat number, baggage tag number, valid email, and mobile number are required.' });
    }
    const attachments = sanitizeContactAttachments(body.attachments);
    if (!attachments.length) return res.status(400).json({ error: 'At least one baggage photo is required.' });
    if ((Array.isArray(body.attachments) ? body.attachments.length : 0) !== attachments.length || attachments.some((item) => !String(item.mimeType).startsWith('image/'))) {
      return res.status(400).json({ error: 'Upload up to 10 images, no more than 8 MB each and 22 MB total.' });
    }
    await appendWrongBaggageSubmission(record);
    let email = null;
    let emailError = '';
    try {
      email = await sendWrongBaggageCaseEmail({ passengerEmail: record.email, language: record.language });
    } catch (mailErr) {
      emailError = cbsEmailErrorMessage(mailErr);
      console.error('Wrong baggage passenger email error:', mailErr);
    }
    let discord = null;
    let discordError = '';
    try {
      discord = await sendWrongBaggageFormToDiscord(record, attachments);
    } catch (discordErr) {
      discordError = discordErr?.message || 'Discord notification failed.';
      console.error('Wrong baggage Discord notification error:', discordErr);
    }
    return res.status(201).json({ created: true, record, email, emailError, discord, discordError });
  } catch (err) {
    console.error('Wrong baggage form submission error:', err);
    return res.status(500).json({ error: 'The form could not be submitted. Please try again or contact a staff member.' });
  }
});

app.post('/contact-form-submissions', async (req, res) => {
  try {
    const body = req.body || {};
    const date = sanitizeCbsText(body.date, 10);
    const name = sanitizeCbsText(body.name, 160);
    const seatNumber = sanitizeCbsText(body.seatNumber, 20).toUpperCase();
    const ticketNumber = sanitizeCbsText(body.ticketNumber, 40);
    const email = sanitizeCbsText(body.email, 160).toLowerCase();
    const phone = sanitizeCbsText(body.phone, 80);
    const language = sanitizeCbsText(body.language, 5) === 'en' ? 'en' : 'zh';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date is required.' });
    if (!name || !seatNumber || !ticketNumber || !phone || !isValidEmail(email)) return res.status(400).json({ error: 'Name, seat number, passport number, valid email, and mobile number are required.' });
    const attachments = sanitizeContactAttachments(body.attachments);
    if ((Array.isArray(body.attachments) ? body.attachments.length : 0) !== attachments.length) {
      return res.status(400).json({ error: 'Use no more than 10 attachments, no more than 22 MB total, and no file larger than 8 MB.' });
    }
    const record = {
      submittedAt: new Date().toISOString(), date, name, seatNumber, ticketNumber, email, phone, language,
      attachmentNames: attachments.map((attachment) => attachment.filename).join(', ')
    };
    await appendContactFormSubmission(record);
    let emailResult = null;
    let emailError = '';
    try {
      emailResult = await sendMisconnectionAssistanceEmail({ passengerEmail: record.email, language: record.language });
    } catch (mailErr) {
      emailError = cbsEmailErrorMessage(mailErr);
      console.error('Misconnection passenger email error:', mailErr);
    }
    let discord = null;
    let discordError = '';
    try {
      discord = await sendContactFormToDiscord(record, attachments);
    } catch (discordErr) {
      discordError = discordErr?.message || 'Discord notification failed.';
      console.error('Contact form Discord notification error:', discordErr);
    }
    return res.status(201).json({ created: true, record, email: emailResult, emailError, discord, discordError });
  } catch (err) {
    console.error('Contact form submission error:', err);
    return res.status(500).json({ error: 'The form could not be submitted. Please try again or contact a staff member.' });
  }
});

app.get('/miss-connection-report', async (req, res) => {
  try {
    const rows = await getContactFormSubmissions();
    return res.json({ rows, source: 'sheet' });
  } catch (err) {
    console.error('Miss connection report error:', err);
    return res.status(500).json({ error: err?.message || 'Miss connection report lookup failed.' });
  }
});

function buildCbsUpdateFields(update = {}) {
  const type = sanitizeCbsText(update.type, 40).toLowerCase();
  if (!['worldtracer', 'requested_bags', 'rush', 'location', 'shipping', 'lost', 'closed', 'reopen'].includes(type)) return null;
  const comment = sanitizeCbsText(update.comment, 500);
  if (type === 'worldtracer') {
    const fileNumber = sanitizeCbsText(update.fileNumber || update.worldTracerFileNumber, 120).toUpperCase();
    if (!fileNumber) return null;
    return { status: 'WorldTracer', updateNote: `WORLDTRACER | File number: ${fileNumber}`, updateEvent: { key: 'worldtracer', title: 'Update WorldTracer', fields: [['File Number', fileNumber]] } };
  }
  if (type === 'requested_bags') {
    const fromStation = sanitizeCbsText(update.fromStation, 120).toUpperCase();
    if (!fromStation) return null;
    return { status: 'Requested Bags', updateNote: `REQUESTED BAGS | From station: ${fromStation}`, updateEvent: { key: 'requested_bags', title: 'Requested Bags', fields: [['From Station', fromStation]] } };
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
  if (type === 'lost') {
    return { status: 'Lost', updateNote: 'LOST BAGGAGE | Case changed from Delayed to Lost', updateEvent: { key: 'lost', title: 'Lost Baggage', fields: [['Status Change', 'DELAYED → LOST']] } };
  }
  if (type === 'reopen') {
    return { status: 'Open', updateNote: `CASE REOPEN${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'reopen', title: 'Case Reopened', fields: comment ? [['Comment', comment]] : [] } };
  }
  const trackingNumber = sanitizeCbsText(update.trackingNumber, 160).toUpperCase();
  const shippingTo = sanitizeCbsText(update.shippingTo, 300);
  const shippingMethods = ['ADC - All Day Courier', 'FedEx Delivery', 'Pick Up at Airport', 'Passenger Pay for Shipping'];
  const shippingMethod = shippingMethods.find((method) => method === sanitizeCbsText(update.shippingMethod, 80));
  if (!shippingMethod || (shippingMethod === 'FedEx Delivery' && !trackingNumber)) return null;
  const airportPickup = shippingMethod === 'Pick Up at Airport';
  return { status: airportPickup ? 'Closed - Pick Up at Airport' : 'Shipping', updateNote: `SHIPPING | Method: ${shippingMethod}${trackingNumber ? ` | Tracking: ${trackingNumber}` : ''} | Ship to: ${shippingTo}${comment ? ` | Comment: ${comment}` : ''}`, updateEvent: { key: 'shipping', title: airportPickup ? 'Airport Pick Up - Case Closed' : 'Update Shipping', fields: [['Shipping Method', shippingMethod], ...(trackingNumber ? [['Tracking Number', trackingNumber]] : []), ['Ship To', shippingTo], ...(comment ? [['Comment', comment]] : [])] } };
}



app.get('/cbs-missing-bags', async (req, res) => {
  try {
    const result = await getCbsMissingBagReports({ sync: false });
    return res.json(result);
  } catch (err) {
    console.error('CBS missing bag report error:', err);
    return res.status(500).json({ error: err?.message || 'CBS missing bag report failed' });
  }
});

app.post('/cbs-missing-bags/sync', async (req, res) => {
  try {
    return res.json(await getCbsMissingBagReports({ sync: true }));
  } catch (err) {
    console.error('CBS missing bag sync error:', err);
    return res.status(500).json({ error: err?.message || 'CBS missing bag sync failed' });
  }
});

app.post('/cbs-missing-bags/:rowNumber/create-case', async (req, res) => {
  try {
    const rowNumber = Number(req.params.rowNumber);
    const report = await getCbsMissingBagReports({ sync: false });
    const missing = (report.rows || []).find((row) => Number(row.rowNumber) === rowNumber);
    if (!missing) return res.status(404).json({ error: 'Missing bag row not found' });
    if (missing.caseCreatedAt) return res.json({ created: false, record: missing });
    if (!normalizeCbsBagTags(missing.bagTag || req.body?.bagTag)) return res.status(400).json({ error: 'Bag tag is required to create a case' });
    const now = new Date().toISOString();
    const bagTag = normalizeCbsBagTags(missing.bagTag || req.body?.bagTag);
    const record = {
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
    await markCbsMissingBagCase(rowNumber);
    return res.status(201).json({ created: true, record });
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

app.post('/cbs-missing-bags/:rowNumber/link-on-hand-rush', async (req, res) => {
  try {
    const worldTracerFileNumber = sanitizeCbsText(req.body?.worldTracerFileNumber, 120).toUpperCase();
    await markCbsMissingBagCase(req.params.rowNumber, worldTracerFileNumber ? `RUSH ${worldTracerFileNumber}` : 'RUSH');
    return res.json({ linked:true, worldTracerFileNumber });
  } catch (err) {
    console.error('CBS missing bag On-hard link error:', err);
    return res.status(500).json({ error:err?.message || 'Missing bag On-hard link failed' });
  }
});


function parseCbsPdf417(rawValue = '') {
  const rawScan = String(rawValue || '').trim();
  const flightMatch = matchMuFlight(rawScan);
  if (!flightMatch) throw new Error('Flight not found.');
  if (!flightMatch.supported) {
    const err = new Error('wrong flight');
    err.code = 'WRONG_FLIGHT';
    err.flight = flightMatch.number;
    throw err;
  }

  const detailMatch = rawScan.match(/(?:^|\D)(0*INF|0*\d{1,3}[A-Z])(\d{3,4})\b/i);
  if (!detailMatch) throw new Error('Seat/BN segment not found.');
  const seatToken = detailMatch[1].toUpperCase();
  const normalizedSeatToken = seatToken.replace(/^0+/, '');
  const isInfant = normalizedSeatToken === 'INF';
  const seat = isInfant ? 'INF' : seatToken.replace(/^0+(?=\d)/, '');
  return {
    flight: flightMatch.number,
    seat,
    bn: detailMatch[2],
    rawScan,
    isInfant
  };
}

function parseRecordPdf417(rawValue = '') {
  const rawScan = String(rawValue || '').trim();
  const flightMatch = matchMuFlight(rawScan);
  if (!flightMatch?.supported) {
    const err = new Error('wrong flight');
    err.code = 'WRONG_FLIGHT';
    throw err;
  }
  const detailMatch = rawScan.match(/(?:^|\D)(0*INF|0*\d{1,3}[A-Z])(\d{3,4})\b/i);
  if (!detailMatch) throw new Error('Seat/BN segment not found.');
  const seatToken = detailMatch[1].toUpperCase();
  return {
    flight: `MU${flightMatch.number.replace(/^0+/, '')}`,
    seat: seatToken.replace(/^0+(?=\d)/, ''),
    bn: detailMatch[2],
    rawScan
  };
}

function sanitizeTransit240AttachmentName(name, index) {
  const fallback = `transit-240-${index + 1}.jpg`;
  return String(name || fallback).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) || fallback;
}

function buildTransit240DiscordFiles(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((file, index) => {
      const data = String(file?.data || '').trim();
      if (!data) return null;
      return {
        attachment: Buffer.from(data, 'base64'),
        name: sanitizeTransit240AttachmentName(file?.name, index)
      };
    })
    .filter(Boolean);
}

function formatTransit240Date(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '').trim() || '—';
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

async function sendTransit240ToDiscord(record) {
  const channel = await client.channels.fetch(TRANSIT_240_DISCORD_CHANNEL_ID);
  if (!channel) return { sent: false, reason: 'Discord channel not found.' };
  const itinerary = Array.isArray(record.itinerary) ? record.itinerary : [];
  const itineraryDates = Array.isArray(record.itineraryDates) ? record.itineraryDates : [];
  const embed = {
    color: 0x2ecc71,
    title: '240 Record',
    fields: [
      { name: 'BN', value: record.bnNumber || '—', inline: true },
      { name: 'Passenger', value: record.passengerName || '—', inline: true },
      { name: 'Nationality', value: record.nationalityCode || '—', inline: true },
      { name: 'Passport Exp', value: formatTransit240Date(record.passportExpiry), inline: true },
      { name: 'Leave Date', value: formatTransit240Date(itineraryDates.at(-1)), inline: true },
      { name: 'Itinerary', value: itinerary.length ? itinerary.join(' → ') : '—', inline: false }
    ],
    footer: { text: 'MUFC' }
  };
  const files = buildTransit240DiscordFiles(record.attachments);
  await channel.send({ embeds: [embed], files });
  return { sent: true, channelId: TRANSIT_240_DISCORD_CHANNEL_ID };
}

app.post('/transit-240', async (req, res) => {
  try {
    const record = {
      passengerName: String(req.body?.passengerName || '').trim(),
      seatNumber: String(req.body?.seatNumber || '').trim().toUpperCase(),
      bnNumber: String(req.body?.bnNumber || '').trim(),
      nationalityCode: String(req.body?.nationalityCode || '').trim().toUpperCase(),
      passportExpiry: String(req.body?.passportExpiry || '').trim(),
      itinerary: Array.isArray(req.body?.itinerary) ? req.body.itinerary.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean) : [],
      itineraryDates: Array.isArray(req.body?.itineraryDates) ? req.body.itineraryDates.map((value) => String(value || '').trim()).filter(Boolean) : [],
      agent: String(req.body?.agent || '').trim(),
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.map((file) => ({
        name: String(file?.name || '').trim(),
        type: String(file?.type || '').trim(),
        data: String(file?.data || '').trim()
      })).filter((file) => file.data) : []
    };
    if (!record.passengerName || !record.seatNumber || !record.bnNumber || !record.nationalityCode || !record.passportExpiry || record.itinerary.length < 3) {
      return res.status(400).json({ error: 'Missing required 240 transit fields.' });
    }
    record.submittedAt = new Date().toISOString();
    const saved = await appendTransit240Record(record);
    let discord = null;
    let discordError = '';
    try {
      discord = await sendTransit240ToDiscord(record);
    } catch (err) {
      discordError = err?.message || 'Discord post failed.';
      console.error('240 Transit Discord post failed:', err);
    }
    return res.json({ ok: true, ...saved, discord, discordError });
  } catch (err) {
    console.error('240 Transit submit failed:', err);
    return res.status(500).json({ error: err?.message || '240 transit submit failed.' });
  }
});

app.post('/cbs-scan', async (req, res) => {
  try {
    const parsed = parseCbsPdf417(req.body?.rawScan || req.body?.raw || req.body?.text || '');
    const saved = await appendCbsScanRecord(parsed);
    return res.json({ ok: true, ...saved });
  } catch (err) {
    const status = err?.code === 'DUPLICATE_BN' || err?.code === 'NBRD_MESSAGE' ? 409 : (err?.code === 'WRONG_FLIGHT' ? 400 : (err?.code === 'SHEETS_QUOTA' ? 503 : 422));
    return res.status(status).json({ error: err?.message || 'CBS scan save failed', code: err?.code || 'SCAN_ERROR', flight: err?.flight || '', bn: err?.bn || '', detail: err?.detail || '' });
  }
});

app.post('/record-scan', async (req, res) => {
  try {
    const parsed = parseRecordPdf417(req.body?.rawScan || req.body?.raw || req.body?.text || '');
    const saved = await appendRecordScanRecord(parsed);
    return res.json({ ok: true, ...saved });
  } catch (err) {
    const status = err?.code === 'DUPLICATE_BN' ? 409 : (err?.code === 'WRONG_FLIGHT' ? 400 : (err?.code === 'SHEETS_QUOTA' ? 503 : 422));
    return res.status(status).json({ error: err?.message || 'Record scan save failed', code: err?.code || 'SCAN_ERROR' });
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

async function handleCbsScanNbrdDelete(req, res) {
  try {
    const result = await deleteCbsScanNbrdBn(req.params.rowNumber, req.body?.bn || req.query?.bn || '');
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err?.code === 'NBRD_NOT_FOUND' || err?.code === 'NBRD_MISMATCH' ? 404 : 422;
    return res.status(status).json({ error: err?.message || 'NBRD BN delete failed', code: err?.code || 'NBRD_DELETE_ERROR' });
  }
}

app.post('/cbs-scan/nbrd-bns/:rowNumber/delete', handleCbsScanNbrdDelete);
app.delete('/cbs-scan/nbrd-bns/:rowNumber', handleCbsScanNbrdDelete);

app.get('/cbs-cases', async (req, res) => {
  try {
    const [pirRows, wrongBaggageRows] = await Promise.all([getCbsCases(), getWrongBaggageSubmissions()]);
    return res.json({ rows: [...pirRows, ...wrongBaggageRows] });
  } catch (err) {
    console.error('CBS case list error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case lookup failed' });
  }
});

app.post('/wrong-baggage-submissions/:rowNumber/update', async (req, res) => {
  try {
    const type = sanitizeCbsText(req.body?.type, 20).toLowerCase();
    const comment = sanitizeCbsText(req.body?.comment, 1000);
    if (!['update', 'closed', 'reopen'].includes(type) || (type === 'update' && !comment)) {
      return res.status(400).json({ error: 'Enter an update comment or close the case.' });
    }
    const record = await updateWrongBaggageSubmission(req.params.rowNumber, { type, comment });
    return res.json({ updated: true, record });
  } catch (err) {
    console.error('Wrong baggage update error:', err);
    return res.status(500).json({ error: err?.message || 'Wrong baggage update failed' });
  }
});

app.post('/cbs-worldtracer-cases', async (req, res) => {
  try {
    const body = req.body || {};
    const record = {
      worldTracerFileNumber: sanitizeCbsText(body.worldTracerFileNumber, 120).toUpperCase(),
      originalTagNumber: sanitizeCbsText(body.originalTagNumber || body.bagTagNumber, 120).toUpperCase(),
      rushTagNumber: sanitizeCbsText(body.rushTagNumber, 120).toUpperCase(),
      flightRows: (Array.isArray(body.flightRows) ? body.flightRows : []).slice(0, 20).map((flight) => ({
        flightDate: sanitizeCbsText(flight?.flightDate, 40),
        flightNumber: sanitizeCbsText(flight?.flightNumber, 40).toUpperCase(),
        from: sanitizeCbsText(flight?.from, 40).toUpperCase(),
        to: sanitizeCbsText(flight?.to, 40).toUpperCase()
      })),
      createdAt: new Date().toISOString()
    };
    const invalidFlight = !record.flightRows.length || record.flightRows.some((flight) => Object.values(flight).some((value) => !value));
    if (!record.originalTagNumber || !record.rushTagNumber || invalidFlight) {
      return res.status(400).json({ error: 'Original tag, RUSH tag, and complete flight segments are required' });
    }
    const saved = await appendCbsWorldTracerCase(record);
    return res.status(201).json({ created: true, record: saved });
  } catch (err) {
    console.error('CBS WorldTracer case create error:', err);
    return res.status(500).json({ error: err?.message || 'WorldTracer case save failed' });
  }
});

app.get('/cbs-worldtracer-cases', async (req, res) => {
  try {
    return res.json({ rows: await getCbsWorldTracerCases() });
  } catch (err) {
    console.error('CBS WorldTracer case list error:', err);
    return res.status(500).json({ error: err?.message || 'WorldTracer case lookup failed' });
  }
});

app.post('/cbs-worldtracer-cases/update', async (req, res) => {
  try {
    const body = req.body || {};
    const record = {
      worldTracerFileNumber: sanitizeCbsText(body.worldTracerFileNumber, 120).toUpperCase(), originalTagNumber: sanitizeCbsText(body.originalTagNumber, 120).toUpperCase(), rushTagNumber: sanitizeCbsText(body.rushTagNumber, 120).toUpperCase(), createdAt:sanitizeCbsText(body.createdAt, 40),
      flightRows:(Array.isArray(body.flightRows) ? body.flightRows : []).slice(0, 20).map((flight) => ({ flightDate:sanitizeCbsText(flight?.flightDate, 40), flightNumber:sanitizeCbsText(flight?.flightNumber, 40).toUpperCase(), from:sanitizeCbsText(flight?.from, 40).toUpperCase(), to:sanitizeCbsText(flight?.to, 40).toUpperCase() }))
    };
    if (!record.originalTagNumber || !record.rushTagNumber || !record.flightRows.length || record.flightRows.some((flight) => Object.values(flight).some((value) => !value))) return res.status(400).json({ error:'Original tag, RUSH tag, and complete flight segments are required' });
    const result = await updateCbsWorldTracerCase(body.rowNumbers, record);
    if (result.notFound) return res.status(404).json({ error:'On-hard case not found' });
    return res.json(result);
  } catch (err) {
    console.error('CBS On-hard update error:', err);
    return res.status(500).json({ error:err?.message || 'On-hard update failed' });
  }
});

app.get('/cbs-unresolved-baggage', async (req, res) => {
  try {
    const rows = await getCbsUnresolvedBaggageCases({ includeResolved: true });
    // A Create Rush resolution is represented by the new Rush Bag record. Do not
    // also keep a duplicate copy in On-hand; other completed resolutions remain
    // available there as history.
    return res.json({ rows: rows.filter((row) => String(row.resolution || '').toLowerCase() !== 'on-hand-rush') });
  } catch (err) {
    console.error('CBS On-hand baggage list error:', err);
    return res.status(500).json({ error: err?.message || 'On-hand baggage lookup failed' });
  }
});

app.post('/cbs-unresolved-baggage/:rowNumber/update', async (req, res) => {
  try {
    const action = sanitizeCbsText(req.body?.action, 40).toLowerCase();
    if (!['on-hand-rush', 'passenger-collected', 'shipped', 'other'].includes(action)) return res.status(400).json({ error: 'A valid resolution is required' });
    const note = sanitizeCbsText(req.body?.note, 500);
    if (action === 'on-hand-rush') {
      const flightRows = (Array.isArray(req.body?.flightRows) ? req.body.flightRows : []).slice(0, 20).map((flight) => ({
        flightDate: sanitizeCbsText(flight?.flightDate, 40), flightNumber: sanitizeCbsText(flight?.flightNumber, 40).toUpperCase(),
        from: sanitizeCbsText(flight?.from, 40).toUpperCase(), to: sanitizeCbsText(flight?.to, 40).toUpperCase()
      }));
      const worldTracerFileNumber = sanitizeCbsText(req.body?.worldTracerFileNumber, 120).toUpperCase();
      const originalTagNumber = sanitizeCbsText(req.body?.originalTagNumber || req.body?.bagTagNumber, 120).toUpperCase();
      const rushTagNumber = sanitizeCbsText(req.body?.rushTagNumber, 120).toUpperCase();
      if (!originalTagNumber || !rushTagNumber || !flightRows.length || flightRows.some((flight) => Object.values(flight).some((value) => !value))) return res.status(400).json({ error: 'Original tag, RUSH tag, and complete flight segments are required' });
      await appendCbsWorldTracerCase({ worldTracerFileNumber, originalTagNumber, rushTagNumber, flightRows, createdAt: new Date().toISOString() });
    }
    if (action !== 'on-hand-rush' && !note) return res.status(400).json({ error: 'A resolution note is required' });
    const result = await resolveCbsUnresolvedBaggageCase(req.params.rowNumber, action, note);
    if (result.notFound) return res.status(404).json({ error: 'Unresolved baggage case not found' });
    return res.json(result);
  } catch (err) {
    console.error('CBS unresolved baggage update error:', err);
    return res.status(500).json({ error: err?.message || 'Unresolved baggage update failed' });
  }
});


app.post('/cbs-cases/from-baggage/:bagTag', async (req, res) => {
  try {
    const bagTag = normalizeTestBagTag(req.params.bagTag || req.body?.bagTag);
    if (!isValidTestBagTag(bagTag)) return res.status(400).json({ error: 'Bag tag must match MU123456 format' });
    const baggage = await findTestBaggageByTag(bagTag);
    if (!baggage) return res.status(404).json({ error: 'Baggage record not found' });
    const existingCase = (await getCbsCases()).find((row) => String(row.bagTag || '').split(/\s*\/\s*/).some((tag) => normalizeCbsBagTag(tag) === bagTag));
    if (existingCase) return res.json({ created: false, record: existingCase });
    const now = new Date().toISOString();
    const flightRoute = [baggage.flight, baggage.date].map((value) => sanitizeCbsText(value, 40)).filter(Boolean).join(' ');
    const record = {
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
    return res.status(201).json({ created: true, record });
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
    if (!sanitizeCbsText(body.ticketNumber, 80)) return res.status(400).json({ error: 'Ticket number is required' });
    if (!sanitizeCbsText(firstFlight.flightNo, 20) || !sanitizeCbsText(firstFlight.flightDate, 20) || !sanitizeCbsText(firstFlight.origin, 20) || !sanitizeCbsText(firstFlight.destination, 20)) return res.status(400).json({ error: 'First flight row is required' });
    if (!sanitizeCbsText(body.permanentAddress, 500)) return res.status(400).json({ error: 'Address is required' });
    const normalizedBagTags = normalizeCbsBagTags(body.bagTags || body.bagTag);
    if (!normalizedBagTags) return res.status(400).json({ error: 'Bag tag is required' });
    if (caseType === 'AHL' && !sanitizeCbsText(body.ahlBagDescription, 500)) return res.status(400).json({ error: 'AHL baggage description is required' });
    if (!sanitizeCbsText(body.issueDate, 40)) return res.status(400).json({ error: 'Issue date is required' });
    if (!body.passengerSignature) return res.status(400).json({ error: 'Passenger signature is required' });
    const now = new Date().toISOString();
    let attachments = sanitizeCbsAttachments(body.attachments);
    const missingAttachmentTypes = missingRequiredCbsAttachmentTypes(attachments);
    if (missingAttachmentTypes.length) return res.status(400).json({ error: 'Boarding pass and bag tag receipt attachments are required' });
    const contentsRows = buildCbsContentsRows(body);
    const record = {
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
        subject: 'China Eastern Baggage Case',
        html: buildCbsEmailHtml(record),
        pdfBuffer,
        filename: 'baggage-report.pdf',
        attachments
      });
    } catch (mailErr) {
      emailError = cbsEmailErrorMessage(mailErr);
      console.error('CBS case email error:', mailErr);
    }
    let discord = null;
    let discordError = '';
    try {
      discord = await sendCbsAttachmentsToDiscord(record, attachments, pdfBuffer);
    } catch (discordErr) {
      discordError = discordErr?.message || 'CBS attachments Discord post failed.';
      console.error('CBS attachments Discord post failed:', discordErr);
    }
    return res.status(201).json({ created: true, record, emailResults, emailError, discord, discordError });
  } catch (err) {
    console.error('CBS case create error:', err);
    return res.status(500).json({ error: err?.message || 'CBS case save failed' });
  }
});

app.post('/cbs-cases/:rowNumber/update', async (req, res) => {
  try {
    const updateFields = buildCbsUpdateFields(req.body || {});
    if (!updateFields) return res.status(400).json({ error: 'Valid WORLDTRACER, REQUESTED BAGS, RUSH, BAG LOCATION UPDATE, SHIPPING, LOST, CASE CLOSE, or REOPEN details are required' });
    const result = await updateCbsCase(req.params.rowNumber, updateFields);
    if (result.notFound) return res.status(404).json({ error: 'Case not found' });
    if (updateFields.updateEvent?.key === 'worldtracer') {
      const fileNumber = updateFields.updateEvent.fields[0][1];
      const record = { ...result.record, worldTracerFileNumber: fileNumber };
      const message = worldTracerUpdateEmail(record, fileNumber);
      try {
        result.email = await sendCbsCaseEmail({
          passengerEmail: record.email,
          subject: message.subject,
          html: message.html,
          ccOperations: false
        });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS WorldTracer update email error:', mailErr);
      }
      if (String(record.caseType || '').toUpperCase() === 'DPR') {
        try {
          result.discord = await sendDprWorldTracerUpdateToDiscord(record, fileNumber);
        } catch (discordErr) {
          result.discordError = discordErr?.message || 'DPR WorldTracer Discord notification failed.';
          console.error('CBS DPR WorldTracer Discord notification error:', discordErr);
        }
      }
    }
    if (updateFields.updateEvent?.key === 'requested_bags') {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const message = requestedBagsUpdateEmail(record, fileNumber);
      try {
        result.email = await sendCbsCaseEmail({
          passengerEmail: record.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ccOperations: false
        });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS requested bags update email error:', mailErr);
      }
    }
    if (updateFields.updateEvent?.key === 'shipping' && updateFields.updateEvent.fields.some(([key, value]) => key === 'Shipping Method' && value === 'ADC - All Day Courier')) {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const shippingAddress = updateFields.updateEvent.fields.find(([key]) => key === 'Ship To')?.[1] || '';
      const message = adcShippingUpdateEmail(record, fileNumber, shippingAddress);
      try {
        result.email = await sendCbsCaseEmail({ passengerEmail: record.email, subject: message.subject, html: message.html, text: message.text, ccOperations: false });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS ADC shipping update email error:', mailErr);
      }
    }
    if (updateFields.updateEvent?.key === 'shipping' && updateFields.updateEvent.fields.some(([key, value]) => key === 'Shipping Method' && value === 'FedEx Delivery')) {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const message = fedexShippingUpdateEmail(record, fileNumber, record.trackingNumber, record.shippingAddress);
      try {
        result.email = await sendCbsCaseEmail({ passengerEmail: record.email, subject: message.subject, html: message.html, text: message.text, ccOperations: false });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS FedEx shipping update email error:', mailErr);
      }
    }
    if (updateFields.updateEvent?.key === 'shipping' && updateFields.updateEvent.fields.some(([key, value]) => key === 'Shipping Method' && value === 'Pick Up at Airport')) {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const message = airportPickupClosureEmail(record, fileNumber);
      try {
        result.email = await sendCbsCaseEmail({ passengerEmail: record.email, subject: message.subject, html: message.html, text: message.text, ccOperations: false });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS airport pickup closure email error:', mailErr);
      }
    }
    if (updateFields.updateEvent?.key === 'shipping' && updateFields.updateEvent.fields.some(([key, value]) => key === 'Shipping Method' && value === 'Passenger Pay for Shipping')) {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const message = passengerPaidShippingEmail(record, fileNumber);
      try {
        result.email = await sendCbsCaseEmail({ passengerEmail: record.email, subject: message.subject, html: message.html, text: message.text, ccOperations: false });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS passenger-paid shipping email error:', mailErr);
      }
    }
    if (updateFields.updateEvent?.key === 'lost') {
      const record = result.record;
      const fileNumber = record.worldTracerFileNumber || '';
      const message = lostBaggageUpdateEmail(record, fileNumber);
      try {
        result.email = await sendCbsCaseEmail({ passengerEmail: record.email, subject: message.subject, html: message.html, text: message.text, ccOperations: false });
      } catch (mailErr) {
        result.emailError = cbsEmailErrorMessage(mailErr);
        console.error('CBS lost baggage email error:', mailErr);
      }
      try {
        result.discord = await sendLostBaggageUpdateToDiscord(fileNumber);
      } catch (discordErr) {
        result.discordError = discordErr?.message || 'Lost baggage Discord notification failed.';
        console.error('CBS lost baggage Discord notification error:', discordErr);
      }
    }
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


app.get('/sales-details-report', async (req, res) => {
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
    const result = await getSalesDetailsReportRows(from, to, { sync: String(req.query.sync || 'true').toLowerCase() !== 'false' });
    return res.json({ ...result, source: 'sheet' });
  } catch (err) {
    console.error('Sales details report error:', err);
    return res.status(500).json({ error: err?.message || 'Sales details report lookup failed' });
  }
});

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

      // An optional flight number keeps irregular operations isolated from the
      // normal MU586 dashboard, for example: SY MU586D/09AUG26.
      const syRawMatch = rawQuery.match(
        /^SY(\+)?(?:\s+([A-Z]{2}\d{1,4}[A-Z]?))?(?:\/(\d{2}[A-Z]{3})(\d{2})?)?$/i
      );
      const isSYRawQuery = Boolean(syRawMatch);

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
            'Unable to load .log files'
        });
      }

      // =========================
      // Parse
      // =========================
      parseIncrementalLog(log);

      parsePDLog(log);

      const syMatch = syRawMatch;
      if (syMatch) {
        const preferNextDay = Boolean(syMatch[1]) && !date;
        const requestedFlightNo = syMatch[2]?.toUpperCase() || 'MU586';
        const syDate = syMatch[3] ? syMatch[3].toUpperCase() : date;
        const syInfo = findSYInfo(log, syDate, {
          preferNextDay,
          preferredFlightNo: requestedFlightNo,
          strictPreferredFlight: Boolean(syMatch[2])
        });
        if (!syInfo) {
          return res.json({ error: `No SY section found for ${requestedFlightNo}${syDate ? `/${syDate}` : ''}.` });
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
        syInfo.salesDetailsSheetSync = await syncSalesDetailsFromTodaySy(isoDate);
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





const DISCORD_BOARDING_LINE_PATTERN = /^\s*(?:[^\p{L}\p{N}]*\s*)?Boarding\s*[:：]/iu;

function removeBoardingLinesFromDiscordEmbedText(value) {
  if (typeof value !== 'string') return value;
  return value
    .split(/\r?\n/)
    .filter((line) => !DISCORD_BOARDING_LINE_PATTERN.test(line))
    .join('\n')
    .trimEnd();
}

function removeBoardingLinesFromDiscordValue(value) {
  if (typeof value === 'string') return removeBoardingLinesFromDiscordEmbedText(value);
  if (Array.isArray(value)) return value.map(removeBoardingLinesFromDiscordValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, removeBoardingLinesFromDiscordValue(nestedValue)]));
  }
  return value;
}

function removeBoardingLinesFromDiscordEmbeds(embeds) {
  if (!Array.isArray(embeds)) return embeds;
  return embeds.map(removeBoardingLinesFromDiscordValue);
}

async function sendNextDayInfoToDiscord(content) {
  const text = String(content || '').trim();
  if (!text) return { sent: false, reason: 'No NEXTDAY INFO email body to post.' };
  const channel = await client.channels.fetch(NEXTDAY_INFO_DISCORD_CHANNEL_ID);
  if (!channel) return { sent: false, reason: 'Discord channel not found.' };
  const chunks = text.match(/[\s\S]{1,1900}/g) || [text];
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
  return { sent: true, channelId: NEXTDAY_INFO_DISCORD_CHANNEL_ID, chunks: chunks.length };
}

function deliveryError(result, fallback) {
  if (result.status === 'rejected') return result.reason?.message || fallback;
  if (result.value?.sent === false) return result.value.reason || fallback;
  return '';
}

function settleWithin(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function nextDayInfoDetailsFromRequest(value) {
  const keys = ['firstClass', 'businessClass', 'economyClass', 'internationalTransfer', 'domesticTransfer', 'overnightPassengers'];
  const details = {};
  for (const key of keys) {
    const text = String(value?.[key] ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    details[key] = text;
  }
  return details;
}

// ===============================
// NEXTDAY INFO Email API
// ===============================
app.post('/nextday-info/send', async (req, res) => {
  try {
    const flightNo = String(req.body?.flightNo || 'MU586').trim().toUpperCase() || 'MU586';
    const nextIso = addIsoDays(todayIsoUtc(), 1);
    const subjectDate = isoDateToEmailSubjectDate(nextIso);
    const subject = `${flightNo} ${subjectDate} flight information details`;
    // The browser already has the exact figures shown in the confirmation card.
    // Use them directly so clicking Send does not first block on another Drive log
    // download (the actual source of the request hanging before either delivery).
    const details = nextDayInfoDetailsFromRequest(req.body?.details);
    if (!details) return res.status(400).json({ error: 'Missing or invalid NEXTDAY INFO figures. Refresh SY and try again.' });
    const text = buildNextDayInfoEmailBody(subjectDate, details);
    const to = ['LAXHMXH@hallmark-aviation.com', 'dg-lax-lounge@qantas.com.au'];
    const cc = ['lax.mupax@hallmark-aviation.com', 'laxhmmu@gmail.com'];
    // Do not make Discord wait for Gmail. A stalled Gmail request previously left
    // the browser on SENDING forever and prevented the Discord attempt entirely.
    const [emailResult, discordResult] = await Promise.allSettled([
      settleWithin(sendNextDayInfoEmail({ to, cc, subject, text }), 35000, 'Email delivery'),
      settleWithin(sendNextDayInfoToDiscord(text), 35000, 'Discord delivery')
    ]);
    const email = emailResult.status === 'fulfilled' ? emailResult.value : null;
    const discordPost = discordResult.status === 'fulfilled' ? discordResult.value : null;
    const emailError = deliveryError(emailResult, 'NEXTDAY INFO email send failed.');
    const discordError = deliveryError(discordResult, 'Discord NEXTDAY INFO post failed.');
    if (emailError) console.error('NEXTDAY INFO email send failed:', emailResult.reason);
    if (discordError) console.error('NEXTDAY INFO Discord post failed:', discordResult.reason);
    const delivered = Boolean(email && discordPost?.sent && !emailError && !discordError);
    const sentAt = new Date().toISOString();
    const reason = [emailError && `Email: ${emailError}`, discordError && `Discord: ${discordError}`].filter(Boolean).join(' ');
    const step = {
      key: 'nextDayInfo', label: 'NEXTDAY INFO', complete: delivered, searched: true,
      time: sentAt.slice(11, 19), subject, details, detailText: buildNextDayInfoDetailLines(details), reason,
      tooltip: delivered
        ? `NEXTDAY INFO sent to ${to.join(', ')}; CC ${cc.join(', ')}: ${subject}`
        : `NEXTDAY INFO delivery failed. ${reason}`
    };
    return res.json({ ok: delivered, sentAt, subject, to, cc, messageId: email?.id || '', emailError, discordPost, discordError, details, detailText: step?.detailText || buildNextDayInfoDetailLines(details), step });
  } catch (err) {
    console.error('NEXTDAY INFO send failed:', err);
    return res.status(500).json({ error: err?.message || 'NEXTDAY INFO email send failed.' });
  }
});

// ===============================
// Send Message API
// ===============================
app.post('/send', async (req, res) => {

  try {

    const {
      channelId,
      message
    } = req.body;
    const sanitizedMessage = removeBoardingLinesFromDiscordEmbedText(message);

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
    content: sanitizedMessage || "",
    embeds: removeBoardingLinesFromDiscordEmbeds(req.body.embeds)
  });

} else {

  await channel.send(sanitizedMessage);
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
