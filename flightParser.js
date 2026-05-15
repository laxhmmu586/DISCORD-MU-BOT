const passengers = {};

// ===============================
// Cabin Mapping
// ===============================
function getCabin(letter) {

  if (!letter) {
    return 'Economy';
  }

  letter =
    letter.toUpperCase();

  // First
  if (['P', 'F', 'A'].includes(letter)) {
    return 'First';
  }

  // Business
  if ([
    'J',
    'C',
    'D',
    'I',
    'O',
    'Z',
    'R'
  ].includes(letter)) {

    return 'Business';
  }

  return 'Economy';
}

// ===============================
// Lounge Rules
// ===============================
function getLounge(passenger) {

  const cabin =
    passenger.cabin;

  const ffTier =
    passenger.ffTier;

  // ===========================
  // Eligible
  // ===========================
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

  // ===========================
  // Guest Allowed
  // ===========================
  let guest = false;

  // Platinum
  if (ffTier === 'V') {

    guest = true;
  }

  // Elite+
  if (
    passenger.ffCarrier &&
    passenger.ffCarrier !== 'MU' &&
    ['G', 'V'].includes(ffTier)
  ) {

    guest = true;
  }

  // Business Gold
  if (
    cabin === 'Business' &&
    ffTier === 'G'
  ) {

    guest = true;
  }

  return {

    eligible,

    guest
  };
}

// ===============================
// Parse Log
// ===============================
function parseIncrementalLog(log) {

  // Clear old data
  Object.keys(passengers)
    .forEach(k => delete passengers[k]);

  // ===========================
  // Split by Timestamp
  // ===========================
  const sections =
    log.split(
      /\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}/g
    );

  for (const section of sections) {

    // =========================
    // Must contain >FB
    // =========================
    const fbMatch =
      section.match(
        />FB\s+(\d{1,3})/i
      );

    if (!fbMatch) {
      continue;
    }

    const bn =
      fbMatch[1]
        .padStart(3, '0');

    // =========================
    // PSGR ID = invalid
    // =========================
    if (
      section.includes('PSGR ID')
    ) {

      continue;
    }

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
    // Name + Seat + Cabin
    // =========================
    const paxMatch =
      section.match(
        /\d+\.\s+([A-Z\/]+)\s+BN\d+\s+(\S+)\s+([A-Z])/i
      );

    if (!paxMatch) {
      continue;
    }

    const name =
      paxMatch[1]
        .trim();

    const seat =
      paxMatch[2]
        .trim();

    const bookingClass =
      paxMatch[3]
        .trim();

    const cabin =
      getCabin(
        bookingClass
      );

    // =========================
    // FF
    // =========================
    let ffCarrier = null;
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
    // Ticket
    // =========================
    let ticketNumber = null;

    const ticketMatch =
      section.match(
        /TKNE\/(\d{13})/i
      );

    if (ticketMatch) {

      ticketNumber =
        ticketMatch[1];
    }

    // =========================
    // Bagtags
    // =========================
    const bagtags = [];

    const bagMatches =
      [
        ...section.matchAll(
          /BAGTAG\/([0-9]+\/[A-Z]{3})/gi
        )
      ];

    for (const m of bagMatches) {

      bagtags.push(
        m[1]
      );
    }

    // =========================
    // Passenger Object
    // =========================
    const passenger = {

      bn,

      name,

      seat,

      bookingClass,

      cabin,

      flight,

      flightDate,

      ffCarrier,

      ffNumber,

      ffTier,

      ticketNumber,

      bagtags
    };

    passenger.lounge =
      getLounge(passenger);

    // =========================
    // Latest Record Wins
    // =========================
    passengers[bn] =
      passenger;
  }

  console.log(
    'Passenger count:',
    Object.keys(passengers).length
  );
}

// ===============================
// Find by Seat
// ===============================
function findBySeat(seat) {

  seat =
    seat
      .trim()
      .toUpperCase();

  return Object.values(
    passengers
  ).find(p => {

    return (
      p.seat.toUpperCase()
      === seat
    );
  });
}

// ===============================
// Find by Name
// ===============================
function findByName(name) {

  name =
    name
      .trim()
      .toUpperCase();

  return Object.values(
    passengers
  ).find(p => {

    return (
      p.name.toUpperCase()
        .includes(name)
    );
  });
}

// ===============================
// Find by FF Number
// ===============================
function findByFFNumber(ff) {

  ff =
    ff
      .replace(/\s/g, '')
      .toUpperCase();

  return Object.values(
    passengers
  ).find(p => {

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

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName,

  findByFFNumber
};