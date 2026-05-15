const pdPassengers = [];

// ===============================
// Cabin Mapping
// ===============================
function getCabin(seat) {

  const row =
    parseInt(
      seat.match(/\d+/)?.[0]
    );

  if (!row) {
    return 'Economy';
  }

  // First
  if (
    row >= 1 &&
    row <= 2
  ) {

    return 'First';
  }

  // Business
  if (
    row >= 10 &&
    row <= 20
  ) {

    return 'Business';
  }

  return 'Economy';
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
// Lounge Rules
// ===============================
function getLounge(passenger) {

  const cabin =
    passenger.cabin;

  const ffTier =
    passenger.ffTier;

  let eligible = false;

  if (
    cabin === 'First' ||
    cabin === 'Business'
  ) {

    eligible = true;
  }

  if (
    ['V', 'G', 'S'].includes(ffTier)
  ) {

    eligible = true;
  }

  let guest = false;

  if (ffTier === 'V') {

    guest = true;
  }

  return {

    eligible,

    guest
  };
}

// ===============================
// Parse PD Log
// ===============================
function parsePDLog(log) {

  // Clear old data
  pdPassengers.length = 0;

  // ===========================
  // Split by Timestamp
  // ===========================
  const sections =
    log.split(
      /\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g
    );

  for (const section of sections) {

    // =========================
    // Flight
    // =========================
    const flightMatch =
      section.match(
        /PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3})/i
      );

    const flight =
      flightMatch?.[1] || '';

    const flightDate =
      flightMatch?.[2] || '';

    // =========================
    // Passenger Lines
    // =========================
    const paxLines =
      [
        ...section.matchAll(
          /\d+\.\s+([A-Z0-9\/]+)\s+BN(\d+)\s+(\S+)/gi
        )
      ];

    for (const pax of paxLines) {

      const name =
        pax[1]
          .trim();

      const bn =
        pax[2]
          .padStart(3, '0');

      const seat =
        pax[3]
          .trim();

      // =======================
      // FF
      // =======================
      const ffMatch =
        section.match(
          /FF\/([A-Z0-9]+)\s+(\d+)\/([A-Z])/i
        );

      if (!ffMatch) {
        continue;
      }

      const ffCarrier =
        ffMatch[1];

      const ffNumber =
        ffMatch[2];

      const ffTier =
        ffMatch[3];

      // =======================
      // Passenger Object
      // =======================
      const passenger = {

        name,

        bn,

        seat,

        cabin:
          getCabin(seat),

        flight,

        flightDate,

        ffCarrier,

        ffNumber,

        ffTier,

        membershipStatus:
          getMembershipStatus(
            ffTier
          ),

        lounge:
          null,

        pdOnly:
          true
      };

      passenger.lounge =
        getLounge(passenger);

      pdPassengers.push(
        passenger
      );
    }
  }

  console.log(
    'PD Passenger Count:',
    pdPassengers.length
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

  return pdPassengers.find(p => {

    const paxFF =
      (
        p.ffCarrier +
        p.ffNumber
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

  pdPassengers,

  parsePDLog,

  findPDByFFNumber
};