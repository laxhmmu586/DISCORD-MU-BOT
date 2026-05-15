const { passengers } = require('./flightParser');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      // 忽略 bot 消息
      if (message.author.bot) return;

      const content = message.content.trim();

      // 检查是否 FB 开头
      const fbMatch = content.match(/^fb\s+(.+)/i);
      if (!fbMatch) return;

      const query = fbMatch[1].trim().toUpperCase();

      let pax = null;

      // 支持 BN / Seat / Name / Ticket / FF 查询
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

      if (!pax) {
        return message.channel.send('Passenger not found.');
      }

      // 构建 embed
      const { MessageEmbed } = require('discord.js');

      const embed = new MessageEmbed()
        .setColor('#1E90FF')
        .setTitle(`✈️ ${pax.flightDate}`)
        .setDescription(`👤 ${pax.name}`)
        .addField('🎫 BN/Seat/Class', `${pax.bn} • ${pax.seat} • ${pax.class}`, true);

      if (pax.membershipNumber) {
        embed.addField('🎟 Membership', `${pax.membershipNumber} (${pax.membershipStatus})`, true);
      }

      if (pax.ticketNumber) {
        embed.addField('🎫 Ticket', pax.ticketNumber, true);
      }

      if (pax.bags && pax.bags.length > 0) {
        embed.addField('🧳 Bags', pax.bags.join('\n'), false);
      }

      if (pax.inbound) {
        embed.addField('Inbound', `${pax.inbound.flight}/${pax.inbound.date} from ${pax.inbound.origin}`, true);
      }
      if (pax.outbound) {
        embed.addField('Outbound', `${pax.outbound.flight}/${pax.outbound.date} to ${pax.outbound.destination}`, true);
      }

      embed.addField('🛋 Lounge Access', pax.loungeAccess ? '✅ Eligible' : '❌ Not Eligible', true);
      embed.addField('👥 Guest Access', pax.guestAccess ? '✅ Allowed' : '❌ Not Allowed', true);

      embed.setFooter({ text: 'MU Lounge Validation' });

      await message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.channel.send('Error processing passenger info.');
    }
  });
};