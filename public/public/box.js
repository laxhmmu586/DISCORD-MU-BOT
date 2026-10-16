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
  if (typeof module === 'object' && module.exports) { module.exports = { groupBns }; return; }
  const doc = root.document;
  const status = doc.getElementById('status');
  const refresh = doc.getElementById('refresh');
  const content = doc.getElementById('box-content');
  const apiBase = (root.MU_API_BASE || 'https://api.mufcapp.net').replace(/\/$/, '');
  let loading = false, timer, stopped = false;
  function text(id, value) { doc.getElementById(id).textContent = value; }
  function render(data) {
    text('sy-data', `SY: ${data.expectedPassengers ?? '—'} passengers + ${data.expectedInfants ?? '—'} Infant = ${data.expectedTotal ?? '—'}`);
    text('fb-data', `FB: ${data.passengers} passengers + ${data.infants} Infant = ${data.total}`);
    text('highest-bn', `Highest BN: ${data.maxBn ?? '—'}`);
    const { groups, columns } = groupBns(data.bns, data.maxBn);
    const boxes = doc.getElementById('boxes');
    boxes.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    // Keep four columns on phones. Flights above 400 continue in another bank.
    if (columns > 4) boxes.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    boxes.replaceChildren();
    function tile(label, count, className, column, row, absent = []) {
      const card = doc.createElement('article');
      card.className = `box ${className}`;
      card.style.gridColumn = column;
      card.style.gridRow = row;
      const range = doc.createElement('div'); range.className = 'range'; range.textContent = label;
      const number = doc.createElement('strong'); number.textContent = count;
      card.append(range, number);
      if (absent.length) {
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
    tile('INFANT', data.infants, data.infants === data.expectedInfants ? 'infant' : 'infant low', 1, infantRow);
    occupied.add(`1:${infantRow}`);
    for (let row = 1; row <= 5; row++) for (let column = 1; column <= 4; column++) {
      if (occupied.has(`${column}:${row}`)) continue;
      const blank = doc.createElement('div'); blank.className = 'box empty'; blank.style.gridColumn = column; blank.style.gridRow = row; blank.setAttribute('aria-hidden','true'); boxes.append(blank);
    }
    text('total', `${data.passengers} + ${data.infants} = ${data.total}`);
    status.textContent = '';
    status.hidden = true;
    content.hidden = false;
  }
  async function load(force = false) {
    if (loading || stopped || !root.mufcFlight) return;
    loading = true; refresh.disabled = true;
    try {
      const response = await fetch(`${apiBase}/boarding-box${force ? '?refresh=1' : ''}`, { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load BOX.');
      if (data.flightNo !== root.mufcFlight.flightNo || data.flightDate !== root.mufcFlight.flightDate) throw new Error('Flight changed. Please refresh.');
      render(data);
    } catch (error) {
      content.hidden = true;
      ['sy-data','fb-data','highest-bn'].forEach(id => text(id,''));
      status.textContent = error.message + ' Totals are unavailable. Please refresh.';
      status.hidden = false;
    } finally { loading = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click',() => load(true));
  root.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); });
  root.addEventListener('pageshow', () => { if (stopped) { stopped = false; timer = setInterval(load,15000); load(); } });
  const auth = root.firebase?.apps?.length && root.firebase?.auth ? root.firebase.auth() : null;
  function login() { root.location.replace('/login.html?next=' + encodeURIComponent(root.location.pathname)); }
  if (!auth) { login(); return; }
  auth.onAuthStateChanged(user => {
    if (!user) { stopped = true; clearInterval(timer); login(); return; }
    stopped = false;
    try { localStorage.setItem('mufc_auth_last_activity_at',String(Date.now())); } catch {}
    load(); clearInterval(timer); timer = setInterval(load,15000);
  });
})(typeof window === 'object' ? window : globalThis);
