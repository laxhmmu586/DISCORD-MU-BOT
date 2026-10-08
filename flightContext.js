'use strict';
const SUPPORTED_FLIGHTS = ['MU586', 'MU9586', 'MU578'];
const FILE_BOUNDARY = '\n\u241eMUFC_FILE_BOUNDARY\u241e\n';
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function timestamp(value) {
  const m = value.match(/^(\d{4})\s+(\w+)\s+(\d{1,2}),.*?(\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], months.indexOf(m[2].slice(0,3).toUpperCase()), +m[3], +m[4], +m[5], +m[6]) : 0;
}
// Resolve terminal context within each file before merging terminals. A PN/empty FB
// must never inherit the active flight from a different workstation's export.
function sections(log) {
  const result = [];
  for (const [file, text] of String(log || '').split(FILE_BOUNDARY).entries()) {
    const parts = []; let current = null, stamp = '';
    const flush = () => { if (current?.text.trim()) parts.push(current); current = null; };
    for (const raw of text.replace(/\r\n/g,'\n').replace(/\\n/g,'\n').split('\n')) {
      const line = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
      if (/^\d{4}\s+\w+\s+\d{1,2},.*\d{2}:\d{2}:\d{2}/.test(line.trim())) { flush(); stamp = line.trim(); continue; }
      if (/^>\s*[A-Z0-9*\/]+/i.test(line) && !/^>\s*(?:(?:SY|PR|PD)\s*:|ACCEPTED\b)/i.test(line)) flush();
      if (!current) current = { text:'', stamp, ts:timestamp(stamp), file, seq:parts.length };
      current.text += line + '\n';
    }
    flush();
    parts.sort((a,b) => a.ts-b.ts || a.seq-b.seq);
    let context = null, passengerHeader = '';
    for (const part of parts) {
      const day = part.ts ? Math.floor(part.ts / 86400000) : 0;
      const header = part.text.match(/(?:^|\n)\s*(?:>\s*)?(?:SY|PR|PD):\s*([A-Z]{2}\d{1,4}[A-Z]?)\/(\d{2}[A-Z]{3})(\d{2})?/i);
      const command = part.text.match(/^>[^\n]*?\b([A-Z]{2}\d{1,4}[A-Z]?)\/(\d{2}[A-Z]{3})(\d{2})?/i);
      const match = header || command;
      if (match) context = { flightNo:match[1].toUpperCase(), flightDate:(match[2] + (match[3] || (part.ts ? String(new Date(part.ts).getUTCFullYear()).slice(-2) : ''))).toUpperCase(), day };
      else if (context?.day !== day) { context = null; passengerHeader = ''; }
      const pr = part.text.match(/(?:^|\n)\s*(?:>\s*)?(PR:[^\n]+)/i)?.[1];
      const continuation = /^>\s*(?:PN|PF)\d*\b/i.test(part.text);
      if (pr) passengerHeader = pr;
      else if (continuation && passengerHeader) part.text = part.text.replace(/\n/, '\n '+passengerHeader+'\n');
      else if (!continuation) passengerHeader = '';
      result.push({ ...part, ...(context || {}), global:/^>\s*XS\s+FSC\b/im.test(part.text) });
    }
  }
  return result.sort((a,b) => a.ts-b.ts || a.file-b.file || a.seq-b.seq);
}
function scopedLog(log, flightNo, flightDate = '') {
  if (!SUPPORTED_FLIGHTS.includes(flightNo)) throw new Error('Choose MU586, MU9586 or MU578.');
  return sections(log).filter(s => s.global || (s.flightNo === flightNo && (!flightDate || s.flightDate === flightDate)))
    .map(s => (s.stamp ? s.stamp+'\n' : '')+s.text).join('\n');
}
function operationalDate(now = new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  return parts.day+parts.month.toUpperCase()+parts.year;
}
function discoverFlights(log, { date = '' } = {}) {
  const found = new Map();
  for (const section of sections(log)) {
    const m = section.text.match(/(?:^|\n)\s*(?:>\s*)?SY:\s*(MU586|MU9586|MU578)\/(\d{2}[A-Z]{3}\d{2})\b/i);
    if (!m) continue;
    const flightNo = m[1].toUpperCase(), flightDate = m[2].toUpperCase();
    if (date && flightDate !== date) continue;
    const aircraft = section.text.match(/(?:^|\n)\s*(?:>\s*)?(\d{3})\/([A-Z0-9]+)\/([A-Z0-9]+)\b/i);
    const route = section.text.match(/\*([A-Z]{3})([A-Z]{3})\s+R/);
    const origin = route?.[1] || section.text.match(/\bSY:\s*[^\s]+\s+([A-Z]{3})\//i)?.[1]?.toUpperCase() || '';
    if (origin !== 'LAX') continue;
    found.set(`${flightNo}/${flightDate}`, { flightNo, flightDate, aircraftType:aircraft ? `${aircraft[1]}-${aircraft[2]}` : '', aircraftRegistration:aircraft?.[3] || '', origin, destination:route?.[2] || '', gate:section.text.match(/\bGTD\/([A-Z0-9]+)\b/i)?.[1] || '', sd:section.text.match(/\bSD(\d{4})/)?.[1] || '', ed:section.text.match(/\bED(\d{4})/)?.[1] || '', bdt:section.text.match(/\bBDT(\d{4})/)?.[1] || '', latest:section.ts });
  }
  return [...found.values()].sort((a,b) => SUPPORTED_FLIGHTS.indexOf(a.flightNo)-SUPPORTED_FLIGHTS.indexOf(b.flightNo) || b.latest-a.latest);
}
module.exports = { SUPPORTED_FLIGHTS, FILE_BOUNDARY, sections, scopedLog, discoverFlights, operationalDate };
