(function (root) {
  'use strict';
  function groupBns(bns) {
    const unique = [...new Set(bns.filter(bn => Number.isInteger(bn) && bn > 0 && bn <= 999))].sort((a,b) => a-b);
    const highest = unique.at(-1) || 0;
    const columns = Math.max(4, Math.ceil(highest / 100));
    const groups = [];
    for (let start = 1; start <= highest; start += 20) {
      const values = unique.filter(bn => bn >= start && bn < start + 20);
      const absent = Array.from({length:20}, (_,i) => start + i).filter(bn => !values.includes(bn));
      groups.push({ start, end:start + 19, bns:values, absent, count:values.length, low:values.length <= 19,
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
    text('expected', data.expectedPassengers ?? '—');
    text('detected', data.passengers);
    text('check', data.matched ? 'MATCH' : 'NOT MATCHED');
    doc.getElementById('check').className = 'check ' + (data.matched ? 'match' : 'mismatch');
    const { groups, columns } = groupBns(data.bns);
    const boxes = doc.getElementById('boxes');
    boxes.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    // Keep four columns on phones. Flights above 400 continue in another bank.
    if (columns > 4) boxes.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    boxes.replaceChildren();
    function tile(label, count, className, column, row, bns, absent = []) {
      const card = doc.createElement('article');
      card.className = `box ${className}`;
      card.style.gridColumn = column;
      card.style.gridRow = row;
      const range = doc.createElement('div'); range.className = 'range'; range.textContent = label;
      const number = doc.createElement('strong'); number.textContent = count;
      const unit = doc.createElement('span'); unit.className = 'unit'; unit.textContent = 'passes';
      card.append(range, number, unit);
      if (absent.length) {
        const note = doc.createElement('p'); note.className = 'absent-bns';
        note.textContent = '未包含 BN ' + absent.map(bn => String(bn).padStart(3,'0')).join(' · ');
        card.append(note);
      }
      if (bns?.length) {
        const details = doc.createElement('details'); const summary = doc.createElement('summary'); summary.textContent = 'View BN';
        const list = doc.createElement('p'); list.className = 'bn-list'; list.textContent = bns.map(bn => String(bn).padStart(3,'0')).join(' · ');
        details.append(summary,list); card.append(details);
      }
      boxes.append(card);
    }
    const occupied = new Set();
    groups.forEach(group => {
      const bank = Math.floor((columns - group.column) / 4);
      const column = 4 - ((columns - group.column) % 4);
      const row = group.row + bank * 5;
      occupied.add(`${column}:${row}`);
      tile(`${group.start}–${group.end}`, group.count, group.low ? 'low' : '', column, row, group.bns, group.absent);
    });
    const infantRow = occupied.has('1:5') ? Math.ceil(columns / 4) * 5 + 1 : 5;
    tile('INFANT', data.infants, data.infants <= 19 ? 'infant low' : 'infant', 1, infantRow, data.infantBns);
    occupied.add(`1:${infantRow}`);
    for (let row = 1; row <= 5; row++) for (let column = 1; column <= 4; column++) {
      if (occupied.has(`${column}:${row}`)) continue;
      const blank = doc.createElement('div'); blank.className = 'box empty'; blank.style.gridColumn = column; blank.style.gridRow = row; blank.setAttribute('aria-hidden','true'); boxes.append(blank);
    }
    text('total', `${data.passengers} + ${data.infants} = ${data.total}`);
    text('sy-total', `SY: ${data.expectedPassengers ?? '—'} passengers + ${data.expectedInfants ?? '—'} Infant = ${data.expectedTotal ?? '—'} total people`);
    doc.getElementById('sy-total').className = data.matched ? 'match' : 'mismatch';
    status.textContent = data.matched ? 'FB and SY match · ' + new Date().toLocaleTimeString() : 'FB and SY do not match yet. Check FB passenger and Infant totals against SY.';
    content.hidden = false;
  }
  async function load() {
    if (loading || stopped || !root.mufcFlight) return;
    loading = true; refresh.disabled = true;
    try {
      const response = await fetch(`${apiBase}/boarding-box`, { cache:'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load BOX.');
      if (data.flightNo !== root.mufcFlight.flightNo || data.flightDate !== root.mufcFlight.flightDate) throw new Error('Flight changed. Please refresh.');
      render(data);
    } catch (error) {
      content.hidden = true;
      ['expected','detected','check'].forEach(id => text(id,'—'));
      status.textContent = error.message + ' Totals are unavailable. Please refresh.';
    } finally { loading = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click',load);
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
