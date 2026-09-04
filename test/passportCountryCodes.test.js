const test = require('node:test');
const assert = require('node:assert/strict');

const { extractPassportCountryCodes } = require('../syParser');

test('API validation reads two country codes from PASSPORT and ignores PAX INFO country codes', () => {
  const section = [
    'PAX INFO :/DOB/110715/POB//GENDER/F',
    'PASSPORT :K5153565E/P/NAT/SGP//300328/SGP/N/A'
  ].join('\n');

  assert.deepEqual(extractPassportCountryCodes(section), ['SGP', 'SGP']);
});

test('PAX INFO country code does not compensate for a missing PASSPORT country code', () => {
  const section = [
    'PAX INFO :USA/DOB/110715/POB//GENDER/F',
    'PASSPORT :K5153565E/P/NAT/SGP//300328//N/A'
  ].join('\n');

  assert.deepEqual(extractPassportCountryCodes(section), ['SGP']);
});
