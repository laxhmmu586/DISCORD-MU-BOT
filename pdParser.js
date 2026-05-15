const pdData = {

  platinum: [],

  gold: [],

  silver: [],

  first: [],

  business: []
};

// ===============================
// Normalize FF Number
// ===============================
function normalizeFF(ff) {

  return String(ff || '')
    .replace(/\s/g, '')
    .toUpperCase();
}

// ===============================
// Parse PD Data
// ===============================
function parsePDLog(log) {

  // Clear old data
  pdData.platinum = [];
  pdData.gold = [];
  pdData.silver = [];
  pdData.first = [];
  pdData.business = [];

  // ===========================
  // Find FF Records
  // ===========================
  const ffMatches = [

    ...log.matchAll(
      /FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/gi
    )

  ];

  for (const match of ffMatches) {

    const carrier =
      match[1];

    const number =
      match[2];

    const tier =
      match[3];

    const entry = {

      ffCarrier:
        carrier,

      ffNumber:
        number,

      ffTier:
        tier
    };

    // =========================
    // Platinum
    // =========================
    if (tier === 'V') {

      pdData.platinum.push(
        entry
      );
    }

    // =========================
    // Gold
    // =========================
    else if (tier === 'G') {

      pdData.gold.push(
        entry
      );
    }

    // =========================
    // Silver
    // =========================
    else if (tier === 'S') {

      pdData.silver.push(
        entry
      );
    }
  }

  console.log(
    'PD Parsed:',
    {

      platinum:
        pdData.platinum.length,

      gold:
        pdData.gold.length,

      silver:
        pdData.silver.length
    }
  );
}

// ===============================
// Find PD by FF Number
// ===============================
function findPDByFFNumber(ff) {

  ff =
    normalizeFF(ff);

  const all = [

    ...pdData.platinum,

    ...pdData.gold,

    ...pdData.silver
  ];

  const found =
    all.find(p => {

      const paxFF =
        normalizeFF(

          p.ffCarrier +
          p.ffNumber
        );

      return paxFF === ff;
    });

  if (!found) {
    return null;
  }

  // ===========================
  // Membership Status
  // ===========================
  let status =
    'Regular';

  if (found.ffTier === 'V') {
    status = 'Platinum';
  }

  else if (found.ffTier === 'G') {
    status = 'Gold';
  }

  else if (found.ffTier === 'S') {
    status = 'Silver';
  }

  // ===========================
  // Return PD Result
  // ===========================
  return {

    name:
      'PD MEMBER',

    bn:
      '---',

    seat:
      '---',

    cabin:
      'Elite',

    flight:
      'PD',

    flightDate:
      '',

    ffCarrier:
      found.ffCarrier,

    ffNumber:
      found.ffNumber,

    ffTier:
      found.ffTier,

    ticketNumber:
      null,

    bagtags:
      [],

    lounge: {

      eligible:
        true,

      guest:
        found.ffTier === 'V'
    },

    pdOnly:
      true,

    membershipStatus:
      status
  };
}

// ===============================
// Exports
// ===============================
module.exports = {

  pdData,

  parsePDLog,

  findPDByFFNumber
};