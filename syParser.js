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

function getYmdFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const m = timestamp.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2}),/);
  if (!m) return null;
  const monMap = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const mm = monMap[m[2]];
  if (!mm) return null;
  return `${m[1]}-${mm}-${m[3]}`;
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
      if (sectionYmd !== targetYmd) continue;
    }
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (!prMatch) continue;
    if (prMatch[1].toUpperCase() !== syInfo.flightNo || prMatch[2].toUpperCase() !== syInfo.flightDate) continue;

    const paxMatch = section.match(/\n\s*\d+\.\s*([A-Z\/]+).*?\bBN(\d{1,3})\b.*?(?:\*?(\d+[A-Z]))?/i);
    if (!paxMatch) continue;
    const name = (paxMatch[1] || '').trim();
    const bn = (paxMatch[2] || '').padStart(3, '0');
    const paxInfo = section.match(/PAX INFO\s*:\s*([^\n\r]+)/i)?.[1] || '';
    const dobRaw = paxInfo.match(/DOB\/(\d{6})/i)?.[1] || null;
    const dobDate = parseDobYYMMDD(dobRaw);
    const ageYears = getAgeYearsAtDate(dobDate, atDateUtc);
    const hasChdCode = /\bCHD1\/0\b/i.test(section);
    const isChdByAge = Number.isInteger(ageYears) && ageYears >= 2 && ageYears < 12;
    const isChd = isChdByAge || hasChdCode;
    if (!isChd) continue;

    if (!chdByBn.has(bn)) {
      chdByBn.set(bn, {
        name,
        bn,
        dob: dobRaw ? `20${dobRaw.slice(0, 2)}-${dobRaw.slice(2, 4)}-${dobRaw.slice(4, 6)}` : '-',
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
  '23305', '23244', '27199', '24648'
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
      if (sectionYmd !== targetYmd) continue;
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

function enrichBnAuditFromLog(log, syInfo, targetYmd = null) {
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
    const bnMatch = section.match(/\bBN(\d{1,3})\b/i);
    if (!bnMatch) continue;
    const bn = bnMatch[1].padStart(3, '0');
    const ts = parseSectionTimestamp(sectionObj.timestamp);
    const prev = latestByBn.get(bn);
    if (prev && prev.ts > ts) continue;
    latestByBn.set(bn, { ts, section });
  }

  return [...latestByBn.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([bn, payload]) => {
    const section = payload.section || '';
    const hasCkinOkOverride = /^\s*CKIN\s+OK(?:\s+BY\s+[A-Z0-9]+)?\b/im.test(section);
    const outboundLine = section.match(/^\s*O\/[^\n\r]*/im)?.[0] || '';
    const outboundDest = outboundLine.match(/\b([A-Z]{3})\s*$/i)?.[1]?.toUpperCase() || '';
    const hasOutbound = Boolean(outboundDest);
    const hasTimeOut = /\bAQQ\/TCL\/USA\b/i.test(section);
    const hasGovFail = /\bGOV\/DTA\/CHN\b/i.test(section);
    const hasReview = /\bWEB\/EDI\/RESWIPE\b/i.test(section);
    const apiStatus = hasTimeOut || hasGovFail ? 'fail' : (hasReview ? 'review' : 'pass');

    const hasInfFlag = /\bINF1\/0\b/i.test(section);
    const hasAdultTk = /\bET\s+TKNE\/(?!INF)\d{10,}\/\d+\b/i.test(section);
    const hasInfTk = /\bET\s+TKNE\/INF\d{10,}\/\d+\b/i.test(section);
    const tkStatus = hasInfFlag ? (hasAdultTk && hasInfTk ? 'pass' : 'fail') : (hasAdultTk ? 'pass' : 'fail');

    const waived = /\bPSM-EXBG0PC/i.test(section);
    const fbaPc = Number(section.match(/\bFBA\/(\d+)PC\b/i)?.[1] || 0);
    const xbagPc = Number(section.match(/\bXBAG\/(\d+)PC\b/i)?.[1] || 0);
    const pdbgCount = [...section.matchAll(/\bPDBG\b/gi)].length;
    const hasExtraBaggageByTier = /\bFF\/MU\s+\d+\/(?:V|G|S)\b/i.test(section) || /\*1|\*2/.test(section);
    const tierExtraPc = hasExtraBaggageByTier ? 1 : 0;
    const purchasedExtra = Math.max(0, xbagPc - fbaPc) + pdbgCount + tierExtraPc;
    const bagTagRaw = [...section.matchAll(/BAGTAG\/([^\n\r]+)/gi)]
      .map((m) => m[1] || '')
      .join(' ');
    const bagDestinations = [...bagTagRaw.matchAll(/\/([A-Z]{3})\b/gi)].map((m) => (m[1] || '').toUpperCase());
    const bagTagCount = bagDestinations.length;
    const allowance = fbaPc + purchasedExtra;
    let bagStatus = waived ? 'pass' : (bagTagCount > allowance ? 'fail' : 'pass');
    if (hasOutbound && bagDestinations.length > 0) {
      const allMatchOutbound = bagDestinations.every((d) => d === outboundDest.toUpperCase());
      bagStatus = allMatchOutbound ? bagStatus : 'review';
    } else if (!hasOutbound && bagDestinations.length > 0) {
      const allToPvg = bagDestinations.every((d) => d === 'PVG');
      bagStatus = allToPvg ? bagStatus : 'review';
    }

    if (hasCkinOkOverride) {
      return { bn, apiStatus: 'pass', tkStatus: 'pass', bagStatus: 'pass' };
    }

    return { bn, apiStatus, tkStatus, bagStatus };
  });
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
      const targetYmd = getYmdFromTimestamp(matched[0].section.timestamp);
      info.chdList = enrichCHDListFromLog(log, info, targetYmd);
      info.govAqq = enrichGovAqqFromLog(log, info, targetYmd);
      info.bnAudit = enrichBnAuditFromLog(log, info, targetYmd);
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
    const targetYmd = getYmdFromTimestamp(todayMatches[0].section.timestamp);
    info.chdList = enrichCHDListFromLog(log, info, targetYmd);
    info.govAqq = enrichGovAqqFromLog(log, info, targetYmd);
    info.bnAudit = enrichBnAuditFromLog(log, info, targetYmd);
    return info;
  }

  return null;
}

module.exports = { findSYInfo };
