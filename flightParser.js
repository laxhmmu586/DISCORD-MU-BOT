const passengers = {};

// ===============================
// Parse Timestamp
// Example:
// 2026 May 10, Sunday, 09:17:59
// ===============================
function parseTimestamp(str) {

  if (!str) {
    return 0;
  }

  const t =
    Date.parse(str);

  if (isNaN(t)) {
    return 0;
  }

  return t;
}

// ===============================
// Cabin Logic
// ===============================
function getCabin(seat) {

  if (!seat) {
    return 'Unknown';
  }

  const row =
    parseInt(seat);

  // First
  if (row >= 1 && row <= 4) {
    return 'First';
  }

  // Business
  if (row >= 5 && row <= 15) {
    return 'Business';
  }

  return 'Economy';
}

// ===============================
// Lounge Logic
// ===============================
function getLounge({

  ffTier,

  elite,

  cabin

}) {

  let eligible = false;

  let guest = false;

  // First
  if (cabin === 'First') {

    eligible = true;

    guest = true;
  }

  // Business
  else if (cabin === 'Business') {

    eligible = true;

    guest = false;
  }

  // Platinum
  if (ffTier === 'V') {

    eligible = true;

    guest = true;
  }

  // Gold
  else if (ffTier === 'G') {

    eligible = true;

    guest = true;
  }

  // Silver
  else if (ffTier === 'S') {

    eligible = true;

    guest = false;
  }

  return {

    eligible,

    guest
  };
}

// ===============================
// Reset
// ===============================
function resetPassengers() {

  for (const key in passengers) {

    delete passengers[key];
  }
}

// ===============================
// Parse Incremental Log
// ===============================
function parseIncrementalLog(log) {

  resetPassengers();

  const lines =
    log.split('\n');

  let currentTimestamp = 0;

  let currentFlight = null;

  let currentFlightDate = null;

  for (let i = 0; i < lines.length; i++) {

    const line =
      lines[i]
        .trim();

    // ===========================
    // Timestamp
    // ===========================
    if (

      /^\d{4}\s+[A-Z][a-z]{2}\s+\d{1,2},/.test(line)

    ) {

      currentTimestamp =
        parseTimestamp(line);

      continue;
    }

    // ===========================
    // Flight Header
    // Example:
    // MU586/14MAY
    // ===========================
    const flightMatch =
      line.match(
        /(MU\d+)\/(\d{2}[A-Z]{3})/
      );

    if (flightMatch) {

      currentFlight =
        flightMatch[1];

      currentFlightDate =
        flightMatch[2];
    }

    // ===========================
    // FB Record
    // ===========================
    if (
      line.startsWith('FB')
    ) {

      const bnMatch =
        line.match(
          /FB\s*(\d{1,3})/
        );

      if (!bnMatch) {
        continue;
      }

      const bn =
        bnMatch[1]
          .padStart(3, '0');

      // =========================
      // Existing Record
      // =========================
      const existing =
        passengers[bn];

      // =========================
      // Duplicate Protection
      // =========================
      if (

        existing &&

        existing.timestamp &&

        existing.timestamp >

        currentTimestamp

      ) {

        continue;
      }

      // =========================
      // Passenger Object
      // =========================
      const pax = {

        bn,

        flight:
          currentFlight,

        flightDate:
          currentFlightDate,

        timestamp:
          currentTimestamp,

        name: null,

        seat: null,

        cabin: null,

        ffCarrier: null,

        ffNumber: null,

        ffTier: null,

        elite: null,

        ticketNumber: null,

        bagtags: [],

        lounge: {

          eligible: false,

          guest: false
        }
      };

      // =========================
      // Parse Nearby Lines
      // =========================
      for (

        let j = i;

        j < i + 25 && j < lines.length;

        j++

      ) {

        const l =
          lines[j];

        // Name
        const nameMatch =
          l.match(
            /([A-Z]+\/[A-Z]+[A-Z]*)/
          );

        if (
          nameMatch &&
          !pax.name
        ) {

          pax.name =
            nameMatch[1];
        }

        // Seat
        const seatMatch =
          l.match(
            /\b(\d+[A-Z])\b/
          );

        if (
          seatMatch &&
          !pax.seat
        ) {

          pax.seat =
            seatMatch[1];
        }

        // FF
        const ffMatch =
          l.match(
            /FF\/([A-Z0-9]+)\s*(\d+)\/([VGSC])\/\*(\d+)/
          );

        if (ffMatch) {

          pax.ffCarrier =
            ffMatch[1];

          pax.ffNumber =
            ffMatch[2];

          pax.ffTier =
            ffMatch[3];

          pax.elite =
            ffMatch[4];
        }

        // Ticket
        const ticketMatch =
          l.match(
            /(781\d{10})/
          );

        if (
          ticketMatch &&
          !pax.ticketNumber
        ) {

          pax.ticketNumber =
            ticketMatch[1];
        }

        // Bags
        const bagMatch =
          l.match(
            /(\d{10})\/([A-Z]{3})/
          );

        if (bagMatch) {

          const bag =
            `${bagMatch[1]}/${bagMatch[2]}`;

          if (
            !pax.bagtags.includes(bag)
          ) {

            pax.bagtags.push(bag);
          }
        }
      }

      // =========================
      // Cabin
      // =========================
      pax.cabin =
        getCabin(
          pax.seat
        );

      // =========================
      // Lounge
      // =========================
      pax.lounge =
        getLounge({

          ffTier:
            pax.ffTier,

          elite:
            pax.elite,

          cabin:
            pax.cabin
        });

      // =========================
      // Save
      // =========================
      passengers[bn] = pax;
    }
  }

  console.log(
    'Passengers Parsed:',
    Object.keys(passengers).length
  );
}

// ===============================
// Find By Seat
// ===============================
function findBySeat(seat) {

  if (!seat) {
    return null;
  }

  seat =
    seat.toUpperCase();

  return Object.values(passengers)

    .find(

      p => p.seat === seat
    );
}

// ===============================
// Find By Name
// ===============================
function findByName(name) {

  if (!name) {
    return null;
  }

  name =
    name.toUpperCase();

  return Object.values(passengers)

    .find(

      p =>

        p.name &&

        p.name.includes(name)
    );
}

// ===============================
// Find By FF Number
// ===============================
function findByFFNumber(input) {

  if (!input) {
    return null;
  }

  let query =
    input
      .toUpperCase()
      .replace(/\s+/g, '');

  query =
    query.replace(/^FF/, '');

  return Object.values(passengers)

    .find(p => {

      const ff =
        (
          p.ffCarrier || ''
        ) +
        (
          p.ffNumber || ''
        );

      return ff === query;
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

  findByFFNumber,

  getCabin,

  getLounge
};