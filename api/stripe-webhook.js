// Stripe tells this function when a deposit is paid. It checks Stripe's signature with the webhook secret
// (STRIPE_WEBHOOK_SECRET in Vercel), then marks that booking request "deposit paid" in her panel.
// The booking page sends the request's id to Stripe as client_reference_id, so the payment finds its request.
const crypto = require('crypto');
const sb = require('./_sb');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function verify(raw, header, secret, now) {
  const parts = {}; String(header || '').split(',').forEach(p => { const i = p.indexOf('='); if (i > 0) (parts[p.slice(0, i)] = parts[p.slice(0, i)] || []).push(p.slice(i + 1)); });
  const t = +(parts.t || [])[0];
  if (!t || Math.abs((now || Date.now()) / 1000 - t) > 300) return false; // older than 5 minutes: refuse replays
  const want = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest();
  return (parts.v1 || []).some(v => { const got = Buffer.from(v, 'hex'); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

module.exports = async (req, res) => {
  const out = (code, text) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain'); res.end(text); };
  if (req.method !== 'POST') return out(405, 'method');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sb.ready()) return out(503, 'not set up');
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 512 * 1024) return out(413, 'too big'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!verify(raw, req.headers['stripe-signature'], secret)) return out(400, 'bad signature');
  let ev; try { ev = JSON.parse(raw); } catch (e) { return out(400, 'bad json'); }
  const s = ev && ev.data && ev.data.object;
  const types = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (types.indexOf(ev.type) < 0 || !s || s.payment_status !== 'paid' || !UUID.test(String(s.client_reference_id || ''))) return out(200, 'ignored');
  try {
    await sb.rest('booking_requests?id=eq.' + s.client_reference_id, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ deposit_paid: true, deposit_paid_at: new Date().toISOString(), deposit_cents: Number.isInteger(s.amount_total) ? s.amount_total : null, stripe_session: String(s.id || '').slice(0, 120) })
    });
  } catch (e) { return out(500, 'retry'); } // Stripe retries on errors
  return out(200, 'ok');
};
module.exports.verify = verify;
