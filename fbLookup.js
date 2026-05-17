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

function getCabinFromSeat(seat) {
  const row = parseInt((seat || '').match(/\d+/)?.[0]);
  if (!row) return 'Economy';
  if (row >= 1 && row <= 2) return 'First';
  if (row >= 6 && row <= 20) return 'Business';
  return 'Economy';
}

function splitLogicalSections(log) {
  const lines = log.split(/\r?\n/);
  const tsRe = /^\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}\s*$/;
  const cmdRe = /^>\s*([A-Z0-9*\/]+)\b/i;
  const sections = [];
  let current = null;
  let pendingTimestamp = null;

  for (const line of lines) {
    if (tsRe.test(line.trim())) {
      pendingTimestamp = line.trim();
      continue;
    }

    const cmd = line.match(cmdRe)?.[1]?.toUpperCase() || null;
    const isContinuation = cmd ? /^(PN|PN1|PF|PF1)$/.test(cmd) : false;

    if (cmd && !isContinuation) {
      if (current && current.content.trim()) sections.push(current.content);
      current = { content: line + '\n', timestamp: pendingTimestamp || null };
      pendingTimestamp = null;
      continue;
    }

    if (!current) {
      current = { content: '' };
      pendingTimestamp = null;
    }

    current.content += line + '\n';
  }

  if (current && current.content.trim()) sections.push(current.content);
  return sections;
}

function getMembershipStatus(tier) {
  if (tier === 'V') return 'Platinum';
  if (tier === 'G') return 'Gold';
  if (tier === 'S') return 'Silver';
  return '';
}

function findPassengerFromPRRecord(log, mode, query) {
  const sections =
    splitLogicalSections(log);

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


function findPDPassengerByFFFromLog(log, query) {
  const ff = query.replace(/\s+/g, '').toUpperCase();
  const ffMatch = ff.match(/^([A-Z]{2})(\d+)$/);
  if (!ffMatch) return null;

  const sections = splitLogicalSections(log);

  for (const section of sections) {
    if (!section.includes('PD:')) continue;

    const rows = section.split(/\r?\n/);
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      const m = line.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);
      if (!m) continue;

      const current = `${m[1]}${m[2]}`.replace(/\s+/g, '').toUpperCase();
      if (current !== ff) continue;

      let name = 'PD MEMBER';
      let bn = '---';
      let seat = '---';

      for (let j = i - 1; j >= 0; j--) {
        const pax = rows[j].match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);
        if (pax) {
          name = pax[1]?.replace(/\+$/, '') || name;
          if (pax[2]) bn = pax[2].padStart(3, '0');
          if (pax[3]) seat = pax[3];
          break;
        }
      }

      const flightMatch = section.match(/PD:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

      return {
        pdOnly: true,
        flight: flightMatch?.[1] || '',
        flightDate: (flightMatch?.[2] || '').substring(0, 5),
        name,
        bn,
        seat,
        cabin: 'Elite',
        ffCarrier: m[1],
        ffNumber: m[2],
        ffTier: m[3],
        membershipStatus: getMembershipStatus(m[3]),
        lounge: { eligible: true, guest: m[3] === 'V' }
      };
    }
  }

  return null;
}

