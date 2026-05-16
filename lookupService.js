const { passengers, findBySeat, findByName, findByFFNumber, parseIncrementalLog } = require('./flightParser');
const { parsePDLog, findPDByFFNumber } = require('./pdParser');
const { getLatestFlightLog, getFlightLogByDate } = require('./googleDrive');

function getCabinFromSeat(seat) {
  const row = parseInt((seat || '').match(/\d+/)?.[0]);
  if (!row) return 'Economy';
  if (row >= 1 && row <= 2) return 'First';
  if (row >= 6 && row <= 20) return 'Business';
  return 'Economy';
}

function getMembershipStatus(tier) {
  if (tier === 'V') return 'Platinum';
  if (tier === 'G') return 'Gold';
  if (tier === 'S') return 'Silver';
  return '';
}

function splitSections(log) {
  return log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);
}

function findPassengerFromPRRecord(log, mode, query) {
  const sections = splitSections(log);
  const normalizedBN = query.padStart(3, '0');
  const normalizedSeat = query.toUpperCase();

  const targetSection = sections.find(section => {
    const prLine = section.match(/PR:\s+[^\n\r]+/i)?.[0] || '';
    if (mode === 'BN') return new RegExp(`,BN0*${normalizedBN}\\b`, 'i').test(prLine);
    if (mode === 'SEAT') return new RegExp(`,SN\\s*${normalizedSeat}\\b`, 'i').test(prLine);
    return false;
  });

  if (!targetSection) return null;

  const bnMatch = targetSection.match(/\bBN(\d{1,3})\b/i);
  const pax = targetSection.match(/\d+\.\s+([A-Z\/]+).*?BN(\d{1,3}).*?(\d+[A-Z])?/i);
  const flightMatch = targetSection.match(/PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
  if (!bnMatch && !pax) return null;

  return {
    bn: (pax?.[2] || bnMatch?.[1] || '').padStart(3, '0'),
    name: pax?.[1] || 'UNKNOWN',
    seat: pax?.[3] || '---',
    cabin: 'Economy',
    flight: flightMatch?.[1] || '',
    flightDate: (flightMatch?.[2] || '').substring(0, 5),
    membershipStatus: ''
  };
}

function findPDPassengerByFFFromLog(log, query) {
  const ff = query.replace(/\s+/g, '').toUpperCase();
  if (!/^([A-Z]{2})(\d+)$/.test(ff)) return null;

  const sections = splitSections(log);
  for (const section of sections) {
    if (!section.includes('PD:')) continue;
    const rows = section.split(/\r?\n/);

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i].match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);
      if (!m) continue;
      const current = `${m[1]}${m[2]}`.replace(/\s+/g, '').toUpperCase();
      if (current !== ff) continue;

      let name = 'PD MEMBER';
      let bn = '---';
      let seat = '---';
      for (let j = i - 1; j >= 0; j--) {
        const pax = rows[j].match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);
        if (!pax) continue;
        name = pax[1]?.replace(/\+$/, '') || name;
        if (pax[2]) bn = pax[2].padStart(3, '0');
        if (pax[3]) seat = pax[3];
        break;
      }

      const flightMatch = section.match(/PD:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
      return {
        pdOnly: true,
        flight: flightMatch?.[1] || '',
        flightDate: (flightMatch?.[2] || '').substring(0, 5),
        name,
        bn,
        seat,
        cabin: 'Elite',
        ffCarrier: m[1],
        ffNumber: m[2],
        ffTier: m[3],
        membershipStatus: getMembershipStatus(m[3]),
        lounge: { eligible: true, guest: m[3] === 'V' }
      };
    }
  }

  return null;
}

function findPassengerByPRIndex(log, query) {
  const idxMatch = (query || '').trim().toUpperCase().match(/^(\d{1,3})$/);
  if (!idxMatch) return null;
  const idx = parseInt(idxMatch[1], 10);

  for (const section of splitSections(log)) {
    if (!section.includes('PR:')) continue;
    const rows = section.split(/\r?\n/);
    const paxLine = rows.find(r => new RegExp(`^\\s*${idx}\\.\\s+`, 'i').test(r));
    if (!paxLine) continue;

    const pm = paxLine.match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);
    if (!pm) continue;

    const flightMatch = section.match(/PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    let ffCarrier = null; let ffNumber = null; let ffTier = null;
    const start = rows.indexOf(paxLine);
    for (let i = start + 1; i < Math.min(start + 8, rows.length); i++) {
      const fm = rows[i].match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);
      if (fm) { ffCarrier = fm[1]; ffNumber = fm[2]; ffTier = fm[3]; break; }
      if (/^\s*\d+\.\s+/.test(rows[i])) break;
    }

    return {
      bn: pm[2] ? pm[2].padStart(3, '0') : '---',
      name: (pm[1] || '').replace(/\+$/, ''),
      seat: pm[3] || '---',
      cabin: getCabinFromSeat(pm[3] || ''),
      flight: flightMatch?.[1] || '',
      flightDate: (flightMatch?.[2] || '').substring(0, 5),
      ffCarrier,
      ffNumber,
      ffTier,
      lounge: { eligible: false, guest: false }
    };
  }
  return null;
}

