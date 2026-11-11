'use strict';

const { SUPPORTED_FLIGHTS } = require('./flightContext');
const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const fields = {
  vip: ['passenger','bn','seat','bags','source'],
  psmMsg: ['passenger','bn','seat','bags','type','detail'],
  inad: ['passenger','bn','seat','ticketNumber','service'],
};

function createSync(appendRows) {
  return async (reports, flightDate) => {
    if (!reports || typeof reports !== 'object') throw Error('Invalid report payload.');
    const month = months.indexOf(flightDate.slice(2,5)) + 1;
    const date = `20${flightDate.slice(-2)}-${String(month).padStart(2,'0')}-${flightDate.slice(0,2)}`;
    const batches = Object.entries(fields).map(([type, columns]) => {
      if (!Array.isArray(reports[type])) throw Error('Invalid report rows.');
      const rows = reports[type].map(input => {
        if (input?.flightDate !== flightDate || !SUPPORTED_FLIGHTS.includes(input.flightNo)) {
          throw Error('Report row is outside the current flight day.');
        }
        const row = {date,flightDate,flightNo:input.flightNo};
        for (const column of columns) {
          const value = input[column];
          if (value != null && typeof value !== 'string' && typeof value !== 'number') throw Error('Invalid report field.');
          row[column] = String(value ?? '');
        }
        if (!row.passenger || (type === 'psmMsg' && !row.detail) || (type === 'inad' && row.service !== 'INAD')) {
          throw Error('Incomplete report row.');
        }
        return row;
      });
      return [type, rows];
    });
    for (const [type, rows] of batches) {
      if (rows.length) await appendRows(type, date, rows);
    }
  };
}

module.exports = { createSync };
