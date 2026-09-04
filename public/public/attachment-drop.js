(() => {
  const dropZoneSelector = 'label, [data-attachment-group], .attachments';

  function fileInputFor(target) {
    const zone = target.closest(dropZoneSelector);
    if (!zone) return null;
    const input = zone.matches('label') ? zone.querySelector('input[type="file"]') : zone.querySelector('input[type="file"]');
    return input && !input.disabled ? { input, zone } : null;
  }

  function setDragging(zone, dragging) {
    zone.classList.toggle('is-file-dragging', dragging);
  }

  function addDropHints(root = document) {
    root.querySelectorAll?.('input[type="file"]').forEach((input) => {
      const zone = input.closest('label') || input.closest('[data-attachment-group], .attachments');
      if (!zone || zone.dataset.fileDropReady) return;
      zone.dataset.fileDropReady = 'true';
      const hint = document.createElement('span');
      hint.className = 'file-drop-hint';
      hint.textContent = input.multiple ? 'Drag & drop files here or click +' : 'Drag & drop file here or click +';
      zone.appendChild(hint);
    });
  }

  addDropHints();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) addDropHints(node.matches?.('input[type="file"]') ? node.parentElement : node);
  }))).observe(document.body, { childList:true, subtree:true });

  document.addEventListener('dragenter', (event) => {
    const target = fileInputFor(event.target);
    if (!target || !event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    setDragging(target.zone, true);
  });

  document.addEventListener('dragover', (event) => {
    const target = fileInputFor(event.target);
    if (!target || !event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(target.zone, true);
  });

  document.addEventListener('dragleave', (event) => {
    const target = fileInputFor(event.target);
    if (target && !target.zone.contains(event.relatedTarget)) setDragging(target.zone, false);
  });

  document.addEventListener('drop', (event) => {
    const target = fileInputFor(event.target);
    if (!target || !event.dataTransfer?.files?.length) return;
    event.preventDefault();
    setDragging(target.zone, false);
    const transfer = new DataTransfer();
    const files = Array.from(event.dataTransfer.files);
    (target.input.multiple ? files : files.slice(0, 1)).forEach((file) => transfer.items.add(file));
    target.input.files = transfer.files;
    target.input.dispatchEvent(new Event('change', { bubbles:true }));
  });

  const style = document.createElement('style');
  style.textContent = `
    label:has(> input[type="file"]), [data-attachment-group], .attachments { transition:border-color .15s ease,box-shadow .15s ease,background .15s ease; }
    .file-drop-hint { display:block; color:#667085; font-size:10px; font-weight:800; line-height:1.3; text-align:center; text-transform:none; letter-spacing:0; }
    .is-file-dragging { border-color:#245fce !important; background:#eaf4ff !important; box-shadow:0 0 0 4px rgba(36,95,206,.16) !important; }
    .is-file-dragging::after { content:"Drop attachment here"; color:#123a73; font-size:12px; font-weight:900; }
  `;
  document.head.appendChild(style);
})();
