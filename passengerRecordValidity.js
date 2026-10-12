// A failed FB lookup is authoritative for that BN in the current flight context.
// Resolve context by timestamp because terminal exports can be newest-first.
function filterUnavailablePassengerSections(sections, timestampToMs) {
  const entries = sections.map((section, index) => ({
    section, index, ts: timestampToMs(section.timestamp) || 0
  })).sort((a, b) => a.ts - b.ts || a.index - b.index);
  const unavailable = new Map();
  const identities = new Map();
  let context = null;
  const keyFor = (flight, date, day, bn) => `${flight}|${date}|${day}|${bn.padStart(3, '0')}`;

  for (const entry of entries) {
    const text = entry.section.content || '';
    const day = entry.ts ? Math.floor(entry.ts / 86400000) : 0;
    const header = text.match(/\b(?:PR|SY):\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
    if (header) context = { flight: header[1].toUpperCase(), date: header[2].toUpperCase(), day };
    // Only the PR header or passenger line identifies the local BN. An onward
    // connection's BN must never identify this passenger.
    const bn = text.match(/\bPR:[^\r\n]*,BN\s*(\d{1,3})\b/i)?.[1]
      || text.match(/^\s*\d+\.[^\r\n]*\bBN\s*(\d{1,3})\b/im)?.[1];
    if (header && bn) identities.set(entry.index, keyFor(header[1].toUpperCase(), header[2].toUpperCase(), day, bn));
    const emptyBn = text.match(/^\s*>\s*FB\s*(\d{1,3})\s*$/im)?.[1];
    if (emptyBn && /^\s*(?:>\s*)?PSGR\s+ID\s*$/im.test(text) && context?.day === day) {
      unavailable.set(keyFor(context.flight, context.date, day, emptyBn), entry);
    }
  }

  return sections.filter((section, index) => {
    const empty = unavailable.get(identities.get(index));
    if (!empty) return true;
    const ts = timestampToMs(section.timestamp) || 0;
    return ts > empty.ts || (ts === empty.ts && index > empty.index);
  });
}

module.exports = { filterUnavailablePassengerSections };
