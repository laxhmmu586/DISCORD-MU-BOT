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
    { title: late ? 'Coming Late' : 'Call Off / Sick', color: late ? 0xffcb35 : 0xff5b76, fields, footer: { text: record.reference }, timestamp: record.submittedAt },
    { title: 'Monthly Report · ' + record.date.slice(0, 7), color: 0xffcb35, description: `${safe(record.employeeName)} · ${history.length} request(s)\n\n` + (history.slice(-25).map(row => `${row.date} · ${row.type === 'late' ? 'Coming Late' : 'Call Off / Sick'}`).join('\n') || 'No records'), footer: { text: history.length > 25 ? 'Showing the latest 25 requests' : 'Requests for this month' } },
    { title: 'Attendance Policy Reminder', color: 0xff4166, description: 'HAS Employee Handbook · 6.7.21\nUnsatisfactory attendance, excessive absenteeism, repeated tardiness.\n\nSpeak directly with your supervisor about your absence.' }
  ];
}
module.exports = { fallbackEmbeds };
