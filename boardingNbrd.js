'use strict';
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
module.exports = { nbrdEntriesFromFb };
