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
// Parse Timestamp
// ===============================
function parseTimestamp(block) {

  const match = block.match(
    /(\d{4}\s+[A-Z][a-z]{2}\s+\d{1,2},\s+[A-Z][a-z]+,\s+\d{2}:\d{2}:\d{2})/
  );

  if (!match) {
    return null;
  }

  return new Date(match[1]);
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
    /1\.\s+([A-Z]+\/[A-Z]+).*?BN(\d+)/s
  );

  if (!match) {
    return null;
  }

  // Seat
  const seatMatch =
    block.match(
      /BN\d+\s+\*?(\d+[A-Z])/
    );

  // Booking Class
  const bookingClassMatch =
    block.match(
      /BN\d+\s+\*?\d+[A-Z]\s+([A-Z])/
    );

  return {

    name:
      match[1],

    bn:
      match[2],

    seat:
      seatMatch
        ? seatMatch[1]
        : 'NONE',

    bookingClass:
      bookingClassMatch
        ? bookingClassMatch[1]
        : 'UNKNOWN',

    boarded:
      block.includes('*')
  };
}

// ===============================
// Parse FF
// ===============================
function parseFF(block) {

  // Elite Format
  let match = block.match(
    /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])\/\*(\d)/
  );

  if (match) {

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

  // Regular Format
  match = block.match(
    /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])/
  );

  if (match) {

    return {

      carrier:
        match[1],

      number:
        match[2],

      tier:
        match[3],

      elite:
        0
    };
  }

  return null;
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

  // Reset passengers
  Object.keys(passengers)
    .forEach(
      key => delete passengers[key]
    );

  // Split blocks by timestamp
  const blocks =
    log.match(
      /\d{4}\s+[A-Z][a-z]{2}\s+\d{1,2},\s+[A-Z][a-z]+,\s+\d{2}:\d{2}:\d{2}[\s\S]*?(?=\d{4}\s+[A-Z][a-z]{2}\s+\d{1,2},\s+[A-Z][a-z]+,\s+\d{2}:\d{2}:\d{2}|$)/g
    ) || [];

  for (const rawBlock of blocks) {

    const block =
      rawBlock.toUpperCase();

    const timestamp =
      parseTimestamp(rawBlock);

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

    // Parse flight
    const flightInfo =
      parseFlightInfo(block);

    // Parse passenger
    const pax =
      parsePassenger(block);

    if (!pax) {
      continue;
    }

    // Keep Latest Record Only
    const existing =
      passengers[pax.bn];

    if (
      existing &&
      existing.updatedAt &&
      timestamp &&
      existing.updatedAt > timestamp
    ) {

      continue;
    }

    // Parse FF
    const ff =
      parseFF(block);

    // Parse Ticket
    const ticket =
      parseTicket(block);

    // Parse Bags
    const bags =
      parseBags(block);

    // Create Passenger
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
        timestamp || new Date()
    };

    // Lounge
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
// Find By FF Number
// ===============================
function findByFFNumber(input) {

  if (!input) {
    return null;
  }

  // Normalize
  let query =
    input
      .toUpperCase()
      .replace(/\s+/g, '');

  // Remove FF prefix
  query =
    query.replace(/^FF/, '');

  // Example:
  // MU650278486253

  for (const bn in passengers) {

    const pax =
      passengers[bn];

    if (!pax) {
      continue;
    }

    const carrier =
      (
        pax.ffCarrier || ''
      )
      .toUpperCase();

    const number =
      (
        pax.ffNumber || ''
      )
      .replace(/\s+/g, '');

    const full =
      carrier + number;

    if (
      full === query
    ) {

      return pax;
    }
  }

  return null;
}

// ===============================
// Exports
// ===============================
module.exports = {

  passengers,

  parseIncrementalLog,

  findBySeat,

  findByName,

  findByFFNumber,

  getLounge,

  getCabin
};