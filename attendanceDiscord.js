const { escapeMarkdown } = require('discord.js');
const safe = value => escapeMarkdown(String(value || ''));
function fallbackEmbeds(record, history) {
  const late = record.type === 'late';
  const fields = [
    { name: 'Employee', value: safe(record.employeeName), inline: true },
    { name: 'Date', value: record.date, inline: true }
  ];
  if (late) fields.push({ name: 'Expected arrival', value: record.arrivalTime + ' PT', inline: true });
  fields.push({ name: late ? 'Why?' : 'Reason', value: safe(record.reason).slice(0, 1024) || '—' });
  if (record.note) fields.push({ name: 'Note', value: safe(record.note).slice(0, 1024) });
  return [
    { title: late ? 'Coming Late' : 'Call Off / Sick', color: late ? 0xffcb35 : 0xff5b76, fields, footer: { text: record.reference }, timestamp: record.submittedAt }
  ];
}
module.exports = { fallbackEmbeds };
