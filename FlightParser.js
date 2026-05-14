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

  // Elite only
  if (pax.elite !== 2) {

    return {
      eligible: false,
      guest: false,
      reason: "Not Elite Plus"
    };
  }

  // Platinum
  if (pax.ffTier === "V") {

    return {
      eligible: true,
      guest: true,
      reason: "Platinum Elite Plus"
    };
  }

  // Gold
  if (pax.ffTier === "G") {

    // Business / First
    if (
      pax.cabin === "Business" ||
      pax.cabin === "First"
    ) {

      return {
        eligible: true,
        guest: true,
        reason:
          "Gold Elite Plus Business"
      };
    }

    // Economy
    return {
      eligible: true,
      guest: false,
      reason:
        "Gold Elite Plus Economy"
    };
  }

  // Silver
  if (pax.ffTier === "S") {

    return {
      eligible: true,
      guest: false,
      reason:
        "Silver Elite Plus"
    };
  }

  // Others
  return {
    eligible: false,
    guest: false,
    reason: "No lounge access"
  };
}

// ===============================
// Parse Passenger Line
// ===============================
function parsePassengerLine(line) {

  // Example:
  // 1HUANG/WEID+ BN014 32H N PVG

  const paxMatch = line.match(
    /([A-Z]+\/[A-Z]+)\+?.*BN(\d+)\s+\*?(\d+[A-Z])\s+([A-Z])\s+PVG/
  );

  if (!paxMatch) {
    return null;
  }

  const name =
    paxMatch[1];

  const bn =
    paxMatch[2];

  const seat =
    paxMatch[3];

  const bookingClass =
    paxMatch[4];

  const boarded =
    line.includes("*");

  return {

    name,

    bn,

    seat,

    bookingClass,

    boarded
  };
}

// ===============================
// Parse FF Line
// ===============================
function parseFFLine(line) {

  // Example:
  // FF/MU 620279694660/G/*2

  const ffMatch = line.match(
    /FF\/MU\s+(\d+)\/([VGSC])\/\*(\d)/
  );

  if (!ffMatch) {
    return null;
  }

  return {

    ffNumber:
      ffMatch[1],

    ffTier:
      ffMatch[2],

    elite:
      parseInt(ffMatch[3])
  };
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

        ffTier:
          null,

        elite:
          0,

        ffNumber:
          null,

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

      passengers[currentBN].ffTier =
        ff.ffTier;

      passengers[currentBN].elite =
        ff.elite;

      passengers[currentBN].ffNumber =
        ff.ffNumber;

      passengers[currentBN].lounge =
        getLounge(
          passengers[currentBN]
        );

      continue;
    }

    // ===========================
    // Special Service Lines
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