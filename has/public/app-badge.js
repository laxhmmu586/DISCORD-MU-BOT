// Keep the Home Screen icon in sync with the same items as the notification bell.
(() => {
  if (!('setAppBadge' in navigator)) return;
  let user, revision = 0, queue = Promise.resolve();

  function sync(count, keys = []) {
    const uid = user?.uid || null, run = revision;
    queue = queue.catch(() => {}).then(async () => {
      if (run !== revision) return;
      try {
        if (count) await navigator.setAppBadge(count);
        else await navigator.clearAppBadge();
      } catch { /* Badging permission is independent of the notification inbox. */ }
      try {
        const registration = await navigator.serviceWorker?.getRegistration('/');
        if (run !== revision) return;
        (registration?.active || navigator.serviceWorker?.controller)?.postMessage({
          type:'MUFC_BADGE_SYNC', uid, count, keys
        });
      } catch { /* A browser without an installed worker can still show the inbox. */ }
    });
  }

  function inbox(data) {
    // A failed or intermediate load must not erase a previously correct badge.
    if (!user || !data || data.uid !== user.uid || !Array.isArray(data.groups) || data.groups.length !== 5
      || data.groups.some(group => group.error) || data.reminderError || data.readSignError || data.scheduleError) return;
    const actionable = (data.rows || []).filter(({r}) => r.canReview || r.needsRevision || r.canComplete);
    const reminders = (data.reminderMessages || []).filter(row => !row.readAt);
    const schedule = data.scheduleItems || [];
    const keys = [
      ...actionable.map(({kind,r}) => (kind === 'new-access' ? 'new_access' : kind) + ':' + r.id),
      ...reminders.map(row => row.badgeKey),
      ...(data.readSignMemos || []).filter(row => ['pending','overdue'].includes(row.myStatus)).map(row => 'read_sign:' + row.id),
      ...schedule.map(row => 'schedule:' + row.requestId)
    ].filter(Boolean);
    sync(actionable.length + reminders.length + (data.signCount || 0) + schedule.length, keys);
  }

  window.mufcClearAppBadge = () => {
    revision++;
    user = null;
    sync(0);
    return queue;
  };
  firebase.auth().onAuthStateChanged(next => {
    const previous = user?.uid;
    user = next;
    if (previous !== next?.uid) revision++;
    if (!next) sync(0);
    else inbox(window.RequestInbox?.data);
  });
  window.addEventListener('request-inbox-updated', event => inbox(event.detail));
  // Enabling phone notifications can install the worker after the inbox loaded.
  navigator.serviceWorker?.ready?.then(() => {
    if (user) inbox(window.RequestInbox?.data);
    else sync(0);
  }).catch(() => {});
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'MUFC_BADGE_PUSH' && !document.hidden) window.RequestInbox?.load();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && user) window.RequestInbox?.load();
  });
})();
