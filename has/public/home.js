(() => {
  const button = document.querySelector('.menu-toggle');
  const scrim = document.querySelector('.sidebar-scrim');
  const sidebar = document.getElementById('home-sidebar');
  const collapse = document.querySelector('.sidebar-collapse');
  function setCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    collapse.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    try { localStorage.setItem('has-home-sidebar-collapsed', String(collapsed)); } catch {}
  }
  let savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem('has-home-sidebar-collapsed') === 'true'; } catch {}
  setCollapsed(savedCollapsed);
  collapse.addEventListener('click', () => setCollapsed(!document.body.classList.contains('sidebar-collapsed')));
  function positionCollapse() {
    if (matchMedia('(max-width:760px)').matches) return;
    const overview = document.querySelector('.home-overview').getBoundingClientRect();
    const panels = document.querySelector('.home-panels').getBoundingClientRect();
    collapse.style.top = ((overview.bottom + panels.top) / 2 - sidebar.getBoundingClientRect().top - collapse.offsetHeight / 2) + 'px';
  }
  new ResizeObserver(positionCollapse).observe(document.querySelector('.home-overview'));
  window.addEventListener('resize', positionCollapse);
  function labelSidebarLinks() {
    sidebar.querySelectorAll('nav a').forEach(link => {
      const svg = link.querySelector('svg');
      if (svg && (link.hasAttribute('data-schedule-nav') || link.hasAttribute('data-briefing-nav'))) {
        const art = document.createElement('span'); art.className = 'art-icon ' + (link.hasAttribute('data-schedule-nav') ? 'icon-schedule' : 'icon-briefing'); art.setAttribute('aria-hidden', 'true'); svg.replaceWith(art);
      }
      const label = link.querySelector('span:not(.art-icon):not(.request-alert)')?.textContent?.trim() || link.textContent.trim();
      if (label) { link.setAttribute('aria-label', label); link.title = label; }
    });
  }
  new MutationObserver(records => { if (records.some(record => record.type === 'childList')) labelSidebarLinks(); }).observe(sidebar, {childList: true, subtree: true}); labelSidebarLinks();
  function closeMenu() { document.body.classList.remove('sidebar-open'); button.setAttribute('aria-expanded', 'false'); scrim.hidden = true; }
  button.addEventListener('click', () => {
    const open = !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', open); button.setAttribute('aria-expanded', String(open)); scrim.hidden = !open;
  });
  scrim.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.getElementById('home-sidebar').addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  const format = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric'});
  const updateDate = () => { document.getElementById('home-date').textContent = format.format(new Date()); };
  updateDate(); setInterval(updateDate, 60000);
  const header = document.querySelector('.home-topbar');
  const departmentMenus = [...document.querySelectorAll('.department-nav')];
  departmentMenus.forEach(menu => {
    menu.addEventListener('toggle', () => { if (menu.open) departmentMenus.forEach(other => { if (other !== menu) other.open = false; }); });
  });
  document.addEventListener('click', event => { departmentMenus.forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') departmentMenus.forEach(menu => { if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); } }); });
  const moveFeatures = () => { const features = header.querySelector('.workspace-features'); if (features) document.querySelector('.sidebar-footer').before(features); };
  new MutationObserver(moveFeatures).observe(header, {childList: true}); moveFeatures();
  if (window.firebase?.apps?.length && typeof firebase.auth === 'function') {
    const accountScript = document.createElement('script'); accountScript.src = '/flight-account.js?v=20261030-glass-clean-routes';
    const inboxScript = document.createElement('script'); inboxScript.src = '/request-inbox.js?v=20261030-glass-clean-routes';
    accountScript.async = false; inboxScript.async = false;
    accountScript.onload = () => { const accessScript = document.createElement('script'); accessScript.src = '/has-report-access.js?v=20261030-glass-clean-routes'; document.head.append(accessScript); };
    document.head.append(accountScript, inboxScript);
  } else {
    const login = document.createElement('a'); login.href = '/login.html'; login.className = 'home-sign-in'; login.textContent = 'Sign in'; document.getElementById('flight-account').append(login);
  }
  window.addEventListener('workspace-profile', ({detail: {profile, user}}) => {
    renderHomeTasks(window.RequestInbox?.data);
    const eligible = Boolean(user && profile && (profile.canViewOperations ?? (profile.station === 'LAX' && profile.account === 'MU')));
    const excluded = ![profile?.loginId, profile?.email, profile?.companyEmail, user?.email].some(v => String(v || '').toLowerCase() === 'test@hm.com') && [profile?.name, profile?.nickname].some(v => ['DEMOHAS', 'HASOPSRAMP'].includes(String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
    document.querySelectorAll('[data-home-operations]').forEach(link => { link.hidden = !eligible || excluded; });
    // The shared account menu converts the Profile sidebar entry to the scoped Briefing entry.
    const briefing = document.querySelector('.home-sidebar [data-briefing-nav]');
    if (briefing) briefing.querySelector('svg')?.classList.add('briefing-icon');
  });
  const reportPanel = document.querySelector('.home-report-panel');
  const reportEmpty = document.getElementById('home-report-empty');
  const updateReportEmpty = () => {
    const available = [...reportPanel.querySelectorAll('.home-report-links a')].some(link => !link.hidden);
    if (reportEmpty.hidden !== available) reportEmpty.hidden = available;
    reportEmpty.textContent = window.workspaceProfile?.user ? 'Report access is unavailable for your account.' : 'Sign in to view available reports.';
  };
  new MutationObserver(updateReportEmpty).observe(reportPanel, {subtree: true, attributes: true, attributeFilter: ['hidden']});
  updateReportEmpty();
  if (new URLSearchParams(location.search).get('preview') === '1') {
    document.querySelectorAll('a[href="/home"],a[href="/hr"],a[href="/has-checklist"],a[href="/info"]').forEach(link => link.href += '?preview=1');
  }
  const taskTabs = [...document.querySelectorAll('.home-task-tabs [role="tab"]')];
  function selectTaskTab(index, focus = false) {
    taskTabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index; });
    if (focus) taskTabs[index].focus();
  }
  taskTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTaskTab(index));
    tab.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectTaskTab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true); } });
  });
  function setTaskCount(id, value) {
    const badge = document.getElementById(id), count = Number(value) || 0;
    badge.hidden = count <= 0;
    badge.textContent = count > 0 ? String(count) : '';
  }
  function renderHomeTasks(data) {
    const approvePanel = document.getElementById('home-approve-panel'), signPanel = document.getElementById('home-sign-panel');
    approvePanel.replaceChildren(); signPanel.replaceChildren();
    const note = (host, text) => { const p = document.createElement('p'); p.className = 'home-task-empty'; p.textContent = text; p.setAttribute('role', 'status'); host.append(p); };
    if (!data) {
      const signedIn = Boolean(window.workspaceProfile?.user);
      setTaskCount('home-approve-count', 0); setTaskCount('home-sign-count', 0);
      note(approvePanel, signedIn ? 'Loading pending approvals…' : 'Sign in to view pending approvals.');
      note(signPanel, signedIn ? 'Loading your documents…' : 'Sign in to view documents awaiting your signature.'); return;
    }
    if (!Array.isArray(data.readSignMemos)) {
      setTaskCount('home-approve-count', 0); setTaskCount('home-sign-count', 0);
      note(approvePanel, 'Loading pending approvals…'); note(signPanel, 'Loading your documents…'); return;
    }
    const approvals = (data.rows || []).filter(({r}) => r.canReview).map(({kind, r}) => ({label: window.RequestInbox?.title(kind, r) || r.title || 'Request awaiting approval', detail: 'Awaiting your approval', href: '/has-form?request=' + encodeURIComponent(r.id)}));
    for (const item of data.scheduleItems || []) if (item.canReview) approvals.push({label: item.label, detail: 'Schedule request', href: item.href});
    const memos = (data.readSignMemos || []).filter(m => ['pending', 'overdue'].includes(m.myStatus)).map(m => ({label: m.subject || m.memoNumber || 'Document awaiting signature', detail: m.myStatus === 'overdue' ? 'Overdue · Awaiting your signature' : 'Awaiting your signature', href: '/read-sign?memo=' + encodeURIComponent(m.id), overdue: m.myStatus === 'overdue'}));
    const approvalError = data.scheduleError || data.groups?.some(group => group.error);
    setTaskCount('home-approve-count', approvals.length); setTaskCount('home-sign-count', data.signCount);
    function rows(host, items, empty, incomplete, href) {
      for (const item of items.slice(0, 4)) {
        const link = document.createElement('a'); link.className = 'home-task-row'; link.href = item.href;
        const icon = document.createElement('span'); icon.className = 'art-icon ' + (host === signPanel ? 'icon-sign' : 'icon-request'); icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('span'), title = document.createElement('strong'), detail = document.createElement('small'); title.textContent = item.label; detail.textContent = item.detail; detail.classList.toggle('is-overdue', Boolean(item.overdue)); copy.append(title, detail); link.append(icon, copy); host.append(link);
      }
      if (!items.length) note(host, incomplete ? 'Some items could not be loaded. Open the list to retry.' : empty);
      else if (incomplete) note(host, 'Some items could not be loaded.');
      const all = document.createElement('a'); all.className = 'home-task-all'; all.href = href; all.textContent = 'View All →'; host.append(all);
    }
    rows(approvePanel, approvals, 'No pending approvals. You’re all caught up.', approvalError, '/has-form');
    rows(signPanel, memos, 'No documents awaiting your signature.', data.readSignError, '/read-sign');
  }
  window.addEventListener('request-inbox-updated', ({detail}) => renderHomeTasks(detail));
  renderHomeTasks(window.RequestInbox?.data);
})();
