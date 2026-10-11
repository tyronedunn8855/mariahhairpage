// New-request alert for Mar Latrice's phone. The booking page calls this right after a request saves.
// It checks the request is real and brand new, marks it alerted (so it never fires twice), then pings
// every phone she turned alerts on for. The alert shows the day, time and style, never the client's name.
// The panel's "Send a test alert" button calls it with her sign-in instead.
const sb = require('./_sb');
const push = require('./_push');
const PUB_KEY = process.env.SUPABASE_ANON_KEY || ''; // her publishable key, same one as in ml-config.js
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(date, time) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DAYS[dow] + ', ' + MON[m - 1] + ' ' + d + ' at ' + ((h + 11) % 12 + 1) + ':' + String(mi).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
}
async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 4096) throw new Error('too big'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
async function fanOut(message) {
  const env = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY, subject: 'https://mariahhairpage.vercel.app' };
  const subs = await sb.rest('push_subscriptions?select=id,endpoint,p256dh,auth&limit=20');
  let sent = 0;
  await Promise.all(subs.map(async s => {
    const st = await push.send(s, message, env).catch(() => 0);
    if (st >= 200 && st < 300) sent++;
    if (st === 404 || st === 410) await sb.rest('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
  }));
  return { phones: subs.length, sent };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const out = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return out(405, { error: 'method' }); }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return out(403, { error: 'origin' });
  if (!sb.ready() || !PUB_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return out(503, { error: 'not set up' });
  let body; try { body = await readBody(req); } catch (e) { return out(400, { error: 'body' }); }
  try {
    if (body.test) {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const email = token && await sb.userEmail(token, PUB_KEY);
      if (!email) return out(401, { error: 'sign in' });
      const own = await sb.rest('owners?select=email&email=eq.' + encodeURIComponent(email));
      if (!own.length) return out(403, { error: 'not owner' });
      return out(200, await fanOut({ title: 'Alerts are on', body: 'New booking requests will show up here.', url: '/admin/' }));
    }
    const id = String(body.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return out(400, { error: 'id' });
    // Claim it: only a request made in the last 10 minutes that hasn't alerted yet
    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const rows = await sb.rest('booking_requests?id=eq.' + id + '&notified_at=is.null&created_at=gte.' + encodeURIComponent(since) + '&select=appt_date,appt_time,style',
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    if (!rows.length) return out(200, { skipped: true });
    const r = rows[0];
    return out(200, await fanOut({ title: 'New booking request', body: when(r.appt_date, String(r.appt_time).slice(0, 5)) + ' · ' + r.style, url: '/admin/' }));
  } catch (e) {
    return out(502, { error: 'failed' });
  }
};
module.exports.when = when;
