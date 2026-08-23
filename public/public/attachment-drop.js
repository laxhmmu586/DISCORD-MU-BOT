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
    .is-file-dragging { border-color:#245fce !important; background:#eaf4ff !important; box-shadow:0 0 0 4px rgba(36,95,206,.16) !important; }
    .is-file-dragging::after { content:"Drop attachment here"; color:#123a73; font-size:12px; font-weight:900; }
  `;
  document.head.appendChild(style);
})();
