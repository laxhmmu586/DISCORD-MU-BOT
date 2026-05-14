const passengers = {};

let currentFlight = 'UNKNOWN';
let currentDate = 'UNKNOWN';

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

  // ===========================
  // Platinum Elite+
  // ===========================
  if (
    pax.ffTier === "V" &&
    pax.elite === 2
  ) {

    return {
      eligible: true,
      guest: true
    };
  }

  // ===========================
  // Gold Elite+ Business
  // ===========================
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

  // ===========================
  // First Class
  // ===========================
  if (pax.cabin === "First") {

    return {
      eligible: true,
      guest: false
    };
  }

  // ===========================
  // Business Class
  // ===========================
  if (pax.cabin === "Business") {

    return {
      eligible: true,
      guest: false
    };
  }

  // ===========================
  // Gold Elite+
  // ===========================
  if (
    pax.ffTier === "G" &&
    pax.elite === 2
  ) {

    return {
      eligible: true,
      guest: false
    };
  }

  // ===========================
  // Silver Elite+
  // ===========================
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
function parseFlightInfo(line) {

  const match = line.match(
    /([A-Z0-9]+)\/(\d{2}[A-Z]{3})\d{2}/
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
// Parse Passenger Line
// ===============================
function parsePassengerLine(line) {

  const paxMatch = line.match(
    /([A-Z]+\/[A-Z]+)\s+BN(\d+)\s+\*?(\d+[A-Z])\s+([A-Z])\s+PVG/
  );

  if (!paxMatch) {
    return null;
  }

  return {

    name:
      paxMatch[1],

    bn:
      paxMatch[2],

    seat:
      paxMatch[3],

    bookingClass:
      paxMatch[4],

    boarded:
      line.includes("*")
  };
}

// ===============================
// Parse FF Line
// ===============================
function parseFFLine(line) {

  const ffMatch = line.match(
    /FF\/([A-Z0-9]+)\s+(\d+)\/([VGSC])\/\*(\d)/
  );

  if (!ffMatch) {
    return null;
  }

  return {

    ffCarrier:
      ffMatch[1],

    ffNumber:
      ffMatch[2],

    ffTier:
      ffMatch[3],

    elite:
      parseInt(ffMatch[4])
  };
}

// ===============================
// Parse Ticket Number
// ===============================
function parseTicketLine(line) {

  const match = line.match(
    /TKNE\/(\d+)/
  );

  if (!match) {
    return null;
  }

  return match[1];
}

// ===============================
// Parse Bagtag
// ===============================
function parseBagtagLine(line) {

  if (!line.includes('BAGTAG/')) {
    return [];
  }

  const cleaned =
    line.split('BAGTAG/')[1];

  const matches =
    [...cleaned.matchAll(
      /(\d+\/[A-Z]{3})/g
    )];

  return matches.map(
    m => m[1]
  );
}

// ===============================
// Parse Special Service
// ===============================
function parseSpecialService(line) {

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

    if (line.includes(code)) {
      services.push(code);
    }
  }

  return services;
}

// ===============================
// Main Parser
// ===============================
function parseIncrementalLog(chunk) {

  const lines =
    chunk.split('\n');

  let currentPassenger = null;

  for (let rawLine of lines) {

    const line =
      rawLine.toUpperCase();

    // ===========================
    // Flight Info
    // ===========================
    const flightInfo =
      parseFlightInfo(line);

    if (flightInfo) {

      currentFlight =
        flightInfo.flight;

      currentDate =
        flightInfo.date;
    }

    // ===========================
    // Passenger Line
    // ===========================
    const pax =
      parsePassengerLine(line);

    if (pax) {

      passengers[pax.bn] = {

        flight:
          currentFlight,

        flightDate:
          currentDate,

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
          null,

        ffNumber:
          null,

        ffTier:
          null,

        elite:
          0,

        ticketNumber:
          null,

        bagtags:
          [],

        lounge:
          null,

        specialServices:
          [],

        updatedAt:
          new Date()
      };

      currentPassenger =
        passengers[pax.bn];

      continue;
    }

    // ===========================
    // Ignore until passenger found
    // ===========================
    if (!currentPassenger) {
      continue;
    }

    // ===========================
    // FF
    // ===========================
    const ff =
      parseFFLine(line);

    if (ff) {

      currentPassenger.ffCarrier =
        ff.ffCarrier;

      currentPassenger.ffNumber =
        ff.ffNumber;

      currentPassenger.ffTier =
        ff.ffTier;

      currentPassenger.elite =
        ff.elite;
    }

    // ===========================
    // Ticket Number
    // ===========================
    const ticket =
      parseTicketLine(line);

    if (ticket) {

      currentPassenger.ticketNumber =
        ticket;
    }

    // ===========================
    // Bagtag
    // ===========================
    const bagtags =
      parseBagtagLine(line);

    if (bagtags.length) {

      currentPassenger.bagtags =
        bagtags;
    }

    // ===========================
    // Special Services
    // ===========================
    const services =
      parseSpecialService(line);

    if (services.length) {

      currentPassenger.specialServices = [

        ...new Set([

          ...currentPassenger.specialServices,

          ...services

        ])
      ];
    }

    // ===========================
    // Refresh Lounge
    // ===========================
    currentPassenger.lounge =
      getLounge(
        currentPassenger
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