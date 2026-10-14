(() => {
  // Keep decoded passes until the server returns a definitive result. Each tab
  // owns an outbox so independent scanners cannot overwrite one another.
  window.createScanOutbox = ({ storage, key, submit, canSubmit, onChanged, onError, uuid = () => crypto.randomUUID() }) => {
    let items = JSON.parse(storage.getItem(key) || '[]');
    if (!Array.isArray(items) || items.some(item => !item || typeof item.text !== 'string' || typeof item.id !== 'string')) throw new Error('Unable to read pending scans.');
    let busy = false;
    const write = next => { storage.setItem(key, JSON.stringify(next)); items = next; onChanged(items.length); };
    const pump = async () => {
      if (busy || !items.length || !canSubmit()) return;
      busy = true;
      const item = items[0];
      try {
        if (await submit(item)) write(items.filter(entry => entry.id !== item.id));
      } catch (error) { onError(error); }
      finally { busy = false; }
    };
    onChanged(items.length);
    return {
      pump,
      capture(text) {
        if (items.some(item => item.text === text)) return;
        write([...items, { id: uuid(), text }]);
        void pump();
      },
      get pending() { return items.length; }
    };
  };
})();