function findPassengerByFFFromRecord(log, query) {
  const ff = query.replace(/\s+/g, '').toUpperCase();
  const sections = splitLogicalSections(log);

  for (const section of sections) {
    const ffMatch = section.match(/FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i);
    if (!ffMatch) continue;

    const currentFF = `${ffMatch[1]}${ffMatch[2]}`.replace(/\s+/g, '').toUpperCase();
    if (currentFF !== ff) continue;

    const paxMatch = section.match(/\n\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:N\d\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);
    const prMatch = section.match(/PR:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);

    return {
      name: (paxMatch?.[1] || 'UNKNOWN').replace(/\+$/, ''),
      bn: (paxMatch?.[2] || '---').padStart(3, '0'),
      seat: paxMatch?.[3] || '---',
      cabin: getCabinFromSeat(paxMatch?.[3] || ''),
      flight: prMatch?.[1] || '',
      flightDate: (prMatch?.[2] || '').substring(0, 5),
      ffCarrier: ffMatch[1],
      ffNumber: ffMatch[2],
      membershipStatus: getMembershipStatus(ffMatch[3]),
      lounge: { eligible: true, guest: ffMatch[3] === 'V' }
    };
  }

  return null;
}
async function runLookup(mode, rawQuery) {
  let query = (rawQuery || '').trim().toUpperCase();

  if (mode === 'FF') {
    query = query
      .replace(/^FF(?:\/|\s+)/i, '')
      .replace(/\s+/g, '');
  }

  if (mode === 'NAME') {
    query = query.replace(/\+$/, '');
  }
  let date = null;

  const dateSuffixMatch = query.match(/^(.*)\/(\d{2}[A-Z]{3})$/i);
  if (dateSuffixMatch) {
    query = dateSuffixMatch[1].trim().toUpperCase();
    date = dateSuffixMatch[2].trim().toUpperCase();
  }

  let log = null;
  if (date) log = await getFlightLogByDate(date);
  else log = await getLatestFlightLog();

  if (!log) return { error: 'Unable to load logs (Flight Control.log / Lake.log / Ticketing.log)' };

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
    if (pax && pax.name === 'PD MEMBER') {
      pax = findPDPassengerByFFFromLog(log, query) || pax;
    }
    if (!pax) {
      pax = findPassengerByFFFromRecord(log, query);
    }
  } else if (mode === 'NAME') {
    pax = findByName(query);

    if (!pax) {
      const sections = splitLogicalSections(log);
      const nameRegex = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\+?\\b`, 'i');
      for (const section of sections) {
        if (!section.includes('PR:')) continue;
        const line = section.split(/\r?\n/).find(r => /\d+\.\s+/.test(r) && nameRegex.test(r));
        if (!line) continue;
        const m = line.match(/\s*\d+\.\s+\d?([A-Z\/]+\+?)\s+(?:\S+\s+)?(?:BN(\d{1,3}))?\s*(\d+[A-Z])?/i);
        const flightMatch = section.match(/PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i);
        if (!m) continue;
        pax = {
          bn: m[2] ? m[2].padStart(3, '0') : '---',
          name: (m[1] || query).replace(/\+$/, ''),
          seat: m[3] || '---',
          cabin: getCabinFromSeat(m[3] || ''),
          flight: flightMatch?.[1] || '',
          flightDate: (flightMatch?.[2] || '').substring(0, 5),
          lounge: { eligible: false, guest: false }
        };
        break;
      }
    }
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
      ...(pax.specialServices?.length ? [{
        name: '🧩 Special Service',
        value: pax.specialServices.join(', '),
        inline: false
      }] : []),
      ...(pax.specialMeals?.length ? [{
        name: '🍽 Special Meal',
        value: pax.specialMeals.join(', '),
        inline: false
      }] : []),
      ...(pax.paidProductsShort?.length ? [{
        name: '💰 Paid Service',
        value: pax.paidProductsShort.join('\n'),
        inline: false
      }] : []),
      ...(pax.paidProducts?.length && !pax.paidProductsShort?.length ? [{
        name: '💰 Paid Service',
        value: pax.paidProducts.join('\n'),
        inline: false
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
    footer: { text: 'MUFC' }
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

    const cmdMatch = upper.match(/^(FB|RN|FSN|ETKD|FF)\s*(.+)$/i);
    if (!cmdMatch) return;

    const command = cmdMatch[1].toUpperCase();
    query = (cmdMatch[2] || '').trim();

    if (command === 'FB') mode = 'BN';
    else if (command === 'RN') mode = 'NAME';
    else if (command === 'FSN') mode = 'SEAT';
    else if (command === 'ETKD') mode = 'TICKET';
    else if (command === 'FF') mode = 'FF';

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
