const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function flightDateToIso(value) {
  const match = String(value || '').toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4}|\d{2})$/);
  if (!match || !MONTHS[match[2]]) return '';
  const year = match[3].length === 4 ? match[3] : `20${match[3]}`;
  return `${year}-${MONTHS[match[2]]}-${match[1]}`;
}

function normalizeFlightDate(value) {
  const match = String(value || '').toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4}|\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3].slice(-2)}` : '';
}

function timestampMs(value) {
  const match = String(value || '').match(/^(\d{4})\s+([A-Za-z]+)\s+(\d{1,2}),.*?(\d{2}):(\d{2}):(\d{2})/);
  const month = MONTHS[String(match?.[2] || '').slice(0, 3).toUpperCase()];
  return match && month ? Date.UTC(Number(match[1]), Number(month) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) : 0;
}

function commandGroups(log) {
  const groups = [];
  let current = null;
  let pendingTimestamp = '';
  const normalizedLog = String(log || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
  for (const line of normalizedLog.split(/\r?\n/)) {
    if (/^\d{4}\s+\w+\s+\d{1,2},.*\d{2}:\d{2}:\d{2}\s*$/.test(line.trim())) {
      pendingTimestamp = line.trim();
      continue;
    }
    const command = !line.includes(':') ? (line.match(/^>\s*([^\s\\]+)/)?.[1]?.toUpperCase() || '') : '';
    const continuation = /^(PN|PF)\d*$/.test(command);
    if (command && !continuation) {
      if (current) groups.push(current);
      current = { command, timestamp: pendingTimestamp, text: `${line}\n` };
      pendingTimestamp = '';
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  if (current) groups.push(current);
  return groups;
}

function numberedRecords(text) {
  const matches = [...String(text || '').matchAll(/^\s*(\d+)\.\s+(.+)(?:\n|$)/gm)];
  return matches.map((match, index) => ({
    number: Number(match[1]),
    text: text.slice(match.index, matches[index + 1]?.index ?? text.length)
  }));
}

function parseMealRecord(record, source, flightNo, flightDate, timestamp) {
  const firstLine = record.text.split(/\r?\n/, 1)[0];
  const name = firstLine.match(/^\s*\d+\.\s+\d?([A-Z][A-Z/]+?)\+?(?=\s{2,}|\s+BN\d+)/i)?.[1]?.toUpperCase() || '';
  if (!name) return null;
  const bn = firstLine.match(/\bBN(\d{1,3})\b/i)?.[1]?.padStart(3, '0') || '';
  const seat = firstLine.match(/(?:\bBN\d{1,3}\s+|\s{2,})(\d{1,2}[A-Z])\b/i)?.[1]?.toUpperCase() || '';
  const mealMatch = record.text.match(/\bSPML-([A-Z0-9]{4})\s+(?:\1\s+)?([A-Z]{2}\d+)\b/i);
  if (!mealMatch) return null;
  const status = mealMatch[2].toUpperCase();
  const bookingClass = firstLine.match(/\b([A-Z])\s+PVG\b/i)?.[1]?.toUpperCase() || '';
  const physicalCabins = {
    F:'F', A:'F',
    J:'J', C:'J', D:'J', Q:'J', I:'J', O:'J',
    Y:'Y', B:'Y', M:'Y', E:'Y', H:'Y', K:'Y', L:'Y', N:'Y', R:'Y', S:'Y', V:'Y', T:'Y', G:'Y', Z:'Y', X:'Y'
  };
  const seatRow = Number(seat.match(/\d+/)?.[0] || 0);
  const cabin = physicalCabins[bookingClass] || (seatRow >= 1 && seatRow <= 2 ? 'F' : (seatRow >= 6 && seatRow <= 20 ? 'J' : 'Y'));
  return { source, flightNo, flightDate, date: flightDateToIso(flightDate), number: record.number, passenger: name, bn, seat, bookingClass, cabin, meal: mealMatch[1].toUpperCase(), status, confirmed: status === 'HK1', timestamp };
}

function parseSpmlLog(log, options = {}) {
  const groups = commandGroups(log);
  const selectedFlight = String(options.flightNo || '').toUpperCase();
  const selectedDate = normalizeFlightDate(options.flightDate);
  const candidates = groups.flatMap((group) => {
    const header = group.text.match(/\b(?:PD|PR)\s*:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}(?:\d{4}|\d{2}))/i);
    if (!header) return [];
    const source = /^PD\*,?SPML/i.test(group.command) ? 'PD' : (/^FB\b/i.test(group.command) ? 'FB' : '');
    const flightDate = normalizeFlightDate(header[2]);
    if (!source || (selectedFlight && header[1].toUpperCase() !== selectedFlight) || (selectedDate && flightDate !== selectedDate)) return [];
    return [{ ...group, source, flightNo: header[1].toUpperCase(), flightDate }];
  });

  const latestPd = Math.max(0, ...candidates.filter((item) => item.source === 'PD').map((item) => timestampMs(item.timestamp)));
  const rows = candidates.flatMap((item) => {
    if (item.source === 'PD' && timestampMs(item.timestamp) < latestPd) return [];
    return numberedRecords(item.text).map((record) => parseMealRecord(record, item.source, item.flightNo, item.flightDate, item.timestamp)).filter(Boolean);
  });
  const deduped = [...new Map(rows.map((row) => [`${row.source}|${row.flightNo}|${row.flightDate}|${row.passenger}|${row.bn}|${row.meal}`, row])).values()];
  const summarize = (source) => deduped.filter((row) => row.source === source).reduce((counts, row) => ({ ...counts, [row.meal]: (counts[row.meal] || 0) + 1 }), {});
  const summarizeByCabin = (source) => deduped.filter((row) => row.source === source).reduce((cabins, row) => {
    cabins[row.cabin] = cabins[row.cabin] || {};
    cabins[row.cabin][row.meal] = (cabins[row.cabin][row.meal] || 0) + 1;
    return cabins;
  }, { F:{}, J:{}, Y:{} });
  return { preorder: deduped.filter((row) => row.source === 'PD'), report: deduped.filter((row) => row.source === 'FB'), preorderCounts: summarize('PD'), reportCounts: summarize('FB'), preorderByCabin:summarizeByCabin('PD') };
}

function parseMealOrderEmail(text) {
  const flight = String(text || '').match(/\b([A-Z]{2}\d+)\/(\d{2}[A-Z]{3}(?:\d{4}|\d{2}))\b/i);
  const cabinCounts = {};
  const countsByCabin = {};
  for (const cabin of ['F', 'J', 'Y']) {
    const label = cabin === 'J' ? '[JC]' : cabin;
    const match = String(text || '').match(new RegExp(`^\\s*${label}\\s*-\\s*(\\d+)([^\\n\\r]*)`, 'im'));
    cabinCounts[cabin] = Number(match?.[1] || 0);
    countsByCabin[cabin] = {};
    String(match?.[2] || '').replace(/\+\s*(\d+)\s+([A-Z0-9]{4})\b/gi, (_, count, meal) => { countsByCabin[cabin][meal.toUpperCase()] = Number(count); return _; });
  }
  const economy = String(text || '').match(/^\s*Y\s*-\s*(\d+)([^\n\r]*)/im);
  return { flightNo: flight?.[1]?.toUpperCase() || '', flightDate: normalizeFlightDate(flight?.[2]), cabinCounts, countsByCabin, economyBase: cabinCounts.Y, counts: countsByCabin.Y, economyTotal: Number(String(economy?.[2] || '').match(/=\s*(\d+)/)?.[1] || 0) };
}

module.exports = { parseSpmlLog, parseMealOrderEmail, flightDateToIso };
