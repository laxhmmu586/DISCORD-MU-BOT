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
  let lastPassengerBn = null;
  let lineSeq = 0;
  const normalizeDetailLine = (line) =>
    (line || '')
      .replace(/[\u001c-\u001f]/g, '')
      .replace(/\s+[+-]\s*$/, '')
      .trimEnd();

  const dedupeExactPreserveOrder = (lines) => {
    const seen = new Set();
    const out = [];
    for (const raw of (lines || [])) {
      const line = normalizeDetailLine(raw);
      if (!line) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
    }
    return out;
  };

  const enrichAndSortHistoryLines = (lines) => {
    const monthMap = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };

    const enriched = (lines || []).map((raw, idx) => {
      const text = normalizeDetailLine(raw);
      const m = text.match(/\/(\d{2})([A-Z]{3})(\d{4})(?:\/|\s|$)/i);
      let orderTs = Number.MAX_SAFE_INTEGER;

      if (m) {
        const day = Number(m[1]);
        const mon = monthMap[m[2].toUpperCase()];
        const hh = Number(m[3].slice(0, 2));
        const mm = Number(m[3].slice(2, 4));

        if (mon !== undefined) {
          orderTs = Date.UTC(2000, mon, day, hh, mm, 0);
        }
      }

      lineSeq += 1;
      return { text, orderTs, seq: lineSeq + idx };
    });

    enriched.sort((a, b) => {
      if (a.orderTs !== b.orderTs) return a.orderTs - b.orderTs;
      return a.seq - b.seq;
    });

    return enriched.map(x => x.text);
  };

  const extractContinuationDetailLines = (text) => {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.replace(/[\u001c-\u001f]/g, '').trim())
      .filter(Boolean);

    return dedupeExactPreserveOrder(
      lines.filter(line => /^[A-Z]{2,3}\s+[A-Z]{3}\d{5,}\s+(?:AGT\d+|EDI-[A-Z0-9]+)\/\d{2}[A-Z]{3}\d{4}(?:\/[^\s]+)*(?:\s+[^\s].*)?$/i.test(line))
    );
  };

  for (const sectionObj of sections) {
    let section = sectionObj.content;
    const isContinuationCommand =
      /^(PN|PN1|PF|PF1)$/i.test(sectionObj.command || '');

    if (isContinuationCommand) {
      section =
        section.replace(
          /(?:^|\r?\n)\s*PR:\s+[^\n\r]*(?:\r?\n|$)/i,
          ''
        );
    }
    const sectionTimestampMs =
      parseSectionTimestamp(sectionObj.timestamp);

    // =========================
    // PR Record Only
    // =========================
    if (
      !section.includes('PR:')
    ) {
      if (isContinuationCommand && lastPassengerBn && passengers[lastPassengerBn]) {
        const continuedDetails = extractContinuationDetailLines(section);
        if (continuedDetails.length) {
          passengers[lastPassengerBn].operationHistoryLines = [
            ...(passengers[lastPassengerBn].operationHistoryLines || []),
            ...continuedDetails
          ];

          passengers[lastPassengerBn].operationHistoryLines =
            enrichAndSortHistoryLines(
              dedupeExactPreserveOrder(
                passengers[lastPassengerBn].operationHistoryLines
              )
            );

          passengers[lastPassengerBn].checkinDetails = [
            ...new Set([
              ...(passengers[lastPassengerBn].ckinLines || []),
              ...(passengers[lastPassengerBn].operationHistoryLines || [])
            ])
          ];
        }
      }
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
    const headerBnMatch =
      section.match(/\bBN(\d{1,3})\b/i);

    const offloadedMatch =
      section.match(
        /^\s*\d+\.\s+([A-Z\/]+).*?\bDELETED\b/im
      );

    if (!paxMatch && !offloadedMatch && !headerBnMatch) {
      continue;
    }

    const name =
      (paxMatch?.[1] || offloadedMatch?.[1] || '')
        .trim();

    const bn =
      (paxMatch?.[2] || headerBnMatch?.[1] || '')
        ? (paxMatch?.[2] || headerBnMatch?.[1] || '').padStart(3, '0')
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
        /BAGTAG\s*\/([^\n\r]+)/i
      );

    if (bagLineMatch) {

      const line =
        bagLineMatch[1];

      const bags = [
        ...line.matchAll(
          /(?:^|\s)\/?\s*((?:[A-Z]{1,3}\s*)?\d{5,12})\s*\/\s*([A-Z]{3})\b/gi
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
        /^\s*I\/\s*([A-Z0-9]+)\s*\/\s*(\d{2}[A-Z]{3}(?:\d{2})?).*?\b([A-Z]{3})\s*$/im
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
          /X?O\/\s*([A-Z0-9]+)\s*\/\s*(\d{2}[A-Z]{3}(?:\d{2})?)(?:.*?\bBN\s*(\d+))?(?:.*?\b(\d+[A-Z]))?.*?\b([A-Z]{3})\s*$/i
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
      'VIP', 'AVIH', 'BLND', 'DEAF', 'INAD', 'PETC',
      'UM', 'STCR', 'MAAS', 'PPOC', 'WCHR', 'WCHS', 'WCHC'
    ];

    const nonPsmSection = section
      .split(/\r?\n/)
      .filter(line => !/^(?:PSM|MSG)(?:\b|-)/i.test(line.trim()))
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

    const ckinLines = dedupeExactPreserveOrder(
      sectionLines.filter(line => /^CKIN\b/i.test(line))
    );

    const psmLines = [
      ...new Set(
        sectionLines.filter(line => /^(?:PSM|MSG)(?:\b|-)/i.test(line))
      )
    ];

    const operationHistoryLines =
      enrichAndSortHistoryLines(
        dedupeExactPreserveOrder(
          sectionLines.filter(line => /^[A-Z]{2,3}\s+[A-Z]{3}\d{5,}\s+(?:AGT\d+|EDI-[A-Z0-9]+)\/\d{2}[A-Z]{3}\d{4}(?:\/[^\s]+)*(?:\s+[^\s].*)?$/i.test(line))
        )
      );

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
      const mergedBagtags = [
        ...new Set([
          ...(existingPassenger.bagtags || []),
          ...(passenger.bagtags || [])
        ])
      ];

      passenger.psmLines = [
        ...new Set([
          ...(existingPassenger.psmLines || []),
          ...(passenger.psmLines || [])
        ])
      ];

      passenger.ckinLines = [
        ...(existingPassenger.ckinLines || []),
        ...(passenger.ckinLines || [])
      ];
      passenger.ckinLines =
        dedupeExactPreserveOrder(passenger.ckinLines);

      passenger.operationHistoryLines = [
        ...(existingPassenger.operationHistoryLines || []),
        ...(passenger.operationHistoryLines || [])
      ];
      passenger.operationHistoryLines =
        enrichAndSortHistoryLines(
          dedupeExactPreserveOrder(passenger.operationHistoryLines)
        );

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

      passenger.bagtags =
        mergedBagtags;

      passenger.inbound =
        passenger.inbound || existingPassenger.inbound || null;

      passenger.outbound =
        passenger.outbound || existingPassenger.outbound || null;

      passenger.ticketNumber =
        passenger.ticketNumber || existingPassenger.ticketNumber || null;

      passenger.seat =
        passenger.seat || existingPassenger.seat || null;

      passenger.ffCarrier =
        passenger.ffCarrier || existingPassenger.ffCarrier || null;

      passenger.ffNumber =
        passenger.ffNumber || existingPassenger.ffNumber || null;

      passenger.ffTier =
        passenger.ffTier || existingPassenger.ffTier || null;

      passenger.specialServices = [
        ...new Set([
          ...(existingPassenger.specialServices || []),
          ...(passenger.specialServices || [])
        ])
      ];

      const changeLogLines = [];
      const sameOrNewer = !existingPassenger.sectionTimestampMs || !sectionTimestampMs || sectionTimestampMs >= existingPassenger.sectionTimestampMs;
      if (sameOrNewer) {
        if (existingPassenger.seat && passenger.seat && existingPassenger.seat !== passenger.seat) {
          changeLogLines.push(`CHG SEAT ${existingPassenger.seat} -> ${passenger.seat}`);
        }
        if (existingPassenger.ffNumber && passenger.ffNumber && existingPassenger.ffNumber !== passenger.ffNumber) {
          changeLogLines.push(`CHG FQTV ${existingPassenger.ffCarrier || ''}${existingPassenger.ffNumber} -> ${(passenger.ffCarrier || '')}${passenger.ffNumber}`.trim());
        }
        const oldPaid = existingPassenger.paidProductsShort || [];
        const newPaid = passenger.paidProductsShort || [];
        const paidRemoved = oldPaid.filter(x => !newPaid.includes(x));
        const paidAdded = newPaid.filter(x => !oldPaid.includes(x));
        paidRemoved.forEach(x => changeLogLines.push(`CHG PAID REMOVED ${x}`));
        paidAdded.forEach(x => changeLogLines.push(`CHG PAID ADDED ${x}`));
      }

      const existingTs =
        existingPassenger.sectionTimestampMs;

      if (
        existingTs &&
        sectionTimestampMs &&
        existingTs > sectionTimestampMs
      ) {
        existingPassenger.psmLines = [
          ...new Set([
            ...(existingPassenger.psmLines || []),
            ...(passenger.psmLines || [])
          ])
        ];

        existingPassenger.ckinLines = [
          ...(existingPassenger.ckinLines || []),
          ...(passenger.ckinLines || [])
        ];
        existingPassenger.ckinLines =
          dedupeExactPreserveOrder(existingPassenger.ckinLines);

        existingPassenger.operationHistoryLines = [
          ...(existingPassenger.operationHistoryLines || []),
          ...(passenger.operationHistoryLines || [])
        ];
        existingPassenger.operationHistoryLines =
          enrichAndSortHistoryLines(
            dedupeExactPreserveOrder(existingPassenger.operationHistoryLines)
          );

        existingPassenger.bagtags =
          mergedBagtags;

        if (
          passenger.inbound &&
          sectionTimestampMs &&
          (
            !existingPassenger.inbound ||
            !existingTs ||
            sectionTimestampMs >= existingTs
          )
        ) {
          existingPassenger.inbound =
            passenger.inbound;
        }

        if (
          passenger.outbound &&
          sectionTimestampMs &&
          (
            !existingPassenger.outbound ||
            !existingTs ||
            sectionTimestampMs >= existingTs
          )
        ) {
          existingPassenger.outbound =
            passenger.outbound;
        }

        existingPassenger.checkinDetails = [
          ...(existingPassenger.ckinLines || []),
          ...(existingPassenger.operationHistoryLines || [])
        ];
        continue;
      }

      passenger.checkinDetails = [
        ...(passenger.ckinLines || []),
        ...(passenger.operationHistoryLines || []),
        ...changeLogLines
      ];
    }

    passenger.sectionTimestampMs = sectionTimestampMs || null;

    // Latest Record Wins (with merged check-in continuation lines)
    passengers[bn] =
      passenger;

    lastPassengerBn = bn;
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
