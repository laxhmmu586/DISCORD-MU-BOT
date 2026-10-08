(() => {
  const cards = document.querySelector('.flight-cards'), status = document.querySelector('#flight-status'), reload = document.querySelector('#flight-reload');
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const city = code => ({LAX:'LOS ANGELES',PVG:'SHANGHAI',SHA:'SHANGHAI'}[code] || code || '—');
  const enter = flight => { window.setMufcFlight({...flight, source:'current'}); const next = new URLSearchParams(location.search).get('next'); const allowed = ['/index.html','/scan.html','/scan2.html','/m-board.html','/m-board2.html']; const url = new URL(next || '/index.html', location.origin); location.replace(url.origin === location.origin && allowed.includes(url.pathname) ? url.href : '/index.html'); };
  let running = false, signature = '';
  async function refresh() {
    if (running) return; running = true; reload.disabled = true;
    try {
      const response = await fetch((window.MU_API_BASE || 'https://api.mufcapp.net').replace(/\/$/,'') + '/flights', {cache:'no-store', headers:{Authorization:'Bearer '+await firebase.auth().currentUser.getIdToken()}}), data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to read flight logs.');
      const flights = data.flights;
      const next = JSON.stringify(flights);
      if (signature !== next) {
        signature = next; cards.replaceChildren();
        for (const [index, flight] of flights.entries()) {
          const card = document.createElement('article'); card.className = 'flight-card' + (index === 0 ? ' is-active' : '');
          card.dataset.flight = flight.flightNo;
          card.innerHTML = `<p class="flight-equipment">${escape(flight.aircraftType || '—')} &nbsp;|&nbsp; ${escape(flight.aircraftRegistration || '—')}</p><svg class="flight-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2l1 7 7 5v2l-7-2v6l2 2h-8l2-2v-6l-7 2v-2l7-5z"/></svg><h2>${escape(flight.flightNo)}</h2><div class="flight-date">${escape(flight.flightDate)}</div><div class="flight-route"><div><strong>${escape(flight.origin || '—')}</strong><small>${escape(city(flight.origin))}</small></div><span class="route-arrow" aria-hidden="true">✈</span><div><strong>${escape(flight.destination || '—')}</strong><small>${escape(city(flight.destination))}</small></div></div><div class="flight-stats"><div><span>GATE</span><strong>${escape(flight.gate || '—')}</strong></div><div><span>STD</span><strong>${escape(flight.sd || '—')}</strong></div><div><span>ETD</span><strong>${escape(flight.ed || '—')}</strong></div></div><button class="flight-enter" type="button" aria-label="Enter ${escape(flight.flightNo)} ${escape(flight.flightDate)} dashboard">Enter Dashboard <b aria-hidden="true">→</b></button>`;
          card.querySelector('button').onclick = () => enter(flight);
          const activate = () => { cards.querySelectorAll('.flight-card').forEach(c => c.classList.toggle('is-active', c === card)); };
          card.addEventListener('pointerenter', activate); card.addEventListener('focusin', activate); cards.append(card);
        }
      }
      status.textContent = flights.length ? `${flights.length} flight${flights.length === 1 ? '' : 's'} departing LAX today` : 'No LAX departure SY record found for today. Refresh after today’s logs are available.';
      if (!flights.length) cards.innerHTML = `<div class="flight-empty"><h2>No flights detected</h2><p>MU586 · MU9586 · MU578<br>Only today's LAX departures found in today’s SY logs appear here.</p></div>`;
    } catch (error) { signature = ''; cards.innerHTML = '<div class="flight-empty"><h2>Flights unavailable</h2><p>Please refresh to try again.</p></div>'; status.textContent = error.message; }
    finally { running = false; reload.disabled = false; cards.setAttribute('aria-busy','false'); }
  }
  reload.onclick = refresh;
  if (!window.firebase?.apps?.length) { status.textContent = 'Unable to initialize sign-in. Please reload.'; return; }
  let timer;
  firebase.auth().onAuthStateChanged(user => {
    clearInterval(timer);
    if (!user) { location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search)); return; }
    document.querySelector('#flight-user').textContent = user.email || 'MUFC';
    refresh(); timer=setInterval(() => { if (!document.hidden) refresh(); },15000);
  });
})();
