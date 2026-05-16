// fbLookup.js
const { passengers, findBySeat, findByName, findByFFNumber } = require('./flightParser');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot) return;

      const content = message.content.trim();
      const fbMatch = content.match(/^fb\s+(.+)/i);
      if (!fbMatch) return;

      const query = fbMatch[1].trim().toUpperCase();
      let pax = null;

      // 查询逻辑：支持 BN / Seat / Name / Ticket / FF
      if (/^\d{1,3}$/.test(query)) {
        const bn = query.padStart(3, '0');
        pax = passengers[bn];
      } else if (/^\d+[A-Z]$/i.test(query)) {
        pax = findBySeat(query);
      } else if (/^ETKD\s+/.test(query)) {
        const ticket = query.replace(/^ETKD\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.ticketNumber === ticket);
      } else if (/^FF\s+/.test(query)) {
        const ff = query.replace(/^FF\s+/i, '').trim();
        pax = findByFFNumber(ff);
      } else {
        pax = findByName(query);
      }

      if (!pax) return message.channel.send('Passenger data not updated yet.');

      // Membership Status
      let membershipStatus = '';
      if (pax.ffTier === 'V') membershipStatus = 'Platinum';
      else if (pax.ffTier === 'G') membershipStatus = 'Gold';
      else if (pax.ffTier === 'S') membershipStatus = 'Silver';
      else if (pax.ffTier === 'C') membershipStatus = 'Regular';
      else if (pax.ffTier === '*1') membershipStatus = 'Elite';
      else if (pax.ffTier === '*2') membershipStatus = 'Elite Plus';
      else if (pax.ffTier === 'D') membershipStatus = 'Diamond';

      // Discord Embed
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
        .setFooter({ text: 'MUL System' });

      await message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.channel.send('Error processing passenger info.');
    }
  });
};