(() => {
  const destination = 'https://has-station.com/has-pbb.html';
  function updateLinks() {
    document.querySelectorAll('a[href="/has-pbb.html"],a.flight-pbb-link,a[data-mobile-service="jetbridge"]').forEach(link => {
      link.href = destination;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }
  updateLinks();
  new MutationObserver(updateLinks).observe(document.body, {childList:true,subtree:true});
})();
