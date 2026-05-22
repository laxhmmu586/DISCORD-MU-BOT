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
    statusDisplay
  };
}

function findSYInfo(log, queryDate) {
  const sections = splitLogicalSections(log);
  const sySections = sections.filter(s => /^>\s*SY(?:\/\d{2}[A-Z]{3})?/im.test(s.content || '') && /SY:\s*[A-Z0-9]+\/(\d{2}[A-Z]{3}\d{2})/i.test(s.content || ''));

  if (!sySections.length) return null;

  if (queryDate) {
    const matched = sySections
      .map(s => ({ section: s, info: parseSYSection(s) }))
      .filter(x => x.info)
      .filter(x => x.info.flightDate?.startsWith(queryDate))
      .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp));
    if (matched.length) return matched[0].info;
  }

  const today = new Date();
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][today.getUTCMonth()];
  const todayDd = String(today.getUTCDate()).padStart(2, '0');
  const todayYy = String(today.getUTCFullYear()).slice(-2);
  const todayFlightDate = `${todayDd}${mon}${todayYy}`;

  const parsed = sySections
    .map(s => ({ section: s, info: parseSYSection(s) }))
    .filter(x => x.info);

  const todayMatches = parsed
    .filter(x => x.info.flightDate === todayFlightDate)
    .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp));

  if (todayMatches.length) return todayMatches[0].info;

  const latest = parsed
    .sort((a, b) => parseSectionTimestamp(b.section.timestamp) - parseSectionTimestamp(a.section.timestamp))[0];
  return latest ? latest.info : null;
}

module.exports = { findSYInfo };