async function runLookup(mode, rawQuery) {
  let query = (rawQuery || '').trim().toUpperCase();
  if (mode === 'FF') {
    query = query.replace(/^FF\//i, '').replace(/\s+/g, '').replace(/^(MU)\/(\d+)$/i, '$1$2');
  }
  if (mode === 'NAME') query = query.replace(/\+$/, '');

  let date = null;
  const dateSuffixMatch = query.match(/^(.*)\/(\d{2}[A-Z]{3})$/i);
  if (dateSuffixMatch) {
    query = dateSuffixMatch[1].trim().toUpperCase();
    date = dateSuffixMatch[2].trim().toUpperCase();
  }

  const log = date ? await getFlightLogByDate(date) : await getLatestFlightLog();
  if (!log) return { error: 'Unable to load Flight Control.log' };

  parseIncrementalLog(log);
  parsePDLog(log);

  let pax = null;
  if (mode === 'BN') {
    pax = passengers[query.padStart(3, '0')] || findPassengerFromPRRecord(log, mode, query);
  } else if (mode === 'SEAT') {
    pax = findBySeat(query) || findPassengerFromPRRecord(log, mode, query);
  } else if (mode === 'TICKET') {
    pax = Object.values(passengers).find(p => p.ticketNumber === query);
  } else if (mode === 'FF') {
    pax = findByFFNumber(query) || findPDByFFNumber(query);
    if (pax && pax.name === 'PD MEMBER') pax = findPDPassengerByFFFromLog(log, query) || pax;
  } else if (mode === 'PR') {
    pax = findPassengerByPRIndex(log, query);
  } else if (mode === 'NAME') {
    pax = findByName(query);
  }

  if (!pax) return { error: 'Passenger data not updated yet.' };
  const membershipStatus = pax.membershipStatus || getMembershipStatus(pax.ffTier);
  return { pax, membershipStatus };
}

function buildEmbed(pax, membershipStatus) {
  return {
    color: 0xf59e0b,
    title: `✈️ ${pax.flight}/${pax.flightDate}`,
    description: `👤 ${pax.name}\n\n🎫 BN${pax.bn} • ${pax.seat} • ${pax.cabin}`,
    fields: [
      ...(pax.ffNumber ? [{ name: '💳 Membership', value: `${pax.ffCarrier} ${pax.ffNumber}${membershipStatus ? `\n${membershipStatus}` : ''}`, inline: true }] : []),
      ...(pax.ticketNumber ? [{ name: '🎟 Ticket', value: pax.ticketNumber, inline: true }] : []),
      ...(pax.bagtags?.length ? [{ name: '🧳 Bags', value: pax.bagtags.join('\n'), inline: false }] : []),
      ...(pax.inbound ? [{ name: '⬅ Inbound', value: `${pax.inbound.flight}/${pax.inbound.date}\nFrom ${pax.inbound.origin}`, inline: true }] : []),
      ...(pax.outbound ? [{ name: '➡ Outbound', value: `${pax.outbound.flight}/${pax.outbound.date}${pax.outbound.bn ? ` • BN${pax.outbound.bn}` : ''}${pax.outbound.seat ? ` • ${pax.outbound.seat}` : ''}\nTo ${pax.outbound.destination}`, inline: true }] : []),
      { name: '🛋 Lounge Access', value: pax.lounge?.eligible ? '✅ Eligible' : '❌ Not Eligible', inline: true },
      { name: '👥 Lounge Guest', value: pax.lounge?.guest ? '✅ Allowed' : '❌ Not Allowed', inline: true }
    ],
    footer: { text: 'MUFC' }
  };
}

module.exports = { runLookup, buildEmbed };
