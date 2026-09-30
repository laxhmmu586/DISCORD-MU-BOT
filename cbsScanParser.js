function matchMuFlight(rawValue = '') {
  const compact = String(rawValue || '').replace(/\s+/g, ' ');

  // PDF417 boarding-pass data is commonly a fixed-width BCBP string. The
  // carrier can therefore touch the preceding airport field, and the flight
  // number can touch the three-digit Julian date (for example
  // MU9586221, where 221 is the Julian date).
  const supportedMatch = compact.match(/MU\s*0*(9586|586)(?=\d{3}|[^A-Z0-9]|$)/i);
  if (supportedMatch) {
    return {
      number: supportedMatch[1].padStart(4, '0'),
      supported: true
    };
  }

  const flightMatch = compact.match(/MU\s*0*(\d{3,4})([A-Z]?)(?=\d{3}|[^A-Z0-9]|$)/i);
  if (!flightMatch) return null;
  return {
    number: `${flightMatch[1].padStart(4, '0')}${flightMatch[2].toUpperCase()}`,
    supported: false
  };
}

function parseEmergencyBoardScan(rawValue = '') {
  const rawScan = String(rawValue || '').normalize('NFKC').replace(/[｜¦]/g, '|').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  // Keep flight recognition in one place so the emergency scanner accepts the
  // same supported flight variants as the regular PDF417 scanner.
  let flightMatch = matchMuFlight(rawScan);
  let scanForParsing = rawScan;
  // Some mobile PDF417 decoders expose the zero in the carrier/flight field as
  // the visually identical letter O. Only repair it inside the emergency
  // flight token, then run the shared matcher again.
  if (!flightMatch?.supported) {
    const repairedScan = rawScan.replace(/MU\s*O(?=\d{3,4}(?:\d{3})?(?:\||$))/i, 'MU0');
    if (repairedScan !== rawScan) {
      flightMatch = matchMuFlight(repairedScan);
      if (flightMatch?.supported) scanForParsing = repairedScan;
    }
  }
  if (!flightMatch?.supported) {
    const err = new Error('wrong flight');
    err.code = 'WRONG_FLIGHT';
    err.flight = flightMatch?.number || '';
    throw err;
  }

  // Parse the payload directly instead of relying on an exact array length.
  // Mobile PDF417 readers may retain symbology or macro metadata before/after
  // the printed value, which must not prevent an infant label from scanning.
  const payloadMatch = scanForParsing.match(/\|\s*(?:(INF)\s*\|\s*)?(BN|INF)0*(\d{1,4})(?=$|[^0-9])/i);
  const isInfant = Boolean(payloadMatch?.[1]);
  const bnToken = payloadMatch ? `${payloadMatch[2]}${payloadMatch[3]}` : '';
  // Emergency infant labels have existed in both forms: INF01 and BN001.
  // Accept either token after the explicit INF marker while keeping regular
  // boarding labels restricted to BN-prefixed identifiers.
  const bnMatch = String(bnToken || '').match(isInfant ? /^(?:INF|BN)(\d{1,4})$/i : /^BN(\d{1,4})$/i);
  if (!bnMatch) {
    const err = new Error(isInfant ? 'INF number not found.' : 'BN number not found.');
    err.code = 'SCAN_FORMAT';
    throw err;
  }
  return {
    flight: flightMatch.number,
    seat: isInfant ? 'INF' : '',
    bn: bnMatch[1],
    rawScan,
    isInfant
  };
}

module.exports = { matchMuFlight, parseEmergencyBoardScan };
