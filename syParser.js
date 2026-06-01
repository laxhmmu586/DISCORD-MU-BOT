function splitLogicalSections(log) {
  const normalizedLog = String(log || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
  const lines = normalizedLog.split(/\n/);
  const tsRe = /^\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}\s*$/;
  const cmdRe = /^>\s*([A-Z0-9*\/]+)\b/i;
  const sections = [];
  let current = null;
  let pendingTimestamp = null;

  for (const line of lines) {
    if (tsRe.test(line.trim())) {
      pendingTimestamp = line.trim();
      continue;
    }

    const cmd = line.match(cmdRe)?.[1]?.toUpperCase() || null;
    const isContinuation = cmd ? /^(PN|PN1|PF|PF1)$/.test(cmd) : false;

    if (cmd && !isContinuation) {
      if (current && current.content.trim()) sections.push(current);
      current = { content: line + '\n', timestamp: pendingTimestamp || null };
      pendingTimestamp = null;
      continue;
    }

    if (!current) {
      current = { content: '', timestamp: pendingTimestamp || null };
      pendingTimestamp = null;
    } else if (cmd && isContinuation && pendingTimestamp) {
      const currentTs = parseSectionTimestamp(current.timestamp);
      const pendingTs = parseSectionTimestamp(pendingTimestamp);
      if (pendingTs >= currentTs) current.timestamp = pendingTimestamp;
      pendingTimestamp = null;
    }

    current.content += line + '\n';
  }

  if (current && current.content.trim()) sections.push(current);
  return sections;
}

function parseSectionTimestamp(timestamp) {
  if (!timestamp) return 0;
  const m = timestamp.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2}),\s+(\w+),\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const monthMap = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };
  const year = Number(m[1]);
  const month = monthMap[m[2]];
  const day = Number(m[3]);
  const hour = Number(m[5]);
  const min = Number(m[6]);
  const sec = Number(m[7]);
  if (Number.isNaN(month)) return 0;
  return Date.UTC(year, month, day, hour, min, sec);
}


function getPassengerRecordLine(section) {
  return String(section || '').split(/\r?\n/).find((line) => /^\s*\d+\.\s*/.test(line)) || '';
}

function isDeletedPassengerLine(line) {
  return /\bDELETED\b/i.test(String(line || ''));
}

function isDeletedPassengerSection(section) {
  return isDeletedPassengerLine(getPassengerRecordLine(section));
}

function getPassengerNameFromSection(section) {
  const passengerLine = getPassengerRecordLine(section);
  const lineName = (passengerLine.match(/^\s*\d+\.\s*\d?([A-Z\/]+\+?)/i)?.[1] || '').replace(/\+$/, '').toUpperCase();
  if (lineName) return lineName;
  const paxListName = (String(section || '').match(/PAXLST\s*:\s*([A-Z\/]+)\/?/i)?.[1] || '').replace(/\+$/, '').toUpperCase();
  return paxListName || 'UNKNOWN';
}

function extractPsmLines(section) {
  return [...new Set(String(section || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^PSM(?:\b|-)/i.test(line)))];
}

function hasTargetPsm(line) {
  const normalized = String(line || '').toUpperCase().replace(/\s+/g, '');
  return ['TSXL', 'JMSQ', 'XCSQ', 'TXLK', 'QTQK'].some((code) => normalized.includes(code));
}


function extractSeatAfterBn(text) {
  return (String(text || '').match(/\bBN\s*\d{1,3}\b\s+\*?(\d{1,3}[A-Z])\b/i)?.[1] || '').toUpperCase();
}

function getOutboundLines(section) {
  return String(section || '').match(/^\s*X?O\/[^\n\r]*/gim) || [];
}

function getActiveOutboundLine(section) {
  return getOutboundLines(section).find((line) => !/\bDELETED\b/i.test(line)) || '';
}

function getPassengerRecordOutboundLine(section) {
  const outboundLines = getOutboundLines(section);
  return outboundLines.find((line) => !/\bDELETED\b/i.test(line)) || outboundLines[0] || '';
}

function getFlightDateFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const m = timestamp.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2}),/);
  if (!m) return null;
  const mon = m[2].toUpperCase();
  const yy = m[1].slice(-2);
  return `${m[3]}${mon}${yy}`;
}

function getYmdFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const m = timestamp.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2}),/);
  if (!m) return null;
  const monMap = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const mm = monMap[m[2]];
  if (!mm) return null;
  return `${m[1]}-${mm}-${m[3]}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function flightDateToYmd(flightDate) {
  const m = String(flightDate || '').toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const monMap = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  const mm = monMap[m[2]];
  if (!mm) return null;
  return `20${m[3]}-${mm}-${m[1]}`;
}

function enrichCrewApisFromLog(log, info, targetYmd) {
  const sections = splitLogicalSections(log);
  const flightNo = String(info?.flightNo || '').trim().toUpperCase();
  const flightYmd = flightDateToYmd(info?.flightDate) || targetYmd || null;
  const sameDaySections = sections.filter((sectionObj) => {
    const ymd = getYmdFromTimestamp(sectionObj.timestamp);
    return Boolean(flightYmd && ymd && ymd === flightYmd);
  });
  const formatTime = (timestamp) => {
    const m = String(timestamp || '').match(/(\d{2}:\d{2}:\d{2})$/);
    return m?.[1] || '';
  };
  const findAcceptedCommand = (regex) => {
    const matches = sameDaySections.filter((item) => {
      const content = String(item.content || '').toUpperCase();
      regex.lastIndex = 0;
      return regex.test(content) && /\bACCEPTED\b/.test(content);
    });
    if (!matches.length) return { complete: false, time: '' };
    const sectionObj = matches.reduce((latest, item) => (
      parseSectionTimestamp(item.timestamp) >= parseSectionTimestamp(latest.timestamp) ? item : latest
    ), matches[0]);
    return { complete: true, time: formatTime(sectionObj.timestamp) };
  };
  const hasCommand = (regex) => sameDaySections.some((sectionObj) => regex.test(String(sectionObj.content || '').toUpperCase()));
  const lrPrefix = flightNo
    ? `LR\\s+${escapeRegExp(flightNo)}\\/\\.\\/LAX\\/CWI`
    : 'LR\\s+[A-Z0-9]+\\/\\.\\/LAX\\/CWI';
  const checks = [
    { key: 'ncwl', label: 'NCWL', complete: findAcceptedCommand(/^>\s*NCWL\s*:/im).complete },
    { key: 'cwd', label: 'CWD', complete: hasCommand(/^>\s*CWD\s*:/im) },
    { key: 'crew1', label: 'LAXAPMU', complete: findAcceptedCommand(new RegExp(`^>\\s*${lrPrefix}\\/LAXAPMU\\/PEKKN1E`, 'im')).complete },
    { key: 'crew2', label: 'CWI/N', complete: findAcceptedCommand(new RegExp(`^>\\s*${lrPrefix}\\/N`, 'im')).complete },
    { key: 'crew3', label: 'BJSCCXH', complete: findAcceptedCommand(new RegExp(`^>\\s*${lrPrefix}\\/BJSCCXH`, 'im')).complete }
  ];
  const crewApisComplete = checks.every((item) => item.complete);
  const ccl = findAcceptedCommand(/^>\s*CCL\s*:/im);
  const cc = findAcceptedCommand(/^>\s*CC\s*:/im);
  return {
    complete: crewApisComplete && ccl.complete && cc.complete,
    steps: [
      {
        key: 'crewApis',
        label: 'Crew APIS',
        complete: crewApisComplete,
        checks
      },
      {
        key: 'ccl',
        label: 'CCL',
        complete: ccl.complete,
        time: ccl.time,
        tooltip: ccl.time ? `CCL ${ccl.time}` : 'CCL not entered'
      },
      {
        key: 'cc',
        label: 'CC',
        complete: cc.complete,
        time: cc.time,
        tooltip: cc.time ? `CC ${cc.time}` : 'CC not entered'
      }
    ]
  };
}

function parseSYSection(sectionObj) {
  const section = sectionObj.content || '';
  const flightMatch = section.match(/SY:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
  if (!flightMatch) return null;

  const aircraftMatch = section.match(/\n\s*(\d{3})\/([A-Z0-9]+)\/([A-Z0-9]+)\b/i);
  const timeMatch = section.match(/\bBDT(\d{4})\s+SD(\d{4})\s+ED(\d{4})\b/i);
  const catLine = section.match(/\bCAT\/[^\n\r]*/i)?.[0] || '';
  const routeLine = section.match(/\*[^\n\r]*\bR\d{3}\/\d{3}\/\d{3}[^\n\r]*/i)?.[0] || '';

  const reservation = section.match(/\bR(\d{3})\/(\d{3})\/(\d{3})\b/i);
  const reservationTicketed = section.match(/\bRET(\d{3})\/(\d{3})\/(\d{3})\b/i);
  const checkedIn = section.match(/\bC(\d{3})\/(\d{3})\/(\d{3})\b/i);
  const checkedInTicketed = section.match(/\bCET(\d{3})\/(\d{3})\/(\d{3})\b/i);
  const bags = section.match(/\bB(\d{4})\/(\d{6})\b/i);

  const chd = section.match(/\bCHD(\d{3})\b/i)?.[1] || null;
  const wch = section.match(/\bWCH(\d{3})\b/i)?.[1] || null;
  const inf = section.match(/\bI(\d{2})\b/i)?.[1] || null;
  const statusMatch = section.match(/\b(OP|CI\d{4}|CCL\d{4}|CC\d{4})\/NAM\b/i);
  const statusRaw = statusMatch?.[1]?.toUpperCase() || null;
  const statusCode = statusRaw
    ? (statusRaw.startsWith('CCL') ? 'CCL' : statusRaw.startsWith('CC') ? 'CC' : statusRaw.startsWith('CI') ? 'CI' : 'OP')
    : null;
  const statusTime = statusRaw && statusCode !== 'OP' ? statusRaw.slice(statusCode.length) : null;
  const statusDisplay = statusCode ? (statusTime ? `${statusCode}${statusTime}` : statusCode) : null;

  return {
    flightNo: flightMatch[1].toUpperCase(),
    flightDate: flightMatch[2].toUpperCase(),
    aircraftType: aircraftMatch?.[1] ? `${aircraftMatch[1]}-${aircraftMatch[2]}` : null,
    aircraftTypeRaw: aircraftMatch?.[0]?.trim() || null,
    aircraftRegistration: aircraftMatch?.[3] || null,
    gate: section.match(/\bGTD\/(\d{1,4})\b/i)?.[1] || null,
    bdt: timeMatch?.[1] || null,
    sd: timeMatch?.[2] || null,
    ed: timeMatch?.[3] || null,
    rkMessage: catLine || null,
    reservation,
    reservationTicketed,
    checkedIn,
    checkedInTicketed,
    bags,
    wch,
    inf,
    chd,
    statusCode,
    statusTime,
    statusDisplay,
    chdList: []
  };
}

function parseDobYYMMDD(dobRaw, atDateUtc = null) {
  if (!/^\d{6}$/.test(dobRaw || '')) return null;
  const yy = Number(dobRaw.slice(0, 2));
  const mm = Number(dobRaw.slice(2, 4));
  const dd = Number(dobRaw.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  let fullYear = yy >= 70 ? 1900 + yy : 2000 + yy;
  if (atDateUtc && Date.UTC(fullYear, mm - 1, dd) > atDateUtc.getTime()) fullYear -= 100;
  return new Date(Date.UTC(fullYear, mm - 1, dd));
}

function parseDobRaw(dobRaw, atDateUtc = null) {
  const raw = String(dobRaw || '').trim().toUpperCase();
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  if (/^\d{6}$/.test(raw)) return parseDobYYMMDD(raw, atDateUtc);
  let m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = raw.match(/^(\d{2})([A-Z]{3})(\d{2}|\d{4})$/);
  if (m && monthMap[m[2]] !== undefined) {
    const yy = Number(m[3]);
    let fullYear = m[3].length === 4 ? yy : (yy >= 70 ? 1900 + yy : 2000 + yy);
    if (m[3].length === 2 && atDateUtc && Date.UTC(fullYear, monthMap[m[2]], Number(m[1])) > atDateUtc.getTime()) fullYear -= 100;
    return new Date(Date.UTC(fullYear, monthMap[m[2]], Number(m[1])));
  }
  return null;
}

function formatDobDate(dobDate) {
  if (!dobDate) return '';
  return `${dobDate.getUTCFullYear()}-${String(dobDate.getUTCMonth() + 1).padStart(2, '0')}-${String(dobDate.getUTCDate()).padStart(2, '0')}`;
}

function getAgeYearsAtDate(dob, atDateUtc) {
  if (!dob || !atDateUtc) return null;
  let age = atDateUtc.getUTCFullYear() - dob.getUTCFullYear();
  const hasHadBirthday =
    atDateUtc.getUTCMonth() > dob.getUTCMonth() ||
    (atDateUtc.getUTCMonth() === dob.getUTCMonth() && atDateUtc.getUTCDate() >= dob.getUTCDate());
  if (!hasHadBirthday) age -= 1;
  return age;
}

function enrichCHDListFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const chdByBn = new Map();

  const flightDateMatch = syInfo.flightDate.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const atDateUtc = flightDateMatch
    ? new Date(Date.UTC(Number(`20${flightDateMatch[3]}`), monthMap[flightDateMatch[2]], Number(flightDateMatch[1])))
    : null;

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd && sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const paxMatch = section.match(/\n\s*\d+\.\s*([A-Z\/]+).*?\bBN(\d{1,3})\b.*?(?:\*?(\d+[A-Z]))?/i);
    if (!paxMatch) continue;
    const name = (paxMatch[1] || '').trim();
    const bn = (paxMatch[2] || '').padStart(3, '0');
    const paxInfo = section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '';
    const dobRaw = paxInfo.match(/DOB\/?\s*[:\/-]?\s*(\d{6,8}|\d{2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1] || null;
    const dobDate = parseDobRaw(dobRaw, atDateUtc);
    const ageYears = getAgeYearsAtDate(dobDate, atDateUtc);
    const hasChdCode = /\bCHD1\/0\b/i.test(section);
    const isChdByAge = Number.isInteger(ageYears) && ageYears >= 2 && ageYears < 12;
    const isChd = isChdByAge || hasChdCode;
    if (!isChd) continue;

    if (!chdByBn.has(bn)) {
      chdByBn.set(bn, {
        name,
        bn,
        dob: formatDobDate(dobDate) || '-',
        hasChdCode,
        isChdByAge
      });
      continue;
    }

    const existing = chdByBn.get(bn);
    if (hasChdCode && !existing.hasChdCode) {
      existing.hasChdCode = true;
    }
    if (isChdByAge && !existing.isChdByAge) {
      existing.isChdByAge = true;
    }
  }

  return Array.from(chdByBn.values()).sort((a, b) => Number(a.bn) - Number(b.bn));
}

function extractPassportCountryCodes(section) {
  const codes = [];
  const paxInfo = (section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '').trim().toUpperCase();
  const paxPassport = (section.match(/PASSPORT\s*:\s*([^\n\r]+)/i)?.[1] || '').trim().toUpperCase();

  const paxInfoCode = paxInfo.match(/^([A-Z]{2,3})\//)?.[1];
  if (paxInfoCode) codes.push(paxInfoCode);

  if (paxPassport) {
    const parts = paxPassport.split('/').map((x) => x.trim());
    const natIndex = parts.indexOf('NAT');
    if (natIndex >= 0 && /^[A-Z]{2,3}$/.test(parts[natIndex + 1] || '')) {
      codes.push(parts[natIndex + 1]);
    }

    const expiryIndex = parts.findIndex((x) => /^\d{6}$/.test(x));
    if (expiryIndex >= 0 && /^[A-Z]{2,3}$/.test(parts[expiryIndex + 1] || '')) {
      codes.push(parts[expiryIndex + 1]);
    }
  }

  return codes;
}

function normalizeCountryCodeForRisk(code) {
  const raw = String(code || '').toUpperCase();
  if (raw === 'GBR' || raw === 'GBN') return 'GB';
  return raw;
}

function extractBookingName(section) {
  const m = section.match(/\n\s*\d+\.\s*([A-Z]+)\/([A-Z]+)/i);
  if (!m) return null;
  return { last: m[1].toUpperCase(), first: m[2].toUpperCase() };
}

function isReversedNamePair(a, b) {
  if (!a || !b) return false;
  return a.last === b.first && a.first === b.last;
}

const APPROVED_AGENT_CODES = new Set([
  '21472', '21470', '21466', '23239', '24110', '24113', '23242', '21440',
  '23241', '21461', '23299', '21463', '23302', '24103', '21451', '21447',
  '24102', '23240', '23307', '21450', '24108', '21455', '24109', '23243',
  '23305', '23244', '27199', '24648', '63288'
]);

function extractLatestApiAgent(section) {
  const apiLines = [...String(section || '').matchAll(/^\s*API\s+[^\n\r]*?\bAGT(\d+)\//gim)];
  if (!apiLines.length) return null;
  return apiLines[apiLines.length - 1][1];
}

function enrichGovAqqFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) {
    return { duplicatePassports: [], aqqTclBnList: [], govDtaBnList: [], passportCodeIssues: [] };
  }
  const sections = splitLogicalSections(log);
  const paxRecords = [];
  const issueByBn = new Map();
  const latestSectionByBn = new Map();
  const passportExpBnList = [];
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd && sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const bnMatch = section.match(/PR:\s*[A-Z0-9]+\/\d{2}[A-Z]{3}\d{2}\*[A-Z]{3},BN(\d{1,3})/i);
    if (!bnMatch) continue;
    const bn = bnMatch[1].padStart(3, '0');
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const prev = latestSectionByBn.get(bn);
    if (prev && prev.ts > ts) continue;
    latestSectionByBn.set(bn, { ts, section });
  }

  for (const [bn, latest] of latestSectionByBn.entries()) {
    const section = latest.section || '';
    const passportNo = section.match(/PASSPORT\s*:\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase() || '';
    const bookingName = extractBookingName(section);
    const latestApiAgent = extractLatestApiAgent(section);
    const needsReswipeByAgent = Boolean(latestApiAgent) && !APPROVED_AGENT_CODES.has(latestApiAgent);
    const hasPaxInfoLine = /PAX INFO\s*:/i.test(section);
    const hasPassportLine = /PASSPORT\s*:/i.test(section);
    const countryCodes = extractPassportCountryCodes(section);
    const issueReasons = [];
    if (!hasPaxInfoLine || !hasPassportLine) {
      issueReasons.push('missing PAX INFO or PASSPORT line');
    }
    if (countryCodes.length !== 3) {
      issueReasons.push(`country code count is ${countryCodes.length}, expected 3`);
    }
    if (countryCodes.some((c) => c.length !== 3)) {
      issueReasons.push('contains non-3-letter country code');
    }
    const normalizedCountryCodes = countryCodes.map(normalizeCountryCodeForRisk);
    if (countryCodes.length === 3 && new Set(normalizedCountryCodes).size !== 1) {
      issueReasons.push(`country codes not identical: ${countryCodes.join('/')}`);
    }
    const hasCountryCodeRisk =
      issueReasons.includes('missing PAX INFO or PASSPORT line') ||
      issueReasons.some((x) => x.startsWith('country code count is')) ||
      issueReasons.includes('contains non-3-letter country code') ||
      issueReasons.some((x) => x.startsWith('country codes not identical:'));

    const hasApiSourceRisk = needsReswipeByAgent;
    if (hasApiSourceRisk) {
      issueReasons.push(`latest API by AGT${latestApiAgent}`);
    }

    const hasCodeIssue = hasCountryCodeRisk || hasApiSourceRisk;
    const passportRawLine = (section.match(/PASSPORT\s*:\s*([^\n\r]+)/i)?.[1] || '').trim().toUpperCase();
    const passportParts = passportRawLine.split('/').map((x) => x.trim());
    const expField = passportParts.find((part) => /^\d{6}$/.test(part)) || '';
    let hasPassportExpired = false;
    if (expField) {
      const yy = Number(expField.slice(0, 2));
      const mm = Number(expField.slice(2, 4));
      const dd = Number(expField.slice(4, 6));
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const expDateUtc = Date.UTC(2000 + yy, mm - 1, dd);
        hasPassportExpired = expDateUtc < todayUtc;
      }
    }
    if (hasPassportExpired) {
      issueReasons.push(`passport expired: ${expField}`);
      passportExpBnList.push(bn);
    }

    paxRecords.push({
      bn,
      bookingName,
      passportNo,
      latestApiAgent,
      needsReswipeByAgent,
      hasAqqTcl: /\bAQQ\/TCL\/USA\b/i.test(section),
      hasGovDta: /\bGOV\/DTA\/CHN\b/i.test(section),
      hasPassportCodeIssue: hasCodeIssue || hasPassportExpired
    });
    if (hasCodeIssue || hasPassportExpired) {
      issueByBn.set(bn, issueReasons.join('; '));
    }
  }

  const byPassport = new Map();
  for (const p of paxRecords) {
    if (!p.passportNo) continue;
    const arr = byPassport.get(p.passportNo) || [];
    arr.push(p.bn);
    byPassport.set(p.passportNo, arr);
  }
  const duplicatePassports = [];
  const duplicateReviewPairs = [];
  for (const [passportNo, bns] of byPassport.entries()) {
    const unique = [...new Set(bns)].sort();
    if (unique.length > 1) {
      duplicatePassports.push({ passportNo, bns: unique });
      for (let i = 0; i < unique.length; i += 1) {
        for (let j = i + 1; j < unique.length; j += 1) {
          const p1 = paxRecords.find((p) => p.bn === unique[i] && p.passportNo === passportNo);
          const p2 = paxRecords.find((p) => p.bn === unique[j] && p.passportNo === passportNo);
          if (isReversedNamePair(p1?.bookingName, p2?.bookingName)) {
            duplicateReviewPairs.push({
              passportNo,
              bnA: unique[i],
              bnB: unique[j],
              reason: 'name reversed / possible name correction'
            });
          }
        }
      }
    }
  }

  return {
    duplicatePassports: duplicatePassports.sort((a, b) => a.passportNo.localeCompare(b.passportNo)),
    aqqTclBnList: [...new Set(paxRecords.filter((p) => p.hasAqqTcl).map((p) => p.bn))].sort(),
    govDtaBnList: [...new Set(paxRecords.filter((p) => p.hasGovDta).map((p) => p.bn))].sort(),
    passportExpBnList: [...new Set(passportExpBnList)].sort(),
    passportCodeIssues: [...new Set(paxRecords.filter((p) => p.hasPassportCodeIssue).map((p) => p.bn))].sort(),
    duplicateReviewPairs,
    passportCodeIssueDetails: [...issueByBn.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([bn, reason]) => ({ bn, reason }))
  };
}

function enrichWchListFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const latestByBn = new Map();
  const wchCodeRegex = /\b(WCHR|WCHS|WCHC)\b/ig;

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd && sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const bnMatch = section.match(/\bBN(\d{1,3})\b/i);
    if (!bnMatch) continue;
    const bn = bnMatch[1].padStart(3, '0');
    const nameMatch = section.match(/\n\s*\d+\.\s*([A-Z]+\/[A-Z]+)/i);
    const paxLineMatch = section.match(/\n\s*\d+\.\s*[^\n\r]*/i);
    const paxLine = paxLineMatch?.[0] || '';
    const seatFromPaxLine = extractSeatAfterBn(paxLine);
    const seatFromSection = extractSeatAfterBn(section);
    const seat = (seatFromPaxLine || seatFromSection || '').toUpperCase();
    const sectionWithoutPsm = section
      .split(/\r?\n/)
      .filter((line) => !/^\s*PSM\b/i.test(line))
      .join('\n');
    const codes = [...sectionWithoutPsm.matchAll(wchCodeRegex)].map((m) => m[1].toUpperCase());
    if (!codes.length) continue;
    const uniqueCodes = [...new Set(codes)];
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const prev = latestByBn.get(bn);
    if (prev && prev.ts > ts) continue;
    latestByBn.set(bn, {
      bn,
      name: nameMatch?.[1] || '-',
      seat: seat || '-',
      codes: uniqueCodes,
      ts
    });
  }

  return [...latestByBn.values()]
    .sort((a, b) => Number(a.bn) - Number(b.bn))
    .map(({ bn, name, seat, codes }) => ({ bn, name, seat, codes }));
}

function enrichMembershipListFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return {};
  const sections = splitLogicalSections(log);
  const latestByBn = new Map();
  const cabinRank = 'FAJCDQIOYBMEHKLNRSVTGZX'.split('').reduce((acc, c, i) => {
    acc[c] = i + 1;
    return acc;
  }, {});
  const tierRank = { V: 1, G: 2, S: 3, E: 4, P: 5 };

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const paxLine = section.match(/\n\s*\d+\.\s*[^\n\r]*/)?.[0] || '';
    const bn = (paxLine.match(/\bBN(\d{1,3})\b/i)?.[1] || '').padStart(3, '0');
    if (!bn) continue;
    const name = paxLine.match(/\n\s*\d+\.\s*([A-Z]+\/[A-Z]+)/i)?.[1] || '-';
    const seat = extractSeatAfterBn(paxLine);
    const cabin = (paxLine.match(/\b([FAJCDQIOYBMEHKLNRSVTGZX])\s+PVG\b/i)?.[1] || '').toUpperCase();
    const ffMatch = section.match(/\bFF\/([A-Z0-9]{2})\s+([A-Z0-9]+)\/([VGSPE])\b/i);
    if (!ffMatch) continue;
    const ffCarrier = (ffMatch[1] || '').toUpperCase();
    const ffNumber = ffMatch[2] || '';
    const tier = (ffMatch[3] || '').toUpperCase();
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const prev = latestByBn.get(bn);
    if (prev && prev.ts > ts) continue;
    latestByBn.set(bn, { bn, name, seat: seat || '-', cabin: cabin || '-', ffCarrier, ffNumber, tier, ts });
  }

  const groups = { platinum: [], gold: [], silver: [], skyElite: [], skyElitePlus: [] };
  for (const p of latestByBn.values()) {
    if (p.tier === 'V') groups.platinum.push(p);
    else if (p.tier === 'G') groups.gold.push(p);
    else if (p.tier === 'S') groups.silver.push(p);
    else if (p.tier === 'E') groups.skyElite.push(p);
    else if (p.tier === 'P') groups.skyElitePlus.push(p);
  }

  const sortRows = (arr) => arr.sort((a, b) =>
    (cabinRank[a.cabin] || 999) - (cabinRank[b.cabin] || 999) ||
    Number(a.bn) - Number(b.bn)
  ).map(({ bn, name, seat, cabin, ffCarrier, ffNumber, tier }) => ({ bn, name, seat, cabin, ffCarrier, ffNumber, tier }));

  return {
    platinum: sortRows(groups.platinum),
    gold: sortRows(groups.gold),
    silver: sortRows(groups.silver),
    skyElite: sortRows(groups.skyElite),
    skyElitePlus: sortRows(groups.skyElitePlus),
    counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]))
  };
}


function enrichSeatMapRecordsFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const latestByKey = new Map();
  let sectionSeq = 0;
  const flightDateMatch = syInfo.flightDate.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const atDateUtc = flightDateMatch
    ? new Date(Date.UTC(Number(`20${flightDateMatch[3]}`), monthMap[flightDateMatch[2]], Number(flightDateMatch[1])))
    : null;

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    const seq = sectionSeq;
    sectionSeq += 1;
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd !== targetYmd) continue;
    }

    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const passengerLine = getPassengerRecordLine(section);
    const passengerName = (passengerLine.match(/^\s*\d+\.\s*\d?([A-Z\/]+\+?)/i)?.[1] || '').replace(/\+$/, '').toUpperCase();
    const bn = section.match(/\bBN\s*(\d{1,3})\b/i)?.[1]?.padStart(3, '0') || '';
    const seat = (
      extractSeatAfterBn(passengerLine) ||
      passengerLine.match(/\bSNR?\s*(\d{1,3}[A-Z])\b/i)?.[1] ||
      section.match(/^\s*O\/[^\n\r]*\bSNR?\s*(\d{1,3}[A-Z])\b/im)?.[1] ||
      section.match(/^\s*O\/[^\n\r]*\b(?:BN\s*\d{1,3}\s+)?\*?(\d{1,3}[A-Z])\b/im)?.[1] ||
      ''
    ).toUpperCase();
    if (!seat) continue;

    const serviceCodes = ['VIP', 'AVIH', 'BLND', 'DEAF', 'INAD', 'PETC', 'UM', 'STCR', 'MAAS', 'PPOC', 'WCHR', 'WCHS', 'WCHC'];
    const nonPsmSection = section.split(/\r?\n/).filter((line) => !/^\s*PSM\b/i.test(line)).join('\n');
    const specialServices = serviceCodes.filter((code) => new RegExp(`(?:\\s|\\/|^)${code}(?:\\s|\\/|$)`, 'i').test(nonPsmSection));
    const specialMeals = [...section.matchAll(/\bSPML-([A-Z]{4})\b/gi)].map((m) => m[1].toUpperCase());
    const ffMatch = section.match(/\bFF\/([A-Z0-9]{2})\s+([A-Z0-9]+)\/([VGSPE])\b/i);
    const adultTicketNo = section.match(/\bET\s+TKNE\/(?!INF)(\d{10,})\/\d+\b/i)?.[1] || '';
    const infantTicketNo = section.match(/\bET\s+TKNE\/INF(\d{10,})\/\d+\b/i)?.[1] || '';
    const hasInfant = /\bINF1\/0\b/i.test(section) || Boolean(infantTicketNo);
    const paxInfo = section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '';
    const dobRaw = paxInfo.match(/DOB\/?\s*[:\/-]?\s*(\d{6,8}|\d{2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1] || null;
    const dobDate = parseDobRaw(dobRaw, atDateUtc);
    const ageYears = getAgeYearsAtDate(dobDate, atDateUtc);
    const hasChdCode = /\bCHD1\/0\b/i.test(section);
    const isChild = (Number.isInteger(ageYears) && ageYears >= 2 && ageYears < 12) || hasChdCode;
    const passportNo = section.match(/PASSPORT\s*:\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase() || '';
    const isOffloaded = isDeletedPassengerLine(passengerLine);
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const identity = passportNo || passengerName || `${seat}:UNKNOWN`;
    const key = `PAX:${identity}`;
    const prev = latestByKey.get(key);
    if (prev && prev.ts > ts) continue;
    latestByKey.set(key, {
      bn,
      name: passengerName || 'UNKNOWN',
      seat,
      passportNo,
      ffCarrier: ffMatch?.[1]?.toUpperCase() || '',
      ffNumber: ffMatch?.[2] || '',
      ffTier: ffMatch?.[3]?.toUpperCase() || '',
      ticketNo: adultTicketNo || infantTicketNo,
      infantTicketNo,
      hasInfant,
      dob: formatDobDate(dobDate),
      ageYears: Number.isInteger(ageYears) ? ageYears : null,
      hasChdCode,
      isChild,
      specialServices: [...new Set(specialServices)],
      specialMeals: [...new Set(specialMeals)],
      status: isOffloaded ? 'DELETED' : '',
      offloaded: isOffloaded,
      recordTimestamp: ts,
      seq,
      ts
    });
  }

  const latestBySeat = new Map();
  for (const record of latestByKey.values()) {
    const prev = latestBySeat.get(record.seat);
    if (!prev || record.ts > prev.ts || (record.ts === prev.ts && record.seq >= prev.seq)) latestBySeat.set(record.seat, record);
  }

  return [...latestBySeat.values()]
    .sort((a, b) => Number(a.bn || 9999) - Number(b.bn || 9999) || a.seat.localeCompare(b.seat))
    .map(({ ts, seq, ...record }) => record);
}


function enrichPsmListFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const latestByBn = new Map();

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd !== targetYmd) continue;
    }

    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const psmLines = extractPsmLines(section).filter(hasTargetPsm);
    if (!psmLines.length) continue;

    const bn = section.match(/\bBN\s*(\d{1,3})\b/i)?.[1]?.padStart(3, '0') || '';
    if (!bn) continue;

    const passengerLine = getPassengerRecordLine(section);
    if (isDeletedPassengerLine(passengerLine)) continue;

    const seat = (
      extractSeatAfterBn(passengerLine) ||
      section.match(/\bSN\s*(\d{1,3}[A-Z])\b/i)?.[1] ||
      ''
    ).toUpperCase();
    const bagLine = section.match(/BAGTAG\s*\/([^\n\r]+)/i)?.[1] || '';
    const bagtags = [...bagLine.matchAll(/(?:^|\s)\/?\s*((?:[A-Z]{1,3}\s*)?\d{5,12})\s*\/\s*([A-Z]{3})\b/gi)]
      .map((m) => `${String(m[1] || '').replace(/\s+/g, ' ').trim()}/${String(m[2] || '').toUpperCase()}`);
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const prev = latestByBn.get(bn);
    if (prev && prev.ts > ts) continue;

    latestByBn.set(bn, {
      bn,
      name: getPassengerNameFromSection(section),
      seat: seat || '---',
      bagtags,
      psmLines,
      ts
    });
  }

  return [...latestByBn.values()]
    .sort((a, b) => Number(a.bn) - Number(b.bn))
    .map(({ ts, ...row }) => row);
}

function enrichBnAuditFromLog(log, syInfo, targetYmd = null) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const latestByBn = new Map();
  const flightDateMatch = syInfo.flightDate.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const atDateUtc = flightDateMatch
    ? new Date(Date.UTC(Number(`20${flightDateMatch[3]}`), monthMap[flightDateMatch[2]], Number(flightDateMatch[1])))
    : null;
  const sectionRichnessScore = (text) => {
    const s = String(text || '');
    let score = 0;
    if (/\bET\s+TKNE\//i.test(s)) score += 2;
    if (/\bFBA\/\d+PC\b/i.test(s)) score += 2;
    if (/\bBAGTAG\//i.test(s)) score += 3;
    if (/\bASVC-[^\n\r]*\bXBAG\/\d+PC\b/i.test(s)) score += 2;
    if (/\bASVC-[^\n\r]*\bPDBG\b/i.test(s)) score += 2;
    if (/^\s*CKIN\b/im.test(s)) score += 1;
    if (/^\s*O\/[^\n\r]*/im.test(s)) score += 1;
    return score;
  };

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    if (targetYmd) {
      const sectionYmd = getYmdFromTimestamp(sectionObj.timestamp);
      if (sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;
    const bnMatch = section.match(/\bBN(\d{1,3})\b/i);
    if (!bnMatch) continue;
    const bn = bnMatch[1].padStart(3, '0');
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const score = sectionRichnessScore(section);
    const isDeletedSection = isDeletedPassengerSection(section);
    const prev = latestByBn.get(bn);
    if (!prev) {
      latestByBn.set(bn, { ts, section, score });
      continue;
    }

    const hasPassengerLine = Boolean(getPassengerRecordLine(section));
    if (ts > prev.ts) {
      latestByBn.set(bn, {
        ts,
        section: isDeletedSection || hasPassengerLine ? section : `${prev.section || ''}
