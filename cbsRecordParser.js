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

module.exports = { bagTagSectionHasSerial, extractPnrRecordsForBagTag };
