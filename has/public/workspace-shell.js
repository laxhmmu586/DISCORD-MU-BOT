(() => {
  if (!document.body.classList.contains('workspace-glass')) return;
  const header = document.querySelector('.profile-topbar');
  const sidebar = document.querySelector('.profile-sidebar');
  const main = document.querySelector('main.profile-shell');
  const account = document.getElementById('flight-account');
  if (!header || !sidebar || !main || !account) return;
  const current = location.pathname;
  const artwork = (name) => `<span class="art-icon icon-${name}" aria-hidden="true"></span>`;
  const menuIcon = '<svg class="menu-icon" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="workspace-menu-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a8e4ff"/><stop offset=".42" stop-color="#469aff"/><stop offset="1" stop-color="#105bd4"/></linearGradient></defs><g fill="#175bc0" opacity=".22"><rect x="10" y="12" width="28" height="7" rx="3.5"/><rect x="10" y="23" width="28" height="7" rx="3.5"/><rect x="10" y="34" width="28" height="7" rx="3.5"/></g><g fill="url(#workspace-menu-blue)" stroke="#c6e7ff" stroke-width="1"><rect x="10" y="9" width="28" height="7" rx="3.5"/><rect x="10" y="20" width="28" height="7" rx="3.5"/><rect x="10" y="31" width="28" height="7" rx="3.5"/></g></svg>';
  header.classList.add('home-topbar');
  header.innerHTML = `<button class="menu-toggle" type="button" aria-label="Open workspace navigation" aria-controls="workspace-sidebar" aria-expanded="false">${menuIcon}</button><a class="home-brand" href="/profile" aria-label="Hallmark Aviation Services profile"><img src="/assets/home-hallmark-transparent-v1.png" alt="Hallmark Aviation Services" width="178" height="76"></a><span class="topbar-date" id="workspace-date"></span>`;
  header.append(account);
  const navigation = document.createElement('nav'); navigation.className = 'top-nav'; navigation.setAttribute('aria-label', 'Main navigation');
  navigation.innerHTML = '<a href="/home">Home</a><a data-department="hr" data-department-href="/hr" aria-disabled="true" tabindex="-1">HR</a><details class="department-nav" data-department="finance" aria-disabled="true" inert><summary aria-disabled="true" tabindex="-1">Finance</summary><div class="department-menu"><p>Finance</p><a href="/has-report">Report</a></div></details><span class="top-nav-placeholder" aria-disabled="true">QA</span>';
  navigation.hidden = ['/profile','/profile.html','/profile/'].includes(current);
  header.querySelector('.topbar-date').before(navigation);
  if(!document.querySelector('script[src*="department-access.js"]')){const access=document.createElement('script');access.src='/department-access.js?v=20261030-access';document.head.append(access);}
  const admin = sidebar.querySelector('#profile-admin-nav');
  const links = [
    ['/briefing', 'Briefing', 'briefing', 'data-briefing-nav hidden'],
    ['/schedule', 'Schedule', 'schedule', 'data-schedule-nav hidden'],
    ['/has-report', 'Report', 'report', 'data-report-access hidden'],
    ['/has-form', 'Request', 'request', ''],
    ['/has-checklist', 'Checklist', 'checklist', 'data-checklist-access hidden'],
    ['/info', 'Info', 'info', 'data-info-access hidden'],
    ['/read-sign', 'Read & Sign', 'sign', ''],
    ['/has-pbb.html', 'PBB checklist', 'bridge', '']
  ];
  sidebar.id = 'workspace-sidebar'; sidebar.classList.add('home-sidebar');
  sidebar.innerHTML = `<button class="sidebar-collapse" type="button" aria-label="Collapse sidebar" aria-controls="workspace-sidebar" aria-expanded="true"><svg class="collapse-arrow" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="workspace-arrow-blue"><stop stop-color="#9cddff"/><stop offset="1" stop-color="#1268e4"/></linearGradient></defs><path d="m25 9-14 12a4 4 0 0 0 0 6l14 12a4 4 0 0 0 6-3v-5h8a4 4 0 0 0 4-4v-5a4 4 0 0 0-4-4h-8v-6a4 4 0 0 0-6-3Z" fill="url(#workspace-arrow-blue)" stroke="#d3efff" stroke-width="1.5"/></svg></button><p class="sidebar-caption">QUICK ACCESS</p><nav aria-label="Workspace pages">${links.map(([href,label,icon,attrs]) => `<a href="${href}" ${attrs}${href === current ? ' class="is-active" aria-current="page"' : ''} aria-label="${label.replace('&', '&amp;')}" title="${label.replace('&', '&amp;')}">${artwork(icon)}<span>${label.replace('&', '&amp;')}</span></a>`).join('')}</nav><div class="home-team-art" data-employee-art></div><div class="sidebar-footer"><span class="footer-mark">HALLMARK</span><p>People. Operations. Together.</p><span class="footer-line"></span><small>Providing Peace of Mind.</small></div>`;
  if (admin) { admin.href = '/hr'; sidebar.querySelector('nav').append(admin); }
  if (!document.querySelector('script[src*="info-access.js"]')) { const info = document.createElement('script'); info.src = '/info-access.js?v=20261030-resources'; document.head.append(info); }
  main.classList.add('home-main');
  const frame = document.createElement('div'); frame.className = 'app-frame';
  document.body.prepend(frame); frame.append(header, sidebar, main);
  const scrim = document.createElement('button'); scrim.className = 'sidebar-scrim'; scrim.type = 'button'; scrim.hidden = true; scrim.setAttribute('aria-label', 'Close workspace navigation'); frame.append(scrim);

  const collapse = sidebar.querySelector('.sidebar-collapse'), menu = header.querySelector('.menu-toggle');
  const mobile = matchMedia('(max-width:760px)');
  function collapsed(value) {
    document.body.classList.toggle('sidebar-collapsed', value);
    collapse.setAttribute('aria-expanded', String(!value)); collapse.setAttribute('aria-label', value ? 'Expand sidebar' : 'Collapse sidebar');
    try { localStorage.setItem('has-home-sidebar-collapsed', String(value)); } catch {}
  }
  let saved = false; try { saved = localStorage.getItem('has-home-sidebar-collapsed') === 'true'; } catch {}
  collapsed(saved);
  collapse.addEventListener('click', () => collapsed(!document.body.classList.contains('sidebar-collapsed')));
  function drawer(open, restoreFocus = false) {
    document.body.classList.toggle('sidebar-open', open); menu.setAttribute('aria-expanded', String(open)); scrim.hidden = !open;
    sidebar.inert = mobile.matches && !open;
    if (open) sidebar.querySelector('nav a:not([hidden])')?.focus();
    else if (restoreFocus) menu.focus();
  }
  menu.addEventListener('click', () => drawer(!document.body.classList.contains('sidebar-open')));
  scrim.addEventListener('click', () => drawer(false, true));
  sidebar.addEventListener('click', event => { if (event.target.closest('a')) drawer(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) drawer(false, true);
    if (event.key === 'Tab' && mobile.matches && document.body.classList.contains('sidebar-open')) {
      const nodes = [...sidebar.querySelectorAll('button,a[href],summary')].filter(node => !node.hidden && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  mobile.addEventListener('change', () => drawer(false)); drawer(false);
  if (new URLSearchParams(location.search).get('preview') === '1') document.querySelectorAll('a[href="/home"],a[href="/hr"],a[href="/has-checklist"],a[href="/info"]').forEach(link => link.href += '?preview=1');
  const departments = [...header.querySelectorAll('.department-nav')];
  departments.forEach(details => details.addEventListener('toggle', () => { if (details.open) departments.forEach(other => { if (other !== details) other.open = false; }); }));
  document.addEventListener('click', event => departments.forEach(details => { if (!details.contains(event.target)) details.open = false; }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') departments.forEach(details => { if (details.open) { details.open = false; details.querySelector('summary').focus(); } }); });
  const formatter = new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles', weekday:'short', month:'short', day:'numeric'});
  const date = () => { document.getElementById('workspace-date').textContent = formatter.format(new Date()); }; date(); setInterval(date, 60000);
  function decorateNavigation() {
    sidebar.querySelectorAll('nav a').forEach(link => {
      const svg = link.querySelector('svg');
      if (svg) {
        const icon = document.createElement('span'); icon.className = 'art-icon icon-' + (link.hasAttribute('data-schedule-nav') ? 'schedule' : link.hasAttribute('data-briefing-nav') ? 'briefing' : link.id === 'profile-admin-nav' ? 'profile' : 'request'); icon.setAttribute('aria-hidden', 'true'); svg.replaceWith(icon);
      }
      const label = link.querySelector('span:not(.art-icon):not(.request-alert)')?.textContent?.trim() || link.textContent.trim();
      if (label) { link.setAttribute('aria-label', label); link.title = label; }
      const active = link.getAttribute('href') === current; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }
  new MutationObserver(records => { if (records.some(record => record.type === 'childList')) decorateNavigation(); }).observe(sidebar, {childList:true,subtree:true}); decorateNavigation();
})();