${section}`,
        score
      });
    } else if (ts === prev.ts && score >= prev.score) {
      latestByBn.set(bn, { ts, section, score });
    }
  }

  const chinaDomesticAirports = new Set([
    'PVG', 'PEK', 'PKX', 'TSN', 'SJW', 'TYN', 'HET', 'SHE', 'DLC', 'HRB', 'CGQ', 'JMU', 'DQA', 'YNZ', 'NKG',
    'HGH', 'NGB', 'WNZ', 'TAO', 'JJN', 'XMN', 'FOC', 'YTY', 'CZX', 'WUX', 'HFE', 'TNA', 'WEH', 'YNT',
    'KHN', 'JDZ', 'SYX', 'WUH', 'CSX', 'CGD', 'ENH', 'ZHA', 'YIH', 'LYG', 'CGO', 'CAN', 'SZX', 'ZUH', 'HAK',
    'KWL', 'NNG', 'BHY', 'CTU', 'CKG', 'KMG', 'LJG', 'DLU', 'LYI', 'XIY', 'TFU', 'GYS', 'XIC', 'KWE', 'ZAT',
    'JHG', 'LHW', 'XNN', 'INC', 'URC', 'KRL', 'AAT', 'KHG', 'HTN', 'TCG'
  ]);

  const auditRows = [...latestByBn.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([bn, payload]) => {
    const section = payload.section || '';
    const hasCkinOkOverride = /^\s*CKIN\s+OK\s*$/im.test(section);
    const outboundLine = getActiveOutboundLine(section);
    const outboundDest = outboundLine.match(/\b([A-Z]{3})\b(?:\s*\+)?\s*$/i)?.[1]?.toUpperCase() || '';
    const hasOutbound = Boolean(outboundDest);
    const hasCheckedOutbound = hasOutbound && (
      /\bBN\s*\d{1,3}\b/i.test(outboundLine)
      || /\b(?:SN|SNR)\s*\d{1,3}[A-Z]\b/i.test(outboundLine)
      || /\b\*?\d{1,3}[A-Z]\b/i.test(outboundLine)
    );
    const hasTimeOut = /\bAQQ\/TCL\/USA\b/i.test(section);
    const hasGovFail = /\bGOV\/DTA\/CHN\b/i.test(section);
    const hasReview = /\bWEB\/EDI\/RESWIPE\b/i.test(section);
    const latestApiAgent = extractLatestApiAgent(section);
    const apiNotWhitelisted = Boolean(latestApiAgent) && !APPROVED_AGENT_CODES.has(latestApiAgent);
    const countryCodes = extractPassportCountryCodes(section);
    const countryCodeCountZero = countryCodes.length === 0;
    const passportRawLine = (section.match(/PASSPORT\s*:\s*([^\n\r]+)/i)?.[1] || '').trim().toUpperCase();
    const passportNo = section.match(/PASSPORT\s*:\s*([A-Z0-9]+)/i)?.[1]?.toUpperCase() || '';
    const expField = passportRawLine.split('/').map((x) => x.trim()).find((part) => /^\d{6}$/.test(part)) || '';
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let isPassportExpired = false;
    if (expField) {
      const yy = Number(expField.slice(0, 2));
      const mm = Number(expField.slice(2, 4));
      const dd = Number(expField.slice(4, 6));
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        isPassportExpired = Date.UTC(2000 + yy, mm - 1, dd) < todayUtc;
      }
    }
    const passportNat = passportRawLine.match(/\/NAT\/([A-Z]{3})\//i)?.[1]?.toUpperCase() || '';
    const passengerLine = getPassengerRecordLine(section);
    const passengerName = (passengerLine.match(/^\s*\d+\.\s*\d?([A-Z\/]+\+?)/i)?.[1] || '').replace(/\+$/, '').toUpperCase();
    const passengerSeat = (
      extractSeatAfterBn(passengerLine) ||
      section.match(/\bSN\s*(\d{1,3}[A-Z])\b/i)?.[1] ||
      ''
    ).toUpperCase();
    const ffMatch = section.match(/\bFF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])\b/i);
    const adultTicketNo = section.match(/\bET\s+TKNE\/(?!INF)(\d{10,})\/\d+\b/i)?.[1] || '';
    const infantTicketNo = section.match(/\bET\s+TKNE\/INF(\d{10,})\/\d+\b/i)?.[1] || '';
    const ticketNo = adultTicketNo || infantTicketNo || '';
    const bagLine = section.match(/BAGTAG\s*\/([^\n\r]+)/i)?.[1] || '';
    const bagtags = [...bagLine.matchAll(/(?:^|\s)\/?\s*((?:[A-Z]{1,3}\s*)?\d{5,12})\s*\/\s*([A-Z]{3})\b/gi)]
      .map((m) => `${String(m[1] || '').replace(/\s+/g, ' ').trim()}/${String(m[2] || '').toUpperCase()}`);
    const inboundMatch = section.match(/^\s*I\/\s*([A-Z0-9]+)\s*\/\s*(\d{2}[A-Z]{3}(?:\d{2})?).*?\b([A-Z]{3})\s*$/im);
    const inbound = inboundMatch ? { flight: inboundMatch[1], date: inboundMatch[2], origin: inboundMatch[3] } : null;
    const outboundLineForRecord = getPassengerRecordOutboundLine(section);
    const outboundMatch = outboundLineForRecord.match(/X?O\/\s*([A-Z0-9]+)\s*\/\s*(\d{2}[A-Z]{3}(?:\d{2})?)(?:.*?\bBN\s*(\d+))?(?:.*?\b(\d+[A-Z]))?.*?\b([A-Z]{3})\s*$/i);
    const isOffloaded = isDeletedPassengerLine(passengerLine);
    const outbound = outboundMatch ? {
      flight: outboundMatch[1],
      date: outboundMatch[2],
      bn: outboundMatch[3] || null,
      seat: outboundMatch[4] || null,
      destination: outboundMatch[5],
      status: /\bDELETED\b/i.test(outboundLineForRecord) ? 'DELETED' : ''
    } : null;
    const ssrCodes = ['VIP', 'AVIH', 'BLND', 'DEAF', 'INAD', 'PETC', 'UM', 'STCR', 'MAAS', 'PPOC', 'WCHR', 'WCHS', 'WCHC'];
    const nonPsmSection = section.split(/\r?\n/).filter((line) => !/^\s*PSM\b/i.test(line)).join('\n');
    const specialServices = ssrCodes.filter((code) => new RegExp(`(?:\\s|\\/|^)${code}(?:\\s|\\/|$)`, 'i').test(nonPsmSection));
    const umNumber = section.match(/\bUM(\d{1,2})\b/i)?.[1];
    if (umNumber && !specialServices.includes('UM')) specialServices.push('UM');
    const wheelchair = ['WCHR', 'WCHS', 'WCHC'].find((code) => specialServices.includes(code));
    const filteredSpecialServices = specialServices.filter((code) => !['WCHR', 'WCHS', 'WCHC'].includes(code));
    if (wheelchair) filteredSpecialServices.push(wheelchair);
    const specialMeals = [...section.matchAll(/\bSPML-([A-Z]{4})\b/gi)].map((m) => m[1].toUpperCase());
    const paxInfo = section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '';
    const dobRaw = paxInfo.match(/DOB\/?\s*[:\/-]?\s*(\d{6,8}|\d{2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1] || null;
    const dobDate = parseDobRaw(dobRaw, atDateUtc);
    const ageYears = getAgeYearsAtDate(dobDate, atDateUtc);
    const hasChdCode = /\bCHD1\/0\b/i.test(section);
    const isChild = (Number.isInteger(ageYears) && ageYears >= 2 && ageYears < 12) || hasChdCode;
    const psmLines = extractPsmLines(section);
    const paidProductsShort = (section.match(/^\s*ASVC-[^\n\r]+/gim) || []).map((line) => {
      const fullLine = line.replace(/^ASVC-\s*/i, '').trim();
      const serviceCode = (fullLine.match(/(?:^|\/)\s*([A-Z]{4})\s*(?:\/|\s)/i)?.[1] || fullLine.match(/\b(\d+[A-Z]|[0-9]+PC)\b/i)?.[1] || '').toUpperCase();
      const emda = fullLine.match(/\bEMDA-\d{13}\b/i)?.[0]?.toUpperCase() || '';
      return serviceCode && emda ? `${serviceCode}/${emda}` : fullLine;
    }).filter(Boolean);
    const hasInfFlag = /\bINF1\/0\b/i.test(section);
    const hasAdultTk = Boolean(adultTicketNo);
    const hasInfTk = Boolean(infantTicketNo);
    const passengerRecord = {
      bn,
      name: passengerName || 'UNKNOWN',
      seat: passengerSeat || '---',
      cabin: 'Economy',
      flight: syInfo.flightNo || '',
      flightDate: syInfo.flightDate || '',
      passportNo,
      ffCarrier: ffMatch?.[1]?.toUpperCase() || '',
      ffNumber: ffMatch?.[2] || '',
      ffTier: ffMatch?.[3]?.toUpperCase() || '',
      ticketNo,
      infantTicketNo,
      hasInfant: hasInfFlag || hasInfTk,
      dob: formatDobDate(dobDate),
      ageYears: Number.isInteger(ageYears) ? ageYears : null,
      hasChdCode,
      isChild,
      bagtags,
      inbound,
      outbound,
      specialServices: filteredSpecialServices,
      specialMeals: [...new Set(specialMeals)],
      paidProductsShort,
      psmLines,
      status: isOffloaded ? 'DELETED' : '',
      offloaded: isOffloaded,
      recordTimestamp: payload.ts || 0
    };
    const isVisaIrrelevantCkinLine = (line) => {
      const normalized = String(line || '').trim().toUpperCase().replace(/\s+/g, ' ');
      return /\/CHKLEG\b/.test(normalized)
        || /^CKIN\s+HK\d+\s+LKCK\/\d+\/[A-Z]$/.test(normalized)
        || /^CKIN\s+MTCK\/MAP\/MU\b/.test(normalized)
        || /^CKIN\s+(?:STSP|GE|KATE|YUIKA|BY\s+YUIKA|BY\s+NORMA|GLENN|NH|RP|TIAN|TAMSUN)\b/.test(normalized)
        || /^CKIN\s+HK\d+\s+VICO\d+\b/.test(normalized);
    };
    const ckinLineList = section.split(/\r?\n/).filter((line) => /^\s*CKIN\b/i.test(line)).map((line) => line.trim());
    const gateComments = ckinLineList.filter((item) => /^CKIN\s+NBRD\b/i.test(item));
    passengerRecord.gateComments = gateComments;
    const visaRelevantCkinLineList = ckinLineList.filter((line) => !isVisaIrrelevantCkinLine(line));
    const ckinLines = visaRelevantCkinLineList.join(' ').toUpperCase();
    const hasVisaKeyword = /\b(?:VISA\d*|VS|TRAVEL\s*DOC(?:UMENT)?\d*|TRAVELDOC(?:UMENT)?\d*|V|PR CARD)\b/.test(ckinLines);
    const hasVisaExpHint = /\b(EXP|DT|TIL|240|APPLY)\b/.test(ckinLines);
    const hasDateLike = /\b(\d{4}|[0-3]?\d\s*[A-Z]{3}\s*\d{2,4}|\d{1,2}[A-Z]{3}\d{2,4}|[A-Z]{3,9}\s*\d{4})\b/.test(ckinLines);
    const hasTravelDocOverride = /\b(TBZ|PINK CARD|PR CARD)\b/.test(ckinLines);
    const has240Transit = /\b240\b/.test(ckinLines);
    const hasAnyVisaEvidence = hasTravelDocOverride || has240Transit || (hasVisaKeyword && (hasDateLike || hasVisaExpHint));
    const visaDest = hasCheckedOutbound ? outboundDest : 'PVG';
    const toChinaDomestic = chinaDomesticAirports.has(visaDest);
    let visaStatus = 'review';
    let visaReason = 'Not yet implemented';
    const ckinBestLine = visaRelevantCkinLineList.find((line) => /\b(?:VISA\d*|VS|TRAVEL\s*DOC(?:UMENT)?\d*|TRAVELDOC(?:UMENT)?\d*|V|PR CARD|TBZ|PINK CARD|240|EXP|DT|TIL|APPLY)\b/i.test(line)) || visaRelevantCkinLineList[0] || '';
    const visaReviewReason = (prefix) => ckinBestLine ? `${prefix};\n${ckinBestLine}` : prefix;
    const visaPassReason = (detail = '') => `${passportNat || 'UNK'} passport to ${visaDest}: PASS${detail ? ` (${detail})` : ''}`;
    if (hasAnyVisaEvidence) {
      visaStatus = 'pass';
      visaReason = visaPassReason(ckinBestLine ? `valid visa evidence: ${ckinBestLine}` : 'valid visa evidence found');
    } else if (toChinaDomestic) {
      if (passportNat === 'CHN') {
        visaStatus = 'pass';
        visaReason = visaPassReason('Chinese passport traveling to China/domestic destination');
      } else if (passportNat === 'USA') {
        visaReason = visaReviewReason(`Need review: USA passport to ${visaDest}`);
      } else if (passportNat === 'CAN' || passportNat === 'RUS' || passportNat === 'ESP') {
        visaStatus = 'pass';
        visaReason = visaPassReason('implemented passport/destination rule');
      } else {
        visaReason = visaReviewReason(`Rule not implemented: passport ${passportNat || 'UNK'} to ${visaDest}`);
      }
    } else if (passportNat === 'VNM' && visaDest === 'SGN') {
      visaStatus = 'pass';
      visaReason = visaPassReason('Vietnam passport returning to SGN');
    } else if (passportNat === 'THA' && visaDest === 'BKK') {
      visaStatus = 'pass';
      visaReason = visaPassReason('Thailand passport returning to BKK');
    } else if (passportNat === 'USA' && visaDest === 'BKK') {
      visaStatus = 'pass';
      visaReason = visaPassReason('USA passport traveling to Bangkok');
    } else {
      visaReason = visaReviewReason(`Rule not implemented: passport ${passportNat || 'UNK'} to ${visaDest}`);
    }

    const tkStatus = hasInfFlag ? (hasAdultTk && hasInfTk ? 'pass' : 'fail') : (hasAdultTk ? 'pass' : 'fail');
    const tkReason = hasInfFlag
      ? (!hasAdultTk && !hasInfTk ? 'INF requires both adult and infant tickets; both are missing'
        : !hasAdultTk ? `INF requires an adult ticket; infant ticket ${infantTicketNo} is present`
        : !hasInfTk ? `INF requires an infant ticket; adult ticket ${adultTicketNo} is present`
        : `Adult ticket ${adultTicketNo} and infant ticket ${infantTicketNo} are present`)
      : (!hasAdultTk ? 'Adult TKNE ticket is missing' : `Adult ticket ${adultTicketNo} is present`);

    const waived = /\bPSM-EXBG0PC/i.test(section);
    const fbaPcParsed = Number(section.match(/\bFBA\/(\d+)PC\b/i)?.[1] || 0);
    const fbaPc = fbaPcParsed || 2;
    const xbagPcValues = [...section.matchAll(/\bXBAG\s*\/\s*(\d+)\s*PC\b/gi)].map((m) => Number(m[1] || 0));
    const asvcXbagPcValues = [...section.matchAll(/^\s*ASVC-[^\n\r]*\bXBAG\s*\/\s*(\d+)\s*PC\b/gim)].map((m) => Number(m[1] || 0));
    const xbagPc = Math.max(0, ...xbagPcValues, ...asvcXbagPcValues);
    const pdbgCount = [...section.matchAll(/\bPDBG\b/gi)].length;
    const hasExtraBaggageByTier = /\bFF\/MU\s+\d+\/(?:V|G|S)\b/i.test(section) || /\*1|\*2/.test(section);
    const tierExtraPc = hasExtraBaggageByTier ? 1 : 0;
    const infExtraPc = hasInfTk ? 1 : 0;
    const paidExtraPc = Math.max(0, xbagPc - fbaPc) + pdbgCount;
    const purchasedExtra = paidExtraPc + tierExtraPc + infExtraPc;
    const bagTagRaw = [...section.matchAll(/BAGTAG\/([^\n\r]+)/gi)]
      .map((m) => m[1] || '')
      .join(' ');
    const bagPieceMatches = [...bagTagRaw.matchAll(/([A-Z]{0,2}\s*\d{6,10})\/([A-Z]{3})\b/gi)];
    const uniqueBagPieces = new Map();
    for (const m of bagPieceMatches) {
      const tag = String(m[1] || '').replace(/\s+/g, '').toUpperCase();
      const dest = String(m[2] || '').toUpperCase();
      if (!tag || !dest) continue;
      uniqueBagPieces.set(`${tag}/${dest}`, dest);
    }
    const bagDestinations = uniqueBagPieces.size
      ? [...uniqueBagPieces.values()]
      : [...bagTagRaw.matchAll(/\/([A-Z]{3})\b/gi)].map((m) => (m[1] || '').toUpperCase());
    const bagTagCount = bagDestinations.length;
    const allowance = fbaPc + purchasedExtra;
    const bagTagSummary = uniqueBagPieces.size ? [...uniqueBagPieces.keys()].join(', ') : (bagDestinations.length ? bagDestinations.join(', ') : 'none');
    const bagDestinationSummary = bagDestinations.length ? [...new Set(bagDestinations)].join('/') : 'none';
    const bagAllowanceParts = [`FBA ${fbaPc}PC`];
    if (paidExtraPc > 0) bagAllowanceParts.push(`paid extra ${paidExtraPc}PC`);
    if (tierExtraPc > 0) bagAllowanceParts.push(`membership extra ${tierExtraPc}PC`);
    if (infExtraPc > 0) bagAllowanceParts.push(`INF extra ${infExtraPc}PC`);
    const bagBaseReason = () => `Allowance: ${bagAllowanceParts.join(' + ')} = ${allowance}PC; checked bags: ${bagTagCount}PC (${bagTagSummary}); bag destination: ${bagDestinationSummary}`;
    let bagStatus = waived ? 'pass' : (bagTagCount > allowance ? 'fail' : 'pass');
    let bagReason = waived ? 'Bag check passed: EXBG0PC waiver found' : bagBaseReason();
    if (!waived && bagTagCount > allowance) {
      bagReason = `${bagBaseReason()}; bag count exceeds allowance`;
    }
    const hasMsgPvgOnly = /\bMSG-[^\n\r]*\bPVG\s+ONLY\b/i.test(section);
    const hasCkinPvgOnly = /\bCKIN[^\n\r]*\bPVG\s+ONLY\b/i.test(section);
    const allBagsToPvg = bagDestinations.length > 0 && bagDestinations.every((d) => d === 'PVG');
    const hasEdi = /\bEDI\b/i.test(section);
    const hasInbound = /^\s*I\/[^\n\r]*/im.test(section);
    if (hasEdi && hasInbound) {
      bagStatus = 'pass';
      bagReason = `${bagBaseReason()}; passed because EDI with inbound is allowed`;
    }
    if (!waived) {
      if ((hasMsgPvgOnly || hasCkinPvgOnly) && allBagsToPvg) {
        bagStatus = 'pass';
        bagReason = `${bagBaseReason()}; destination matches PVG ONLY instruction`;
      } else
      if (hasOutbound && bagDestinations.length > 0) {
        const allMatchOutbound = bagDestinations.every((d) => d === outboundDest.toUpperCase());
        bagStatus = allMatchOutbound ? bagStatus : (bagStatus === 'fail' ? 'fail' : 'review');
        bagReason = allMatchOutbound
          ? `${bagBaseReason()}; destination matches outbound ${outboundDest}`
          : `${bagBaseReason()}; bag destination does not match outbound ${outboundDest}`;
      } else if (!hasOutbound && bagDestinations.length > 0) {
        const allToPvg = bagDestinations.every((d) => d === 'PVG');
        bagStatus = allToPvg ? bagStatus : (bagStatus === 'fail' ? 'fail' : 'review');
        bagReason = allToPvg
          ? `${bagBaseReason()}; no outbound found, all bags go to PVG`
          : `${bagBaseReason()}; no outbound found, bag destination must be PVG`;
      }
    }

    let apiStatus = 'pass';
    const apiReasons = [];
    if (hasTimeOut) { apiStatus = 'fail'; apiReasons.push('USA TIME OUT'); }
    if (hasGovFail) { apiStatus = 'fail'; apiReasons.push('CHN GOV FAIL'); }
    if (isPassportExpired) { apiStatus = 'fail'; apiReasons.push(`Passport expired: ${expField}`); }
    if (hasReview && apiStatus !== 'fail') { apiStatus = 'review'; apiReasons.push('WEB/EDI/Reswipe'); }
    if (apiNotWhitelisted && apiStatus !== 'fail') {
      apiStatus = 'review';
      apiReasons.push(`latest API AGT${latestApiAgent} not in whitelist`);
    }
    if (countryCodeCountZero && apiStatus !== 'fail') {
      apiStatus = 'review';
      apiReasons.push('country code count is 0, expected 3');
    }

    if (isOffloaded) {
      return { bn, apiStatus: '', tkStatus: '', visaStatus: '', bagStatus: '', apiReason: 'Passenger record is DELETED/offloaded', tkReason: '', visaReason: '', bagReason: '', passportNo: '', passengerRecord, offloaded: true };
    }

    if (hasCkinOkOverride) {
      return { bn, apiStatus: 'pass', tkStatus: 'pass', visaStatus: 'pass', bagStatus: 'pass', apiReason: '', tkReason: '', visaReason: 'CKIN OK override', bagReason, passportNo, passengerRecord, offloaded: false };
    }

    return { bn, apiStatus, tkStatus, visaStatus, bagStatus, apiReason: apiReasons.join('; '), tkReason, visaReason, bagReason, passportNo, passengerRecord, offloaded: false };
  });

  const passportBnMap = new Map();
  auditRows.forEach((row) => {
    if (row.offloaded || !row.passportNo) return;
    const arr = passportBnMap.get(row.passportNo) || [];
    arr.push(row.bn);
    passportBnMap.set(row.passportNo, arr);
  });
  auditRows.forEach((row) => {
    if (row.offloaded) return;
    const dupList = row.passportNo ? (passportBnMap.get(row.passportNo) || []) : [];
    if (dupList.length > 1 && row.apiStatus !== 'fail') {
      row.apiStatus = 'review';
      row.apiReason = row.apiReason ? `${row.apiReason}; Duplicate Passport (${dupList.join(',')})` : `Duplicate Passport (${dupList.join(',')})`;
    }
    if (!row.apiReason && row.apiStatus === 'review') {
      row.apiReason = 'Need review';
    }
  });

  return auditRows.map(({ passportNo, ...rest }) => rest);
}

function sortSYMatches(matches, preferredFlightNo = '') {
  const preferred = String(preferredFlightNo || '').trim().toUpperCase();
  return matches.slice().sort((a, b) => {
    if (preferred) {
      const aPreferred = a.info?.flightNo === preferred ? 1 : 0;
      const bPreferred = b.info?.flightNo === preferred ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    }
    return parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp);
  });
}

function findSYInfo(log, queryDate, options = {}) {
  const sections = splitLogicalSections(log);
  const preferredFlightNo = String(options.preferredFlightNo || '').trim().toUpperCase();
  const sySections = sections.filter(s => /^>\s*SY(?:\/\d{2}[A-Z]{3}(?:\d{2})?)?/im.test(s.content || '') && /SY:\s*[A-Z0-9]+\/(\d{2}[A-Z]{3}\d{2})/i.test(s.content || ''));

  if (!sySections.length) return null;

  if (queryDate) {
    const matched = sortSYMatches(sySections
      .map(s => ({ section: s, info: parseSYSection(s) }))
      .filter(x => x.info)
      .filter(x => x.info.flightDate?.startsWith(queryDate)), preferredFlightNo);
    if (matched.length) {
      const info = matched[0].info;
      const targetYmd = getYmdFromTimestamp(matched[0].section.timestamp);
      info.chdList = enrichCHDListFromLog(log, info, targetYmd);
      info.govAqq = enrichGovAqqFromLog(log, info, targetYmd);
      info.wchList = enrichWchListFromLog(log, info, targetYmd);
      info.membershipList = enrichMembershipListFromLog(log, info, targetYmd);
      info.seatMapRecords = enrichSeatMapRecordsFromLog(log, info, targetYmd);
      info.bnAudit = enrichBnAuditFromLog(log, info, targetYmd);
      info.psmList = enrichPsmListFromLog(log, info, targetYmd);
      info.crewApis = enrichCrewApisFromLog(log, info, targetYmd);
      return info;
    }
  }

  const parsed = sySections
    .map(s => ({ section: s, info: parseSYSection(s) }))
    .filter(x => x.info);

  const latestByTimestamp = parsed
    .slice()
    .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp))[0];

  const fallbackToday = new Date();
  const fallbackMon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][fallbackToday.getMonth()];
  const fallbackDd = String(fallbackToday.getDate()).padStart(2, '0');
  const fallbackYy = String(fallbackToday.getFullYear()).slice(-2);
  const fallbackFlightDate = `${fallbackDd}${fallbackMon}${fallbackYy}`;

  const todayFlightDate = getFlightDateFromTimestamp(latestByTimestamp?.section?.timestamp) || fallbackFlightDate;

  const targetFlightDate = options.preferNextDay
    ? (() => {
        const m = todayFlightDate.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
        if (!m) return todayFlightDate;
        const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
        const monIdx = monthMap[m[2]];
        if (monIdx === undefined) return todayFlightDate;
        const d = new Date(Number(`20${m[3]}`), monIdx, Number(m[1]));
        d.setDate(d.getDate() + 1);
        const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        return `${String(d.getDate()).padStart(2, '0')}${mons[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
      })()
    : todayFlightDate;
  const todayMatches = sortSYMatches(
    parsed.filter(x => x.info.flightDate === targetFlightDate),
    preferredFlightNo
  );

  if (todayMatches.length) {
    const info = todayMatches[0].info;
    const targetYmd = getYmdFromTimestamp(todayMatches[0].section.timestamp);
    info.chdList = enrichCHDListFromLog(log, info, targetYmd);
    info.govAqq = enrichGovAqqFromLog(log, info, targetYmd);
    info.wchList = enrichWchListFromLog(log, info, targetYmd);
    info.membershipList = enrichMembershipListFromLog(log, info, targetYmd);
    info.seatMapRecords = enrichSeatMapRecordsFromLog(log, info, targetYmd);
    info.bnAudit = enrichBnAuditFromLog(log, info, targetYmd);
    info.psmList = enrichPsmListFromLog(log, info, targetYmd);
    info.crewApis = enrichCrewApisFromLog(log, info, targetYmd);
    return info;
  }

  return null;
}

module.exports = { findSYInfo };
