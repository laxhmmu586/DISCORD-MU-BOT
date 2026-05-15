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
  // 清空上次数据
  Object.keys(passengers).forEach(k => delete passengers[k]);

  // 按每个旅客 record 分割
  const records = log.split(/(?=^\d+\.)/gm);

  records.forEach(section => {
    const bnMatch = section.match(/BN\s?(\d+)/i);
    const seatMatch = section.match(/(\d+[A-Z])/i);
    const nameMatch = section.match(/\d+\.\s+([A-Z\/\+\-]+)\s+BN/i);

    if (!bnMatch || !seatMatch || !nameMatch) {
      // 调试输出：被跳过的记录
      console.log('Skipped section (missing BN/Seat/Name):', section.slice(0, 50));
      return;
    }

    const bn = normalizeBN(bnMatch[1]);
    const seat = seatMatch[1].toUpperCase();
    const name = nameMatch[1].replace(/\s+/g, '').toUpperCase();

    // 创建基础乘客对象
    passengers[bn] = {
      bn,
      seat,
      name,
      class: getClassFromSeat(seat),
      flightNumber: section.match(/PR:\s*([A-Z0-9]+)/)?.[1] || null,
      flightDate: section.match(/PR:.*?(\d{1,2}[A-Z]{3})\d{2}/)?.[1] || null,
      membershipNumber: section.match(/FF\/([A-Z0-9]+)\/([A-Z])\/\*?\d?/i)?.[1] || null,
      ffTier: section.match(/FF\/([A-Z0-9]+)\/([A-Z])\/\*?\d?/i)?.[2] || null,
      ticketNumber: section.match(/ET\s+TKNE\/(\d{13})/i)?.[1] || null,
      bags: section.match(/BAGTAG\/([^\n]+)/i)?.[1].split('/').map(b => b.trim()) || [],
      inbound: (() => {
        const m = section.match(/I\/([A-Z0-9]+)\/(\d+[A-Z]{0,2})\s+([A-Z]{3})/i);
        return m ? { flight: m[1], date: m[2], from: m[3] } : null;
      })(),
      outbound: (() => {
        const m = section.match(/O\/([A-Z0-9]+)\/?(\d+[A-Z]{0,2})?\s+([A-Z]{3})/i);
        return m ? { flight: m[1], date: m[2] || null, to: m[3] } : null;
      })(),
      loungeAccess: section.includes('FBA'),
      guestAccess: false,
      specialServices: [] // 先初始化为空
    };

    // ===============================
    // 安全添加 SSR
    // ===============================
    try {
      const ssrMatch = section.match(/SSR\/([A-Z0-9]+)/gi);
      if (ssrMatch) {
        passengers[bn].specialServices = ssrMatch.map(s => s.toUpperCase());
      }
    } catch (err) {
      // 保持空数组，避免报错
      passengers[bn].specialServices = [];
    }
  });
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
  findByFFNumber
};