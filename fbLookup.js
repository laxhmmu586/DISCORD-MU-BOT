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

function getMembershipStatus(tier) {
  if (tier === 'V') return 'Platinum';
  if (tier === 'G') return 'Gold';
  if (tier === 'S') return 'Silver';
  return '';
}

function findPassengerFromPRRecord(log, mode, query) {
  const sections =
    log.split(/\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g);

  const normalizedBN = query.padStart(3, '0');
  const normalizedSeat = query.toUpperCase();

  const targetSection =
    sections.find(section => {
      const prLine = section.match(/PR:\s+[^\n\r]+/i)?.[0] || '';

      if (mode === 'BN') {
        return new RegExp(`,BN0*${normalizedBN}\\b`, 'i').test(prLine);
      }

      if (mode === 'SEAT') {
        return new RegExp(`,SN\\s*${normalizedSeat}\\b`, 'i').test(prLine);
      }

      return false;
    });

  if (!targetSection) return null;

  const bnMatch = targetSection.match(/\bBN(\d{1,3})\b/i);
  const pax =
    targetSection.match(/\d+\.\s+([A-Z\/]+).*?BN(\d{1,3}).*?(\d+[A-Z])?/i);
  const flightMatch =
    targetSection.match(/PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

  if (!bnMatch && !pax) return null;

  return {
    bn: (pax?.[2] || bnMatch?.[1] || '').padStart(3, '0'),
    name: pax?.[1] || 'UNKNOWN',
    seat: pax?.[3] || '---',
    cabin: 'Economy',
    flight: flightMatch?.[1] || '',
    flightDate: (flightMatch?.[2] || '').substring(0, 5),
    membershipStatus: ''
  };
}

async function runLookup(mode, rawQuery) {
  let query = (rawQuery || '').trim().toUpperCase();
  let date = null;

  if (query.includes('/')) {
    const parts = query.split('/');
    if (parts.length === 2) {
      query = parts[0].trim().toUpperCase();
      date = parts[1].trim().toUpperCase();
    }
  }

  let log = null;
  if (date) log = await getFlightLogByDate(date);
  else log = await getLatestFlightLog();

  if (!log) return { error: 'Unable to load Flight Control.log' };

  parseIncrementalLog(log);
  parsePDLog(log);

  let pax = null;

  if (mode === 'BN') {
    const bn = query.padStart(3, '0');
    pax = passengers[bn] || findPassengerFromPRRecord(log, mode, query);
  } else if (mode === 'SEAT') {
    pax = findBySeat(query) || findPassengerFromPRRecord(log, mode, query);
  } else if (mode === 'TICKET') {
    pax = Object.values(passengers).find(p => p.ticketNumber === query);
  } else if (mode === 'FF') {
    pax = findByFFNumber(query) || findPDByFFNumber(query);
  } else if (mode === 'NAME') {
    pax = findByName(query);
  }

  if (!pax) return { error: 'Passenger data not updated yet.' };

  const membershipStatus = pax.membershipStatus || getMembershipStatus(pax.ffTier);

  const embed = {
    color: 0xf59e0b,
    title: `✈️ ${pax.flight}/${pax.flightDate}`,
    description: `👤 ${pax.name}\n\n🎫 BN${pax.bn} • ${pax.seat} • ${pax.cabin}`,
    fields: [
      ...(pax.ffNumber ? [{
        name: '💳 Membership',
        value: `${pax.ffCarrier} ${pax.ffNumber}${membershipStatus ? `\n${membershipStatus}` : ''}`,
        inline: true
      }] : []),
      ...(pax.ticketNumber ? [{
        name: '🎟 Ticket',
        value: pax.ticketNumber,
        inline: true
      }] : []),
      ...(pax.bagtags?.length ? [{
        name: '🧳 Bags',
        value: pax.bagtags.join('\n'),
        inline: false
      }] : []),
      ...(pax.inbound ? [{
        name: '⬅ Inbound',
        value: `${pax.inbound.flight}/${pax.inbound.date}\nFrom ${pax.inbound.origin}`,
        inline: true
      }] : []),
      ...(pax.outbound ? [{
        name: '➡ Outbound',
        value: `${pax.outbound.flight}/${pax.outbound.date}${pax.outbound.bn ? ` • BN${pax.outbound.bn}` : ''}${pax.outbound.seat ? ` • ${pax.outbound.seat}` : ''}\nTo ${pax.outbound.destination}`,
        inline: true
      }] : []),
      {
        name: '🛋 Lounge Access',
        value: pax.lounge?.eligible ? '✅ Eligible' : '❌ Not Eligible',
        inline: true
      },
      {
        name: '👥 Lounge Guest',
        value: pax.lounge?.guest ? '✅ Allowed' : '❌ Not Allowed',
        inline: true
      }
    ],
    footer: { text: 'MUFTF system' }
  };

  return { embed };
}

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const upper = content.toUpperCase();

    let query = '';
    let mode = '';

    if (upper.startsWith('FB ')) { mode = 'BN'; query = content.substring(3).trim(); }
    else if (upper.startsWith('RN ')) { mode = 'NAME'; query = content.substring(3).trim(); }
    else if (upper.startsWith('FSN ')) { mode = 'SEAT'; query = content.substring(4).trim(); }
    else if (upper.startsWith('ETKD ')) { mode = 'TICKET'; query = content.substring(5).trim(); }
    else if (upper.startsWith('FF ')) { mode = 'FF'; query = content.substring(3).trim(); }
    else return;

    try {
      const result = await runLookup(mode, query);
      if (result.error) return message.reply(result.error);
      return message.reply({ embeds: [result.embed] });
    } catch (err) {
      console.error(err);
      return message.reply('Lookup failed.');
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const commandMap = {
      fb: 'BN',
      rn: 'NAME',
      fsn: 'SEAT',
      etkd: 'TICKET',
      ff: 'FF'
    };

    const mode = commandMap[interaction.commandName.toLowerCase()];
    if (!mode) return;

    const query = interaction.options.getString('query', true);

    try {
      const result = await runLookup(mode, query);
      if (result.error) {
        return interaction.reply({ content: result.error, ephemeral: true });
      }
      return interaction.reply({ embeds: [result.embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Lookup failed.', ephemeral: true });
    }
  });
};
