(() => {
  const pages = new Set(['home', 'hr', 'info', 'has-checklist', 'profile', 'has-form', 'has-report', 'read-sign', 'briefing', 'schedule', 'admin', 'account-settings']);
  if(location.pathname.startsWith('/has/'))history.replaceState(history.state,'',location.pathname.slice(4)+location.search+location.hash);
  const match = location.pathname.match(/^\/([a-z-]+)(?:\.html|\/)$/);
  if (match && pages.has(match[1])) history.replaceState(history.state, '', '/' + match[1] + location.search + location.hash);
})();
