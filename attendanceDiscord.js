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
  const month = new Date(record.date.slice(0, 7) + '-01T12:00:00Z').toLocaleDateString('en-US', { month:'long', year:'numeric', timeZone:'UTC' });
  const rows = [...history].sort((a,b) => a.date.localeCompare(b.date)).slice(-25);
  const timeline = rows.map((row,index) => {
    const date = new Date(row.date + 'T12:00:00Z').toLocaleDateString('en-US', { month:'short', day:'2-digit', timeZone:'UTC' });
    return `${index === rows.length - 1 ? '🟢' : '◯'}  \`${date}\`   ${row.type === 'late' ? '🕒 **Coming Late**' : '🛌 **Call Off / Sick**'}${index === rows.length - 1 ? '  ·  **Latest**' : ''}`;
  }).join('\n│\n');
  return [
    { title: late ? 'Coming Late' : 'Call Off / Sick', color: late ? 0xffcb35 : 0xff5b76, fields, footer: { text: record.reference }, timestamp: record.submittedAt },
    { title: '📊 Monthly Report', color: 0xffcb35, description: `**${month}**\n${safe(record.employeeName)}\n\n${timeline || '*No requests this month.*'}`, footer: { text: `${history.length} request${history.length === 1 ? '' : 's'} this month${history.length > 25 ? ' · Latest 25 shown' : ''}` } },
    { title: '⚠️ Attendance Policy Reminder', color: 0xff4166, description: '**HAS Employee Handbook**\n\n> **6.7.21**\n> Unsatisfactory attendance, excessive absenteeism, repeated tardiness.', fields: [{ name:'Supervisor notification', value:'Speak **directly with your supervisor** about your absence.' }] }
  ];
}
module.exports = { fallbackEmbeds };
