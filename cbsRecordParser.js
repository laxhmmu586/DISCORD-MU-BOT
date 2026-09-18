'use strict';

function bagTagSection(record) {
  const match = String(record || '').match(/(?:^|\n)\s*BAGTAG\/[\s\S]*?(?=\n\s*(?:I\/|O\/|RES\b|ACC\b|GOV\b|MOD\b|PR:|>\s*PR:)|$)/i);
  return match?.[0] || '';
}

function bagTagSectionHasSerial(record, serial) {
  const wanted = String(serial || '').replace(/\D/g, '').slice(-6);
  if (!/^\d{6}$/.test(wanted)) return false;
  const section = bagTagSection(record);
  const numericTags = section.match(/\d{6,10}/g) || [];
  if (numericTags.some((tag) => tag.slice(-6) === wanted)) return true;
  const airlineTags = section.match(/[A-Z][A-Z0-9]\s*\d{6}/gi) || [];
  return airlineTags.some((tag) => tag.replace(/\D/g, '').slice(-6) === wanted);
}

function extractPnrRecordsForBagTag(content, serial) {
  const text = String(content || '').replace(/\r\n?/g, '\n');
  const starts = [...text.matchAll(/^\s*>?\s*PR:\s*/gim)].map((match) => match.index);
  if (!starts.length) return bagTagSectionHasSerial(text, serial) ? [text.trim()] : [];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? text.length;
    const before = text.slice(index ? starts[index - 1] : 0, start);
    const timestamp = before.match(/(?:^|\n)(\d{4}\s+[A-Za-z]+\s+\d{1,2},[^\n]*\n(?:\s*>?\s*FB[^\n]*\n)?)[\s\S]*$/i)?.[1] || '';
    return `${timestamp}${text.slice(start, end)}`.trim();
  }).filter((record) => bagTagSectionHasSerial(record, serial));
}

function splitPnrAndTicketRecord(record) {
  const text = String(record || '').replace(/\r\n?/g, '\n').trim();
  const bagTagIndex = text.search(/(?:^|\n)\s*BAGTAG\//i);
  if (bagTagIndex < 0) return { pnr:text, ticket:'' };
  const transactionPattern = /^\d{4}\s+[A-Za-z]+\s+\d{1,2},[^\n]*\n\s*>\s*([^\n]+)/gim;
  const transactions = [...text.matchAll(transactionPattern)].filter((match) => match.index > bagTagIndex);
  const firstTransaction = transactions[0];
  const pnr = text.slice(0, firstTransaction?.index ?? text.length).trim();
  const ticketStart = transactions.find((match) => /^ETKD\b/i.test(match[1]))?.index;
  if (ticketStart == null) return { pnr, ticket:'' };
  const ticketEnd = transactions.find((match) => match.index > ticketStart)?.index ?? text.length;
  return { pnr, ticket:text.slice(ticketStart, ticketEnd).trim() };
}

module.exports = { bagTagSectionHasSerial, extractPnrRecordsForBagTag, splitPnrAndTicketRecord };
