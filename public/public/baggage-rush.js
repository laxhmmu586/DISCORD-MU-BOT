(() => {
  const button = document.querySelector('#departure-rush-button');
  const panel = document.querySelector('#departure-rush-panel');
  const form = document.querySelector('#departure-rush-form');
  const rows = document.querySelector('#departure-rush-flight-rows');
  const addFlight = document.querySelector('#departure-rush-add-flight');
  const close = document.querySelector('#departure-rush-close');
  const status = document.querySelector('#departure-rush-status');
  let saving = false;

  // Match the CBS Rush Bag creation fields, default itinerary and tag format.
  function flightRow(flight = {}) {
    return `<div class="rush-flight-row" data-rush-flight-row><label><span>Date</span><input data-flight-date type="date" value="${escapeHtml(flight.flightDate || '')}" required /></label><label><span>Flight Number</span><input data-flight-number value="${escapeHtml(flight.flightNumber || '')}" required autocomplete="off" placeholder="MU586" /></label><label><span>From</span><input data-flight-from value="${escapeHtml(flight.from || '')}" required autocomplete="off" placeholder="LAX" /></label><span class="rush-route-arrow">–</span><label><span>To</span><input data-flight-to value="${escapeHtml(flight.to || '')}" required autocomplete="off" placeholder="PVG" /></label><button type="button" data-remove-rush-flight aria-label="Remove flight">Remove</button></div>`;
  }

  function resetFlights() {
    rows.innerHTML = flightRow({ flightDate:ymdFromDate(new Date()), flightNumber:'MU586', from:'LAX', to:'PVG' });
    addFlight.disabled = false;
  }

  function togglePanel(open) {
    if (saving) return;
    if (open && !rows.children.length) resetFlights();
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.scrollIntoView({ block:'start' });
      form.elements.worldTracerFileNumber.focus({ preventScroll:true });
    } else button.focus();
  }

  button.addEventListener('click', () => togglePanel(panel.hidden));
  close.addEventListener('click', () => togglePanel(false));
  addFlight.addEventListener('click', () => {
    if (saving || rows.children.length >= 20) return;
    rows.insertAdjacentHTML('beforeend', flightRow());
    rows.lastElementChild.querySelector('input').focus();
    addFlight.disabled = rows.children.length >= 20;
  });
  rows.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-rush-flight]');
    if (!remove || saving) return;
    const row = remove.closest('[data-rush-flight-row]');
    if (rows.children.length > 1) row.remove();
    else row.querySelectorAll('input').forEach(input => { input.value = ''; });
    addFlight.disabled = false;
  });
  form.addEventListener('input', event => {
    if (['originalTagNumber', 'rushTagNumber'].includes(event.target.name)) {
      event.target.value = normalizeTestBagTag(event.target.value).replace(/[^A-Z0-9]/g, '');
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const payload = {
      worldTracerFileNumber:form.elements.worldTracerFileNumber.value.trim().toUpperCase(),
      originalTagNumber:normalizeTestBagTag(form.elements.originalTagNumber.value),
      rushTagNumber:normalizeTestBagTag(form.elements.rushTagNumber.value),
      flightRows:[...rows.querySelectorAll('[data-rush-flight-row]')].map(row => ({
        flightDate:row.querySelector('[data-flight-date]').value,
        flightNumber:row.querySelector('[data-flight-number]').value.trim().toUpperCase(),
        from:row.querySelector('[data-flight-from]').value.trim().toUpperCase(),
        to:row.querySelector('[data-flight-to]').value.trim().toUpperCase()
      }))
    };
    saving = true;
    const controls = [button, close, ...form.elements].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    status.className = 'worldtracer-status';
    status.textContent = 'Saving case…';
    try {
      // The shared CBS endpoint persists the case and sends its Discord notification.
      const result = await apiJson('/cbs-worldtracer-cases', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload)
      });
      if (!result.record || (!result.created && !result.updated)) {
        throw new Error('Rush Bag save was not confirmed. Please check the case before trying again.');
      }
      form.reset();
      resetFlights();
      status.textContent = result.updated ? 'Rush Bag updated in CBS.' : 'Rush Bag saved to CBS.';
      if (result.discordError) {
        status.classList.add('status-warn');
        status.textContent += ` Discord notification failed: ${result.discordError}`;
      } else if (result.discord?.sent) status.textContent += ' Discord notification sent.';
      else if (result.discord?.reason) status.textContent += ` ${result.discord.reason}`;
    } catch (error) {
      status.classList.add('status-fail');
      status.textContent = error.message || 'Rush Bag save failed. Please try again.';
    } finally {
      saving = false;
      controls.forEach(control => { control.disabled = false; });
      addFlight.disabled = rows.children.length >= 20;
      form.removeAttribute('aria-busy');
    }
  });
})();
