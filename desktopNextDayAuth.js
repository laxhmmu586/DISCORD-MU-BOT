// Desktop sends derived figures only, using the existing Firebase sign-in.
let publicKey;
async function verifyDesktopToken(authorization) {
  const token = String(authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) return false;
  if (!publicKey) {
    const response = await fetch('https://china-eastern.web.app/__/firebase/init.json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Firebase configuration unavailable.');
    publicKey = (await response.json()).apiKey;
    if (!publicKey) throw new Error('Firebase configuration unavailable.');
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(publicKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) return false;
  const user = (await response.json()).users?.[0];
  const allowed = (process.env.MUFC_ALLOWED_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return Boolean(user && !user.disabled && (!allowed.length || allowed.includes(user.localId)));
}
module.exports = { verifyDesktopToken };
