const {

  getLounge,

  getCabin

} = require('./flightParser');

const pdData = {

  first: [],

  business: [],

  platinum: [],

  gold: [],

  silver: []

};

// ===============================
// Reset
// ===============================
function resetPD() {

  pdData.first = [];

  pdData.business = [];

  pdData.platinum = [];

  pdData.gold = [];

  pdData.silver = [];
}

// ===============================
// Parse Passenger Line
// ===============================
function parsePassengerLine(line, category) {

  // Example:
  //  6. 1LIU/ZHI 32K N PVG ...
  //      FF/MU 650278486253/S/*1
  //
  //  4. 1JIA/ZIME+
  //
  //  5. 1JIN/JIAN+

  const result = {

    category,

    name: null,

    bn: null,

    seat: null,

    ffCarrier: null,

    ffNumber: null,

    ffTier: null,

    cabin: 'Unknown',

    lounge: {

      eligible: false,

      guest: false
    }
  };

  // ===========================
  // Name
  // ===========================
  const nameMatch =
    line.match(
      /\d+\.\s+1([A-Z\/\+]+)/
    );

  if (nameMatch) {

    result.name =
      nameMatch[1]
        .replace(/\+$/, '');
  }

  // ===========================
  // BN
  // ===========================
  const bnMatch =
    line.match(
      /BN(\d{3})/
    );

  if (bnMatch) {

    result.bn =
      bnMatch[1];
  }

  // ===========================
  // Seat
  // ===========================
  const seatMatch =
    line.match(
      /\s(\d+[A-Z])\s+[A-Z]\s+PVG/
    );

  if (seatMatch) {

    result.seat =
      seatMatch[1];
  }

  // ===========================
  // FF
  // ===========================
  const ffMatch =
    line.match(
      /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])/
    );

  if (ffMatch) {

    result.ffCarrier =
      ffMatch[1];

    result.ffNumber =
      ffMatch[2];

    result.ffTier =
      ffMatch[3];
  }

  // ===========================
  // Cabin
  // ===========================
  result.cabin =
    getCabin(
      result.seat
    );

  // ===========================
  // Lounge
  // ===========================
  result.lounge =
    getLounge({

      ffTier:
        result.ffTier,

      elite:
        2,

      cabin:
        result.cabin
    });

  return result;
}

// ===============================
// Add Passenger
// ===============================
function addPassenger(category, pax) {

  if (!pax.name) {
    return;
  }

  pdData[category].push(pax);
}

// ===============================
// Parse Section
// ===============================
function parseSection(lines, category) {

  let currentPax = null;

  for (const line of lines) {

    // ===========================
    // New Passenger
    // ===========================
    if (
      /^\s*\d+\./.test(line)
    ) {

      if (currentPax) {

        addPassenger(
          category,
          currentPax
        );
      }

      currentPax =
        parsePassengerLine(
          line,
          category
        );
    }

    // ===========================
    // FF continuation line
    // ===========================
    else if (
      currentPax &&
      line.includes('FF/')
    ) {

      const ffMatch =
        line.match(
          /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])/
        );

      if (ffMatch) {

        currentPax.ffCarrier =
          ffMatch[1];

        currentPax.ffNumber =
          ffMatch[2];

        currentPax.ffTier =
          ffMatch[3];

        // Update Lounge
        currentPax.lounge =
          getLounge({

            ffTier:
              currentPax.ffTier,

            elite:
              2,

            cabin:
              currentPax.cabin
          });
      }
    }
  }

  // Last passenger
  if (currentPax) {

    addPassenger(
      category,
      currentPax
    );
  }
}

// ===============================
// Main Parser
// ===============================
function parsePDLog(log) {

  resetPD();

  const lines =
    log
      .split('\n')
      .map(
        l => l.toUpperCase()
      );

  let currentCategory =
    null;

  let buffer = [];

  function flush() {

    if (
      currentCategory &&
      buffer.length
    ) {

      parseSection(
        buffer,
        currentCategory
      );
    }

    buffer = [];
  }

  for (const line of lines) {

    // ===========================
    // PDF*
    // ===========================
    if (
      line.includes('>PDF*')
    ) {

      flush();

      currentCategory =
        'first';

      continue;
    }

    // ===========================
    // PDJ*
    // ===========================
    if (
      line.includes('>PDJ*')
    ) {

      flush();

      currentCategory =
        'business';

      continue;
    }

    // ===========================
    // Platinum
    // ===========================
    if (
      line.includes('>PDY*,FF/V')
    ) {

      flush();

      currentCategory =
        'platinum';

      continue;
    }

    // ===========================
    // Gold
    // ===========================
    if (
      line.includes('>PDY*,FF/G')
    ) {

      flush();

      currentCategory =
        'gold';

      continue;
    }

    // ===========================
    // Silver
    // ===========================
    if (
      line.includes('>PDY*,FF/S')
    ) {

      flush();

      currentCategory =
        'silver';

      continue;
    }

    // ===========================
    // Ignore unrelated sections
    // ===========================
    if (
      line.startsWith('>') &&
      !line.startsWith('>PN1')
    ) {

      flush();

      currentCategory =
        null;

      continue;
    }

    // ===========================
    // Collect lines
    // ===========================
    if (currentCategory) {

      buffer.push(line);
    }
  }

  flush();

  console.log(
    'PD Parsed:',
    {

      first:
        pdData.first.length,

      business:
        pdData.business.length,

      platinum:
        pdData.platinum.length,

      gold:
        pdData.gold.length,

      silver:
        pdData.silver.length
    }
  );

  // Debug
  console.log(
    'Silver Sample:',
    pdData.silver.slice(0, 3)
  );
}

// ===============================
// Find By FF Number
// ===============================
function findPDByFFNumber(input) {

  if (!input) {
    return null;
  }

  // Normalize
  let query =
    input
      .toUpperCase()
      .replace(/\s+/g, '');

  query =
    query.replace(/^FF/, '');

  const allPassengers = [

    ...pdData.first,

    ...pdData.business,

    ...pdData.platinum,

    ...pdData.gold,

    ...pdData.silver

  ];

  for (const pax of allPassengers) {

    const full =
      (
        pax.ffCarrier || ''
      ) +
      (
        pax.ffNumber || ''
      );

    if (full === query) {

      return pax;
    }
  }

  return null;
}

// ===============================
// Get Summary
// ===============================
function getPDSummary() {

  return {

    first:
      pdData.first.length,

    business:
      pdData.business.length,

    platinum:
      pdData.platinum.length,

    gold:
      pdData.gold.length,

    silver:
      pdData.silver.length
  };
}

// ===============================
// Exports
// ===============================
module.exports = {

  pdData,

  parsePDLog,

  getPDSummary,

  findPDByFFNumber
};