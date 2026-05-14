const passengers = {};

// ===============================
// Cabin Logic
// ===============================
function getCabin(seat) {

  if (!seat) {
    return "Unknown";
  }

  const row =
    parseInt(seat);

  // First
  if (row >= 1 && row <= 2) {
    return "First";
  }

  // Business
  if (row >= 6 && row <= 20) {
    return "Business";
  }

  // Economy
  if (
    (row >= 31 && row <= 44) ||
    (row >= 61 && row <= 74)
  ) {
    return "Economy";
  }

  return "Unknown";
}

// ===============================
// Lounge Logic
// ===============================
function getLounge(pax) {

  // Platinum Elite+
  if (
    pax.ffTier === "V" &&
    pax.elite === 2
  ) {

    return {
      eligible: true,
      guest: true
    };
  }

  // Gold Elite+ Business
  if (
    pax.ffTier === "G" &&
    pax.elite === 2 &&
    pax.cabin === "Business"
  ) {

    return {
      eligible: true,
      guest: true
    };
  }

  // First Class
  if (pax.cabin === "First") {

    return {
      eligible: true,
      guest: false
    };
  }

  // Business Class
  if (pax.cabin === "Business") {

    return {
      eligible: true,
      guest: false
    };
  }

  // Gold Elite+
  if (
    pax.ffTier === "G" &&
    pax.elite === 2
  ) {

    return {
      eligible: true,
      guest: false
    };
  }

  // Silver Elite+
  if (
    pax.ffTier === "S" &&
    pax.elite === 2
  ) {

    return {
      eligible: true,
      guest: false
    };
  }

  return {
    eligible: false,
    guest: false
  };
}

// ===============================
// Parse Flight Info
// ===============================
function parseFlightInfo(block) {

  const match = block.match(
    /PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3})\d{2}/
  );

  if (!match) {
    return null;
  }

  return {

    flight:
      match[1],

    date:
      match[2]
  };
}

// ===============================
// Parse Passenger
// ===============================
function parsePassenger(block) {

  const match = block.match(
    /1\.\s+([A-Z]+\/[A-Z]+)\s+BN(\d+)\s+\*?(\d+[A-Z])\s+([A-Z])\s+PVG/
  );

  if (!match) {
    return null;
  }

  return {

    name:
      match[1],

    bn:
      match[2],

    seat:
      match[3],

    bookingClass:
      match[4],

    boarded:
      block.includes('*' + match[3])
  };
}

// ===============================
// Parse FF
// ===============================
function parseFF(block) {

  const match = block.match(
    /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])\/\*(\d)/
  );

  if (!match) {
    return null;
  }

  return {

    carrier:
      match[1],

    number:
      match[2],

    tier:
      match[3],

    elite:
      parseInt(match[4])
  };
}

// ===============================
// Parse Ticket
// ===============================
function parseTicket(block) {

  const match = block.match(
    /TKNE\/(\d+)/
  );

  if (!match) {
    return null;
  }

  return match[1];
}

// ===============================
// Parse Bagtags
// ===============================
function parseBags(block) {

  const bagLine =
    block.match(
      /BAGTAG\/([^\n\r]+)/
    );

  if (!bagLine) {
    return [];
  }

  const matches =
    [...bagLine[1].matchAll(
      /(\d+\/[A-Z]{3})/g
    )];

  return matches.map(
    m => m[1]
  );
}

// ===============================
// Parse Services
// ===============================
function parseServices(block) {

  const services = [];

  const codes = [

    "VIP",
    "AVIH",
    "BLND",
    "DEAF",
    "DEP",
    "INAD",
    "PETC",
    "UM",
    "STCR",
    "MAAS",
    "PPOC"

  ];

  for (const code of codes) {

    if (block.includes(code)) {
      services.push(code);
    }
  }

  return services;
}

// ===============================
// Main Parser
// ===============================
function parseIncrementalLog(log) {

  // Split by timestamp
  const blocks =
    log.split(
      /\d{4}\s+[A-Z][a-z]{2}\s+\d{2},/
    );

  for (const rawBlock of blocks) {

    // Normalize uppercase
    const block =
      rawBlock.toUpperCase();

    // Must be FB query
    if (
      !block.includes('>FB')
    ) {

      continue;
    }

    // Passenger not found
    if (
      block.includes('PSGR ID')
    ) {

      continue;
    }

    // ===========================
    // Parse Flight
    // ===========================
    const flightInfo =
      parseFlightInfo(block);

    // ===========================
    // Parse Passenger
    // ===========================
    const pax =
      parsePassenger(block);

    if (!pax) {
      continue;
    }

    // ===========================
    // Parse FF
    // ===========================
    const ff =
      parseFF(block);

    // ===========================
    // Parse Ticket
    // ===========================
    const ticket =
      parseTicket(block);

    // ===========================
    // Parse Bags
    // ===========================
    const bags =
      parseBags(block);

    // ===========================
    // Create Passenger
    // ===========================
    passengers[pax.bn] = {

      flight:
        flightInfo?.flight || 'UNKNOWN',

      flightDate:
        flightInfo?.date || 'UNKNOWN',

      name:
        pax.name,

      bn:
        pax.bn,

      seat:
        pax.seat,

      bookingClass:
        pax.bookingClass,

      boarded:
        pax.boarded,

      cabin:
        getCabin(
          pax.seat
        ),

      ffCarrier:
        ff?.carrier || null,

      ffNumber:
        ff?.number || null,

      ffTier:
        ff?.tier || null,

      elite:
        ff?.elite || 0,

      ticketNumber:
        ticket || null,

      bagtags:
        bags,

      specialServices:
        parseServices(block),

      updatedAt:
        new Date()
    };

    // ===========================
    // Lounge
    // ===========================
    passengers[pax.bn].lounge =
      getLounge(
        passengers[pax.bn]
      );
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
    seat.toUpperCase();

  return Object.values(
    passengers
  ).find(
    p => p.seat === seat
  );
}

// ===============================
// Find by Name
// ===============================
function findByName(name) {

  name =
    name.toUpperCase();

  return Object.values(
    passengers
  ).find(
    p => p.name.includes(name)
  );
}

// ===============================
// Exports
// ===============================
module.exports = {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName
};