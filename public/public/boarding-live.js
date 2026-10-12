(() => {
  // Fetch is flight-scoped by flight-session.js; EventSource needs the same
  // explicit scope because it does not pass through the fetch wrapper.
  window.connectBoardingLive = async ({ apiBase, onBoard, onStatus }) => {
    let stream;
    let closed = false;
    let revision = -1;
    let reconnectTimer;
    const close = () => { closed = true; stream?.close(); clearTimeout(reconnectTimer); };
    window.addEventListener('pagehide', close, { once: true });
    const accept = data => {
      if (!Number.isSafeInteger(data.revision) || data.revision < revision) return;
      revision = data.revision;
      onBoard(data);
    };
    const connect = () => {
      if (closed) return;
      const flight = window.mufcFlight;
      const url = new URL(`${apiBase}/cbs-scan/live-stream`);
      if (flight) {
        url.searchParams.set('flightNo', flight.flightNo);
        url.searchParams.set('flightDate', flight.flightDate);
      }
      stream = new EventSource(url.href);
      // Each connection starts with an authoritative full snapshot. A restart
      // can legitimately restore a lower revision after an unsuccessful write.
      stream.onopen = () => { revision = -1; onStatus('Live'); };
      stream.addEventListener('board', event => {
        try { accept(JSON.parse(event.data)); } catch { onStatus('Unable to read live update.'); }
      });
      stream.onerror = () => onStatus('Reconnecting…');
    };
    const initialize = async () => {
      try {
        const response = await fetch(`${apiBase}/cbs-scan/live-state`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Live updates unavailable.');
        if (closed) return false;
        if (!data.live) { onStatus('Manual refresh'); return false; }
        accept(data);
        connect();
        return true;
      } catch {
        if (!closed) {
          onStatus('Reconnecting…');
          reconnectTimer = setTimeout(initialize, 10000);
        }
        // Retry the cache endpoint, never force a Sheets read per device.
        return true;
      }
    };
    return initialize();
  };
})();
