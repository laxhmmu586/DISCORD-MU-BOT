'use strict';

const { runLookup, buildEmbed } = require('./lookupService');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const upper = content.toUpperCase();
    const cmdMatch = upper.match(/^(FB|RN|FSN|ETKD|FF|PR)\s*(.+)$/i);
    if (!cmdMatch) return;

    const command = cmdMatch[1].toUpperCase();
    const query = (cmdMatch[2] || '').trim();

    let mode = '';
    if (command === 'FB') mode = 'BN';
    else if (command === 'RN') mode = 'NAME';
    else if (command === 'FSN') mode = 'SEAT';
    else if (command === 'ETKD') mode = 'TICKET';
    else if (command === 'FF') mode = 'FF';
    else if (command === 'PR') mode = 'PR';

    try {
      const result = await runLookup(mode, query);
      if (result.error) return message.reply(result.error);
      return message.reply({ embeds: [buildEmbed(result.pax, result.membershipStatus)] });
    } catch (err) {
      console.error(err);
      return message.reply('Lookup failed.');
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const commandMap = { fb: 'BN', rn: 'NAME', fsn: 'SEAT', etkd: 'TICKET', ff: 'FF', pr: 'PR' };
    const mode = commandMap[interaction.commandName.toLowerCase()];
    if (!mode) return;

    const query = interaction.options.getString('query', true);

    try {
      const result = await runLookup(mode, query);
      if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
      return interaction.reply({ embeds: [buildEmbed(result.pax, result.membershipStatus)], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Lookup failed.', ephemeral: true });
    }
  });
};
