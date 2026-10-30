(() => {
  const pages = new Set(['home', 'hr', 'info', 'has-checklist', 'profile', 'has-form', 'has-report', 'read-sign', 'briefing', 'schedule', 'admin', 'account-settings']);
  const match = location.pathname.match(/^\/([a-z-]+)(?:\.html|\/)$/);
  if (match && pages.has(match[1])) history.replaceState(history.state, '', '/' + match[1] + location.search + location.hash);
})();
