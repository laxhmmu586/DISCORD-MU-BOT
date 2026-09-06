'use strict';

function normalize(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength).toUpperCase();
}

function notificationDetails(record = {}) {
  return {
    originalTagNumber: normalize(record.originalTagNumber, 120),
    rushTagNumber: normalize(record.rushTagNumber, 120),
    flightRows: (Array.isArray(record.flightRows) ? record.flightRows : []).map((flight) => ({
      flightDate: normalize(flight?.flightDate, 40),
      flightNumber: normalize(flight?.flightNumber, 40),
      from: normalize(flight?.from, 40),
      to: normalize(flight?.to, 40)
    }))
  };
}

function notificationIdentity(record = {}) {
  const details = notificationDetails(record);
  return {
    rushTagNumber: details.rushTagNumber.replace(/[\s-]+/g, ''),
    flightRows: details.flightRows
  };
}

function isDuplicateRushBagNotification(previousRecord = {}, nextRecord = {}) {
  const previous = notificationIdentity(previousRecord);
  const next = notificationIdentity(nextRecord);
  return Boolean(previous.rushTagNumber)
    && previous.rushTagNumber === next.rushTagNumber
    && JSON.stringify(previous.flightRows) === JSON.stringify(next.flightRows);
}

function isWorldTracerOnlyRushBagUpdate(previousRecord = {}, nextRecord = {}) {
  const previousFileNumber = normalize(previousRecord.worldTracerFileNumber, 120);
  const nextFileNumber = normalize(nextRecord.worldTracerFileNumber, 120);
  return previousFileNumber !== nextFileNumber
    && JSON.stringify(notificationDetails(previousRecord)) === JSON.stringify(notificationDetails(nextRecord));
}

module.exports = { isDuplicateRushBagNotification, isWorldTracerOnlyRushBagUpdate };
