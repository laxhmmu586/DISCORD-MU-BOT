const passengers = {};


function parseSectionTimestamp(timestamp) {
  if (!timestamp) return null;

  const m = timestamp.match(/^(\d{4})\s+([A-Z]{3,9})\s+(\d{1,2}),\s*\w+,\s*(\d{2}):(\d{2}):(\d{2})$/i);
  if (!m) return null;

  const [, year, monthName, day, hh, mm, ss] = m;
  const monthMap = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };

  const month = monthMap[monthName.slice(0, 3).toUpperCase()];
  if (month === undefined) return null;

  return Date.UTC(
    Number(year),
    month,
    Number(day),
    Number(hh),
    Number(mm),
    Number(ss)
  );
}

function splitLogicalSections(log) {
  const lines = log.split(/\r?\n/);
  const tsRe = /^\d{4}\s+\w+\s+\d{2},.*?\d{2}:\d{2}:\d{2}\s*$/;
  const cmdRe = /^>\s*([A-Z0-9*\/]+)\b/i;
  const sections = [];

  let current = null;
  let pendingTimestamp = null;

  for (const line of lines) {
    if (tsRe.test(line.trim())) {
      pendingTimestamp = line.trim();
      continue;
    }

    const cmd = line.match(cmdRe)?.[1]?.toUpperCase() || null;
    const isContinuation = cmd ? /^(PN|PN1|PF|PF1)$/.test(cmd) : false;

    if (cmd && !isContinuation) {
      if (current && current.content.trim()) sections.push(current);
      current = {
        timestamp: pendingTimestamp || null,
        command: cmd,
        content: line + '\n'
      };
      pendingTimestamp = null;
      continue;
    }

    if (cmd && isContinuation && pendingTimestamp) {
      if (current && current.content.trim()) sections.push(current);
      current = {
        timestamp: pendingTimestamp,
        command: cmd,
        content: line + '\n'
      };
      pendingTimestamp = null;
      continue;
    }

    if (!current) {
      current = { timestamp: pendingTimestamp || null, command: null, content: '' };
      pendingTimestamp = null;
    }

    current.content += line + '\n';
  }

  if (current && current.content.trim()) sections.push(current);
  return sections;
}

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
    ['V', 'G', 'S']
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
    ['G', 'V'].includes(ffTier)

  ) {

    guest = true;
  }

  // Business + Gold
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

  // Clear Old
  Object.keys(passengers)
    .forEach(k => delete passengers[k]);

  // ===========================
  // Split by Timestamp
  // ===========================
  const sections = splitLogicalSections(log);

  for (const sectionObj of sections) {
    const section = sectionObj.content;
    const sectionTimestampMs =
      parseSectionTimestamp(sectionObj.timestamp);

    // =========================
    // PR Record Only
    // =========================
    if (
      !section.includes('PR:')
    ) {
      continue;
    }

    // =========================
    // Skip Invalid
    // PSGR ID means no valid passenger in this record
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

    const flight =
      flightMatch?.[1] || '';

    const rawFlightDate =
      flightMatch?.[2] || '';

    const flightDate =
      rawFlightDate.substring(0, 5);

    // =========================
    // Passenger + BN
    // Handles:
    // G2 / FA4 / AA2 etc
    // =========================
    const paxMatch =
      section.match(
        /\d+\.\s+([A-Z\/]+).*?BN(\d+)(?:\s+\*?(\d+[A-Z]))?/i
      );

    const offloadedMatch =
      section.match(
        /^\s*\d+\.\s+([A-Z\/]+).*?\bDELETED\b/im
      );

    if (!paxMatch && !offloadedMatch) {
      continue;
    }

    const name =
      (paxMatch?.[1] || offloadedMatch?.[1] || '')
        .trim();

    const bn =
      paxMatch?.[2]
        ? paxMatch[2].padStart(3, '0')
        : '---';

    const isPassengerOffloaded =
      !!offloadedMatch &&
      !paxMatch?.[2] &&
      !paxMatch?.[3];

    // =========================
    // Seat
    // =========================
    let seat = '---';

    if (isPassengerOffloaded) {
      seat = '---';
    } else if (paxMatch?.[3]) {
      seat =
        paxMatch[3]
          .toUpperCase();
    } else {
      const seatMatch =
        section.match(
          /\bBN\d{1,3}\s+\*?(\d+[A-Z])\b/i
        ) ||
        section.match(
          /\bR(\d+[A-Z])\b/i
        );

      if (seatMatch) {

        seat =
          (seatMatch[1] || '').toUpperCase();
      }
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
    // Passport / PAX Info
    // =========================
    let paxListName = null;
    let paxInfoRaw = null;
    let passportRaw = null;

    const paxListMatch =
      section.match(
        /PAXLST\s*:\s*([A-Z\/]+)\/?/i
      );

    if (paxListMatch) {
      paxListName =
        paxListMatch[1].trim();
    }

    const paxInfoMatch =
      section.match(
        /PAX INFO\s*:\s*([^\n\r]+)/i
      );

    if (paxInfoMatch) {
      paxInfoRaw =
        paxInfoMatch[1].trim();
    }

    const passportMatch =
      section.match(
        /PASSPORT\s*:\s*([^\n\r]+)/i
      );

    if (passportMatch) {
      passportRaw =
        passportMatch[1].trim();
    }

    // =========================
    // Bags
    // Handles:
    // 3781640468/PVG
    // DL 659822/PVG
    // /3781277263/PVG
    // AS 216490/CSX
    // B6 216490/CTU
    // =========================
    const bagtags = [];

    const bagLineMatch =
      section.match(
        /BAGTAG\/([^\n\r]+)/i
      );

    if (bagLineMatch) {

      const line =
        bagLineMatch[1];

      const bags = [
        ...line.matchAll(
          /(?:^|\s)\/?\s*((?:[A-Z]{1,2}\s*)?\d{5,12})\s*\/\s*([A-Z]{3})\b/gi
        )
      ];

      for (const b of bags) {

        const bagNumber =
          b[1]
            .replace(/\s+/g, ' ')
            .trim();

        const destination =
          b[2]
            .toUpperCase();

        bagtags.push(
          `${bagNumber}/${destination}`
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

    const outboundLine =
      section.match(/^\s*X?O\/[^\n\r]+/im)?.[0] || null;

    if (outboundLine) {
      const outboundMatch =
        outboundLine.match(
          /X?O\/([A-Z0-9]+)\/(\d{2}[A-Z]{3})(?:.*?\bBN(\d+))?(?:.*?\b(\d+[A-Z]))?.*?\b([A-Z]{3})\s*$/i
        );

      if (outboundMatch) {
        outbound = {
          flight: outboundMatch[1],
          date: outboundMatch[2],
          bn: outboundMatch[3] || null,
          seat: outboundMatch[4] || null,
          destination: outboundMatch[5]
        };

        if (/\bDELETED\b/i.test(outboundLine)) {
          outbound.status = 'DELETED';
        }
      }
    }

    // =========================
    // Special Services
    // Safe SSR Matching
    // =========================
    const specialServices = [];

    const ssrCodes = [
      'VIP', 'AVIH', 'BLND', 'DEAF', 'DEP', 'INAD', 'PETC',
      'UM', 'STCR', 'MAAS', 'PPOC', 'WCHR', 'WCHS', 'WCHC'
    ];

    const nonPsmSection = section
      .split(/\r?\n/)
      .filter(line => !/^\s*PSM\b/i.test(line))
      .join('\n');

    for (const code of ssrCodes) {

      // Safe Match
      const regex =
        new RegExp(

          `(?:\\s|\\/|^)${code}(?:\\s|\\/|$)`,

          'i'
        );

      if (
        regex.test(nonPsmSection)
      ) {

        specialServices.push(code);
      }
    }

    // UM + number (ex: UM32)
    const umNumber = section.match(/\bUM(\d{1,2})\b/i)?.[1];
    if (umNumber && !specialServices.includes('UM')) {
      specialServices.push('UM');
    }

    // Wheelchair only one should be shown
    const wheelchair = ['WCHR', 'WCHS', 'WCHC'].find(code => specialServices.includes(code));
    const filteredSpecialServices = specialServices.filter(code => !['WCHR', 'WCHS', 'WCHC'].includes(code));
    if (wheelchair) filteredSpecialServices.push(wheelchair);

    // SPML (special meals): include all 4-letter meal codes
    const specialMeals = [];
    const mealMatches = section.matchAll(/\bSPML-([A-Z]{4})\b/gi);
    for (const m of mealMatches) {
      const mealCode = m[1].toUpperCase();
      if (!specialMeals.includes(mealCode)) specialMeals.push(mealCode);
    }

    // Paid products (ASVC)
    const paidProducts = [];
    const paidProductsShort = [];
    const asvcLines = section.match(/^\s*ASVC-[^\n\r]+/gim) || [];
    for (const line of asvcLines) {
      const fullLine =
        line.replace(/^ASVC-\s*/i, '').trim();

      paidProducts.push(fullLine);

      const serviceCodeMatch =
        fullLine.match(/(?:^|\/)\s*([A-Z]{4})\s*(?:\/|\s)/i);

      const tokenMatch =
        fullLine.match(/\b(\d+[A-Z]|[0-9]+PC)\b/i);

      const shortCode =
        (serviceCodeMatch?.[1] || tokenMatch?.[1] || '').toUpperCase();

      const emdaMatch =
        fullLine.match(/\bEMDA-\d{13}\b/i);

      if (shortCode && emdaMatch) {
        paidProductsShort.push(
          `${shortCode}/${emdaMatch[0].toUpperCase()}`
        );
      }
    }

    // =========================
    // Passenger Object
    // =========================
    const sectionLines =
      section
        .split(/\r?\n/)
        .map(line => line.replace(/[\u001c-\u001f]/g, '').trim())
        .filter(Boolean);

    const ckinLines = [
      ...new Set(
        sectionLines.filter(line => /^CKIN\b/i.test(line))
      )
    ];

    const psmLines = [
      ...new Set(
        sectionLines.filter(line => /^PSM\b/i.test(line))
      )
    ];

    const operationHistoryLines = [
      ...new Set(
        sectionLines.filter(line => /^[A-Z]{2,3}\s+[A-Z]{3}\d{5,}\s+AGT\d+\/\d{2}[A-Z]{3}\d{4}/i.test(line))
      )
    ];

    const checkinDetails = [
      ...ckinLines,
      ...operationHistoryLines
    ];

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
      paxListName,
      paxInfoRaw,
      passportRaw,

      ticketNumber,

      bagtags,

      inbound,

      outbound,

      specialServices: filteredSpecialServices,
      specialMeals,
      paidProducts,
      paidProductsShort,
      offloaded: isPassengerOffloaded,
      sourceText: section,
      ckinLines,
      psmLines,
      operationHistoryLines,
      checkinDetails
    };

    passenger.lounge =
      getLounge(passenger);

    const existingPassenger =
      passengers[bn];

    if (existingPassenger) {
      passenger.psmLines = [
        ...new Set([
          ...(existingPassenger.psmLines || []),
          ...(passenger.psmLines || [])
        ])
      ];

      passenger.ckinLines = [
        ...new Set([
          ...(existingPassenger.ckinLines || []),
          ...(passenger.ckinLines || [])
        ])
      ];

      passenger.operationHistoryLines = [
        ...new Set([
          ...(existingPassenger.operationHistoryLines || []),
          ...(passenger.operationHistoryLines || [])
        ])
      ];

      passenger.checkinDetails = [
        ...new Set([
          ...(passenger.ckinLines || []),
          ...(passenger.operationHistoryLines || [])
        ])
      ];

      passenger.paidProducts = [
        ...new Set([
          ...(existingPassenger.paidProducts || []),
          ...(passenger.paidProducts || [])
        ])
      ];

      passenger.paidProductsShort = [
        ...new Set([
          ...(existingPassenger.paidProductsShort || []),
          ...(passenger.paidProductsShort || [])
        ])
      ];

      const existingTs =
        existingPassenger.sectionTimestampMs;

      if (
        existingTs &&
        sectionTimestampMs &&
        existingTs > sectionTimestampMs
      ) {
        continue;
      }
    }

    passenger.sectionTimestampMs = sectionTimestampMs || null;

    // Latest Record Wins (with merged check-in continuation lines)
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
// Find by Bagtag
// ===============================
function findByBagtag(bagtagQuery) {
  const normalizedQuery =
    (bagtagQuery || '')
      .replace(/\s+/g, '')
      .toUpperCase();

  if (!normalizedQuery) return null;

  return Object.values(
    passengers
  ).find(p => {
    const tags = p.bagtags || [];
    return tags.some(tag => {
      const bagOnly =
        (tag || '')
          .split('/')[0]
          .replace(/\s+/g, '')
          .toUpperCase();
      return bagOnly === normalizedQuery;
    });
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

  findByBagtag
};
