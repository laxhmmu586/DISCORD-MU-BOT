(() => {
  const cards = document.querySelector('.flight-cards'), status = document.querySelector('#flight-status'), reload = document.querySelector('#flight-reload');
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const city = code => ({LAX:'LOS ANGELES',PVG:'SHANGHAI',SHA:'SHANGHAI'}[code] || code || '—');
  const enter = flight => { window.setMufcFlight({...flight, source:'current'}); location.assign('/index.html'); };
  let running = false, signature = '';
  const loader = document.querySelector('.flight-loading');
  const finishLoading = () => { loader.hidden = true; document.body.classList.remove('is-loading'); cards.setAttribute('aria-busy','false'); };
  async function refresh(showLoading = false) {
    if (running) return; running = true; reload.disabled = true;
    cards.setAttribute('aria-busy','true');
    if (showLoading) { loader.hidden = false; document.body.classList.add('is-loading'); }
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
          card.innerHTML = `<p class="flight-equipment">${escape(flight.aircraftType || '—')} &nbsp;|&nbsp; ${escape(flight.aircraftRegistration || '—')}</p><svg class="flight-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2l1 7 7 5v2l-7-2v6l2 2h-8l2-2v-6l-7 2v-2l7-5z"/></svg><h2>${escape(flight.flightNo)}</h2><div class="flight-date">${escape(flight.flightDate)}</div><div class="flight-route"><div><strong>${escape(flight.origin || '—')}</strong><small>${escape(city(flight.origin))}</small></div><span class="route-arrow" aria-hidden="true">✈</span><div><strong>${escape(flight.destination || '—')}</strong><small>${escape(city(flight.destination))}</small></div></div><div class="flight-stats"><div><span>GATE</span><strong>${escape(flight.gate || '—')}</strong></div><div><span>STD</span><strong>${escape(flight.sd || '—')}</strong></div><div><span>ETD</span><strong>${escape(flight.ed || '—')}</strong></div></div><button class="flight-enter" type="button" aria-label="Enter ${escape(flight.flightNo)} ${escape(flight.flightDate)} dashboard">Enter Dashboard <b aria-hidden="true">→</b></button><button class="flight-enter flight-enter-boarding" type="button" aria-label="Enter ${escape(flight.flightNo)} boarding">Enter Boarding <b aria-hidden="true">→</b></button>`;
          card.querySelector('.flight-enter').onclick = () => enter(flight);
          card.querySelector('.flight-enter-boarding').onclick = () => { window.setMufcFlight({...flight, source:'current'}); location.assign('/scan.html'); };
          const activate = () => { cards.querySelectorAll('.flight-card').forEach(c => c.classList.toggle('is-active', c === card)); };
          card.addEventListener('pointerenter', activate); card.addEventListener('focusin', activate); cards.append(card);
        }
      }
      status.textContent = flights.length ? `${flights.length} flight${flights.length === 1 ? '' : 's'} departing LAX today` : 'No LAX departure SY record found for today. Refresh after today’s logs are available.';
      if (!flights.length) cards.innerHTML = `<div class="flight-empty"><h2>No flights detected</h2><p>MU586 · MU9586 · MU578<br>Only today's LAX departures found in today’s SY logs appear here.</p></div>`;
    } catch (error) { signature = ''; cards.innerHTML = '<div class="flight-empty"><h2>Flights unavailable</h2><p>Please refresh to try again.</p></div>'; status.textContent = error.message; }
    finally { running = false; reload.disabled = false; finishLoading(); }
  }
  reload.onclick = () => refresh(true);
  if (!window.firebase?.apps?.length) { status.textContent = 'Unable to initialize sign-in. Please reload.'; finishLoading(); return; }
  let timer;
  firebase.auth().onAuthStateChanged(user => {
    clearInterval(timer);
    if (!user) { location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search)); return; }

    refresh(); timer=setInterval(() => { if (!document.hidden) refresh(); },15000);
  }, error => { status.textContent = error.message || 'Unable to check sign-in. Please reload.'; finishLoading(); });
})();
