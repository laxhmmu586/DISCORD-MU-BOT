// ===============================
// Modules
// ===============================
const {
  passengers,
  findBySeat,
  findByName,
  findByFFNumber,
  parseIncrementalLog
} = require('./flightParser');

const {
  parsePDLog,
  findPDByFFNumber
} = require('./pdParser');

const {
  getLatestFlightLog,
  getFlightLogByDate
} = require('./googleDrive');

// ===============================
// Membership Status
// ===============================
function getMembershipStatus(tier) {
  if (tier === 'V') return 'Platinum';
  if (tier === 'G') return 'Gold';
  if (tier === 'S') return 'Silver';
  return '';
}

// ===============================
// FB Lookup Command
// ===============================
module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignore Bots
    if (message.author.bot) return;

    const content = message.content.trim();
    const upper = content.toUpperCase();
    let query = '';
    let mode = '';

    // =========================
    // FB
    // =========================
    if (upper.startsWith('FB ')) {
      mode = 'BN';
      query = content.substring(3).trim();
    }
    // =========================
    // RN
    // =========================
    else if (upper.startsWith('RN ')) {
      mode = 'NAME';
      query = content.substring(3).trim();
    }
    // =========================
    // FSN
    // =========================
    else if (upper.startsWith('FSN ')) {
      mode = 'SEAT';
      query = content.substring(4).trim();
    }
    // =========================
    // ETKD
    // =========================
    else if (upper.startsWith('ETKD ')) {
      mode = 'TICKET';
      query = content.substring(5).trim();
    }
    // =========================
    // FF
    // =========================
    else if (upper.startsWith('FF ')) {
      mode = 'FF';
      query = content.substring(3).trim();
    } else {
      return; // not a recognized command
    }

    query = query.toUpperCase();

    // =========================
    // Date Search (optional)
    // =========================
    let date = null;
    const dateMatch = query.match(/(.+)\/(\d{2}[A-Z]{3})$/i);
    if (dateMatch) {
      query = dateMatch[1].trim().toUpperCase();
      date = dateMatch[2].trim().toUpperCase();
    }

    try {
      // =====================
      // Load Log
      // =====================
      let log = null;
      if (date) {
        log = await getFlightLogByDate(date);
      } else {
        log = await getLatestFlightLog();
      }

      if (!log) return;

      // =====================
      // Parse Logs
      // =====================
      parseIncrementalLog(log);
      parsePDLog(log);

      let pax = null;

      // =====================
      // BN Search
      // =====================
      if (mode === 'BN') {
        const bn = query.padStart(3, '0');
        pax = passengers[bn];
      }
      // =====================
      // Seat Search
      // =====================
      else if (mode === 'SEAT') {
        pax = findBySeat(query);
      }
      // =====================
      // Ticket Search
      // =====================
      else if (mode === 'TICKET') {
        pax = Object.values(passengers).find(p => p.ticketNumber === query);
      }
      // =====================
      // FF Search
      // =====================
      else if (mode === 'FF') {
        pax = findByFFNumber(query);
        if (!pax) pax = findPDByFFNumber(query);
      }
      // =====================
      // Name Search
      // =====================
      else if (mode === 'NAME') {
        pax = findByName(query);
      }

      // =====================
      // Not Found
      // =====================
      if (!pax) {
        message.channel.send('Passenger not found.');
        return;
      }

      // =====================
      // Membership
      // =====================
      const membershipStatus = pax.membershipStatus || getMembershipStatus(pax.ffTier);

      // =====================
      // Compose message
      // =====================
      let msg = `✈️ ${pax.flight}/${pax.flightDate}\n👤 ${pax.name}\n🎫 BN${pax.bn} • ${pax.seat} • ${pax.cabin}\n`;

      if (pax.ffNumber) {
        msg += `💳 Membership: ${pax.ffCarrier} ${pax.ffNumber}`;
        if (membershipStatus) msg += `\n${membershipStatus}`;
        msg += '\n';
      }

      if (pax.ticketNumber) msg += `🎟 Ticket: ${pax.ticketNumber}\n`;

      if (pax.bagtags?.length) msg += `🧳 Bags:\n${pax.bagtags.join('\n')}\n`;

      if (pax.inbound) msg += `⬅ Inbound: ${pax.inbound.flight}/${pax.inbound.date} From ${pax.inbound.origin}\n`;

      if (pax.outbound)
        msg += `➡ Outbound: ${pax.outbound.flight}/${pax.outbound.date}${
          pax.outbound.bn ? ` • BN${pax.outbound.bn}` : ''
        }${pax.outbound.seat ? ` • ${pax.outbound.seat}` : ''} To ${pax.outbound.destination}\n`;

      if (pax.specialServices?.length) msg += `⚠ Special Service:\n${pax.specialServices.join('\n')}\n`;

      msg += `🛋 Lounge Access: ${pax.lounge?.eligible ? '✅ Eligible' : '❌ Not Eligible'}\n`;
      msg += `👥 Lounge Guest: ${pax.lounge?.guest ? '✅ Allowed' : '❌ Not Allowed'}`;

      // =====================
      // Send to channel
      // =====================
      message.channel.send(msg);
    } catch (err) {
      console.error(err);
      message.channel.send('Error processing the request.');
    }
  });
};