function matchMuFlight(rawValue = '') {
  const compact = String(rawValue || '').replace(/\s+/g, ' ');

  // PDF417 boarding-pass data is commonly a fixed-width BCBP string. The
  // carrier can therefore touch the preceding airport field, and the flight
  // suffix can touch the three-digit Julian date (for example MU0586D221).
  const supportedMatch = compact.match(/MU\s*0*(586)(D?)(?=\d{3}|[^A-Z0-9]|$)/i);
  if (supportedMatch) {
    return {
      number: `${supportedMatch[1].padStart(4, '0')}${supportedMatch[2].toUpperCase()}`,
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

module.exports = { matchMuFlight };
