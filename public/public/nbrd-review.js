(() => {
  const displayBn = bn => String(bn || '').padStart(3, '0').slice(-3);
  function create({ container, apiBase, onChanged = async () => {} }) {
    let rows = [];
    let revision = 0, loadSequence = 0;
    const modal = document.createElement('dialog');
    modal.className = 'nbrd-modal';
    modal.setAttribute('aria-labelledby', 'nbrd-modal-title');
    document.body.append(modal);
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
    }
    async function post(path, body) {
      const res = await fetch(apiBase + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save NBRD confirmation.');
      return data;
    }
    function choose({ title, text, yesLabel = '✓', noLabel = '✕', confirm, total, preview = false }) {
      if (modal.open) return Promise.resolve(false);
      return new Promise(resolve => {
        modal.replaceChildren();
        const heading = document.createElement('h2'); heading.id = 'nbrd-modal-title'; heading.textContent = title; modal.append(heading);
        const message = document.createElement('p'); message.textContent = text; modal.append(message);
        if (total !== undefined) { const count = document.createElement('div'); count.className='nbrd-total'; count.textContent=total; modal.append(count); }
        if (preview) { const list = document.createElement('p'); list.textContent=rows.map(row=>displayBn(row.nbrdBn)).join(' · '); modal.append(list); }
        const error = document.createElement('p'); error.className='nbrd-error'; error.setAttribute('role','alert'); modal.append(error);
        const actions = document.createElement('div'); actions.className='nbrd-dialog-actions';
        const yes = document.createElement('button'); yes.type='button'; yes.className='nbrd-yes'; yes.textContent=yesLabel;
        const no = document.createElement('button'); no.type='button'; no.className='nbrd-no'; no.textContent=noLabel;
        actions.append(yes,no); modal.append(actions);
        let busy=false;
        const finish = value => { modal.close(); resolve(value); };
        modal.oncancel = event => { event.preventDefault(); if (!busy) finish(false); };
        no.onclick = () => { if (!busy) finish(false); };
        yes.onclick = async () => {
          if (busy) return; busy=true; yes.disabled=true; no.disabled=true; error.textContent='Saving...';
          try { if (confirm) await confirm(); finish(true); }
          catch (err) { error.textContent=err.message; }
          finally { busy=false; yes.disabled=false; no.disabled=false; }
        };
        modal.showModal(); no.focus();
      });
    }
    async function details(row) {
      return choose({ title:`NBRD · BN ${displayBn(row.nbrdBn)}`, text:row.nbrdDetail + (row.nbrdResolved ? '\nResolved' : ''),
        confirm:async()=>{
          if (!row.nbrdResolved) await post('/cbs-scan/nbrd-bns/resolve', {bn:row.nbrdBn});
          row.nbrdResolved=true; render(rows); await onChanged().catch(()=>{});
        }
      });
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
      verify:()=>rows.length ? choose({title:'Check NBRD count', text:'Check that all NBRD records are listed. Continue if the count is correct, or add a missing NBRD.', total:rows.length, preview:true, yesLabel:'Continue', noLabel:'Add NBRD'}) : Promise.resolve(true),
      board:({bn,detail,confirm})=>choose({title:`NBRD · BN ${displayBn(bn)}`,text:detail,yesLabel:'Board',noLabel:'NOT OK',confirm}),
    };
  }
  window.NbrdReview = { create };
})();
