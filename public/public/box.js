(function (root) {
  'use strict';
  function groupBns(bns, maxBn) {
    const unique = [...new Set(bns.filter(bn => Number.isInteger(bn) && bn > 0 && bn <= 999))].sort((a,b) => a-b);
    const highest = Number.isInteger(maxBn) && maxBn >= 0 && maxBn <= 999 ? maxBn : unique.at(-1) || 0;
    const columns = Math.max(4, Math.ceil(highest / 100));
    const groups = [];
    for (let start = 1; start <= highest; start += 20) {
      const end = Math.min(start + 19, highest);
      const values = unique.filter(bn => bn >= start && bn <= end);
      const absent = Array.from({length:end - start + 1}, (_,i) => start + i).filter(bn => !values.includes(bn));
      groups.push({ start, end, bns:values, absent, count:values.length, low:absent.length > 0,
        column:columns - Math.floor((start - 1) / 100), row:Math.floor(((start - 1) % 100) / 20) + 1 });
    }
    return { groups, columns };
  }
  function renderTotal(doc, data) {
    const total = doc.getElementById('total');
    const deleted = data.manualDeletedCount || 0;
    total.replaceChildren();
    const original = doc.createElement('span');
    original.textContent = `${data.expectedPassengers ?? '—'} + ${data.expectedInfants ?? '—'} = ${data.expectedTotal ?? '—'}`;
    total.append(original);
    if (deleted) {
      const adjustment = doc.createElement('span'); adjustment.className = 'total-deleted';
      adjustment.textContent = ` -${deleted}`;
      const result = doc.createElement('span');
      result.textContent = ` = ${data.expectedTotal == null ? '—' : data.expectedTotal - deleted}`;
      total.append(adjustment, result);
    }
  }
  if (typeof module === 'object' && module.exports) { module.exports = { groupBns, renderTotal }; return; }
  const doc = root.document;
  const status = doc.getElementById('status');
  const refresh = doc.getElementById('refresh');
  const content = doc.getElementById('box-content');
  const apiBase = (root.MU_API_BASE || 'https://api.mufcapp.net').replace(/\/$/, '');
  let loading = false, stopped = false, stopLive, authenticated = false;
  let numberSaving = false;
  let lastRevision = -1, lastSignature = '';
  const pendingBoxes = new Set();
  function text(id, value) { doc.getElementById(id).textContent = value; }
  function applySnapshot(data) {
    if (stopped || data.flightNo !== root.mufcFlight?.flightNo || data.flightDate !== root.mufcFlight?.flightDate) return;
    if (!Number.isSafeInteger(data.updatedAt) || data.updatedAt < lastRevision) return;
    lastRevision = data.updatedAt;
    if (data.reset) {
      lastSignature = ''; content.hidden = true;
      status.textContent = 'BOX data cleared. Waiting for current flight data.'; status.hidden = false; return;
    }
    const {updatedAt,cached,...payload} = data;
    const signature = JSON.stringify(payload);
    if (signature !== lastSignature) { render(data); lastSignature = signature; }
    status.hidden = true; content.hidden = false;
  }
  function render(data) {
    text('sy-data', `SY: ${data.expectedPassengers ?? '—'} passengers + ${data.expectedInfants ?? '—'} Infant = ${data.expectedTotal ?? '—'}`);
    text('bnd-data', `BND: ${data.passengers} passengers + ${data.infants} Infant = ${data.total}`);
    text('highest-bn', `Highest BN: ${data.maxBn ?? '—'}`);
    const { groups, columns } = groupBns(data.bns, data.maxBn);
    const boxes = doc.getElementById('boxes');
    const focusedBox = doc.activeElement?.dataset?.boxId;
    boxes.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    // Keep four columns on phones. Flights above 400 continue in another bank.
    if (columns > 4) boxes.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    boxes.replaceChildren();
    const details = doc.getElementById('bn-details');
    const detailRows = doc.getElementById('bn-detail-rows');
    detailRows.replaceChildren();
    const shortages = groups.filter(group => group.absent.length);
    details.hidden = !shortages.length;
    shortages.forEach(group => {
      const row = doc.createElement('div'); row.className = 'bn-detail-row'; row.id = `bn-detail-${group.start}`; row.tabIndex = -1;
      const label = doc.createElement('b'); label.textContent = `${group.start}–${group.end}`;
      const count = doc.createElement('span'); count.className = 'absence-count'; count.textContent = `⚠ ${group.absent.length}`;
      count.setAttribute('aria-label', `${group.absent.length} BN numbers`);
      const numbers = doc.createElement('div'); numbers.className = 'detail-numbers';
      group.absent.forEach(bn => { const badge = doc.createElement('span'); badge.textContent = String(bn).padStart(3,'0'); numbers.append(badge); });
      row.append(label,count,numbers); detailRows.append(row);
    });
    function tile(label, count, className, column, row, absent = []) {
      const compact = absent.length > 2;
      const boxId = label === 'INFANT' ? 'INFANT' : label.split('–')[0];
      const checked = (data.confirmedBoxes || []).includes(boxId);
      const card = doc.createElement('button'); card.type = 'button';
      card.className = `box ${className}`;
      card.classList.toggle('confirmed',checked);
      card.dataset.boxId = boxId;
      card.setAttribute('aria-pressed',String(checked));
      card.setAttribute('aria-label',`${label}: ${count} passes`);
      card.disabled = pendingBoxes.has(boxId);
      card.addEventListener('click',async () => {
        if (pendingBoxes.has(boxId)) return;
        pendingBoxes.add(boxId); card.disabled = true;
        try {
          const response = await fetch(`${apiBase}/boarding-box/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({boxId,confirmed:!checked})});
          const next = await response.json();
          if (!response.ok) throw new Error(next.error || 'Unable to save BOX selection.');
          applySnapshot(next);
        } catch (error) {
          if (!stopped) { status.textContent = error.message; status.hidden = false; }
        } finally {
          pendingBoxes.delete(boxId);
          const current = boxes.querySelector(`[data-box-id="${boxId}"]`); if (current) current.disabled = false;
        }
      });
      card.style.gridColumn = column;
      card.style.gridRow = row;
      const range = doc.createElement('div'); range.className = 'range'; range.textContent = label;
      const number = doc.createElement('strong'); number.textContent = count;
      card.append(range, number);
      if (compact) {
        const warning = doc.createElement('span'); warning.className = 'absence-count box-warning'; warning.textContent = `⚠ ${absent.length}`;
        card.append(warning);
      } else if (absent.length) {
        const note = doc.createElement('p'); note.className = 'absent-bns';
        absent.forEach(bn => {
          const item = doc.createElement('span'); item.className = 'absent-bn';
          item.textContent = String(bn).padStart(3,'0'); note.append(item);
        });
        card.append(note);
      }
      boxes.append(card);
    }
    const occupied = new Set();
    groups.forEach(group => {
      const bank = Math.floor((columns - group.column) / 4);
      const column = 4 - ((columns - group.column) % 4);
      const row = group.row + bank * 5;
      occupied.add(`${column}:${row}`);
      tile(`${group.start}–${group.end}`, group.count, group.low ? 'low' : '', column, row, group.absent);
    });
    const infantRow = occupied.has('1:5') ? Math.ceil(columns / 4) * 5 + 1 : 5;
    tile('INFANT', data.expectedInfants ?? '—', 'infant', 1, infantRow);
    occupied.add(`1:${infantRow}`);
    for (let row = 1; row <= 5; row++) for (let column = 1; column <= 4; column++) {
      if (occupied.has(`${column}:${row}`)) continue;
      const blank = doc.createElement('div'); blank.className = 'box empty'; blank.style.gridColumn = column; blank.style.gridRow = row; blank.setAttribute('aria-hidden','true'); boxes.append(blank);
    }
    renderTotal(doc, data);
    status.textContent = '';
    status.hidden = true;
    content.hidden = false;
    if (focusedBox) boxes.querySelector(`[data-box-id="${focusedBox}"]`)?.focus({preventScroll:true});
  }
  async function load(force = false) {
    if (loading || stopped || !root.mufcFlight) return;
    loading = true; refresh.disabled = true;
    const startedAtRevision = lastRevision;
    try {
      const response = await fetch(`${apiBase}/boarding-box${force ? '?refresh=1' : ''}`, { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load BOX.');
      if (data.flightNo !== root.mufcFlight.flightNo || data.flightDate !== root.mufcFlight.flightDate) throw new Error('Flight changed. Please refresh.');
      applySnapshot(data);
    } catch (error) {
      if (stopped || lastRevision > startedAtRevision) return;
      content.hidden = true;
      ['sy-data','bnd-data','highest-bn'].forEach(id => text(id,''));
      status.textContent = error.message + ' Totals are unavailable. Please refresh.';
      status.hidden = false;
    } finally { loading = false; refresh.disabled = false; }
  }
  function numberForm(id, present) {
    const form = doc.getElementById(id);
    const input = form.querySelector('input');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (numberSaving || stopped) return;
      const bn = input.value.trim();
      const message = doc.getElementById('number-status');
      if (!/^[0-9]{1,4}$/.test(bn) || Number(bn) < 1 || Number(bn) > 999) {
        message.textContent = 'Enter a BN between 1 and 999.'; return;
      }
      numberSaving = true;
      const buttons = [...doc.querySelectorAll('.number-control button')];
      buttons.forEach(button => { button.disabled = true; });
      message.textContent = 'Saving…';
      const flight = {...root.mufcFlight};
      try {
        const response = await fetch(`${apiBase}/boarding-box/number`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bn,present})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to save BOX number. Please retry.');
        if (stopped || flight.flightNo !== root.mufcFlight?.flightNo || flight.flightDate !== root.mufcFlight?.flightDate) return;
        applySnapshot(data);
        input.value = '';
        message.textContent = `BN ${String(Number(bn)).padStart(3,'0')} ${present ? 'restored to' : 'deleted from'} Box.`;
      } catch (error) { message.textContent = error.message; }
      finally { numberSaving = false; buttons.forEach(button => { button.disabled = false; }); }
    });
  }
  numberForm('delete-number-form', false);
  numberForm('restore-number-form', true);
  refresh.addEventListener('click',() => load(true));
  function startLive() {
    stopLive?.();
    stopLive = root.connectBoxLive({apiBase,onData:applySnapshot,onFallback:() => load()});
    load();
  }
  root.addEventListener('pagehide', () => { stopped = true; stopLive?.(); });
  root.addEventListener('pageshow', () => { if (stopped && authenticated) { stopped = false; startLive(); } });
  const auth = root.firebase?.apps?.length && root.firebase?.auth ? root.firebase.auth() : null;
  function login() { root.location.replace('/login.html?next=' + encodeURIComponent(root.location.pathname)); }
  if (!auth) { login(); return; }
  auth.onAuthStateChanged(user => {
    authenticated = Boolean(user);
    if (!user) { stopped = true; stopLive?.(); login(); return; }
    stopped = false;
    try { localStorage.setItem('mufc_auth_last_activity_at',String(Date.now())); } catch {}
    startLive();
  });
})(typeof window === 'object' ? window : globalThis);
