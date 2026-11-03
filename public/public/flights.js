(() => {
  const cards = document.querySelector('.flight-cards'), status = document.querySelector('#flight-status'), reload = document.querySelector('#flight-reload');
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enter = flight => { if(renderedDate!==today()){void refresh(true);return;}window.setMufcFlight({...flight, source:'current'}); location.assign('/index.html'); };
  let running = false, signature = '',revision='',userId='';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const cacheKey=()=>`mufc.flight-list.v1:${userId}:${today()}`;
  function restore(){try{const saved=JSON.parse(localStorage.getItem(cacheKey()));if(saved?.date===today()&&Array.isArray(saved.flights)){paint(saved.flights);revision=saved.revision||'';finishLoading();return true;}}catch{}return false;}
  function paint(flights){
      renderedDate=today();
      const next = JSON.stringify(flights);
      if (signature !== next) {
        signature = next; cards.replaceChildren();
        for (const [index, flight] of flights.entries()) {
          const card = document.createElement('article'); card.className = 'flight-card' + (index === 0 ? ' is-active' : '');
          card.dataset.flight = flight.flightNo;
          card.innerHTML = `<a class="flight-pbb-link" href="/has-pbb.html" aria-label="Open Jet Bridge checklist for ${escape(flight.flightNo)}" title="Jet Bridge"><img src="/has/assets/home-icon-bridge-v2.webp" alt="" width="40" height="40"></a><h2>${escape(flight.flightNo)}</h2><div class="flight-date">${escape(flight.flightDate)}</div><div class="flight-card-actions"><button class="flight-enter" type="button" aria-label="Enter ${escape(flight.flightNo)} ${escape(flight.flightDate)} dashboard">Enter Dashboard</button><button class="flight-enter flight-enter-boarding" type="button" aria-label="Enter ${escape(flight.flightNo)} boarding">Enter Boarding</button></div>`;
          card.querySelector('.flight-pbb-link').onclick = () => window.setMufcFlight({...flight, source:'current'});
          card.querySelector('.flight-enter').onclick = () => enter(flight);
          card.querySelector('.flight-enter-boarding').onclick = () => { window.setMufcFlight({...flight, source:'current'}); location.assign('/scan.html'); };
          const activate = () => { cards.querySelectorAll('.flight-card').forEach(c => c.classList.toggle('is-active', c === card)); };
          card.addEventListener('pointerenter', activate); card.addEventListener('focusin', activate); cards.append(card);
        }
      }
      cards.dispatchEvent(new Event('flight-cards-rendered'));
      status.hidden = flights.length > 0;
      status.textContent = flights.length ? `${flights.length} flight${flights.length === 1 ? '' : 's'} departing LAX today` : 'No LAX departure SY record found for today. Refresh after today’s logs are available.';
      if (!flights.length) cards.innerHTML = `<div class="flight-empty"><h2>No flights detected</h2><p>MU586 · MU9586 · MU578 · MU9578<br>Only today's LAX departures found in today’s SY logs appear here.</p></div>`;
  }
  let renderedDate='';
  const loader = document.querySelector('.flight-loading');
  const finishLoading = () => { loader.hidden = true; document.body.classList.remove('is-loading'); cards.setAttribute('aria-busy','false'); };
  async function refresh(showLoading = false) {
    if (running) return; running = true; reload.disabled = true;
    cards.setAttribute('aria-busy','true');
    if (showLoading) { loader.hidden = false; document.body.classList.add('is-loading'); }
    try {
      const response = await fetch((window.MU_API_BASE || 'https://api.mufcapp.net').replace(/\/$/,'') + '/flights'+(showLoading?'?refresh=1':''), {cache:'no-store', headers:{Authorization:'Bearer '+await firebase.auth().currentUser.getIdToken()}}), data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to read flight logs.');
      if(!Array.isArray(data.flights))throw new Error('Unable to read flight list.');
      paint(data.flights);revision=data.revision||'';
      try{localStorage.setItem(cacheKey(),JSON.stringify({date:today(),flights:data.flights,revision}));}catch{}
    } catch (error) { status.hidden = false; if(!signature)cards.innerHTML = '<div class="flight-empty"><h2>Flights unavailable</h2><p>Please refresh to try again.</p></div>'; status.textContent = error.message; }
    finally { running = false; reload.disabled = false; finishLoading(); }
  }
  reload.onclick = () => refresh(true);
  if (!window.firebase?.apps?.length) { status.textContent = 'Unable to initialize sign-in. Please reload.'; finishLoading(); return; }
  firebase.auth().onAuthStateChanged(user => {
    if (!user) { location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search)); return; }

    userId=user.uid||user.email||'';
    if(!restore())void refresh();
  }, error => { status.textContent = error.message || 'Unable to check sign-in. Please reload.'; finishLoading(); });
})();
