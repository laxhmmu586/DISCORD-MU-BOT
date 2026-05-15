const passengers = {};

// ===============================
// Cabin Mapping by Seat
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
    row >= 6 &&
    row <= 20
  ) {

    return 'Business';
  }

  // Economy
  if (
    row >= 30
  ) {

    return 'Economy';
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

  let eligible = false;

  // Cabin
  if (

    cabin === 'First' ||
    cabin === 'Business'

  ) {

    eligible = true;
  }

  // Elite
  if (
    ['V', 'G', 'S', 'D']
      .includes(ffTier)
  ) {

    eligible = true;
  }

  let guest = false;

  // Platinum
  if (ffTier === 'V') {

    guest = true;
  }

  // SkyTeam Elite+
  if (

    passenger.ffCarrier &&
    passenger.ffCarrier !== 'MU' &&
    ['G', 'V', 'D']
      .includes(ffTier)

  ) {

    guest = true;
  }

  // Business + Gold
  if (

    cabin === 'Business' &&
    ['G', 'V', 'D']
      .includes(ffTier)

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

  // Clear Old
  Object.keys(passengers)
    .forEach(k => delete passengers[k]);

  // ===========================
  // Split by PR:
  // Works for:
  // >FB
  // >fb295
  // >FSN
  // ===========================
  const sections =
    log.split(
      /(?=PR:\s+[A-Z0-9]+\/\d{2}[A-Z]{3}\d{2})/g
    );

  for (const section of sections) {

    // =========================
    // Skip Invalid
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
        /PR:\s+([A-Z0-9]+)\/(\d{2}[A-Z]{3}\d{2})/i
      );

    if (!flightMatch) {
      continue;
    }

    const flight =
      flightMatch[1];

    const rawFlightDate =
      flightMatch[2];

    const flightDate =
      rawFlightDate.substring(0, 5);

    // =========================
    // Passenger + BN
    // Supports:
    // BN298
    // BN 298
    // =========================
    const paxMatch =
      section.match(
        /\d+\.\s+([A-Z\/]+).*?BN\s?(\d+)/i
      );

    if (!paxMatch) {
      continue;
    }

    const name =
      paxMatch[1]
        .trim();

    const bn =
      paxMatch[2]
        .padStart(3, '0');

    // =========================
    // Seat
    // =========================
    let seat = '---';

    const seatMatch =
      section.match(
        /\b(\d+[A-Z])\b/
      );

    if (seatMatch) {

      seat =
        seatMatch[1];
    }

    // =========================
    // Cabin
    // =========================
    const cabin =
      getCabin(seat);

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
    // Bags
    // =========================
    const bagtags = [];

    const bagLineMatch =
      section.match(
        /BAGTAG\/([^\n\r]+)/i
      );

    if (bagLineMatch) {

      const line =
        bagLineMatch[1];

      const bags =
        [
          ...line.matchAll(
            /([A-Z]{0,2}\s?\d+\/[A-Z]{3})/gi
          )
        ];

      for (const b of bags) {

        bagtags.push(

          b[1]
            .replace(/\s+/g, '')
        );
      }
    }

    // =========================
    // Inbound
    // =========================
    let inbound = null;

    const inboundMatch =
      section.match(
        /I\/([A-Z0-9]+)\/(\d{2}[A-Z]{3}).*?\s([A-Z]{3})/i
      );

    if (inboundMatch) {

      inbound = {

        flight:
          inboundMatch[1],

        date:
          inboundMatch[2],

        origin:
          inboundMatch[3]
      };
    }

    // =========================
    // Outbound
    // =========================
    let outbound = null;

    const outboundMatch =
      section.match(
        /O\/([A-Z0-9]+)\/(\d{2}[A-Z]{3}).*?(BN(\d+))?.*?(\d+[A-Z])?.*?\s([A-Z]{3})/i
      );

    if (outboundMatch) {

      outbound = {

        flight:
          outboundMatch[1],

        date:
          outboundMatch[2],

        bn:
          outboundMatch[4] || null,

        seat:
          outboundMatch[5] || null,

        destination:
          outboundMatch[6]
      };
    }

    // =========================
    // Special Services
    // =========================
    const specialServices = [];

    const ssrCodes = [

      'WCHR',
      'WCHS',
      'WCHC',

      'UMNR',
      'UM',

      'BLND',
      'DEAF',
      'MEDA',
      'OXYG',

      'PETC',
      'AVIH',

      'MAAS',
      'STCR',
      'INAD',
      'VIP',
      'CIP',
      'PPOC',

      'VGML',
      'AVML',
      'KSML',
      'MOML',
      'CHML',
      'BBML',
      'GFML',
      'NLML',
      'DBML',
      'FPML'
    ];

    for (const code of ssrCodes) {

      const regex =
        new RegExp(

          `(?:\\s|\\/|^)${code}(?:\\s|\\/|$)`,

          'i'
        );

      if (
        regex.test(section)
      ) {

        specialServices.push(code);
      }
    }

    // =========================
    // Passenger Object
    // =========================
    const passenger = {

      bn,

      name,

      seat,

      cabin,

      flight,

      flightDate,

      ffCarrier,

      ffNumber,

      ffTier,

      ticketNumber,

      bagtags,

      inbound,

      outbound,

      specialServices
    };

    passenger.lounge =
      getLounge(passenger);

    // Latest Record Wins
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
      p.name
        .toUpperCase()
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