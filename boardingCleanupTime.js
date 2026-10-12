'use strict';
function localParts(now) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}
function nextBoardingCleanup(now) {
  const p = localParts(now);
  const target = Date.UTC(p.year, p.month - 1, p.day + (p.hour >= 7 ? 1 : 0), 7);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const c = localParts(candidate);
    const offset = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - candidate;
    candidate = target - offset;
  }
  return candidate;
}
module.exports = { nextBoardingCleanup };
