const { randomUUID, createHash } = require('node:crypto');

// A confirmation is scoped to the exact boarding pass, selected flight/date,
// and a short-lived server-issued challenge. A client cannot bypass a warning
// merely by posting a boolean flag.
function createNbrdConfirmationStore({ now = Date.now, ttlMs = 300000 } = {}) {
  const challenges = new Map();
  const generations = new Map();
  const signature = (flight, date, raw) => createHash('sha256').update(JSON.stringify([flight, date, raw, generations.get(flight + '/' + date) || 0])).digest('hex');
  function matches(token, key, stage) {
    const entry = challenges.get(token);
    return entry && entry.key === key && entry.stage === stage && entry.expiresAt > now();
  }
  return {
    key: signature,
    canBoard: (token, key) => Boolean(matches(token, key, 'board')),
    consume: token => challenges.delete(token),
    clear: () => { challenges.clear(); generations.clear(); },
    clearScope(flight, date) {
      const scope = flight + '/' + date;
      generations.set(scope, (generations.get(scope) || 0) + 1);
    },
    detail: (token, key) => matches(token, key, 'board') ? challenges.get(token).detail : undefined,
    warning(key, reviewToken, detail = '') {
      for (const [token, entry] of challenges) if (entry.expiresAt <= now()) challenges.delete(token);
      const canBoard = Boolean((matches(reviewToken, key, 'review') || matches(reviewToken, key, 'board')) && challenges.get(reviewToken).detail === detail);
      if (canBoard) challenges.delete(reviewToken);
      if (challenges.size >= 1000) challenges.delete(challenges.keys().next().value);
      const token = randomUUID();
      challenges.set(token, { key, detail, stage:canBoard ? 'board' : 'review', expiresAt:now() + ttlMs });
      return { canBoard, confirmationToken:token };
    }
  };
}

module.exports = { createNbrdConfirmationStore };
