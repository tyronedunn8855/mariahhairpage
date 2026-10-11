// One confirmed booking as a calendar event, for the owner panel's "Add to Apple Calendar" button.
// iPhone Safari opens a text/calendar response straight in the Calendar "Add" sheet, which a file built
// inside the page can't do reliably. This reads nothing and stores nothing: it turns the fields it gets
// into an event and sends it back.
const CHI = [
  'BEGIN:VTIMEZONE', 'TZID:America/Chicago',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0500', 'TZNAME:CDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0600', 'TZNAME:CST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];
const clean = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f<>"`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const fold = line => { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); } out.push(line); return out.join('\r\n'); };
const pad = n => String(n).padStart(2, '0');
const local = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00';

function build(q) {
  const date = q.get('date') || '', time = q.get('time') || '', dur = +q.get('dur'), id = q.get('id') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !(dur >= 15 && dur <= 1440) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  // Wall-clock math in UTC fields so the server's own time zone never shifts the times
  const start = new Date(Date.UTC(y, mo - 1, d, h, mi)), end = new Date(start.getTime() + dur * 60000);
  const name = clean(q.get('name'), 60) || 'Client', style = clean(q.get('style'), 90), phone = (q.get('phone') || '').replace(/\D/g, '').slice(-10);
  const lines = [
    style && 'Style: ' + style,
    clean(q.get('addons'), 60) && 'Add-ons: ' + clean(q.get('addons'), 60),
    /^\d{1,4}$/.test(q.get('total') || '') && 'Estimated total: $' + q.get('total') + (q.get('plus') === '1' ? '+' : ''),
    phone.length === 10 && 'Phone: (' + phone.slice(0, 3) + ') ' + phone.slice(3, 6) + '-' + phone.slice(6),
    q.get('paid') === '2' ? 'Deposit: paid.' : q.get('paid') === '1' ? 'Client said the deposit is paid. Check your payment app.' : 'Deposit: not marked paid.',
    clean(q.get('notes'), 400) && 'Notes: ' + clean(q.get('notes'), 400),
    'Booked through your Mar Latrice Styles site.'
  ].filter(Boolean);
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mar Latrice Styles//owner panel//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...CHI,
    'BEGIN:VEVENT', 'UID:' + id + '@marlatricestyles', 'DTSTAMP:' + stamp, 'SEQUENCE:' + (/^\d{1,10}$/.test(q.get('seq') || '') ? q.get('seq') : '0'),
    'DTSTART;TZID=America/Chicago:' + local(start), 'DTEND;TZID=America/Chicago:' + local(end),
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'LOCATION:' + esc('10601 W Oklahoma Ave # X17, West Allis, WI 53227'),
    'SUMMARY:' + esc(name + (style ? ': ' + style : '')),
    'DESCRIPTION:' + esc(lines.join('\n')),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(name + ' in 1 hour'), 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  const file = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'booking') + '-' + date + '.ics';
  return { body: ev.map(fold).join('\r\n') + '\r\n', file };
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end('Method not allowed'); }
  // Only the panel on this site may ask. Browsers send this header on every request.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') { res.statusCode = 403; return res.end('Forbidden'); }
  const out = build(new URL(req.url, 'http://x').searchParams);
  if (!out) { res.statusCode = 400; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('That booking is missing its date or time.'); }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="' + out.file + '"');
  res.end(out.body);
};
module.exports.build = build;
