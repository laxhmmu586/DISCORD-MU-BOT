// fbLookup.js
const { passengers, findBySeat, findByName, findByFFNumber, clearPassengers } = require('./flightParser');
const { parsePDLog, findPDByFFNumber, clearPD } = require('./pdParser');
const { getLatestFlightLog, getFlightLogByDate } = require('./googleDrive');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot) return;

      const content = message.content.trim();
      const fbMatch = content.match(/^fb\s+(.+)/i);
      if (!fbMatch) return;

      let query = fbMatch[1].trim().toUpperCase();
      let date = null;

      // 历史记录 BN/DATE 或 Ticket/DATE 或 FF/DATE
      const matchDate = query.match(/^(.+?)\/(\d{1,2}[A-Z]{3}\d{0,2})$/i);
      if (matchDate) {
        query = matchDate[1].trim();
        date = matchDate[2].trim().toUpperCase();
      }

      // =========================
      // Load Flight Log
      // =========================
      let log = null;
      if (date) log = await getFlightLogByDate(date);
      else log = await getLatestFlightLog();

      if (!log) return message.channel.send('Passenger data not updated yet.');

      // =========================
      // Clear previous cache
      // =========================
      clearPassengers();
      clearPD();

      // =========================
      // Parse logs
      // =========================
      const { parseIncrementalLog } = require('./flightParser');
      parseIncrementalLog(log);
      parsePDLog(log);

      let pax = null;

      // =========================
      // Search logic
      // =========================
      if (/^\d{1,3}$/.test(query)) {
        // BN search
        const bn = query.padStart(3, '0');
        pax = passengers[bn];
      } else if (/^\d+[A-Z]$/i.test(query)) {
        // Seat search
        pax = findBySeat(query);
      } else if (/^\d{13}$/.test(query)) {
        // Ticket search
        pax = Object.values(passengers).find(p => p.ticketNumber === query);
      } else if (/^[A-Z]{2}\d+$/i.test(query)) {
        // FF search
        pax = findByFFNumber(query);
        if (!pax && date) pax = findPDByFFNumber(query); // check PD only for FF
      } else if (!date) {
        // Name search (only today)
        pax = findByName(query);
      }

      if (!pax) return message.channel.send('Passenger data not updated yet.');

      // =========================
      // Membership Status
      // =========================
      let membershipStatus = '';
      if (pax.ffTier === 'V') membershipStatus = 'Platinum';
      else if (pax.ffTier === 'G') membershipStatus = 'Gold';
      else if (pax.ffTier === 'S') membershipStatus = 'Silver';
      else if (pax.membershipNumber) {
        const tierMatch = pax.membershipNumber.match(/\/([A-Z])\/\*?(\d)/i);
        if (tierMatch) {
          const letter = tierMatch[1].toUpperCase();
          const num = tierMatch[2];
          if (num === '1') membershipStatus = 'Elite';
          else if (num === '2') membershipStatus = 'Elite Plus';
          else if (letter === 'D') membershipStatus = 'Diamond';
          else if (letter === 'C') membershipStatus = 'Regular';
        }
      }

      // =========================
      // Discord Embed
      // =========================
      const embed = new EmbedBuilder()
        .setColor('#1E90FF')
        .setTitle(`✈️ ${pax.flightNumber || pax.flight}/${pax.flightDate}`)
        .setDescription(`👤 ${pax.name}`)
        .addFields(
          { name: '🎫 BN/Seat/Class', value: `${pax.bn} • ${pax.seat} • ${pax.class}`, inline: true },
          { name: '🎟 Membership', value: pax.membershipNumber ? `${pax.membershipNumber} • ${membershipStatus || ''}` : 'N/A', inline: true },
          { name: '🎫 Ticket', value: pax.ticketNumber || 'N/A', inline: true },
          { name: '🧳 Bags', value: pax.bags.length ? pax.bags.join('\n') : 'None', inline: true },
          { name: '🛋 Lounge Access', value: pax.loungeAccess ? '✅ Eligible' : '❌ Not Allowed', inline: true },
          { name: '👥 Guest Access', value: pax.guestAccess ? '✅ Allowed' : '❌ Not Allowed', inline: true }
        )
        .setFooter({ text: 'MUFTF System' });

      await message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.channel.send('Error processing passenger info.');
    }
  });
};