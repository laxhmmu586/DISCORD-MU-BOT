const ORIGIN = 'LAX';
const DESTINATION = 'PVG';

function extractPnr(sourceText = '') {
  return String(sourceText).match(/\bPNR\s+RL\s+([A-Z0-9]{5,8})\b/i)?.[1]?.toUpperCase() || '';
}

function flightDayOfYear(flightDate = '', now = new Date()) {
  const match = String(flightDate).toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{2})?$/);
  const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  if (!match || months[match[2]] === undefined) return '001';
  const year = match[3] ? 2000 + Number(match[3]) : now.getUTCFullYear();
  const date = Date.UTC(year, months[match[2]], Number(match[1]));
  const day = Math.floor((date - Date.UTC(year, 0, 1)) / 86400000) + 1;
  return String(day).padStart(3, '0');
}

function normalizePassenger(passenger = {}, operations = {}) {
  const flight = String(passenger.flight || operations.flight || 'MU586').toUpperCase();
  return {
    name: String(passenger.name || passenger.paxListName || '').toUpperCase(),
    bn: String(passenger.bn || '').replace(/\D/g, '').padStart(3, '0'),
    seat: String(passenger.seat || '').toUpperCase(),
    ticketNumber: String(passenger.ticketNumber || ''),
    membershipNumber: `${passenger.ffCarrier || ''}${passenger.ffNumber || ''}`,
    pnr: String(passenger.pnr || extractPnr(passenger.sourceText)).toUpperCase(),
    flight,
    flightDate: String(passenger.flightDate || operations.flightDate || '').toUpperCase(),
    cabin: String(passenger.cabin || 'Economy'),
    gate: String(operations.gate || ''),
    bdt: String(operations.bdt || ''),
  };
}

function buildBcbp(record = {}) {
  const name = String(record.name || '').replace(/[^A-Z/ ]/gi, '').toUpperCase().slice(0, 20).padEnd(20, ' ');
  const pnr = String(record.pnr || '').toUpperCase().slice(0, 7).padEnd(7, ' ');
  const carrier = String(record.flight || 'MU586').match(/^([A-Z]{2})/)?.[1] || 'MU';
  const flightNumber = String(record.flight || 'MU586').replace(/\D/g, '').slice(-4).padStart(4, '0').padStart(5, ' ');
  const seat = String(record.seat || '').toUpperCase().padStart(4, '0').slice(-4);
  const bn = String(record.bn || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const cabin = /FIRST/i.test(record.cabin) ? 'F' : (/BUSINESS/i.test(record.cabin) ? 'I' : 'Y');
  // IATA BCBP mandatory fields.  scan.html recognizes the adjacent seat/BN segment.
  return `M1${name}E${pnr}${ORIGIN}${DESTINATION}${carrier.padEnd(3, ' ')}${flightNumber}${flightDayOfYear(record.flightDate)}${cabin}${seat}${bn} 1`;
}

function buildManualRecords(passengers, operations = {}) {
  return Object.values(passengers || {})
    .filter((passenger) => passenger && passenger.bn && passenger.bn !== '---' && passenger.name && !passenger.offloaded)
    .map((passenger) => normalizePassenger(passenger, operations))
    .sort((a, b) => Number(a.bn) - Number(b.bn))
    .map((record) => ({ ...record, barcode:buildBcbp(record) }));
}

module.exports = { extractPnr, flightDayOfYear, normalizePassenger, buildBcbp, buildManualRecords };
