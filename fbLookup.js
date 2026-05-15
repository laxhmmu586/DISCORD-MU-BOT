const { passengers } = require('./flightParser');
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
      } else if (/^\d+[A-Z]$/.test(query)) {
        pax = Object.values(passengers).find(p => p.seat.toUpperCase() === query);
      } else if (/^RN\s+/.test(query)) {
        const name = query.replace(/^RN\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.name.toUpperCase() === name);
      } else if (/^ETKD\s+/.test(query)) {
        const ticket = query.replace(/^ETKD\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.ticketNumber === ticket);
      } else if (/^FF\s+/.test(query)) {
        const ff = query.replace(/^FF\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.membershipNumber === ff);
      } else {
        pax = Object.values(passengers).find(p => p.name.toUpperCase().includes(query));
      }

      if (!pax) return message.channel.send('Passenger not found.');

      // 构建紧凑 embed
      const embed = new EmbedBuilder()
        .setColor('#1E90FF')
        .setTitle(`✈️ ${pax.flightNumber || pax.flight}/${pax.flightDate}`)
        .setDescription(`👤 ${pax.name}/${pax.ffStatus || 'A+'}`)
        .addFields(
          { name: '🎫 BN/Seat/Class', value: `${pax.bn} • ${pax.seat} • ${pax.class}`, inline: true },
          { name: '🎟 Membership', value: pax.membershipNumber ? `${pax.membershipNumber} • ${pax.membershipStatus || ''}` : 'N/A', inline: true },
          { name: '🎫 Ticket', value: pax.ticketNumber || 'N/A', inline: true },
          { name: '🛋 Lounge Access', value: pax.loungeAccess ? '✅ Eligible' : '❌ Not Allowed', inline: true },
          { name: '👥 Guest Access', value: pax.guestAccess ? '✅ Allowed' : '❌ Not Allowed', inline: true }
        )
        .setFooter({ text: 'MUL system' });

      await message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.channel.send('Error processing passenger info.');
    }
  });
};