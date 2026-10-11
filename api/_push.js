// Web Push without extra packages: a VAPID signature (RFC 8292) and an encrypted payload (RFC 8291, aes128gcm).
// The private key stays in Vercel's environment (VAPID_PRIVATE_KEY). Files starting with _ are not public functions.
const crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');

// Push services her phone might use. Anything else is refused, so a stored address can't point the server elsewhere.
const HOSTS = /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)$/;
function allowed(endpoint) { try { const u = new URL(endpoint); return u.protocol === 'https:' && HOSTS.test(u.hostname); } catch (e) { return false; } }

function vapidKey(pub, priv) {
  const p = unb64u(pub);
  if (p.length !== 65 || p[0] !== 4) throw new Error('VAPID public key must be 65 bytes, uncompressed');
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33)), d: String(priv) }, format: 'jwk' });
}
function vapidHeader(endpoint, pub, priv, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: vapidKey(pub, priv), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + pub;
}
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

function encrypt(payload, p256dh, auth) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const as = ecdh.getPublicKey(), shared = ecdh.computeSecret(ua);
  const ikm = hkdf(secret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = as.length;
  return Buffer.concat([head, as, ct]);
}

// Sends one alert. Resolves with the push service's status code (404/410 = that phone turned alerts off).
async function send(sub, message, env) {
  if (!allowed(sub.endpoint)) return 400;
  const body = encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: vapidHeader(sub.endpoint, env.pub, env.priv, env.subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body
  });
  return r.status;
}
module.exports = { send, encrypt, vapidHeader, allowed };
