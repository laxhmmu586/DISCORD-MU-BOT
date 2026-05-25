function splitLogicalSections(log) {
  const lines = log.split(/\r?\n/);
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
      current = { content: '' };
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


function getFlightDateFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const m = timestamp.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2}),/);
  if (!m) return null;
  const mon = m[2].toUpperCase();
  const yy = m[1].slice(-2);
  return `${m[3]}${mon}${yy}`;
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

function parseDobYYMMDD(dobRaw) {
  if (!/^\d{6}$/.test(dobRaw || '')) return null;
  const yy = Number(dobRaw.slice(0, 2));
  const mm = Number(dobRaw.slice(2, 4));
  const dd = Number(dobRaw.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const fullYear = yy >= 70 ? 1900 + yy : 2000 + yy;
  return new Date(Date.UTC(fullYear, mm - 1, dd));
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

function enrichCHDListFromLog(log, syInfo) {
  if (!log || !syInfo?.flightNo || !syInfo?.flightDate) return [];
  const sections = splitLogicalSections(log);
  const chdList = [];

  const flightDateMatch = syInfo.flightDate.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const atDateUtc = flightDateMatch
    ? new Date(Date.UTC(Number(`20${flightDateMatch[3]}`), monthMap[flightDateMatch[2]], Number(flightDateMatch[1])))
    : null;

  for (const sectionObj of sections) {
    const section = sectionObj.content || '';
    if (!section.includes('PR:')) continue;
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const paxMatch = section.match(/\n\s*\d+\.\s*([A-Z\/]+).*?\bBN(\d{1,3})\b.*?(?:\*?(\d+[A-Z]))?/i);
    if (!paxMatch) continue;
    const name = (paxMatch[1] || '').trim();
    const bn = (paxMatch[2] || '').padStart(3, '0');
    const seat = (paxMatch[3] || '---').toUpperCase();

    const paxInfo = section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '';
    const dobRaw = paxInfo.match(/DOB\/(\d{6})/i)?.[1] || null;
    const dobDate = parseDobYYMMDD(dobRaw);
    const ageYears = getAgeYearsAtDate(dobDate, atDateUtc);
    const isChd = Number.isInteger(ageYears) && ageYears >= 2 && ageYears < 12;
    if (!isChd) continue;

    const hasChdCode = /\bCHD1\/0\b/i.test(section);

    chdList.push({
      name,
      bn,
      seat,
      dob: dobRaw ? `20${dobRaw.slice(0, 2)}-${dobRaw.slice(2, 4)}-${dobRaw.slice(4, 6)}` : '-',
      hasChdCode
    });
  }

  return chdList.sort((a, b) => a.bn.localeCompare(b.bn));
}

function findSYInfo(log, queryDate, options = {}) {
  const sections = splitLogicalSections(log);
  const sySections = sections.filter(s => /^>\s*SY(?:\/\d{2}[A-Z]{3}(?:\d{2})?)?/im.test(s.content || '') && /SY:\s*[A-Z0-9]+\/(\d{2}[A-Z]{3}\d{2})/i.test(s.content || ''));

  if (!sySections.length) return null;

  if (queryDate) {
    const matched = sySections
      .map(s => ({ section: s, info: parseSYSection(s) }))
      .filter(x => x.info)
      .filter(x => x.info.flightDate?.startsWith(queryDate))
      .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp));
    if (matched.length) {
      const info = matched[0].info;
      info.chdList = enrichCHDListFromLog(log, info);
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
  const todayMatches = parsed
    .filter(x => x.info.flightDate === targetFlightDate)
    .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp));

  if (todayMatches.length) {
    const info = todayMatches[0].info;
    info.chdList = enrichCHDListFromLog(log, info);
    return info;
  }

  return null;
}

module.exports = { findSYInfo };
