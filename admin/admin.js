/* Mar Latrice Styles owner panel. Built from the ken.didit panel.
   Mar Latrice signs in with her phone number and a password she picked. The password lives only in Supabase Auth
   (stored hashed), never in this code. Supabase's own phone sign-in needs a paid SMS provider, so her account
   uses a login built from her number (p4145550123@<loginDomain>); no email is ever sent to it.
   Then she opens or closes days,
   adds or removes times, marks times booked, and copies a week forward.
   Row Level Security in supabase/setup.sql is the real lock: this page only asks, the database decides.
   "Saved" shows only after Supabase returns the changed rows. Anything else shows an error. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var cfg = window.ML_SUPABASE || {};
  var VIEWS = ['v-off', 'v-wait', 'v-signin', 'v-denied', 'v-load-err', 'v-panel'];
  function show(id) {
    VIEWS.forEach(function (v) { var el = document.getElementById(v); if (el) el.hidden = v !== id; });
    $('#signout').hidden = id !== 'v-panel' && id !== 'v-load-err';
  }

  if (!cfg.url || !cfg.anonKey || !window.supabase) { show('v-off'); return; }

  var LOGIN_DOMAIN = cfg.loginDomain || 'mariahhairpage.vercel.app';

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  /* ─── Dates and times ─── */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON3 = MONTHS.map(function (m) { return m.slice(0, 3); });
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { return addDays(d, -d.getDay()); }
  function fmtTime(t) { // '16:30:00' -> '4:30 PM'
    var p = String(t).split(':'), h = +p[0], m = p[1] || '00';
    return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function hm(t) { return String(t).slice(0, 5); } // '16:30:00' -> '16:30'
  function plusMinutes(t, mins) {
    var p = t.split(':'), total = Math.min(23 * 60 + 45, +p[0] * 60 + +p[1] + mins);
    return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  }
  function fmtDay(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtRange(a, b) {
    return MON3[a.getMonth()] + ' ' + a.getDate() + ' to ' + (a.getMonth() === b.getMonth() ? '' : MON3[b.getMonth()] + ' ') + b.getDate();
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var TODAY = iso(today);

  /* ─── Status bar: Saving, Saved, or a clear error ─── */
  var stEl = $('#status'), stText = $('#status-text'), stX = $('#status-x'), stTimer = 0;
  function status(kind, text) {
    clearTimeout(stTimer);
    stEl.hidden = false;
    stEl.className = 'status ' + kind;
    stEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    stText.textContent = text;
    stX.hidden = kind !== 'error';
    if (kind === 'saved') stTimer = setTimeout(function () { stEl.hidden = true; }, 2600);
  }
  stX.addEventListener('click', function () { stEl.hidden = true; });

  function friendly(e) {
    if (!navigator.onLine) return 'You are offline. Nothing was saved.';
    var code = e && (e.code || ''), msg = String((e && e.message) || e || '');
    if (e && e.status >= 500) return 'The booking database had a problem. Nothing was saved. Try again in a minute.';
    if (code === '23505') return 'You already have a time that starts then on this day.';
    if (code === '23514') return 'The end time has to be after the start time.';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'This account is not allowed to make changes. Nothing was saved.';
    if (code === 'PGRST301' || /jwt|expired|not authenticated/i.test(msg)) return 'Your sign-in ended. Sign in again. Nothing was saved.';
    if (/fetch|network|load failed/i.test(msg)) return 'Could not reach the server. Check your connection. Nothing was saved.';
    return 'Not saved: ' + msg;
  }

  // Runs one change. Resolves with the rows Supabase confirms, or rejects after showing the error.
  var busy = false;
  function save(text, run, okText) {
    if (busy) return Promise.reject(new Error('busy'));
    busy = true; lock(true);
    status('saving', text);
    return Promise.resolve().then(run).then(function (res) {
      if (res.error) { res.error.status = res.status; throw res.error; }
      var rows = res.data || [];
      // An update or delete that RLS blocks returns no rows instead of an error. Never call that saved.
      if (!rows.length && !res.allowEmpty) throw { message: 'not authenticated', code: 'PGRST301', silent: true };
      status('saved', typeof okText === 'function' ? okText(rows) : (okText || 'Saved'));
      return rows;
    }).catch(function (e) {
      status('error', e && e.silent ? 'Not saved. Your sign-in may have ended. Sign out, then sign in again.' : friendly(e));
      throw e;
    }).finally(function () { busy = false; lock(false); });
  }
  function lock(on) {
    document.querySelectorAll('#v-panel button, #v-panel input').forEach(function (b) {
      if (on) { b.dataset.wasDisabled = b.disabled ? '1' : ''; b.disabled = true; }
      else if (b.dataset.wasDisabled !== undefined) { b.disabled = b.dataset.wasDisabled === '1'; delete b.dataset.wasDisabled; }
    });
  }

  /* ─── Sign in: phone number + password ─── */
  // '(414) 555-0123', '414.555.0123' or '+1 414 555 0123' -> '4145550123'
  function phoneDigits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.length === 10 ? d : '';
  }
  function loginFor(digits) { return 'p' + digits + '@' + LOGIN_DOMAIN; }
  function prettyLogin(login) {
    var m = String(login || '').match(/^p(\d{3})(\d{3})(\d{4})@/);
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : (login || 'this account');
  }
  function fieldErr(input, el, text) {
    el.textContent = text; el.hidden = !text;
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  $('#pw-show').addEventListener('click', function () {
    var pw = $('#password'), on = pw.type === 'password';
    pw.type = on ? 'text' : 'password';
    this.textContent = on ? 'Hide' : 'Show';
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ph = $('#phone'), pw = $('#password'), digits = phoneDigits(ph.value), err = $('#signin-err'), btn = $('#signin-btn');
    err.hidden = true;
    fieldErr(ph, $('#phone-err'), !ph.value.trim() ? 'Type your phone number first.' : !digits ? 'Use your 10-digit number, like (414) 555-0123.' : '');
    fieldErr(pw, $('#password-err'), pw.value ? '' : 'Type your password.');
    if (!digits) { ph.focus(); return; }
    if (!pw.value) { pw.focus(); return; }
    btn.disabled = true; btn.textContent = 'Signing in';
    sb.auth.signInWithPassword({ email: loginFor(digits), password: pw.value }).then(function (res) {
      if (res.error) throw res.error;
      pw.value = '';
    }).catch(function (e) {
      var m = String((e && e.message) || ''), st = e && e.status;
      err.textContent = st === 429 || /rate|too many/i.test(m)
        ? 'Too many tries. Wait a few minutes, then try again.'
        : st === 400 || /invalid login|credentials/i.test(m)
          ? 'That phone number and password don\'t match. Check both and try again.'
          : !navigator.onLine || /fetch|network/i.test(m)
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Could not sign in: ' + m;
      err.hidden = false;
    }).finally(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  function signOut() {
    status('saving', 'Signing out');
    sb.auth.signOut().finally(function () { stEl.hidden = true; rows = {}; show('v-signin'); });
  }
  $('#signout').addEventListener('click', signOut);
  $('#denied-out').addEventListener('click', signOut);

  /* ─── Who is signed in ─── */
  var routed = '';
  function route(session) {
    if (!session) { routed = ''; show('v-signin'); return; }
    var who = session.user && session.user.email;
    if (routed === who) return;
    routed = who;
    show('v-wait');
    sb.rpc('is_owner').then(function (res) {
      if (res.error) throw res.error;
      if (res.data !== true) { $('#denied-as').textContent = prettyLogin(who); show('v-denied'); return; }
      show('v-panel');
      tabLoaded = {};
      startTabs();
      loadMonth();
      startAlerts();
      cleanup();
    }).catch(function (e) {
      routed = '';
      $('#load-err-text').textContent = friendly(e).replace(' Nothing was saved.', '');
      show('v-load-err');
    });
  }
  $('#load-retry').addEventListener('click', function () { sb.auth.getSession().then(function (r) { route(r.data.session); }); });
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') { routed = ''; show('v-signin'); return; }
    // Let the auth callback finish before calling the database
    setTimeout(function () { route(session); }, 0);
  });

  /* ─── Month data ─── */
  var view = new Date(today.getFullYear(), today.getMonth(), 1);
  var sel = null;          // 'YYYY-MM-DD'
  var rows = {};           // date -> rows sorted by start time
  var loadSeq = 0;
  function gridRange() {
    var a = new Date(view.getFullYear(), view.getMonth(), 1);
    var b = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    return [iso(weekStart(a)), iso(addDays(weekStart(b), 6))];
  }
  function putRows(list, from, to) {
    Object.keys(rows).forEach(function (k) { if (k >= from && k <= to) delete rows[k]; });
    list.forEach(function (r) { (rows[r.date] = rows[r.date] || []).push(r); });
    Object.keys(rows).forEach(function (k) { rows[k].sort(function (x, y) { return x.start_time < y.start_time ? -1 : 1; }); });
  }
  function loadMonth() {
    var seq = ++loadSeq, r = gridRange();
    $('#grid').classList.add('busy'); $('#grid').setAttribute('aria-busy', 'true');
    $('#cal-err').hidden = true;
    renderCal();
    return sb.from('availability').select('id,date,start_time,end_time,status,note')
      .gte('date', r[0]).lte('date', r[1]).order('date').order('start_time')
      .then(function (res) {
        if (seq !== loadSeq) return;
        if (res.error) throw res.error;
        putRows(res.data || [], r[0], r[1]);
        $('#grid').classList.remove('busy'); $('#grid').removeAttribute('aria-busy');
        renderCal(); renderDay();
      }).catch(function (e) {
        if (seq !== loadSeq) return;
        $('#grid').classList.remove('busy'); $('#grid').removeAttribute('aria-busy');
        $('#cal-err-text').textContent = 'Couldn\'t load your hours. ' + friendly(e).replace(' Nothing was saved.', '');
        $('#cal-err').hidden = false;
      });
  }
  $('#cal-retry').addEventListener('click', loadMonth);
  $('#prev').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); loadMonth(); });
  $('#next').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); loadMonth(); });

  function dayInfo(k) {
    var list = rows[k] || [];
    var open = list.filter(function (r) { return r.status === 'open'; }).length;
    var booked = list.filter(function (r) { return r.status === 'booked'; }).length;
    return { list: list, open: open, booked: booked, closed: list.length - open - booked };
  }

  /* ─── Calendar ─── */
  function renderCal() {
    $('#month').textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
    $('#prev').disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    var grid = $('#grid'), frag = document.createDocumentFragment();
    var first = view.getDay(), n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (var i = 0; i < first; i++) { var bl = document.createElement('span'); bl.className = 'd blank'; frag.appendChild(bl); }
    for (var d = 1; d <= n; d++) {
      var dt = new Date(view.getFullYear(), view.getMonth(), d), k = iso(dt), info = dayInfo(k);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'd'; b.dataset.k = k;
      if (k < TODAY) { b.classList.add('past'); b.disabled = true; }
      else if (info.open) b.classList.add('open');
      else if (info.list.length) b.classList.add('closed');
      if (k === TODAY) b.classList.add('today');
      if (k === sel) { b.classList.add('sel'); b.setAttribute('aria-pressed', 'true'); }
      var num = document.createElement('span'); num.textContent = d; b.appendChild(num);
      var dots = document.createElement('i'); dots.setAttribute('aria-hidden', 'true');
      for (var j = 0; j < Math.min(info.open, 3); j++) dots.appendChild(document.createElement('b'));
      if (info.booked) { var bk = document.createElement('b'); bk.className = 'bk'; dots.appendChild(bk); }
      b.appendChild(dots);
      b.setAttribute('aria-label', fmtDay(dt) + ', ' + (k < TODAY ? 'past' :
        info.open ? info.open + ' open time' + (info.open > 1 ? 's' : '') + (info.booked ? ', ' + info.booked + ' booked' : '') :
        info.booked ? info.booked + ' booked, no open times' : info.list.length ? 'closed' : 'no times yet'));
      frag.appendChild(b);
    }
    grid.replaceChildren(frag);
  }
  $('#grid').addEventListener('click', function (e) {
    var b = e.target.closest('.d[data-k]'); if (!b || b.disabled) return;
    sel = b.dataset.k;
    renderCal(); closeAdd(); renderDay(true);
  });

  /* ─── One day ─── */
  var USUAL = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']; // quick picks only; she types any time she wants
  function renderDay(scroll) {
    var box = $('#day');
    if (!sel) { box.hidden = true; return; }
    var d = parse(sel), info = dayInfo(sel);
    box.hidden = false;
    $('#day-title').textContent = fmtDay(d);
    var st = $('#day-state');
    st.textContent = info.open ? 'Open · ' + info.open + ' time' + (info.open > 1 ? 's' : '') + ' clients can book' + (info.booked ? ' · ' + info.booked + ' booked' : '')
      : info.booked ? 'Fully booked' : info.list.length ? 'Closed. Clients can\'t book this day.' : 'No times yet. Clients can\'t book this day.';
    st.classList.toggle('is-closed', !info.open);

    var tg = $('#toggle-day');
    if (info.open) { tg.textContent = 'Close this day'; tg.className = 'btn danger'; tg.dataset.act = 'close'; }
    else if (info.closed) { tg.textContent = 'Open this day'; tg.className = 'btn'; tg.dataset.act = 'open'; }
    else { tg.textContent = 'Open this day'; tg.className = 'btn'; tg.dataset.act = 'first'; }
    var adding = !$('#add-form').hidden;
    // Fully booked: nothing to open or close. Empty day: the big button opens the add form.
    tg.hidden = (!info.open && !info.closed && info.booked > 0) || (!info.list.length && adding);
    $('#add-open').hidden = adding || !info.list.length;

    var ul = $('#slots'), frag = document.createDocumentFragment();
    if (!info.list.length) {
      var li = document.createElement('li'); li.className = 'empty';
      li.textContent = 'No times on this day yet.';
      frag.appendChild(li);
    }
    info.list.forEach(function (r) {
      var li = document.createElement('li'); li.className = 'slot is-' + r.status;
      var top = document.createElement('div'); top.className = 'slot-top';
      var t = document.createElement('div');
      var tt = document.createElement('p'); tt.className = 'slot-time'; tt.textContent = fmtTime(r.start_time) + ' to ' + fmtTime(r.end_time);
      t.appendChild(tt);
      if (r.note) { var nt = document.createElement('p'); nt.className = 'slot-note'; nt.textContent = r.note; t.appendChild(nt); }
      var del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.dataset.id = r.id;
      del.setAttribute('aria-label', 'Remove ' + fmtTime(r.start_time) + ' to ' + fmtTime(r.end_time));
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
      top.appendChild(t); top.appendChild(del);
      var seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Status for ' + fmtTime(r.start_time));
      [['open', 'Open', ''], ['booked', 'Booked', 'bk'], ['closed', 'Closed', 'cl']].forEach(function (o) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1]; b.className = o[2];
        b.dataset.id = r.id; b.dataset.set = o[0]; b.setAttribute('aria-pressed', r.status === o[0] ? 'true' : 'false');
        seg.appendChild(b);
      });
      li.appendChild(top); li.appendChild(seg);
      frag.appendChild(li);
    });
    ul.replaceChildren(frag);

    var ws = weekStart(d), we = addDays(ws, 6);
    $('#copy-hint').textContent = 'Copies this week (' + fmtRange(ws, we) + ') onto next week (' + fmtRange(addDays(ws, 7), addDays(we, 7)) + '). Times already there stay as they are.';
    if (scroll) {
      box.scrollIntoView({ behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth', block: 'start' });
      box.focus({ preventScroll: true });
    }
  }
  function findRow(id) {
    var list = rows[sel] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function replaceRows(changed) {
    changed.forEach(function (c) {
      var list = rows[c.date] || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === c.id) { list[i] = c; return; }
      list.push(c); rows[c.date] = list;
    });
    Object.keys(rows).forEach(function (k) { rows[k].sort(function (x, y) { return x.start_time < y.start_time ? -1 : 1; }); });
    renderCal(); renderDay();
  }

  // Open or close the whole day
  $('#toggle-day').addEventListener('click', function () {
    var act = this.dataset.act, k = sel;
    if (act === 'first') { openAdd(); return; }
    var from = act === 'close' ? 'open' : 'closed', to = act === 'close' ? 'closed' : 'open';
    var label = fmtDay(parse(k));
    save(act === 'close' ? 'Closing ' + label : 'Opening ' + label, function () {
      return sb.from('availability').update({ status: to }).eq('date', k).eq('status', from).select();
    }, act === 'close' ? 'Saved. ' + label + ' is closed.' : 'Saved. ' + label + ' is open.').then(replaceRows, function () {});
  });

  // Status buttons and remove buttons on each time
  $('#slots').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var r = findRow(b.dataset.id); if (!r) return;
    if (b.dataset.set) {
      if (b.dataset.set === r.status) return;
      var to = b.dataset.set;
      save('Saving ' + fmtTime(r.start_time), function () {
        return sb.from('availability').update({ status: to }).eq('id', r.id).select();
      }, 'Saved. ' + fmtTime(r.start_time) + ' is ' + to + '.').then(replaceRows, function () {});
    } else if (b.classList.contains('del')) {
      if (!window.confirm('Remove ' + fmtTime(r.start_time) + ' to ' + fmtTime(r.end_time) + ' on ' + fmtDay(parse(r.date)) + '?')) return;
      save('Removing ' + fmtTime(r.start_time), function () {
        return sb.from('availability').delete().eq('id', r.id).select();
      }, 'Saved. ' + fmtTime(r.start_time) + ' removed.').then(function () {
        rows[r.date] = (rows[r.date] || []).filter(function (x) { return x.id !== r.id; });
        if (!rows[r.date].length) delete rows[r.date];
        renderCal(); renderDay();
      }, function () {});
    }
  });

  /* ─── Add a time ─── */
  var quick = $('#quick');
  USUAL.forEach(function (t) {
    var b = document.createElement('button'); b.type = 'button'; b.dataset.t = t; b.textContent = fmtTime(t + ':00');
    b.setAttribute('aria-pressed', 'false'); quick.appendChild(b);
  });
  quick.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $('#start').value = b.dataset.t; $('#end').value = plusMinutes(b.dataset.t, 180);
    quick.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  });
  $('#start').addEventListener('change', function () {
    if (this.value && (!$('#end').value || $('#end').value <= this.value)) $('#end').value = plusMinutes(this.value, 180);
    quick.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
  });
  function openAdd() {
    $('#add-form').hidden = false; $('#add-err').hidden = true;
    renderDay();
    $('#start').focus();
  }
  function closeAdd() {
    $('#add-form').hidden = true;
    $('#add-form').reset();
    quick.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    ['#start', '#end'].forEach(function (s) { $(s).removeAttribute('aria-invalid'); });
  }
  $('#add-open').addEventListener('click', openAdd);
  $('#add-cancel').addEventListener('click', function () { closeAdd(); renderDay(); });
  $('#add-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = $('#start').value, en = $('#end').value, note = $('#note').value.trim(), err = $('#add-err');
    var bad = !s ? ['#start', 'Pick a start time.'] : !en ? ['#end', 'Pick an end time.'] : en <= s ? ['#end', 'The end time has to be after the start time.'] : null;
    if (!bad && (rows[sel] || []).some(function (r) { return hm(r.start_time) === s; })) bad = ['#start', 'You already have a time at ' + fmtTime(s + ':00') + ' on this day.'];
    if (bad) { err.textContent = bad[1]; err.hidden = false; $(bad[0]).setAttribute('aria-invalid', 'true'); $(bad[0]).focus(); return; }
    err.hidden = true; $('#start').removeAttribute('aria-invalid'); $('#end').removeAttribute('aria-invalid');
    var k = sel;
    save('Saving ' + fmtTime(s + ':00'), function () {
      return sb.from('availability').insert({ date: k, start_time: s, end_time: en, status: 'open', note: note || null }).select();
    }, 'Saved. ' + fmtTime(s + ':00') + ' is open.').then(function (data) {
      closeAdd(); replaceRows(data);
    }, function () {});
  });

  /* ─── Copy a week forward ─── */
  $('#copy-week').addEventListener('click', function () {
    var ws = weekStart(parse(sel)), we = addDays(ws, 6), to0 = addDays(ws, 7), to1 = addDays(we, 7);
    var src;
    status('saving', 'Reading ' + fmtRange(ws, we));
    sb.from('availability').select('date,start_time,end_time,status').gte('date', iso(ws)).lte('date', iso(we)).then(function (res) {
      if (res.error) throw res.error;
      src = res.data || [];
      stEl.hidden = true;
      if (!src.length) { status('error', 'The week of ' + fmtRange(ws, we) + ' has no times to copy.'); return; }
      if (!window.confirm('Copy ' + src.length + ' time' + (src.length > 1 ? 's' : '') + ' from the week of ' + MON3[ws.getMonth()] + ' ' + ws.getDate() + ' onto the week of ' + MON3[to0.getMonth()] + ' ' + to0.getDate() + '?\nBooked times copy as open. Times already there stay.')) return;
      var out = src.map(function (r) {
        return { date: iso(addDays(parse(r.date), 7)), start_time: r.start_time, end_time: r.end_time, status: r.status === 'closed' ? 'closed' : 'open' };
      });
      var wk = 'the week of ' + MON3[to0.getMonth()] + ' ' + to0.getDate();
      return save('Copying to ' + wk, function () {
        return sb.from('availability').upsert(out, { onConflict: 'date,start_time', ignoreDuplicates: true }).select()
          .then(function (r) { r.allowEmpty = !r.error; return r; });
      }, function (added) {
        var skipped = out.length - added.length;
        return added.length
          ? 'Saved. Copied ' + added.length + ' time' + (added.length > 1 ? 's' : '') + ' to ' + wk + (skipped ? '. ' + skipped + ' were already there.' : '.')
          : 'Nothing new to copy. ' + wk.charAt(0).toUpperCase() + wk.slice(1) + ' already has these times.';
      }).then(function (added) { replaceRows(added); });
    }).catch(function (e) { if (e && e.message !== 'busy' && stEl.className.indexOf('error') < 0) status('error', friendly(e)); });
  });

  /* ═══ Tabs: Requests, Hours, Menu (id prices), Photos, Info ═══ */
  var TABS = ['requests', 'hours', 'prices', 'photos', 'info'], tabLoaded = {};
  function showTab(name, focus) {
    TABS.forEach(function (t) {
      var b = $('#tab-' + t), on = t === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      $('#t-' + t).hidden = !on;
    });
    if (focus) $('#tab-' + name).focus();
    document.querySelector('.top h1').textContent = 'Your ' + (name === 'prices' ? 'menu' : name);
    document.title = 'Your ' + (name === 'prices' ? 'menu' : name) + ' | Mar Latrice Styles';
    try { sessionStorage.setItem('ml-admin-tab', name); } catch (e) {}
    if (name === 'prices' && !tabLoaded.prices) loadPrices();
    if (name === 'photos' && !tabLoaded.photos) loadPhotos();
    if (name === 'requests') loadRequests();
    if (name === 'info' && !tabLoaded.info) loadInfo();
  }
  TABS.forEach(function (t, i) {
    var b = $('#tab-' + t);
    b.addEventListener('click', function () { showTab(t); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); showTab(TABS[(i + d + TABS.length) % TABS.length], true);
    });
  });
  function startTabs() {
    var t = 'requests'; try { t = sessionStorage.getItem('ml-admin-tab') || 'requests'; } catch (e) {}
    showTab(TABS.indexOf(t) > -1 ? t : 'requests');
    if (t !== 'requests') loadRequests(); // keeps the New count on the tab current
  }

  // Text that goes on her public site: no markup characters, same rule as the database
  function cleanText(v, max) { return String(v || '').replace(/<[^>]*>/g, '').replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
  // Descriptions keep their paragraphs (a blank line between them) and **bold**
  function cleanDesc(v, max) {
    return String(v || '').replace(/<[^>]*>/g, '').replace(/[<>"`\\]/g, '').replace(/\r/g, '').split(/\n\s*\n/)
      .map(function (p) { return p.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n\n').slice(0, max);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function field(label, input) { var w = el('div'); var l = el('label', null, label); l.htmlFor = input.id; w.appendChild(l); w.appendChild(input); return w; }
  function check(id, label, on) { var l = el('label', 'check'), i = el('input'); i.type = 'checkbox'; i.id = id; i.checked = !!on; l.appendChild(i); l.appendChild(document.createTextNode(label)); return l; }
  function minutesOf(t) { var h = String(t).match(/(\d+)\s*h/i), m = String(t).match(/(\d+)\s*m/i); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); }

  /* ═══ Menu: her categories and the services inside them ═══ */
  var cats = [], svcs = [], openSvc = null, openCat = null; // openSvc: service id or 'new:<category>'; openCat: category id or 'new'
  function loadPrices() {
    $('#prices-err').hidden = true;
    $('#prices').setAttribute('aria-busy', 'true');
    return Promise.all([sb.from('service_categories').select('*').order('sort'), sb.from('services').select('*').order('sort')]).then(function (r) {
      if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error;
      cats = r[0].data || []; svcs = r[1].data || []; tabLoaded.prices = true;
      $('#prices').removeAttribute('aria-busy');
      renderPrices();
    }).catch(function (e) {
      $('#prices-err-text').textContent = 'Couldn\'t load your menu. ' + friendly(e).replace(' Nothing was saved.', '');
      $('#prices-err').hidden = false; $('#prices').replaceChildren();
    });
  }
  $('#prices-retry').addEventListener('click', loadPrices);
  function catOf(id) { return cats.filter(function (c) { return c.id === id; })[0]; }
  function svcsOf(cid) { return svcs.filter(function (x) { return x.category_id === cid; }).sort(function (a, b) { return a.sort - b.sort; }); }
  function priceText(x) { return '$' + x.price + (x.plus ? '+' : ''); }
  function metaText(x, c) { return (c && c.addon ? 'Add-on' : x.deposit == null ? 'No deposit' : 'Deposit $' + x.deposit) + ' · ' + x.duration + (x.hidden ? ' · Hidden' : ''); }
  function renderPrices() {
    var box = $('#prices'), frag = document.createDocumentFragment();
    cats.forEach(function (c) {
      var list = svcsOf(c.id), card = el('section', 'card svc');
      var head = el('div', 'svc-head'); head.appendChild(el('h2', null, c.name));
      head.appendChild(el('span', 'svc-from', c.hidden ? 'Hidden' : list.length + (list.length === 1 ? ' service' : ' services')));
      card.appendChild(head);
      if (c.note) card.appendChild(el('p', 'hint cat-note', c.note));
      if (openCat === c.id) card.appendChild(catForm(c));
      else { var ed = el('button', 'link cat-edit', 'Edit this category'); ed.type = 'button'; ed.dataset.catedit = c.id; card.appendChild(ed); }
      var ul = el('ul', 'opts');
      list.forEach(function (x, i) {
        var li = el('li'), b = el('button', 'opt-row' + (x.hidden ? ' is-hidden' : ''));
        b.type = 'button'; b.dataset.id = x.id; b.setAttribute('aria-expanded', openSvc === x.id ? 'true' : 'false');
        b.appendChild(el('span', 'on', x.name)); b.appendChild(el('span', 'op', priceText(x)));
        b.appendChild(el('span', 'ot', metaText(x, c)));
        li.appendChild(b);
        if (openSvc === x.id) li.appendChild(svcForm(c, x, i, list.length));
        ul.appendChild(li);
      });
      card.appendChild(ul);
      if (openSvc === 'new:' + c.id) card.appendChild(svcForm(c, null, list.length, list.length));
      else { var add = el('button', 'btn-ghost add-opt', c.addon ? 'Add an add-on' : 'Add a service'); add.type = 'button'; add.dataset.add = c.id; card.appendChild(add); }
      frag.appendChild(card);
    });
    if (openCat === 'new') { var nc = el('section', 'card svc'); nc.appendChild(catForm(null)); frag.appendChild(nc); }
    else { var ac = el('button', 'btn-ghost add-cat', 'Add a category'); ac.type = 'button'; ac.dataset.catedit = 'new'; frag.appendChild(ac); }
    box.replaceChildren(frag);
  }
  function svcForm(c, x, idx, count) {
    var f = el('form', 'opt-form'); f.noValidate = true; f.dataset.cat = c.id; if (x) f.dataset.id = x.id;
    f.appendChild(el('h3', null, x ? 'Change ' + x.name : c.addon ? 'New add-on' : 'New ' + c.name + ' service'));
    var n = el('input'); n.type = 'text'; n.id = 'sf-name'; n.maxLength = 60; n.value = x ? x.name : ''; n.autocomplete = 'off';
    f.appendChild(field('Name', n));
    var two = el('div', 'two');
    var pw = el('div', 'money'), p = el('input'); p.type = 'text'; p.inputMode = 'numeric'; p.id = 'sf-price'; p.value = x ? x.price : ''; p.autocomplete = 'off'; pw.appendChild(p);
    var pl = el('label', null, 'Price'); pl.htmlFor = 'sf-price'; var pwrap = el('div'); pwrap.appendChild(pl); pwrap.appendChild(pw); two.appendChild(pwrap);
    if (!c.addon) {
      var dw = el('div', 'money'), d = el('input'); d.type = 'text'; d.inputMode = 'numeric'; d.id = 'sf-dep'; d.value = x && x.deposit != null ? x.deposit : ''; d.placeholder = 'None'; d.autocomplete = 'off'; dw.appendChild(d);
      var dl = el('label', null, 'Deposit'); dl.htmlFor = 'sf-dep'; var dwrap = el('div'); dwrap.appendChild(dl); dwrap.appendChild(dw); two.appendChild(dwrap);
    }
    f.appendChild(two);
    f.appendChild(check('sf-plus', 'Starting price (shows a + after it)', x && x.plus));
    var t = el('input'); t.type = 'text'; t.id = 'sf-dur'; t.maxLength = 30; t.value = x ? x.duration : ''; t.placeholder = 'Like 1 hr 30 min'; t.autocomplete = 'off';
    f.appendChild(field('How long it takes', t));
    var ds = el('textarea'); ds.id = 'sf-desc'; ds.rows = 6; ds.maxLength = 1500; ds.value = x ? x.description : '';
    f.appendChild(field('Description', ds));
    f.appendChild(el('p', 'hint', 'Leave a blank line between paragraphs. Put ** on both sides of words to make them bold, like **Hair is not included.**'));
    f.appendChild(check('sf-hidden', 'Hide from my site for now', x && x.hidden));
    var err = el('p', 'field-err'); err.setAttribute('role', 'alert'); err.hidden = true; f.appendChild(err);
    var row = el('div', 'row'), sv = el('button', 'btn', 'Save'), cn = el('button', 'btn-ghost', 'Cancel');
    sv.type = 'submit'; cn.type = 'button'; cn.dataset.cancel = '1'; row.appendChild(sv); row.appendChild(cn); f.appendChild(row);
    if (x) {
      var r3 = el('div', 'row3'), up = el('button', null, '↑ Up'), dn = el('button', null, '↓ Down'), rm = el('button', 'rm-btn', 'Remove');
      [up, dn, rm].forEach(function (b) { b.type = 'button'; });
      up.dataset.move = '-1'; dn.dataset.move = '1'; rm.dataset.remove = '1'; up.disabled = idx === 0; dn.disabled = idx >= count - 1;
      r3.appendChild(up); r3.appendChild(dn); r3.appendChild(rm); f.appendChild(r3);
    }
    setTimeout(function () { n.focus(); f.scrollIntoView({ behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth', block: 'center' }); }, 30);
    return f;
  }
  function catForm(c) {
    var f = el('form', 'opt-form cat-form'); f.noValidate = true; f.dataset.cat = c ? c.id : 'new';
    f.appendChild(el('h3', null, c ? 'Change ' + c.name : 'New category'));
    var n = el('input'); n.type = 'text'; n.id = 'cf-name'; n.maxLength = 40; n.value = c ? c.name : ''; n.autocomplete = 'off'; n.placeholder = 'Like Healthy Hair Collection';
    f.appendChild(field('Name', n));
    var note = el('input'); note.type = 'text'; note.id = 'cf-note'; note.maxLength = 120; note.value = c ? c.note : ''; note.autocomplete = 'off'; note.placeholder = 'Like Hair is not included.';
    f.appendChild(field('Short note under the name (optional)', note));
    f.appendChild(check('cf-addon', 'These are add-ons that go with a service', c && c.addon));
    f.appendChild(check('cf-hidden', 'Hide from my site for now', c && c.hidden));
    var err = el('p', 'field-err'); err.setAttribute('role', 'alert'); err.hidden = true; f.appendChild(err);
    var row = el('div', 'row'), sv = el('button', 'btn', 'Save'), cn = el('button', 'btn-ghost', 'Cancel');
    sv.type = 'submit'; cn.type = 'button'; cn.dataset.catcancel = '1'; row.appendChild(sv); row.appendChild(cn); f.appendChild(row);
    if (c) {
      var i = cats.indexOf(c), r2 = el('div', 'row2'), up = el('button', null, '↑ Earlier'), dn = el('button', null, '↓ Later');
      up.type = dn.type = 'button'; up.dataset.catmove = '-1'; dn.dataset.catmove = '1'; up.disabled = i === 0; dn.disabled = i >= cats.length - 1;
      r2.appendChild(up); r2.appendChild(dn); f.appendChild(r2);
    }
    setTimeout(function () { n.focus(); f.scrollIntoView({ behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth', block: 'center' }); }, 30);
    return f;
  }
  function slugFor(name, taken) {
    var b = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item', id = b, n = 2;
    while (taken(id)) id = b + '-' + n++;
    return id.length < 2 ? id + '-1' : id;
  }
  function copyRow(x) { var o = {}; Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return o; }
  $('#prices').addEventListener('click', function (e) {
    var ce = e.target.closest('[data-catedit]'), cc = e.target.closest('[data-catcancel]'), cm = e.target.closest('[data-catmove]');
    if (ce) { openCat = ce.dataset.catedit; openSvc = null; renderPrices(); return; }
    if (cc) { openCat = null; renderPrices(); return; }
    if (cm) {
      var c = catOf(cm.closest('.cat-form').dataset.cat), list = cats.slice(), i = list.indexOf(c), j = i + Number(cm.dataset.catmove); if (!list[j]) return;
      list[i] = list[j]; list[j] = c;
      var ups = list.map(function (x, k) { var o = copyRow(x); o.sort = (k + 1) * 10; return o; });
      save('Moving ' + c.name, function () { return sb.from('service_categories').upsert(ups).select(); }, 'Saved. ' + c.name + ' moved on your site.').then(function (d) {
        d.forEach(function (x) { var k = cats.map(function (y) { return y.id; }).indexOf(x.id); if (k > -1) cats[k] = x; });
        cats.sort(function (a, b) { return a.sort - b.sort; }); renderPrices();
      }, function () {});
      return;
    }
    var row = e.target.closest('.opt-row'), add = e.target.closest('[data-add]'), f = e.target.closest('.opt-form');
    if (row) { openSvc = openSvc === row.dataset.id ? null : row.dataset.id; openCat = null; renderPrices(); return; }
    if (add) { openSvc = 'new:' + add.dataset.add; openCat = null; renderPrices(); return; }
    if (!f || f.classList.contains('cat-form')) return;
    var b = e.target.closest('button'); if (!b) return;
    var x = svcs.filter(function (y) { return y.id === f.dataset.id; })[0];
    if (b.dataset.cancel) { openSvc = null; renderPrices(); return; }
    if (b.dataset.move && x) {
      var l2 = svcsOf(x.category_id), a2 = l2.indexOf(x), j2 = a2 + Number(b.dataset.move), other = l2[j2]; if (!other) return;
      l2[a2] = other; l2[j2] = x;
      var rows = l2.map(function (y, k) { var o = copyRow(y); o.sort = (k + 1) * 10; return o; });
      save('Moving ' + x.name, function () { return sb.from('services').upsert(rows).select(); }, 'Saved. ' + x.name + ' moved.').then(mergeSvcs, function () {});
      return;
    }
    if (b.dataset.remove && x) {
      if (!window.confirm('Remove ' + x.name + ' (' + priceText(x) + ') from your menu? To keep it for later, tick Hide instead.')) return;
      save('Removing ' + x.name, function () { return sb.from('services').delete().eq('id', x.id).select(); }, 'Saved. ' + x.name + ' removed.').then(function () {
        svcs = svcs.filter(function (y) { return y.id !== x.id; }); openSvc = null; renderPrices();
      }, function () {});
    }
  });
  $('#prices').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = f.querySelector('.field-err');
    function bad(sel, msg) { err.textContent = msg; err.hidden = false; var i = f.querySelector(sel); i.setAttribute('aria-invalid', 'true'); i.focus(); }
    if (f.classList.contains('cat-form')) {
      var isNew = f.dataset.cat === 'new', cur = catOf(f.dataset.cat);
      var name = cleanText(f.querySelector('#cf-name').value, 40); if (!name) return bad('#cf-name', 'Give this category a name.');
      var row = { name: name, note: cleanText(f.querySelector('#cf-note').value, 120), addon: f.querySelector('#cf-addon').checked, hidden: f.querySelector('#cf-hidden').checked, updated_at: new Date().toISOString() };
      if (isNew) {
        row.id = slugFor(name, function (id) { return !!catOf(id); }).slice(0, 24); row.sort = cats.length ? cats[cats.length - 1].sort + 10 : 10;
        save('Adding ' + name, function () { return sb.from('service_categories').insert(row).select(); }, 'Saved. Now add a service so ' + name + ' shows on your site.')
          .then(function (d) { cats.push(d[0]); openCat = null; openSvc = 'new:' + d[0].id; renderPrices(); }, function () {});
      } else {
        save('Saving ' + name, function () { return sb.from('service_categories').update(row).eq('id', cur.id).select(); }, row.hidden ? 'Saved. ' + name + ' is hidden from your site.' : 'Saved. ' + name + ' is on your site.')
          .then(function (d) { cats[cats.indexOf(cur)] = d[0]; openCat = null; renderPrices(); }, function () {});
      }
      return;
    }
    var c = catOf(f.dataset.cat), id = f.dataset.id, x = svcs.filter(function (y) { return y.id === id; })[0];
    var nm = cleanText(f.querySelector('#sf-name').value, 60), dur = cleanText(f.querySelector('#sf-dur').value, 30);
    var raw = f.querySelector('#sf-price').value.replace(/[$,\s+]/g, ''), price = /^\d{1,4}$/.test(raw) ? +raw : NaN;
    var depIn = f.querySelector('#sf-dep'), depRaw = depIn ? depIn.value.replace(/[$,\s]/g, '') : '', dep = depRaw === '' ? null : /^\d{1,3}$/.test(depRaw) ? +depRaw : NaN;
    if (!nm) return bad('#sf-name', 'Give this service a name.');
    if (!(price >= 0 && price <= 3000)) return bad('#sf-price', 'Type the price in whole dollars, like 85.');
    if (dep !== null && !(dep >= 0 && dep <= 500)) return bad('#sf-dep', 'Type the deposit in whole dollars, like 20, or leave it empty.');
    if (!dur || !minutesOf(dur)) return bad('#sf-dur', 'Say how long it takes, like 1 hr 30 min.');
    var row2 = { category_id: c.id, name: nm, price: price, plus: f.querySelector('#sf-plus').checked, deposit: c.addon ? null : dep, duration: dur, minutes: minutesOf(dur),
      description: cleanDesc(f.querySelector('#sf-desc').value, 1500), hidden: f.querySelector('#sf-hidden').checked, updated_at: new Date().toISOString() };
    if (x) {
      save('Saving ' + nm, function () { return sb.from('services').update(row2).eq('id', x.id).select(); }, 'Saved. ' + nm + ' is ' + priceText(row2) + ' on your site.')
        .then(function (d) { openSvc = null; mergeSvcs(d); }, function () {});
    } else {
      var l3 = svcsOf(c.id); row2.sort = l3.length ? l3[l3.length - 1].sort + 10 : 10;
      row2.slug = slugFor(nm, function (sl) { return svcs.some(function (y) { return y.slug === sl; }); });
      save('Adding ' + nm, function () { return sb.from('services').insert(row2).select(); }, 'Saved. ' + nm + ' is on your site.')
        .then(function (d) { openSvc = null; mergeSvcs(d); }, function () {});
    }
  });
  // A field marked wrong clears as soon as she edits it
  ['#prices', '#photo-edit'].forEach(function (sel) {
    $(sel).addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
      var f = e.target.closest('form'), er = f && f.querySelector('.field-err'); if (er) er.hidden = true;
    });
  });
  function mergeSvcs(rows) {
    rows.forEach(function (r) { var k = svcs.map(function (x) { return x.id; }).indexOf(r.id); if (k > -1) svcs[k] = r; else svcs.push(r); });
    renderPrices();
  }

  /* ═══ Requests ═══
     Clients send a request from the booking page (submit_booking_request in requests-faq.sql).
     Confirm marks the request confirmed and the matching open time booked, so nobody else can pick it. */
  var reqs = [], reqFilter = 'new', reqSeq = 0, openReq = null, moved = {}, openSlots = null;
  var IOS = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  function loadRequests() {
    var seq = ++reqSeq;
    $('#req-err').hidden = true;
    return sb.from('booking_requests').select('*').order('appt_date').order('appt_time').limit(500).then(function (res) {
      if (seq !== reqSeq) return;
      if (res.error) throw res.error;
      reqs = res.data || []; tabLoaded.requests = true;
      $('#reqs').removeAttribute('aria-busy');
      renderRequests();
      loadStats();
    }).catch(function (e) {
      if (seq !== reqSeq) return;
      $('#req-err-text').textContent = 'Couldn\'t load your requests. ' + friendly(e).replace(' Nothing was saved.', '');
      $('#req-err').hidden = false;
      if (!reqs.length) $('#reqs').replaceChildren();
    });
  }
  $('#req-retry').addEventListener('click', loadRequests);
  // Client details don't pile up: requests for appointments more than 90 days back are deleted
  var cleaned = false;
  function cleanup() {
    if (cleaned) return; cleaned = true;
    sb.from('booking_requests').delete().lt('appt_date', iso(addDays(today, -90))).then(function () {}, function () {});
  }

  /* ─── Last 7 days: visits, booking opens and requests (counts only, nothing about the visitor) ─── */
  function loadStats() {
    var from = iso(addDays(today, -6));
    sb.from('visit_stats').select('day,kind,n').gte('day', from).then(function (res) {
      if (res.error) { $('#stats').hidden = true; return; }
      var tot = { visit: 0, booking: 0, request: 0 }, per = {};
      (res.data || []).forEach(function (x) { tot[x.kind] = (tot[x.kind] || 0) + x.n; if (x.kind === 'visit') per[x.day] = x.n; });
      $('#st-visit').textContent = tot.visit; $('#st-booking').textContent = tot.booking; $('#st-request').textContent = tot.request;
      var days = [], max = 1;
      for (var i = 6; i >= 0; i--) { var d = addDays(today, -i), k = iso(d); days.push([d, per[k] || 0]); max = Math.max(max, per[k] || 0); }
      var bars = $('#st-bars'); bars.replaceChildren();
      days.forEach(function (x) { var b = el('span'), f = el('i'); f.style.height = Math.max(4, Math.round(x[1] / max * 100)) + '%'; b.appendChild(f); b.appendChild(el('b', null, DAYS[x[0].getDay()].charAt(0))); bars.appendChild(b); });
      $('#stats-sub').textContent = tot.visit ? 'Counts only. Nothing about who visited.' : 'Counting started. Visits show here as people come by.';
      $('#stats').hidden = false;
    }, function () { $('#stats').hidden = true; });
  }

  /* ─── Request alerts on her phone (Web Push). On iPhone this works once the panel is on her Home Screen. ─── */
  var VAPID = cfg.vapidKey || '';
  var IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent);
  var STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var CAN_PUSH = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var swReg = null, pushSub = null;
  function keyBytes(k) { var s = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function alertsBtn(label, act, cls) { var b = el('button', cls || 'btn-ghost', label); b.type = 'button'; b.dataset.alert = act; $('#alerts-btns').appendChild(b); return b; }
  function renderAlerts() {
    var box = $('#alerts'), txt = $('#alerts-text'); $('#alerts-btns').replaceChildren();
    if (!VAPID) { box.hidden = true; return; }
    if (!CAN_PUSH) {
      if (IPHONE && !STANDALONE) { txt.textContent = 'Get a ping on your iPhone when a new request comes in. First put this panel on your Home Screen: tap the Share button, then Add to Home Screen. Open the panel from that icon and turn alerts on here.'; box.hidden = false; }
      else box.hidden = true;
      return;
    }
    box.hidden = false;
    if (Notification.permission === 'denied') { txt.textContent = 'Alerts are blocked for this panel. Turn them on in your phone\'s Settings, under Notifications.'; return; }
    if (pushSub && Notification.permission === 'granted') {
      txt.textContent = 'Alerts are on for this phone. You get a ping when a new request comes in.';
      alertsBtn('Send a test alert', 'test'); alertsBtn('Turn off', 'off', 'btn-ghost quiet');
    } else {
      txt.textContent = 'Get a ping on this phone when a new request comes in.';
      alertsBtn('Turn on alerts', 'on', 'btn');
    }
  }
  function startAlerts() {
    if (!VAPID || !CAN_PUSH) { renderAlerts(); return; }
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).then(function (reg) {
      swReg = reg; return reg.pushManager.getSubscription();
    }).then(function (sub) { pushSub = sub; renderAlerts(); }, function () { $('#alerts').hidden = true; });
  }
  $('#alerts-btns').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-alert]'); if (!b || busy) return;
    var act = b.dataset.alert;
    if (act === 'on') {
      status('saving', 'Turning on alerts');
      Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw { msg: 'Alerts stay off. Your phone asked and the answer was no.' };
        return (swReg || navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
      }).then(function (sub) {
        pushSub = sub; var j = sub.toJSON();
        return sb.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }).select();
      }).then(function (res) {
        if (res.error && res.error.code !== '23505') throw res.error;
        status('saved', 'Alerts are on. Send a test alert to check.'); renderAlerts();
      }).catch(function (err) {
        // Browser-side failures (no push support, blocked) are DOMExceptions, not database errors
        var browser = err && typeof err.name === 'string' && !err.code && /Error$|NotAllowed|Abort|NotSupported|InvalidState/.test(err.name);
        status('error', err && err.msg ? err.msg : browser ? 'This browser couldn\'t turn on alerts. On iPhone, open the panel from its Home Screen icon and try again.' : friendly(err));
        renderAlerts();
      });
    } else if (act === 'test') {
      status('saving', 'Sending a test alert');
      sb.auth.getSession().then(function (r) {
        var tok = r.data.session && r.data.session.access_token;
        return fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ test: true }) });
      }).then(function (r) {
        if (r.status === 503) throw { msg: 'Alerts are not finished on the server yet. Ty needs to add the alert keys.' };
        if (!r.ok) throw { msg: 'The test alert didn\'t send. Try again in a minute.' };
        return r.json();
      }).then(function (j) { status('saved', j.sent ? 'Test sent. It should show up on your phone in a few seconds.' : 'No phone took the alert. Turn alerts off, then on again.'); })
        .catch(function (err) { status('error', err && err.msg ? err.msg : friendly(err)); });
    } else if (act === 'off') {
      var ep = pushSub && pushSub.endpoint;
      status('saving', 'Turning off alerts');
      (pushSub ? pushSub.unsubscribe() : Promise.resolve()).then(function () {
        return ep ? sb.from('push_subscriptions').delete().eq('endpoint', ep).select() : { data: [] };
      }).then(function () { pushSub = null; status('saved', 'Alerts are off for this phone.'); renderAlerts(); })
        .catch(function (err) { status('error', friendly(err)); });
    }
  });
  $('#req-refresh').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Checking';
    loadRequests().finally(function () { b.disabled = false; b.textContent = 'Check for new requests'; });
  });
  // Coming back to the panel from Messages or Calendar: check for new ones
  document.addEventListener('visibilitychange', function () { if (!document.hidden && tabLoaded.requests && !$('#v-panel').hidden) loadRequests(); });

  function isPast(r) { return r.appt_date < TODAY; }
  function bucket(r) { return r.status === 'new' && !isPast(r) ? 'new' : r.status === 'confirmed' && !isPast(r) ? 'confirmed' : 'past'; }
  function phonePretty(d) { return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6); }
  function durText(m) { var h = Math.floor(m / 60), mm = m % 60; return (h ? h + ' hr' + (h > 1 ? 's' : '') : '') + (h && mm ? ' ' : '') + (mm ? mm + ' min' : ''); }
  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) + ' day' + (Math.round(m / 1440) > 1 ? 's' : '') + ' ago';
  }
  function when(r) { return fmtDay(parse(r.appt_date)) + ' at ' + fmtTime(r.appt_time); }
  function firstName(r) { return r.name.split(' ')[0]; }
  function smsHref(r, body) { return 'sms:+1' + r.phone + (body ? (IOS ? '&' : '?') + 'body=' + encodeURIComponent(body) : ''); }
  function confirmText(r) {
    var d = parse(r.appt_date);
    return 'Hi ' + firstName(r) + ', this is Mar Latrice. You are confirmed for ' + r.style + ' on ' + DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ' at ' + fmtTime(r.appt_time) + ' at 10601 W Oklahoma Ave # X17, West Allis. Text me if you are running late.';
  }
  function movedText(r) {
    var d = parse(r.appt_date);
    return 'Hi ' + firstName(r) + ', this is Mar Latrice. Your appointment moved to ' + DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ' at ' + fmtTime(r.appt_time) + ', same place: 10601 W Oklahoma Ave # X17, West Allis.';
  }
  function icsHref(r) {
    var q = new URLSearchParams({ id: r.id, date: r.appt_date, time: hm(r.appt_time), dur: r.duration_min, name: r.name, style: r.style, addons: r.addons || '',
      total: r.total, plus: r.total_plus ? '1' : '0', phone: r.phone, paid: r.deposit_paid ? '2' : r.paid_said ? '1' : '0', notes: r.notes || '',
      seq: Math.floor(new Date(r.updated_at || r.created_at).getTime() / 1000) });
    return '/api/ics?' + q.toString();
  }
  var PILL = { new: 'New', confirmed: 'Confirmed', done: 'Done', declined: 'Declined' };
  function renderRequests() {
    var n = { new: 0, confirmed: 0, past: 0 };
    reqs.forEach(function (r) { n[bucket(r)]++; });
    $('#n-new').textContent = n.new; $('#n-confirmed').textContent = n.confirmed;
    var tn = $('#tab-n'); tn.textContent = n.new; tn.hidden = !n.new;
    $('#tab-requests').setAttribute('aria-label', 'Requests' + (n.new ? ', ' + n.new + ' new' : ''));
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.f === reqFilter ? 'true' : 'false'); });
    var list = reqs.filter(function (r) { return bucket(r) === reqFilter; });
    if (reqFilter === 'past') list = list.reverse().slice(0, 60);
    var box = $('#reqs'), frag = document.createDocumentFragment();
    if (!list.length) {
      var em = el('div', 'card rq-empty');
      em.appendChild(el('h2', null, reqFilter === 'new' ? 'No new requests' : reqFilter === 'confirmed' ? 'Nothing confirmed yet' : 'Nothing here yet'));
      em.appendChild(el('p', null, reqFilter === 'new' ? 'When a client sends a request from your booking page, it shows up here.' : reqFilter === 'confirmed' ? 'Confirm a new request and it moves here, with its calendar button.' : 'Finished, declined and past requests show here.'));
      frag.appendChild(em);
    }
    list.forEach(function (r) { frag.appendChild(reqCard(r)); });
    box.replaceChildren(frag);
  }
  function reqCard(r) {
    var c = el('article', 'card rq rq-' + r.status); c.dataset.id = r.id;
    var top = el('div', 'rq-top');
    top.appendChild(el('span', 'pill pill-' + r.status, isPast(r) && r.status === 'new' ? 'Missed' : PILL[r.status]));
    top.appendChild(el('span', 'rq-ago', 'Sent ' + ago(r.created_at) + (r.sent_by === 'deposit' ? ' with the deposit' : ' by text')));
    c.appendChild(top);
    c.appendChild(el('h3', 'rq-name', r.name));
    c.appendChild(el('p', 'rq-when', when(r)));
    var dl = el('dl', 'rq-dl');
    function row(k, v) { if (!v) return; var d = el('div'); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', null, v)); dl.appendChild(d); }
    row('Style', r.style); row('Add-ons', r.addons); row('Takes about', durText(r.duration_min));
    row('Total', '$' + r.total + (r.total_plus ? '+' : ''));
    // Deposit: Stripe's word beats the client's. She marks cash or Cash App deposits herself.
    var dep = el('div', 'rq-dep' + (r.deposit_paid ? ' paid' : '')), dd = el('dd');
    var amt = r.deposit == null ? '' : '$' + r.deposit + ': ';
    dd.appendChild(el('span', null, r.deposit == null && !r.deposit_paid ? 'No deposit listed' : r.deposit_paid ? (r.stripe_session ? 'Paid' + (r.deposit_cents ? ' $' + (r.deposit_cents / 100) : '') + ', confirmed by Stripe' : amt + 'marked paid by you')
      : r.paid_said ? amt + 'client says paid. Stripe has not confirmed it yet.' : amt + 'not paid yet'));
    if (!isPast(r) && (r.status === 'new' || r.status === 'confirmed') && !r.stripe_session) {
      var mk = el('button', 'link', r.deposit_paid ? 'Undo' : 'Mark paid'); mk.type = 'button'; mk.dataset.act = r.deposit_paid ? 'unpaid' : 'paid'; dd.appendChild(mk);
    }
    dep.appendChild(el('dt', null, 'Deposit')); dep.appendChild(dd); dl.appendChild(dep);
    row('Phone', phonePretty(r.phone)); row('Notes', r.notes);
    c.appendChild(dl);
    var acts = el('div', 'rq-acts');
    function btn(label, cls, act) { var b = el('button', cls, label); b.type = 'button'; b.dataset.act = act; acts.appendChild(b); return b; }
    function link(label, cls, href) { var a = el('a', cls, label); a.href = href; acts.appendChild(a); return a; }
    if (r.status === 'new' && !isPast(r)) {
      btn('Confirm', 'btn', 'confirm');
      link('Text ' + firstName(r), 'btn-ghost', smsHref(r));
      btn('Decline', 'btn-ghost quiet', 'decline');
    } else if (r.status === 'confirmed' && !isPast(r)) {
      var cal = link('Add to Apple Calendar', 'btn cal', icsHref(r));
      cal.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>');
      if (moved[r.id]) link('Text ' + firstName(r) + ' the new time', 'btn-ghost', smsHref(r, movedText(r)));
      else link('Text ' + firstName(r) + ' the confirmation', 'btn-ghost', smsHref(r, confirmText(r)));
      if (openReq === r.id) acts.appendChild(moveForm(r));
      var r2 = el('div', 'row3'); acts.appendChild(r2);
      [['Move time', 'move'], ['Mark done', 'done'], ['Cancel', 'cancel']].forEach(function (x) { var b = el('button', x[1] === 'cancel' ? 'rm-btn' : null, x[0]); b.type = 'button'; b.dataset.act = x[1]; if (x[1] === 'move') b.setAttribute('aria-expanded', openReq === r.id ? 'true' : 'false'); r2.appendChild(b); });
    } else {
      var r3 = el('div', 'row2'); acts.appendChild(r3);
      if (r.status !== 'done' && !isPast(r)) { var b1 = el('button', null, 'Move back to new'); b1.type = 'button'; b1.dataset.act = 'reopen'; r3.appendChild(b1); }
      var b2 = el('button', 'rm-btn', 'Delete'); b2.type = 'button'; b2.dataset.act = 'delete'; r3.appendChild(b2);
    }
    c.appendChild(acts);
    return c;
  }
  document.querySelector('.seg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]'); if (!b) return;
    reqFilter = b.dataset.f; renderRequests();
  });
  function setStatus(r, st) { return sb.from('booking_requests').update({ status: st, updated_at: new Date().toISOString() }).eq('id', r.id).select(); }
  function slot(r, from, to) { // the matching time on her calendar
    return sb.from('availability').update({ status: to }).eq('date', r.appt_date).eq('start_time', r.appt_time).eq('status', from).select();
  }
  /* Move a confirmed booking: pick another open time. The old time opens again, the new one is booked. */
  function moveForm(r) {
    var f = el('form', 'opt-form mv'); f.noValidate = true; f.dataset.id = r.id;
    f.appendChild(el('h3', null, 'Move to another time'));
    if (!openSlots) { var w = el('p', 'wait'); w.appendChild(el('span', 'spin')); w.appendChild(document.createTextNode('Loading your open times')); f.appendChild(w); return f; }
    var days = {}; openSlots.forEach(function (s) { (days[s.date] = days[s.date] || []).push(s); });
    var keys = Object.keys(days).sort();
    if (!keys.length) { f.appendChild(el('p', 'hint', 'You have no open times coming up. Open a time on your Hours tab first.')); return f; }
    var ds = el('select'); ds.id = 'mv-day';
    keys.forEach(function (k) { var o = el('option', null, fmtDay(parse(k)) + ' (' + days[k].length + ' open)'); o.value = k; ds.appendChild(o); });
    var ts = el('select'); ts.id = 'mv-time';
    function fill() { ts.replaceChildren(); days[ds.value].forEach(function (s) { var o = el('option', null, fmtTime(s.start_time)); o.value = s.start_time; ts.appendChild(o); }); }
    ds.addEventListener('change', fill); fill();
    f.appendChild(field('Day', ds)); f.appendChild(field('Time', ts));
    var row = el('div', 'row'), sv = el('button', 'btn', 'Move it'), cn = el('button', 'btn-ghost', 'Cancel');
    sv.type = 'submit'; cn.type = 'button'; cn.dataset.act = 'move'; row.appendChild(sv); row.appendChild(cn); f.appendChild(row);
    return f;
  }
  $('#reqs').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, r = reqs.filter(function (x) { return x.id === f.dataset.id; })[0]; if (!r) return;
    var nd = f.querySelector('#mv-day').value, nt = f.querySelector('#mv-time').value, old = { appt_date: r.appt_date, appt_time: r.appt_time };
    if (nd === r.appt_date && hm(nt) === hm(r.appt_time)) { openReq = null; renderRequests(); return; }
    var label = fmtDay(parse(nd)) + ' at ' + fmtTime(nt);
    save('Moving to ' + label, function () {
      return sb.from('booking_requests').update({ appt_date: nd, appt_time: nt, updated_at: new Date().toISOString() }).eq('id', r.id).select().then(function (res) {
        if (res.error || !(res.data || []).length) return res;
        return slot(old, 'booked', 'open').then(function () { return slot({ appt_date: nd, appt_time: nt }, 'open', 'booked'); }).then(function () { return res; });
      });
    }, 'Moved to ' + label + '. Text ' + firstName(r) + ' the new time and add it to your calendar again.').then(function (rows) {
      mergeReq(rows); moved[r.id] = true; openReq = null; openSlots = null; renderRequests(); markHoursStale();
    }, function () {});
  });
  function mergeReq(rows) { rows.forEach(function (x) { for (var i = 0; i < reqs.length; i++) if (reqs[i].id === x.id) reqs[i] = x; }); }
  $('#reqs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var card = b.closest('.rq'), r = reqs.filter(function (x) { return x.id === card.dataset.id; })[0]; if (!r) return;
    var act = b.dataset.act, slotNote = '';
    if (act === 'move') {
      openReq = openReq === r.id ? null : r.id; renderRequests();
      if (openReq && !openSlots) {
        sb.from('availability').select('date,start_time').eq('status', 'open').gte('date', TODAY).lte('date', iso(addDays(today, 90))).order('date').order('start_time').then(function (res) {
          openSlots = res.error ? [] : (res.data || []); renderRequests();
        });
      }
      return;
    }
    if (act === 'paid' || act === 'unpaid') {
      save(act === 'paid' ? 'Marking the deposit paid' : 'Undoing', function () {
        return sb.from('booking_requests').update({ deposit_paid: act === 'paid', deposit_paid_at: act === 'paid' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', r.id).select();
      }, act === 'paid' ? 'Deposit marked paid.' : 'Deposit marked not paid.').then(function (rows) { mergeReq(rows); renderRequests(); }, function () {});
      return;
    }
    if (act === 'confirm') {
      save('Confirming ' + r.name, function () {
        return setStatus(r, 'confirmed').then(function (res) {
          if (res.error || !(res.data || []).length) return res;
          // Book the time on her site. If she already booked or removed it, the request still confirms.
          return slot(r, 'open', 'booked').then(function (s2) {
            slotNote = s2.error ? ' Check that time on your Hours tab.' : (s2.data || []).length ? ' The time shows as booked on your site.' : ' That time was not open on your calendar, so check your Hours tab.';
            return res;
          });
        });
      }, function () { return 'Confirmed.' + slotNote; }).then(function (rows) {
        mergeReq(rows); reqFilter = 'confirmed'; renderRequests(); markHoursStale();
        var c2 = document.querySelector('.rq[data-id="' + r.id + '"] .cal'); if (c2) c2.focus();
      }, function () {});
    } else if (act === 'decline') {
      if (!window.confirm('Decline ' + r.name + '\'s request for ' + when(r) + '? The time stays open on your site. Text ' + firstName(r) + ' to let them know.')) return;
      save('Declining', function () { return setStatus(r, 'declined'); }, 'Declined. The time is still open.').then(function (rows) { mergeReq(rows); renderRequests(); }, function () {});
    } else if (act === 'done') {
      save('Marking done', function () { return setStatus(r, 'done'); }, 'Marked done.').then(function (rows) { mergeReq(rows); renderRequests(); }, function () {});
    } else if (act === 'cancel') {
      if (!window.confirm('Cancel ' + r.name + '\'s booking on ' + when(r) + '? The time opens again on your site. Delete the event from your calendar too.')) return;
      save('Canceling', function () {
        return setStatus(r, 'declined').then(function (res) {
          if (res.error || !(res.data || []).length) return res;
          return slot(r, 'booked', 'open').then(function () { return res; });
        });
      }, 'Canceled. The time is open again.').then(function (rows) { mergeReq(rows); renderRequests(); markHoursStale(); }, function () {});
    } else if (act === 'reopen') {
      save('Moving back', function () { return setStatus(r, 'new'); }, 'Moved back to new.').then(function (rows) { mergeReq(rows); reqFilter = 'new'; renderRequests(); }, function () {});
    } else if (act === 'delete') {
      if (!window.confirm('Delete ' + r.name + '\'s request for good?')) return;
      save('Deleting', function () { return sb.from('booking_requests').delete().eq('id', r.id).select(); }, 'Deleted.').then(function () {
        reqs = reqs.filter(function (x) { return x.id !== r.id; }); renderRequests();
      }, function () {});
    }
  });
  function markHoursStale() { rows = {}; loadMonth(); }

  /* ═══ Info: policies and FAQ ═══ */
  var INFO = {
    pol: { table: 'site_policies', box: '#pol-list', noun: 'policy', items: [], open: null,
      fields: [{ k: 'big', label: 'Big text', max: 14, ph: 'Like 48 hrs or 10 min' }, { k: 'title', label: 'Title', max: 40, ph: 'Like Cancel or reschedule' }, { k: 'body', label: 'What it says', max: 700, area: true }],
      head: function (x) { return x.big + ' · ' + x.title; }, sub: function (x) { return x.body; } },
    faq: { table: 'faq_items', box: '#faq-list', noun: 'question', items: [], open: null,
      fields: [{ k: 'q', label: 'Question', max: 120 }, { k: 'a', label: 'Answer', max: 500, area: true }],
      head: function (x) { return x.q; }, sub: function (x) { return x.a; } },
    rev: { table: 'reviews', box: '#rev-list', noun: 'review', items: [], open: null, noStamp: true, optional: true,
      fields: [{ k: 'name', label: 'Client name', max: 40, ph: 'First name or initials' }, { k: 'body', label: 'What they said', max: 400, area: true },
        { k: 'stars', label: 'Stars', select: [['', 'No stars'], ['5', '5 stars'], ['4', '4 stars'], ['3', '3 stars'], ['2', '2 stars'], ['1', '1 star']], num: true },
        { k: 'service', label: 'Service they got', max: 40, ph: 'Like Signature Silk Press', opt: true },
        { k: 'source', label: 'Where they said it', select: [['', 'Leave blank'], ['Text', 'Text'], ['Instagram', 'Instagram'], ['Facebook', 'Facebook'], ['Google', 'Google'], ['Square', 'Square'], ['In person', 'In person']] }],
      head: function (x) { return x.name + (x.stars ? ' · ' + x.stars + ' stars' : ''); }, sub: function (x) { return x.body; } }
  };
  function loadInfo() {
    $('#info-err').hidden = true;
    return Promise.all([INFO.pol, INFO.faq, INFO.rev].map(function (L) {
      return sb.from(L.table).select('*').order('sort').then(function (res) {
        if (res.error) { if (L.optional) { L.missing = true; return; } throw res.error; }
        L.items = res.data || [];
      });
    })).then(function () {
      tabLoaded.info = true;
      $('#rev-sec').hidden = !!INFO.rev.missing;
      ['pol', 'faq', 'rev'].forEach(function (k) { if (INFO[k].missing) return; $(INFO[k].box).removeAttribute('aria-busy'); renderInfo(k); });
    }).catch(function (e) {
      $('#info-err-text').textContent = 'Couldn\'t load your policies and FAQ. ' + friendly(e).replace(' Nothing was saved.', '');
      $('#info-err').hidden = false;
    });
  }
  $('#info-retry').addEventListener('click', loadInfo);
  function renderInfo(k) {
    var L = INFO[k], frag = document.createDocumentFragment(), ul = el('ul', 'opts');
    L.items.forEach(function (x, i) {
      var li = el('li'), b = el('button', 'opt-row info-row' + (x.hidden ? ' is-hidden' : ''));
      b.type = 'button'; b.dataset.id = x.id; b.setAttribute('aria-expanded', L.open === x.id ? 'true' : 'false');
      b.appendChild(el('span', 'on', L.head(x))); b.appendChild(el('span', 'op', x.hidden ? 'Hidden' : ''));
      b.appendChild(el('span', 'ot', L.sub(x)));
      li.appendChild(b);
      if (L.open === x.id) li.appendChild(infoForm(k, x, i));
      ul.appendChild(li);
    });
    frag.appendChild(ul);
    if (L.open === 'new') frag.appendChild(infoForm(k, null, L.items.length));
    else { var add = el('button', 'btn-ghost add-opt', 'Add a ' + L.noun); add.type = 'button'; add.dataset.add = '1'; frag.appendChild(add); }
    $(L.box).replaceChildren(frag);
  }
  function infoForm(k, x, idx) {
    var L = INFO[k], f = el('form', 'opt-form'); f.noValidate = true; if (x) f.dataset.id = x.id;
    f.appendChild(el('h3', null, x ? 'Change this ' + L.noun : 'New ' + L.noun));
    var first = null;
    L.fields.forEach(function (fd) {
      var inp;
      if (fd.select) {
        inp = el('select');
        fd.select.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; if (x && String(x[fd.k] == null ? '' : x[fd.k]) === o[0]) op.selected = true; inp.appendChild(op); });
      } else {
        inp = el(fd.area ? 'textarea' : 'input'); if (!fd.area) inp.type = 'text'; else inp.rows = 4;
        inp.maxLength = fd.max; inp.value = x ? (x[fd.k] || '') : ''; inp.autocomplete = 'off'; if (fd.ph) inp.placeholder = fd.ph;
      }
      inp.id = 'if-' + k + '-' + fd.k; inp.dataset.k = fd.k; f.appendChild(field(fd.label + (fd.opt ? ' (optional)' : ''), inp)); if (!first) first = inp;
    });
    var c = el('label', 'check'), hid = el('input'); hid.type = 'checkbox'; hid.id = 'if-' + k + '-hidden'; hid.checked = !!(x && x.hidden);
    c.appendChild(hid); c.appendChild(document.createTextNode('Hide from my site for now')); f.appendChild(c);
    var err = el('p', 'field-err'); err.setAttribute('role', 'alert'); err.hidden = true; f.appendChild(err);
    var row = el('div', 'row'), sv = el('button', 'btn', 'Save'), cn = el('button', 'btn-ghost', 'Cancel');
    sv.type = 'submit'; cn.type = 'button'; cn.dataset.cancel = '1'; row.appendChild(sv); row.appendChild(cn); f.appendChild(row);
    if (x) {
      var r3 = el('div', 'row3'), up = el('button', null, '↑ Up'), dn = el('button', null, '↓ Down'), rm = el('button', 'rm-btn', 'Remove');
      [up, dn, rm].forEach(function (b) { b.type = 'button'; });
      up.dataset.move = '-1'; dn.dataset.move = '1'; rm.dataset.remove = '1';
      up.disabled = idx === 0; dn.disabled = idx >= L.items.length - 1;
      r3.appendChild(up); r3.appendChild(dn); r3.appendChild(rm); f.appendChild(r3);
    }
    setTimeout(function () { first.focus(); f.scrollIntoView({ behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth', block: 'center' }); }, 30);
    return f;
  }
  function mergeInfo(k, list) {
    var L = INFO[k];
    list.forEach(function (r) { var i = L.items.map(function (x) { return x.id; }).indexOf(r.id); if (i > -1) L.items[i] = r; else L.items.push(r); });
    L.items.sort(function (a, b) { return a.sort - b.sort; });
    L.open = null; renderInfo(k);
  }
  ['pol', 'faq', 'rev'].forEach(function (k) {
    var L = INFO[k], box = $(L.box);
    box.addEventListener('click', function (e) {
      var row = e.target.closest('.opt-row'), add = e.target.closest('[data-add]'), f = e.target.closest('.opt-form');
      if (row) { L.open = L.open === row.dataset.id ? null : row.dataset.id; renderInfo(k); return; }
      if (add) { L.open = 'new'; renderInfo(k); return; }
      if (!f) return;
      var b = e.target.closest('button'); if (!b) return;
      var x = L.items.filter(function (y) { return y.id === f.dataset.id; })[0];
      if (b.dataset.cancel) { L.open = null; renderInfo(k); return; }
      if (b.dataset.move && x) {
        var list = L.items.slice(), i = list.indexOf(x), j = i + Number(b.dataset.move); if (!list[j]) return;
        list[i] = list[j]; list[j] = x;
        var ups = list.map(function (y, n) { var o = {}; Object.keys(y).forEach(function (key) { o[key] = y[key]; }); o.sort = (n + 1) * 10; return o; });
        save('Moving', function () { return sb.from(L.table).upsert(ups).select(); }, 'Saved. Order changed on your site.').then(function (d) { mergeInfo(k, d); L.open = x.id; renderInfo(k); }, function () {});
        return;
      }
      if (b.dataset.remove && x) {
        if (k === 'pol' && L.items.length === 1) { window.alert('Keep at least one policy. Tick "Hide from my site" to take it off instead.'); return; }
        if (!window.confirm('Remove "' + L.head(x) + '" from your site?')) return;
        save('Removing', function () { return sb.from(L.table).delete().eq('id', x.id).select(); }, 'Saved. Removed from your site.').then(function () {
          L.items = L.items.filter(function (y) { return y.id !== x.id; }); L.open = null; renderInfo(k);
        }, function () {});
      }
    });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, id = f.dataset.id, err = f.querySelector('.field-err'), row = {}, bad = null;
      L.fields.forEach(function (fd) {
        var inp = f.querySelector('[data-k="' + fd.k + '"]');
        if (fd.select) { row[fd.k] = fd.num ? (inp.value ? +inp.value : null) : inp.value; return; }
        var v = cleanText(inp.value, fd.max); row[fd.k] = v;
        if (!v && !fd.opt && !bad) bad = [inp, fd.label + ' can\'t be empty.'];
      });
      if (bad) { err.textContent = bad[1]; err.hidden = false; bad[0].setAttribute('aria-invalid', 'true'); bad[0].focus(); return; }
      row.hidden = f.querySelector('#if-' + k + '-hidden').checked; if (!L.noStamp) row.updated_at = new Date().toISOString();
      if (id) {
        save('Saving', function () { return sb.from(L.table).update(row).eq('id', id).select(); }, row.hidden ? 'Saved. Hidden from your site.' : 'Saved. It shows on your site.').then(function (d) { mergeInfo(k, d); }, function () {});
      } else {
        row.sort = L.items.length ? L.items[L.items.length - 1].sort + 10 : 10;
        save('Adding', function () { return sb.from(L.table).insert(row).select(); }, row.hidden ? 'Saved. Hidden for now.' : 'Saved. It shows on your site.').then(function (d) { mergeInfo(k, d); }, function () {});
      }
    });
    box.addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
      var f = e.target.closest('form'), er = f && f.querySelector('.field-err'); if (er) er.hidden = true;
    });
  });

  /* ═══ Photos ═══ */
  var photos = [], openPhoto = null;
  var STORE = (cfg.url || '').replace(/\/+$/, '') + '/storage/v1/object/public/gallery/';
  function thumb(p) { var m = p.src.match(/^builtin:(.+)$/); return m ? '/img/web/' + m[1] + '-800.webp' : STORE + p.src + '/800'; }
  function large(p) { var m = p.src.match(/^builtin:(.+)$/); return m ? '/img/web/' + m[1] + '-1200.webp' : STORE + p.src + '/1600'; }
  function loadPhotos() {
    $('#photos-err').hidden = true;
    return sb.from('gallery_photos').select('*').order('sort').then(function (res) {
      if (res.error) throw res.error;
      photos = res.data || []; tabLoaded.photos = true;
      $('#photo-grid').removeAttribute('aria-busy');
      renderPhotos();
    }).catch(function (e) {
      $('#photos-err-text').textContent = 'Couldn\'t load your photos. ' + friendly(e).replace(' Nothing was saved.', '');
      $('#photos-err').hidden = false; $('#photo-grid').replaceChildren();
    });
  }
  $('#photos-retry').addEventListener('click', loadPhotos);
  function sorted() { return photos.slice().sort(function (a, b) { return a.sort - b.sort; }); }
  function renderPhotos() {
    var grid = $('#photo-grid'), frag = document.createDocumentFragment(), list = sorted();
    if (!list.length) frag.appendChild(el('p', 'card empty', 'No photos yet. Tap Add photos to put your work on your site.'));
    list.forEach(function (p) {
      var b = el('button', 'ph' + (p.hidden ? ' is-hidden' : '')); b.type = 'button'; b.dataset.id = p.id;
      b.setAttribute('aria-pressed', openPhoto === p.id ? 'true' : 'false');
      b.setAttribute('aria-label', (p.caption || 'Photo') + (p.hidden ? ', hidden from your site' : '') + '. Tap to change.');
      var w = el('span', 'ph-img'), im = el('img'); im.src = thumb(p); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; w.appendChild(im); b.appendChild(w);
      if (p.hidden) b.appendChild(el('span', 'ph-badge', 'Hidden'));
      b.appendChild(el('span', 'ph-c', p.caption || 'No caption yet')); b.appendChild(el('span', 'ph-t', p.posted || ''));
      frag.appendChild(b);
    });
    grid.replaceChildren(frag);
    renderPhotoEdit();
  }
  $('#photo-grid').addEventListener('click', function (e) {
    var b = e.target.closest('.ph'); if (!b) return;
    openPhoto = openPhoto === b.dataset.id ? null : b.dataset.id; renderPhotos();
    if (openPhoto) { var pe = $('#photo-edit'); pe.scrollIntoView({ behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth', block: 'start' }); pe.focus({ preventScroll: true }); }
  });
  function opt(sel, value, label, cur) { var o = el('option', null, label); o.value = value; if (value === cur) o.selected = true; sel.appendChild(o); }
  function renderPhotoEdit() {
    var box = $('#photo-edit'), p = photos.filter(function (x) { return x.id === openPhoto; })[0];
    if (!p) { box.hidden = true; box.replaceChildren(); return; }
    var list = sorted(), i = list.indexOf(p), up = p.src.indexOf('uploads/') === 0;
    var f = el('form'); f.noValidate = true; f.dataset.id = p.id;
    var h = el('h2', null, p.caption || 'New photo'); h.id = 'pe-title'; f.appendChild(h);
    var iw = el('div', 'pe-img'), im = el('img'); im.src = large(p); im.alt = 'The photo you are changing'; iw.appendChild(im); f.appendChild(iw);
    var c = el('input'); c.type = 'text'; c.id = 'pe-cap'; c.maxLength = 80; c.value = p.caption; c.placeholder = 'Like Fresh silk press'; c.autocomplete = 'off';
    f.appendChild(field('Caption', c));
    var dt = el('input'); dt.type = 'text'; dt.id = 'pe-posted'; dt.maxLength = 20; dt.value = p.posted || ''; dt.placeholder = 'Like Oct 11, 2026'; dt.autocomplete = 'off';
    f.appendChild(field('Date (optional)', dt));
    var lk = el('input'); lk.type = 'url'; lk.id = 'pe-link'; lk.maxLength = 160; lk.value = p.link || ''; lk.placeholder = 'https://www.instagram.com/p/...'; lk.autocomplete = 'off';
    f.appendChild(field('Instagram post link (optional)', lk));
    var tg = el('label', 'toggle'), sh = el('input'); sh.type = 'checkbox'; sh.id = 'pe-show'; sh.checked = !p.hidden;
    tg.appendChild(sh); tg.appendChild(document.createTextNode('Show on my site')); f.appendChild(tg);
    var err = el('p', 'field-err'); err.setAttribute('role', 'alert'); err.hidden = true; f.appendChild(err);
    var row = el('div', 'row'), sv = el('button', 'btn', 'Save'), cn = el('button', 'btn-ghost', 'Close');
    sv.type = 'submit'; cn.type = 'button'; cn.dataset.close = '1'; row.appendChild(sv); row.appendChild(cn); f.appendChild(row);
    var r3 = el('div', 'row3'), ea = el('button', null, 'Earlier'), la = el('button', null, 'Later'), rm = el('button', 'rm-btn', up ? 'Delete' : 'Hide');
    [ea, la, rm].forEach(function (b) { b.type = 'button'; });
    ea.dataset.move = '-1'; la.dataset.move = '1'; rm.dataset.remove = '1';
    ea.disabled = i === 0; la.disabled = i === list.length - 1; rm.disabled = !up && p.hidden;
    r3.appendChild(ea); r3.appendChild(la); r3.appendChild(rm); f.appendChild(r3);
    if (!up) f.appendChild(el('p', 'hint', 'This photo came with your site, so you hide it instead of deleting it.'));
    box.replaceChildren(f); box.hidden = false;
  }
  $('#photo-edit').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var p = photos.filter(function (x) { return x.id === openPhoto; })[0]; if (!p) return;
    if (b.dataset.close) { openPhoto = null; renderPhotos(); return; }
    if (b.dataset.move) {
      var list = sorted(), i = list.indexOf(p), j = i + Number(b.dataset.move); if (!list[j]) return;
      var a = list[i]; list[i] = list[j]; list[j] = a;
      var rows = list.map(function (x, k) { return { id: x.id, src: x.src, caption: x.caption, posted: x.posted, link: x.link, width: x.width, height: x.height, hidden: x.hidden, sort: (k + 1) * 10 }; });
      save('Moving photo', function () { return sb.from('gallery_photos').upsert(rows).select(); }, 'Saved. Photo moved ' + (b.dataset.move === '-1' ? 'earlier.' : 'later.')).then(mergePhotos, function () {});
      return;
    }
    if (b.dataset.remove) {
      if (p.src.indexOf('uploads/') !== 0) {
        save('Hiding photo', function () { return sb.from('gallery_photos').update({ hidden: true }).eq('id', p.id).select(); }, 'Saved. The photo is hidden from your site.').then(mergePhotos, function () {});
        return;
      }
      if (!window.confirm('Delete this photo from your site for good?')) return;
      save('Deleting photo', function () { return sb.from('gallery_photos').delete().eq('id', p.id).select(); }, 'Saved. Photo deleted.').then(function () {
        photos = photos.filter(function (x) { return x.id !== p.id; }); openPhoto = null; renderPhotos();
        // The site no longer lists it. Clear the files too; a leftover file is harmless if this fails.
        sb.storage.from('gallery').remove([p.src + '/1600', p.src + '/800']).catch(function () {});
      }, function () {});
    }
  });
  $('#photo-edit').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, p = photos.filter(function (x) { return x.id === f.dataset.id; })[0]; if (!p) return;
    var link = f.querySelector('#pe-link').value.trim(), er = f.querySelector('.field-err');
    if (link && !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.\/-]{1,120}$/.test(link.split('?')[0])) { er.textContent = 'Paste a link that starts with https://www.instagram.com/, or leave it empty.'; er.hidden = false; f.querySelector('#pe-link').focus(); return; }
    var row = { caption: cleanText(f.querySelector('#pe-cap').value, 80), posted: cleanText(f.querySelector('#pe-posted').value, 20), link: link ? link.split('?')[0] : null, hidden: !f.querySelector('#pe-show').checked };
    save('Saving photo', function () { return sb.from('gallery_photos').update(row).eq('id', p.id).select(); },
      row.hidden ? 'Saved. The photo is hidden from your site.' : 'Saved. The photo is on your site.').then(function (d) { openPhoto = null; mergePhotos(d); }, function () {});
  });
  function mergePhotos(rows) {
    rows.forEach(function (r) { var k = photos.map(function (x) { return x.id; }).indexOf(r.id); if (k > -1) photos[k] = r; else photos.push(r); });
    renderPhotos();
  }

  // Shrink a photo on the phone before upload: longest side max px, the whole picture kept (never cropped)
  function openImage(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('This photo type can\'t be opened here. Try a JPG or a screenshot of it.')); };
      im.src = u;
    });
  }
  function shrink(img, max) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(function (res, rej) {
      c.toBlob(function (b) {
        // Raw bytes plus their type: the upload then carries the image's own content type
        var done = function (x) { x.arrayBuffer().then(function (buf) { res({ buf: buf, type: x.type, w: c.width, h: c.height }); }, rej); };
        if (b && b.type === 'image/webp') return done(b);
        c.toBlob(function (j) { j ? done(j) : rej(new Error('Couldn\'t prepare this photo.')); }, 'image/jpeg', 0.86);
      }, 'image/webp', 0.84);
    });
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); });
  }
  $('#add-photos').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []); this.value = '';
    if (!files.length || busy) return;
    var added = [], n = files.length;
    busy = true; lock(true); $('#add-photos').disabled = true;
    var first = sorted()[0], top = first ? first.sort : 0;
    files.reduce(function (chain, file, k) {
      return chain.then(function () {
        var label = n > 1 ? ' ' + (k + 1) + ' of ' + n : '', id = newId(), base = 'uploads/' + id, big, small;
        status('saving', 'Getting photo' + label + ' ready');
        return openImage(file).then(function (img) {
          return shrink(img, 1600).then(function (r) { big = r; return shrink(img, 800); }).then(function (r) { small = r; if (img.close) img.close(); });
        }).then(function () {
          status('saving', 'Uploading photo' + label);
          var o = { cacheControl: '31536000', upsert: false };
          return sb.storage.from('gallery').upload(base + '/1600', big.buf, Object.assign({ contentType: big.type }, o)).then(function (r) {
            if (r.error) throw r.error;
            return sb.storage.from('gallery').upload(base + '/800', small.buf, Object.assign({ contentType: small.type }, o));
          }).then(function (r) { if (r.error) throw r.error; });
        }).then(function () {
          top -= 10;
          return sb.from('gallery_photos').insert({ src: base, caption: '', posted: MONTHS[today.getMonth()].slice(0, 3) + ' ' + today.getDate() + ', ' + today.getFullYear(), width: big.w, height: big.h, hidden: false, sort: top }).select()
            .then(function (r) {
              if (r.error) { sb.storage.from('gallery').remove([base + '/1600', base + '/800']).catch(function () {}); throw r.error; }
              if (!r.data || !r.data.length) throw { message: 'not authenticated', code: 'PGRST301' };
              added.push(r.data[0]);
            });
        });
      });
    }, Promise.resolve()).then(function () {
      status('saved', 'Saved. ' + (n > 1 ? n + ' photos are' : 'Your photo is') + ' on your site. Add a caption next.');
    }).catch(function (e) {
      var m = String((e && e.message) || '');
      status('error', (added.length ? added.length + ' of ' + n + ' saved. ' : '') + (/opened here|prepare/.test(m) ? m : /mime|type/i.test(m) ? 'That file type isn\'t allowed. Use a photo.' : /size|large/i.test(m) ? 'That photo is too big. Try a smaller one.' : friendly(e)));
    }).finally(function () {
      busy = false; lock(false); $('#add-photos').disabled = false;
      added.forEach(function (r) { photos.push(r); });
      if (added.length) openPhoto = added[added.length - 1].id;
      renderPhotos();
      if (openPhoto) $('#photo-edit').scrollIntoView({ block: 'start' });
    });
  });

  // Kick off: show the saved sign-in, or the sign-in form
  sb.auth.getSession().then(function (r) { route(r.data && r.data.session); });
})();
