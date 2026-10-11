// Server-side Supabase calls with the service key (SUPABASE_SERVICE_ROLE_KEY in Vercel, never in the page).
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''); // her own project's URL, set in Vercel
function headers(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  // New-style keys (sb_secret_...) go in apikey only. Older JWT keys also go in Authorization.
  const h = { apikey: k, 'Content-Type': 'application/json' };
  if (k && !k.startsWith('sb_')) h.Authorization = 'Bearer ' + k;
  return Object.assign(h, extra || {});
}
async function rest(path, opts) {
  const r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({}, opts, { headers: headers(opts && opts.headers) }));
  const text = await r.text();
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}
// Who owns this sign-in token? Returns the email, or null.
async function userEmail(token, anonKey) {
  const r = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.email ? String(u.email).toLowerCase() : null;
}
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && URL_);
module.exports = { rest, userEmail, ready, URL: URL_ };
