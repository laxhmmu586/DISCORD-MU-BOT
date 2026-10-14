(() => {
  const displayBn = bn => String(bn || '').padStart(3, '0').slice(-3);
  // A normalized outline keeps softly rounded hexagon corners at every size.
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  outline.setAttribute('width', '0'); outline.setAttribute('height', '0');
  outline.setAttribute('aria-hidden', 'true');
  outline.style.position = 'absolute';
  outline.innerHTML = '<defs><clipPath id="nbrd-hexagon" clipPathUnits="objectBoundingBox"><path d="M .475 .012 Q .5 0 .525 .012 L .975 .237 Q 1 .25 1 .278 L 1 .722 Q 1 .75 .975 .763 L .525 .988 Q .5 1 .475 .988 L .025 .763 Q 0 .75 0 .722 L 0 .278 Q 0 .25 .025 .237 Z"/></clipPath></defs>';
  document.addEventListener('DOMContentLoaded', () => document.body.append(outline), { once:true });
  // Pack consecutive rows into alternating full/offset rows, without sorting BNs.
  function layoutHoneycomb(list) {
    const available = list.clientWidth;
    if (!available) return;
    const gap = Math.max(2, Math.min(4, available / 180)), inset = 3;
    const columns = 6;
    const width = (available - inset * 2 - gap * (columns - 1)) / columns;
    const height = width / Math.sqrt(3) * 2;
    const start = (available - columns * width - (columns - 1) * gap) / 2;
    let row = 0, column = 0;
    for (const tile of list.children) {
      const offset = row % 2;
      Object.assign(tile.style, {
        width: `${width}px`, height: `${height}px`,
        left: `${start + (column + offset / 2) * (width + gap)}px`,
        top: `${inset + row * (height * .75 + gap)}px`,
        fontSize: `${Math.max(11, Math.min(30, width * .29))}px`
      });
      if (++column === columns - offset) { column = 0; row++; }
    }
    const lastRow = column ? row : Math.max(0, row - 1);
    list.style.height = `${inset * 2 + lastRow * (height * .75 + gap) + height}px`;
  }
  function create({ container, apiBase, onChanged = async () => {} }) {
    let rows = [];
    let revision = 0, loadSequence = 0;
    const modal = document.createElement('dialog');
    modal.className = 'nbrd-modal';
    modal.setAttribute('aria-labelledby', 'nbrd-modal-title');
    document.body.append(modal);
    const layout = () => {
      container.querySelectorAll('.nbrd-bubbles').forEach(layoutHoneycomb);
      if (modal.open) modal.querySelectorAll('.nbrd-bubbles').forEach(layoutHoneycomb);
    };
    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(container);
    resizeObserver.observe(modal);
    window.addEventListener('resize', layout);
    const isOpen = () => modal.open;
    function render(nextRows) {
      revision++;
      rows = nextRows.filter(row => row.nbrdBn).map(row => ({ ...row }));
      container.replaceChildren();
      if (!rows.length) {
        const empty = document.createElement('p'); empty.className = 'nbrd-empty'; empty.textContent = 'No NBRD records.'; container.append(empty); return;
      }
      const bubbles = document.createElement('div'); bubbles.className = 'nbrd-bubbles';
      for (const row of rows) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'nbrd-bubble' + (row.nbrdResolved ? ' is-resolved' : '');
        button.textContent = displayBn(row.nbrdBn);
        button.setAttribute('aria-label', `BN ${displayBn(row.nbrdBn)}, ${row.nbrdResolved ? 'resolved' : 'pending'}`);
        button.addEventListener('click', () => details(row)); bubbles.append(button);
      }
      container.append(bubbles);
      layout();
    }
    async function post(path, body) {
      const res = await fetch(apiBase + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save NBRD confirmation.');
      return data;
    }
    function choose({ title, text, yesLabel = '✓', noLabel = '✕', confirm, reject, previewRows = [], warning = false }) {
      if (modal.open) return Promise.resolve(false);
      return new Promise(resolve => {
        modal.replaceChildren();
        if (warning) {
          const icon=document.createElement('div'); icon.className='nbrd-warning-icon'; icon.textContent='!'; icon.setAttribute('aria-hidden','true'); modal.append(icon);
        }
        const heading = document.createElement('h2'); heading.id = 'nbrd-modal-title'; heading.textContent = title; modal.append(heading);
        if (text) { const message = document.createElement('p'); message.textContent = text; modal.append(message); }
        if (previewRows.length) {
          const list = document.createElement('div'); list.className='nbrd-bubbles nbrd-preview';
          for (const row of previewRows) { const circle=document.createElement('span'); circle.className='nbrd-bubble'; circle.textContent=displayBn(row.nbrdBn); list.append(circle); }
          modal.append(list);
        }
        const error = document.createElement('p'); error.className='nbrd-error'; error.setAttribute('role','alert'); modal.append(error);
        const actions = document.createElement('div'); actions.className='nbrd-dialog-actions';
        const yes = document.createElement('button'); yes.type='button'; yes.className='nbrd-yes'; yes.textContent=yesLabel;
        const no = document.createElement('button'); no.type='button'; no.className='nbrd-no'; no.textContent=noLabel;
        if (yesLabel === '✓' && noLabel === '✕') {
          yes.classList.add('nbrd-status-action'); no.classList.add('nbrd-status-action');
          yes.setAttribute('aria-label','Mark NBRD resolved'); no.setAttribute('aria-label','Mark NBRD pending');
        }
        actions.append(yes,no); modal.append(actions);
        const back=document.createElement('button'); back.type='button'; back.className='nbrd-back'; back.setAttribute('aria-label','Back');
        back.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h13a5 5 0 0 1 5 5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        modal.append(back);
        let busy=false;
        const finish = value => { modal.close(); resolve(value); };
        modal.oncancel = event => { event.preventDefault(); if (!busy) finish(false); };
        back.onclick = () => { if (!busy) finish(false); };
        const run = async (action, value) => {
          if (busy) return; busy=true; yes.disabled=true; no.disabled=true; back.disabled=true; error.textContent='Saving...';
          try { if (action) await action(); finish(value); }
          catch (err) { error.textContent=err.message; }
          finally { busy=false; yes.disabled=false; no.disabled=false; back.disabled=false; }
        };
        no.onclick = () => reject ? run(reject, false) : (!busy && finish(false));
        yes.onclick = () => run(confirm, true);
        modal.showModal(); layout(); no.focus();
      });
    }
    async function details(row) {
      const setStatus = async resolved => {
        if (row.nbrdResolved !== resolved) await post('/cbs-scan/nbrd-bns/resolve', {bn:row.nbrdBn, resolved});
        row.nbrdResolved=resolved; render(rows); await onChanged().catch(()=>{});
      };
      return choose({warning:true,title:'NBRD · BN '+displayBn(row.nbrdBn), text:row.nbrdDetail + (row.nbrdResolved ? '\nResolved' : ''), confirm:()=>setStatus(true), reject:()=>setStatus(false)});
    }
    return {
      render, isOpen,
      load:async()=>{
        const requestRevision = revision, sequence = ++loadSequence;
        const res=await fetch(apiBase+'/cbs-scan/nbrd-bns',{cache:'no-store'}); const data=await res.json();
        if(!res.ok) throw new Error(data.error || 'Unable to load NBRD.');
        if (sequence === loadSequence && requestRevision === revision) render(data.rows || []);
        return rows;
      },
      verify:()=>{ const pending=rows.filter(row=>!row.nbrdResolved); return pending.length ? choose({title:'Check Total Nbrd',text:'',previewRows:pending,yesLabel:'Continue',noLabel:'Add NBRD'}) : Promise.resolve(true); },
      board:({bn,detail,confirm})=>choose({warning:true,title:`NBRD · BN ${displayBn(bn)}`,text:detail,yesLabel:'OK to Board',noLabel:'NOT OK',confirm}),
    };
  }
  window.NbrdReview = { create };
})();
