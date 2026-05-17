const pdData = [];

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
      if (current && current.content.trim()) sections.push(current);
      current = { timestamp: pendingTimestamp || null, command: cmd, content: line + '\n' };
      pendingTimestamp = null;
      continue;
    }
    if (!current) {
      current = { timestamp: pendingTimestamp || null, command: null, content: '' };
      pendingTimestamp = null;
    }
    current.content += line + '\n';
  }
  if (current && current.content.trim()) sections.push(current);
  return sections;
}

// ===============================
// Membership Status
// ===============================
function getMembershipStatus(tier) {

  if (tier === 'V') {
    return 'Platinum';
  }

  if (tier === 'G') {
    return 'Gold';
  }

  if (tier === 'S') {
    return 'Silver';
  }

  return 'Regular';
}

// ===============================
// Parse PD Log
// ===============================
function parsePDLog(log) {

  // Clear old data
  pdData.length = 0;

  // ===========================
  // Split Sections
  // ===========================
  const sections = splitLogicalSections(log);

  for (const sectionObj of sections) {
    const section = sectionObj.content;

    // =========================
    // PD Search Only
    // =========================
    if (
      !section.includes('PD:')
    ) {

      continue;
    }

    // =========================
    // Flight
    // PD: MU586/15MAY26Y*LAX
    // =========================
    let flight = '';
    let flightDate = '';

    const flightMatch =
      section.match(
        /PD:\s*([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i
      );

    if (flightMatch) {

      flight =
        flightMatch[1];

      flightDate =
        flightMatch[2]
          .substring(0, 5);
    }

    // =========================
    // Name
    // =========================
    let name =
      'PD MEMBER';

    const nameMatch =
      section.match(
        /\d+\.\s*([A-Z\/]+)/i
      );

    if (nameMatch) {

      name =
        nameMatch[1]
          .trim();
    }

    // =========================
    // BN
    // =========================
    let bn = '---';

    const bnMatch =
      section.match(
        /BN(\d{1,3})/i
      );

    if (bnMatch) {

      bn =
        bnMatch[1]
          .padStart(3, '0');
    }

    // =========================
    // Seat
    // =========================
    let seat = '---';

    const seatMatch =
      section.match(
        /BN\d+\s+(\d+[A-Z])/i
      );

    if (seatMatch) {

      seat =
        seatMatch[1];
    }

    // =========================
    // Membership
    // =========================
    let ffCarrier = 'MU';

    let ffNumber = null;

    let ffTier = null;

    const ffMatch =
      section.match(
        /FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i
      );

    if (ffMatch) {

      ffCarrier =
        ffMatch[1];

      ffNumber =
        ffMatch[2];

      ffTier =
        ffMatch[3];
    }

    // =========================
    // Skip Invalid
    // =========================
    if (!ffNumber) {
      continue;
    }

    // =========================
    // Passenger Object
    // =========================
    const passenger = {

      pdOnly: true,

      flight,

      flightDate,

      name,

      bn,

      seat,

      cabin:
        'Elite',

      ffCarrier,

      ffNumber,

      ffTier,

      membershipStatus:
        getMembershipStatus(
          ffTier
        ),

      lounge: {

        eligible: true,

        guest:
          ffTier === 'V'
      }
    };

    pdData.push(passenger);
  }

  console.log(
    'PD passengers:',
    pdData.length
  );
}

// ===============================
// Find by FF Number
// ===============================
function findPDByFFNumber(ff) {

  ff =
    ff
      .replace(/\s/g, '')
      .toUpperCase();

  return pdData.find(p => {

    const paxFF =
      (
        (p.ffCarrier || '') +
        (p.ffNumber || '')
      )
      .replace(/\s/g, '')
      .toUpperCase();

    return paxFF === ff;
  });
}

// ===============================
// Exports
// ===============================
module.exports = {

  pdData,

  parsePDLog,

  findPDByFFNumber
};