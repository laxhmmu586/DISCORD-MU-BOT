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

  if (row >= 1 && row <= 2) {
    return "First";
  }

  if (row >= 6 && row <= 20) {
    return "Business";
  }

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

  if (pax.elite !== 2) {

    return {
      eligible: false,
      guest: false
    };
  }

  if (pax.ffTier === "V") {

    return {
      eligible: true,
      guest: true
    };
  }

  if (pax.ffTier === "G") {

    if (pax.cabin === "Economy") {

      return {
        eligible: true,
        guest: false
      };
    }

    return {
      eligible: true,
      guest: true
    };
  }

  if (pax.ffTier === "S") {

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
// Passenger Line
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
// FF Line
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
// Ticket Number
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
// Bagtag
// ===============================
function parseBagtagLine(line) {

  // ONLY parse BAGTAG lines

  if (!line.includes('BAGTAG/')) {
    return [];
  }

  // Remove BAGTAG/
  const cleaned =
    line.split('BAGTAG/')[1];

  // Match only baggage tags
  const matches =
    [...cleaned.matchAll(
      /(\d+\/[A-Z]{3})/g
    )];

  return matches.map(
    m => m[1]
  );
}

// ===============================
// Special Services
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
    // NEW PASSENGER
    // ===========================
    const pax =
      parsePassengerLine(line);

    if (pax) {

      passengers[pax.bn] = {

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

      currentPassenger.lounge =
        getLounge(
          currentPassenger
        );
    }

    // ===========================
    // Ticket
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
    // Special Service
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