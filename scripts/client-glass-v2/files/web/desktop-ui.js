(() => {
  if (!window.mufcDesktop) return;
  document.addEventListener('click',event=>{const logo=event.target.closest('.home-brand,.profile-brand');if(!logo)return;event.preventDefault();location.assign('/flights.html?choose=1');},true);
  const teamScript=document.createElement('script');teamScript.src='/today-team.js';document.head.append(teamScript);
  document.addEventListener('click',event=>{if(event.target.closest('[data-passenger-index],[data-security-index],[data-seat]')){event.preventDefault();event.stopImmediatePropagation();}},true);
  const styles = document.createElement('style');
  styles.textContent = `.mufc-settings::backdrop{background:#020913b8;backdrop-filter:blur(6px)}.mufc-settings{font:15px/1.6 system-ui;box-shadow:0 24px 90px #0009}.mufc-settings h2{margin:0 0 12px;font-size:26px}.mufc-settings button{background:#173953;color:#edf7ff;border:1px solid #42667f;border-radius:8px;padding:10px 14px;cursor:pointer;font:inherit}.mufc-settings button:hover{background:#225475}.mufc-settings [data-folders]>p{background:#0b1b2c;border:1px solid #264358;padding:14px;border-radius:10px}.mufc-settings [data-folders] span{color:#a7bdd0;font-size:13px}.mufc-settings [data-update]{color:#b5cce0}`;
  document.head.append(styles);
  for (const item of document.querySelectorAll('a[href],#emergency-board-button')) {
    const pathname = new URL(item.getAttribute('href') || '/', location.href).pathname;
    // CBS forms stay local.
    if (/^\/(?:cbs|pir)-form\.html$/.test(pathname)) continue;
    if (new URL(item.getAttribute('href') || '/', location.href).origin !== location.origin) continue;
    if (item.id === 'emergency-board-button' || /^\/(?:box(?:-[a-z0-9-]+)?|scan2?|m-board2?|240|irr|baggage)(?:\.html)?$/i.test(pathname) || /^\/[^/]*-form(?:\.html)?$/i.test(pathname)) item.remove();
  }
  for (const item of document.querySelectorAll('#irr-button,#test-nav-link,#mobile-test-nav-link,#report-baggage-mode,#bag-report-button,#baggage-page,body:not(.service-page) #test-page')) item.remove();
  styles.textContent += `.timeline .node[data-web-only]{--node-color:#8fb4d7!important;cursor:not-allowed;opacity:1;background-color:rgba(5,22,35,.7)!important;box-shadow:inset 0 0 12px #88b8dd22!important}.timeline .node[data-web-only] .node-value{width:auto;height:auto;border:0;background:none;box-shadow:none;color:#d3e5f3;font-size:12px;font-weight:400;transform:translateY(-9px)}.timeline .node[data-web-only] .node-value::after{content:'Web Only';display:block;width:auto;height:auto;mask:none;background:none;font-size:12px;color:#d3e5f3}.timeline .node[data-web-only] .rail-pulse{display:none}`;
  function updateOnlineNodes(online){
    const missing=document.querySelector('.node[data-key="MISSING_BAG"]');
    if(missing && !online){missing.hidden=true;missing.dataset.time='----';missing.removeAttribute('data-alert');}

  for(const key of []){
    const node=document.querySelector(`.node[data-key="${key}"]`);
    if(!node)continue;
    if(!node.dataset.originalIcon)node.dataset.originalIcon=node.querySelector('.node-icon').innerHTML;
    if(online){if(!node.dataset.webOnly)continue;delete node.dataset.webOnly;node.disabled=false;node.removeAttribute('aria-disabled');node.title='';node.querySelector('.node-icon').innerHTML=node.dataset.originalIcon;node.dataset.status='pending';node.dataset.time='----';node.setAttribute('aria-label',node.dataset.label+': Pending');continue;}
    node.dataset.webOnly='true';node.dataset.status='locked';node.dataset.time='';
    node.disabled=true;node.title='Available in the web version only.';node.setAttribute('aria-disabled','true');
    node.setAttribute('aria-label',node.dataset.label+' - Web Only');
    node.querySelector('.node-icon').innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
    node.querySelector('.node-value').textContent='';
  }
  }
  const online=()=>Boolean(window.firebase?.auth && firebase.auth().currentUser) && sessionStorage.getItem('mufc-desktop-mode') !== 'local';
  updateOnlineNodes(online());
  window.addEventListener('mufc-online-state',e=>updateOnlineNodes(e.detail));
  window.firebase?.auth?.().onAuthStateChanged(()=>updateOnlineNodes(online()));
  styles.textContent += `.timeline .node[data-web-only]{background:repeating-linear-gradient(135deg,#29303b 0,#29303b 7px,#242b35 7px,#242b35 14px)!important;border:2px dashed #89939f!important;box-shadow:none!important;-webkit-box-reflect:unset!important;color:#b6bec9!important}.timeline .node[data-web-only] .node-icon{width:42px;height:42px;flex-shrink:0;border:1px solid #aeb8c6;border-radius:50%;background:#111722;display:grid;place-items:center;box-shadow:none}.timeline .node[data-web-only] .node-icon svg{width:29px;height:29px;stroke:#f0f3f7;stroke-width:2.5}.timeline .node[data-web-only] .node-led,.timeline .node[data-web-only] .node-glass,.timeline .node[data-web-only] .rail-pulse{display:none!important}.timeline .node[data-web-only] .node-icon::before{display:none!important}.timeline .node[data-web-only] .node-value{transform:none;margin-top:auto;padding:0 0 2px}.timeline .node[data-web-only] .node-value::after{content:'WEB ONLY';font-size:12px;font-weight:700;color:#f0f3f7}.timeline .node[data-web-only] .node-label{color:#c6ccd5}.timeline .node[data-web-only]::before{background:#555f6c!important;box-shadow:none!important;border-color:#929ca9!important}.timeline .node[data-web-only]::after{box-shadow:none!important}`;
  document.addEventListener('click',event=>{if(event.target.closest('.node[data-web-only]')){event.preventDefault();event.stopImmediatePropagation();}},true);
  const onlineReports = ['spml','wch','missConnection'];
  for (const mode of onlineReports) document.querySelectorAll('[data-report-mode="'+mode+'"],[data-report-shortcut="'+mode+'"]').forEach(item=>item.remove());
  if (location.pathname==='/index.html' && window.mufcFlight && !['/flights.html','/cbs.html','/reissue.html'].includes(location.pathname) && !document.querySelector('.flight-switch')) {
    const switchFlight = document.createElement('a'); switchFlight.href='/flights.html?choose=1'; switchFlight.className='flight-switch';switchFlight.setAttribute('aria-label','Switch flight');switchFlight.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v17m-4-4 4 4 4-4M17 21V4m-4 4 4-4 4 4"/></svg>'; 
    document.querySelector('header')?.append(switchFlight);
  }
  const button = document.createElement('button'); button.textContent = 'Settings'; button.type = 'button';
  button.id = 'mufc-settings-button';
  button.style.cssText = 'flex:none;height:38px;padding:10px 18px;border-radius:8px;background:#102940;color:white;border:1px solid #467590;cursor:pointer';
  const modal = document.createElement('dialog');
  modal.className = 'mufc-settings';
  modal.style.cssText = 'background:#102032;color:#eef6ff;border:1px solid #467590;border-radius:16px;padding:28px;max-width:680px;width:80vw;z-index:10001';
  modal.innerHTML = '<h2>MUFC Settings</h2><p>eTerm and history files are read on this computer. Today’s SY/BND sync to boarding SQLite. Sales Report uses Google Drive.</p><div data-folders></div><p data-version></p><p data-update></p><button data-check>Check for updates</button> <button data-close>Close</button>';
  const search = document.querySelector('#mission-search');
  const header = document.querySelector('header');
  if (search) search.before(button);
  else if (header) header.append(button);
  else { button.style.cssText += 'position:fixed;top:14px;right:18px;z-index:10000'; document.body.append(button); }
  if(location.pathname==='/login.html'){
    const controls=document.createElement('div');controls.id='mufc-login-controls';controls.style.cssText='position:fixed;top:14px;right:18px;z-index:10000;display:flex;gap:10px;align-items:center';
    const local=document.createElement('button');local.id='local-entry';local.type='button';local.textContent='Local';local.style.cssText=button.style.cssText.replace(/position:fixed[^;]*;?|top:14px;?|right:18px;?|z-index:10000;?/g,'');
    local.style.position='static';button.style.position='static';controls.append(local,button);document.body.append(controls);
    local.hidden=true;
  }
  document.body.append(modal);
  async function render() {
    const settings = await window.mufcDesktop.settings();
    const container = modal.querySelector('[data-folders]'); container.replaceChildren();
    for (const [kind, label] of [['logFolder', 'Today eTerm logs'], ['historyFolder', 'History Flight Files']]) {
      const row = document.createElement('p'), choose = document.createElement('button'), value = document.createElement('span');
      choose.textContent = label + ' — Choose folder'; value.textContent = '\n' + (settings[kind] || 'Not selected'); value.style.cssText = 'display:block;overflow-wrap:anywhere;margin:8px 0';
      choose.onclick = async () => { await window.mufcDesktop.chooseFolder(kind); await render(); };
      row.append(choose, value); container.append(row);
    }
    modal.querySelector('[data-version]').textContent = 'Version ' + settings.version;
    if(settings.sync) modal.querySelector('[data-version]').textContent += ' · '+settings.sync.message;
    modal.querySelector('[data-update]').textContent = (await window.mufcDesktop.updateStatus()).message;
  }
  button.onclick = async () => { await render(); modal.showModal(); };
  modal.querySelector('[data-close]').onclick = () => modal.close();
  modal.querySelector('[data-check]').onclick = async () => { try { const state = await window.mufcDesktop.checkUpdates(); modal.querySelector('[data-update]').textContent = state.message; } catch (e) { modal.querySelector('[data-update]').textContent = e.message; } };
})();
