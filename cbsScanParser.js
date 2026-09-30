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
  const rawScan = String(rawValue || '').trim();
  // Keep flight recognition in one place so the emergency scanner accepts the
  // same supported flight variants as the regular PDF417 scanner.
  const flightMatch = matchMuFlight(rawScan);
  if (!flightMatch?.supported) {
    const err = new Error('wrong flight');
    err.code = 'WRONG_FLIGHT';
    err.flight = flightMatch?.number || '';
    throw err;
  }

  const parts = rawScan.split('|').map((part) => part.trim()).filter(Boolean);
  const flightPart = parts.findIndex((part) => matchMuFlight(part)?.supported);
  const payload = flightPart >= 0 ? parts.slice(flightPart + 1) : [];
  const isInfant = /^INF$/i.test(payload[0] || '');
  const bnToken = isInfant ? payload[1] : payload[0];
  // Emergency infant labels have existed in both forms: INF01 and BN001.
  // Accept either token after the explicit INF marker while keeping regular
  // boarding labels restricted to BN-prefixed identifiers.
  const bnMatch = String(bnToken || '').match(isInfant ? /^(?:INF|BN)0*(\d{1,4})$/i : /^BN0*(\d{1,4})$/i);
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
