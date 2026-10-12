(() => {
  if (["/", "/index.html"].includes(location.pathname) && ["#reports", "#test"].includes(location.hash)) return;
  const key = 'mufc-online-flight';
  const today = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'America/Los_Angeles', day:'2-digit', month:'short', year:'2-digit' }).formatToParts(new Date()).map(p => [p.type,p.value]));
    return p.day + p.month.toUpperCase() + p.year;
  };
  let selected;
  try { selected = JSON.parse(sessionStorage.getItem(key)); } catch {}
  if (!['MU586','MU9586','MU578','MU9578'].includes(selected?.flightNo) || selected.flightDate !== today()) selected = null;
  window.mufcFlight = selected;
  window.setMufcFlight = value => {
    window.mufcFlight = value;
    if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key);
  };
  if (location.pathname === '/login.html') window.setMufcFlight(null);
  const guarded = ['/','/index.html','/scan.html','/scan2.html','/m-board.html','/m-board2.html'];
  if (guarded.includes(location.pathname) && !selected) location.replace('/flights.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (resource, init) => {
    const url = new URL(resource instanceof Request ? resource.url : resource, location.href);
    const apiOrigin = new URL(window.MU_API_BASE || 'https://api.mufcapp.net').origin;
    const flight = window.mufcFlight;
    if (url.origin === apiOrigin && (url.pathname === '/search' || /^\/cbs-scan2?(?:\/|$)/.test(url.pathname)) && flight) {
      if (flight.flightDate !== today()) {
        window.setMufcFlight(null); location.replace('/flights.html');
        return Promise.reject(new Error('Please select today’s flight.'));
      }
      url.searchParams.set('flightNo', flight.flightNo);
      url.searchParams.set('flightDate', flight.flightDate);
      resource = resource instanceof Request ? new Request(url.href, resource) : url.href;
    }
    return nativeFetch(resource, init);
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.mufcFlight) return;
    document.title = window.mufcFlight.flightNo + ' · ' + document.title;
    const label = document.querySelector('[data-selected-flight]');
    if (label) label.textContent = window.mufcFlight.flightNo + ' · ' + window.mufcFlight.flightDate;
  });
})();
