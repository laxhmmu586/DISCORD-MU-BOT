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

  // Must be Elite Plus
  if (pax.elite !== 2) {

    return {
      eligible: false,
      guest: false
    };
  }

  // Platinum
  if (pax.ffTier === "V") {

    return {
      eligible: true,
      guest: true
    };
  }

  // Gold
  if (pax.ffTier === "G") {

    // Economy Gold
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

  // Silver
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
// Parse Passenger Line
// ===============================
function parsePassengerLine(line) {

  // Example:
  // 1. YOU/RUOJIE BN121 11D Q PVG

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

  // Example:
  // FF/MU 613026637487/V/*2
  // FF/DL 2334262744/S/*1

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

  // Example:
  // ET TKNE/7817484489860/1

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

  // Example:
  // BAGTAG/3781524525/PVG /3781575569/PVG

  const matches =
    [...line.matchAll(
      /(\d+\/[A-Z]{3})/g
    )];

  if (!matches.length) {
    return [];
  }

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
// Incremental Parser
// ===============================
function parseIncrementalLog(chunk) {

  const lines =
    chunk.split("\n");

  let currentBN = null;

  for (let rawLine of lines) {

    const line =
      rawLine.toUpperCase();

    // ===========================
    // Passenger Line
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
          parseSpecialService(
            line
          ),

        updatedAt:
          new Date()
      };

      currentBN =
        pax.bn;

      continue;
    }

    // ===========================
    // FF Line
    // ===========================
    const ff =
      parseFFLine(line);

    if (
      ff &&
      currentBN &&
      passengers[currentBN]
    ) {

      passengers[currentBN]
        .ffCarrier =
        ff.ffCarrier;

      passengers[currentBN]
        .ffNumber =
        ff.ffNumber;

      passengers[currentBN]
        .ffTier =
        ff.ffTier;

      passengers[currentBN]
        .elite =
        ff.elite;

      passengers[currentBN]
        .lounge =
        getLounge(
          passengers[currentBN]
        );

      continue;
    }

    // ===========================
    // Ticket Number
    // ===========================
    const ticket =
      parseTicketLine(line);

    if (
      ticket &&
      currentBN &&
      passengers[currentBN]
    ) {

      passengers[currentBN]
        .ticketNumber =
        ticket;
    }

    // ===========================
    // Bagtag
    // ===========================
    const bagtags =
      parseBagtagLine(line);

    if (
      bagtags.length &&
      currentBN &&
      passengers[currentBN]
    ) {

      passengers[currentBN]
        .bagtags = bagtags;
    }

    // ===========================
    // Special Service
    // ===========================
    if (
      currentBN &&
      passengers[currentBN]
    ) {

      const services =
        parseSpecialService(
          line
        );

      if (services.length > 0) {

        passengers[
          currentBN
        ].specialServices = [

          ...new Set([

            ...passengers[
              currentBN
            ].specialServices,

            ...services

          ])
        ];
      }
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
  ).find(p =>
    p.seat === seat
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
  ).find(p =>
    p.name.includes(name)
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