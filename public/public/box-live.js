(function(root) {
  'use strict';
  root.connectBoxLive = function({apiBase,onData,onFallback}) {
    let stream, retry, fallback, closed = false;
    const flight = {...root.mufcFlight};
    const matches = () => root.mufcFlight?.flightNo === flight.flightNo && root.mufcFlight?.flightDate === flight.flightDate;
    const poll = () => {
      if (closed || fallback) return;
      fallback = root.setTimeout(async () => {
        fallback = null;
        if (closed || !matches()) return;
        try { await onFallback(); } finally { if (!closed && stream?.readyState !== 1) poll(); }
      },15000);
    };
    function connect() {
      if (closed || !matches()) return;
      try {
        const url = new URL(apiBase + '/boarding-box/live-stream');
        url.searchParams.set('flightNo',flight.flightNo); url.searchParams.set('flightDate',flight.flightDate);
        stream = new root.EventSource(url.href);
        stream.onopen = () => { root.clearTimeout(fallback); fallback = null; root.clearTimeout(retry); retry = null; };
        stream.addEventListener('box',event => {
          if (closed || !matches()) return;
          try { onData(JSON.parse(event.data)); } catch { poll(); }
        });
        stream.onerror = () => {
          poll();
          if (stream.readyState === 2 && !retry) {
            stream.close(); retry = root.setTimeout(() => { retry = null; connect(); },10000);
          }
        };
      } catch {
        poll(); retry = root.setTimeout(connect,10000);
      }
    }
    connect();
    return () => { closed = true; stream?.close(); root.clearTimeout(retry); root.clearTimeout(fallback); };
  };
})(window);
