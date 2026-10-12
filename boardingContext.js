const { AsyncLocalStorage, AsyncResource } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
const SHEETS = Object.freeze({ MU586: 0, MU9586: 409569001, MU578: 640376113 });
const states = new Map();
function normalizeBoardingFlight(value) {
  const flight = 'MU' + String(value || '').trim().toUpperCase().replace(/^MU/, '').replace(/^0+/, '');
  return Object.hasOwn(SHEETS, flight) ? flight : '';
}
function boardingFlight() { return storage.getStore() || 'MU586'; }
function runWithBoardingFlight(value, fn) {
  const flight = normalizeBoardingFlight(value);
  if (!flight) throw new Error('Choose MU586, MU9586 or MU578.');
  return storage.run(flight, fn);
}
function boardingSheetGid() { return SHEETS[boardingFlight()]; }
function boardingState() {
  const flight = boardingFlight();
  if (!states.has(flight)) states.set(flight, {
    cbsScanSheetTitle: '', cbsScanSheetTitlePending: null,
    cbsScanSheetCache: { loadedAt: 0, rows: [] },
    cbsScanAppendPending: [], cbsScanAppendTimer: null, cbsScanAppendRunning: false
  });
  return states.get(flight);
}
function assertBoardingFlight(value) {
  if (normalizeBoardingFlight(value) !== boardingFlight()) {
    const err = new Error(`This boarding pass does not belong to ${boardingFlight()}.`);
    err.code = 'WRONG_FLIGHT'; err.flight = value; throw err;
  }
}
function emergencyNbrdFlight(detail) {
  return String(detail || '').match(/^\[(MU586|MU9586|MU578)\]\s*/)?.[1] || 'MU586';
}
function emergencyNbrdDetail(detail) { return String(detail || '').replace(/^\[(MU586|MU9586|MU578)\]\s*/, '').trim(); }
function tagEmergencyNbrd(detail, flight = boardingFlight()) { return `[${flight}] ${emergencyNbrdDetail(detail)}`.trim(); }
let nbrdTail = Promise.resolve();
function serializeEmergencyNbrd(fn) {
  const next = nbrdTail.then(AsyncResource.bind(fn));
  nbrdTail = next.catch(() => {});
  return next;
}
module.exports = { SHEETS, normalizeBoardingFlight, boardingFlight, runWithBoardingFlight, boardingSheetGid, boardingState, assertBoardingFlight, emergencyNbrdFlight, emergencyNbrdDetail, tagEmergencyNbrd, serializeEmergencyNbrd, bindBoardingOperation: AsyncResource.bind };
