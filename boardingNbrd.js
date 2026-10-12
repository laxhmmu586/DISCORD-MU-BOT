'use strict';
const { sections } = require('./flightContext');

// Keep passenger ownership across a PN page only when the preceding page
// explicitly continues (+). Revisited pages can start inside another passenger.
function nbrdEntriesFromPd(log, flight, date) {
  const entries = new Map(), states = new Map();
  for (const section of sections(log)) {
    const previous = states.get(section.file);
    const continuation = /^>\s*(?:PN|PF)\d*\s*$/im.test(section.text);
    const query = /^>\s*PD\*\s*,\s*CKIN\/NBRD\s*$/im.test(section.text);
    const header = /\bPD:\s*[^\n]*,\s*CKIN\/NBRD\b/i.test(section.text);
    const scope = section.flightNo === flight && section.flightDate === date;
    if (!scope || !(query || (continuation && (header || previous?.active)))) {
      states.delete(section.file);
      continue;
    }
    let passenger = continuation && previous?.continued ? previous.passenger : null;
    const lines = section.text.trimEnd().split(/\r?\n/);
    for (const line of lines) {
      if (/^\s*\d+\./.test(line)) {
        const bn = line.match(/\bBN(\d{1,4})\b/i)?.[1];
        passenger = bn ? { bn: String(Number(bn)).padStart(3, '0'), comments: [] } : null;
        continue;
      }
      if (!passenger || !/^\s*CKIN\s+NBRD\b/i.test(line)) continue;
      const detail = line.trim().replace(/\s*\+\s*$/, '').trim();
      if (!passenger.comments.includes(detail)) passenger.comments.push(detail);
      entries.set(passenger.bn, { bn: passenger.bn, detail: passenger.comments.join(' | ') });
    }
    states.set(section.file, { active: true, passenger, continued: /\+\s*$/.test(lines.at(-1)) });
  }
  return [...entries.values()];
}
// Match the dashboard's existing FB gate-comment rule exactly.
function nbrdEntriesFromFb(rows = []) {
  const entries = new Map();
  for (const row of rows) {
    if (row.offloaded || !/^\d{1,4}$/.test(String(row.bn || ''))) continue;
    const comments = row.passengerRecord?.gateComments || row.ckinLines;
    if (!Array.isArray(comments)) continue;
    const lines = comments.map(line => String(line || '').trim()).filter(line => /^CKIN\s+NBRD\b/i.test(line));
    if (lines.length) entries.set(row.bn, { bn: row.bn, detail: lines.join(' | ') });
  }
  return [...entries.values()];
}
module.exports = { nbrdEntriesFromFb, nbrdEntriesFromPd };
