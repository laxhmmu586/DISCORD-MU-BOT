// flightParser.js
const passengers = {};

// ===============================
// Helper Functions
// ===============================
function normalizeBN(bn) {
  return bn.padStart(3, '0');
}

function getClassFromSeat(seat) {
  const num = parseInt(seat);
  if (num <= 2) return 'First';
  if (num >= 6 && num <= 20) return 'Business';
  return 'Economy';
}

// ===============================
// Parse Flight Log
// ===============================
function parseIncrementalLog(log) {
  clearPassengers(); // 每次解析前清空

  // 按每个旅客 record 分割
  const records = log.split(/(?=^\d+\.)/gm);

  records.forEach(section => {
    const bnMatch = section.match(/BN\s?(\d+)/i);
    const seatMatch = section.match(/(\d+[A-Z])/i);
    const nameMatch = section.match(/\d+\.\s+([A-Z\/\+\-]+)\s+BN/i);
    const ffMatch = section.match(/FF\/([A-Z0-9]+)\/([A-Z])\/\*?\d?/i);
    const ticketMatch = section.match(/ET\s+TKNE\/(\d{13})/i);
    const bagsMatch = section.match(/BAGTAG\/([^\n]+)/i);
    const inboundMatch = section.match(/I\/([A-Z0-9]+)\/(\d+[A-Z]{0,2})\s+([A-Z]{3})/i);
    const outboundMatch = section.match(/O\/([A-Z0-9]+)\/?(\d+[A-Z]{0,2})?\s+([A-Z]{3})/i);

    if (!bnMatch || !seatMatch || !nameMatch) return;

    const bn = normalizeBN(bnMatch[1]);
    const seat = seatMatch[1].toUpperCase();
    const name = nameMatch[1].replace(/\s+/g, '').toUpperCase();

    passengers[bn] = {
      bn,
      seat,
      name,
      class: getClassFromSeat(seat),
      flightNumber: section.match(/PR:\s*([A-Z0-9]+)/)?.[1] || null,
      flightDate: section.match(/PR:.*?(\d{1,2}[A-Z]{3})\d{2}/)?.[1] || null,
      membershipNumber: ffMatch?.[1] || null,
      ffTier: ffMatch?.[2] || null,
      ticketNumber: ticketMatch?.[1] || null,
      bags: bagsMatch ? bagsMatch[1].split('/').map(b => b.trim()) : [],
      inbound: inboundMatch ? { flight: inboundMatch[1], date: inboundMatch[2], from: inboundMatch[3] } : null,
      outbound: outboundMatch ? { flight: outboundMatch[1], date: outboundMatch[2] || null, to: outboundMatch[3] } : null,
      loungeAccess: section.includes('FBA') ? true : false,
      guestAccess: false
    };
  });
}

// ===============================
// 清空 passengers
// ===============================
function clearPassengers() {
  Object.keys(passengers).forEach(k => delete passengers[k]);
}

// ===============================
// Find Functions
// ===============================
function findBySeat(seat) {
  seat = seat.toUpperCase();
  return Object.values(passengers).find(p => p.seat === seat);
}

function findByName(name) {
  name = name.toUpperCase();
  return Object.values(passengers).find(p => p.name.includes(name));
}

function findByFFNumber(ff) {
  return Object.values(passengers).find(p => p.membershipNumber === ff);
}

// ===============================
// Exports
// ===============================
module.exports = {
  passengers,
  parseIncrementalLog,
  findBySeat,
  findByName,
  findByFFNumber,
  clearPassengers
};