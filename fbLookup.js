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

      // 查询逻辑：BN / Seat / Name / Ticket / FF
      if (/^\d{1,3}$/.test(query)) {
        const bn = query.padStart(3, '0');
        pax = passengers[bn];
      } else if (/^\d+[A-Z]$/.test(query)) {
        pax = Object.values(passengers).find(p => p.seat?.toUpperCase() === query);
      } else if (/^RN\s+/.test(query)) {
        const name = query.replace(/^RN\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.name?.toUpperCase() === name);
      } else if (/^ETKD\s+/.test(query)) {
        const ticket = query.replace(/^ETKD\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.ticketNumber === ticket);
      } else if (/^FF\s+/.test(query)) {
        const ff = query.replace(/^FF\s+/i, '').trim();
        pax = Object.values(passengers).find(p => p.membershipNumber === ff);
      } else {
        pax = Object.values(passengers).find(p => p.name?.toUpperCase().includes(query));
      }

      if (!pax) return message.channel.send('Passenger not found.');

      // 判断舱位类型
      let classType = 'Economy';
      if (pax.seat) {
        const seatNum = parseInt(pax.seat.match(/\d+/)?.[0]);
        if (seatNum >= 1 && seatNum <= 2) classType = 'First Class';
        else if (seatNum >= 6 && seatNum <= 20) classType = 'Business Class';
      }

      // 构建 Embed
      const embed = new EmbedBuilder()
        .setColor('#1E90FF')
        .setTitle(`✈️ ${pax.flightNumber || pax.flight}/${pax.flightDate}`)
        .setDescription(`👤 ${pax.name}`)
        .addFields(
          { name: '🎫 BN/Seat/Class', value: `${pax.bn} • ${pax.seat} • ${classType}`, inline: true },
          ...(pax.membershipNumber ? [{ name: '🎟 Membership', value: `${pax.membershipNumber}${pax.membershipStatus ? ' • ' + pax.membershipStatus : ''}`, inline: true }] : []),
          ...(pax.ticketNumber ? [{ name: '🎫 Ticket', value: pax.ticketNumber, inline: true }] : []),
          ...(pax.bags?.length ? [{ name: '🧳 Bags', value: pax.bags.join('\n'), inline: true }] : []),
          { name: '🛋 Lounge Access', value: pax.loungeAccess ? '✅ Eligible' : '❌ Not Eligible', inline: true },
          { name: '👥 Guest Access', value: pax.guestAccess ? '✅ Allowed' : '❌ Not Allowed', inline: true },
          ...(pax.inbound ? [{ name: '✈️ Inbound', value: pax.inbound, inline: false }] : []),
          ...(pax.outbound ? [{ name: '✈️ Outbound', value: pax.outbound, inline: false }] : []),
          ...(pax.specialServices?.length ? [{ name: '⚠️ Special Services', value: pax.specialServices.join(', '), inline: false }] : [])
        )
        .setFooter({ text: 'MU Lounge Validation' });

      await message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.channel.send('Error processing passenger info.');
    }
  });
};