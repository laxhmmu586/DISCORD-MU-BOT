// Contact text is not SSR data. A CTC field can wrap across display lines.
function withoutContactDetails(section) {
  let contact = false;
  return String(section || '').split(/\r?\n/).filter(line => {
    const normalized = line.replace(/[\u0000-\u001f]/g, '').trim();
    if (/^CTC(?:[-/\s]|$)/i.test(normalized)) { contact = true; return false; }
    if (!contact) return true;
    // New fields can be indented; wrapped phone/address text remains in CTC.
    if (/^(?:PSPT-|PAXLST\s*:|PAX INFO\s*:|PASSPORT\s*:|SEC TXT-|CKIN\b|BAGTAG\/|[XIO]\/|NAM\s|PSM-|MSG-|INF-|SPML-)/i.test(normalized)
      || /^\s{0,1}\S/.test(line)) { contact = false; return true; }
    return false;
  }).join('\n');
}
module.exports = {withoutContactDetails};
