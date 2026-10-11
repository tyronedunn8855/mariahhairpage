/* Mar Latrice Styles: booking, plus everything her owner panel (/admin/) changes on this page.
   The menu, policies and photos in the HTML are the fallback. When ml-config.js holds her Supabase keys,
   the live copies replace them, and the calendar shows the open times she sets in her panel.
   Every piece of text from the database goes in with textContent, never as HTML. */
(function () {
  "use strict";

  var CONFIG = {
    phone: "+14149358785",
    phoneText: "(414) 935-8785",
    address: "10601 W Oklahoma Ave # X17, West Allis, WI 53227",
    // Payment links for each deposit amount (Stripe Payment Links, Apple Pay + card). Paste a link next to
    // its amount. In Stripe, set each link's "After payment" redirect to https://mariahhairpage.vercel.app/?deposit=paid#book
    depositLinks: { 15: "", 20: "", 25: "" },
    monthsAhead: 3
  };

  var LIVE = window.ML_SUPABASE || {};
  var LIVE_ON = !!(LIVE.url && LIVE.anonKey);
  var API = LIVE_ON ? LIVE.url.replace(/\/+$/, "") + "/rest/v1/" : "";
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
  var rm = !!window.__rm;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clean(v, max) { return String(v == null ? "" : v).replace(/<[^>]*>/g, "").replace(/[<>"`\\]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max); }
  function get(q) { return fetch(API + q, { headers: { apikey: LIVE.anonKey }, cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
  function rpc(fn, body, opts) {
    return fetch(API + "rpc/" + fn, Object.assign({ method: "POST", headers: { apikey: LIVE.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) }, opts || {}));
  }
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDay(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtTime(t) { var p = String(t).split(":"), h = +p[0]; return ((h + 11) % 12 + 1) + ":" + p[1] + " " + (h < 12 ? "AM" : "PM"); }
  function fmtDay(d) { return DOW[d.getDay()].slice(0, 3) + ", " + MON[d.getMonth()].slice(0, 3) + " " + d.getDate(); }
  function durText(m) { var h = Math.floor(m / 60), mm = m % 60; return (h ? h + " hr" : "") + (h && mm ? " " : "") + (mm ? mm + " min" : ""); }
  var today = new Date(); today.setHours(0, 0, 0, 0);

  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = el("div", "bk-toast"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 3600);
  }

  /* ═══ Menu: read from the page, or rebuilt from her panel ═══ */
  var MENU = []; // [{id, name, addon, services:[{slug,name,price,plus,dep,min,dur}]}]
  function readMenu() {
    MENU = $$("#menu-list .cat").map(function (c) {
      var t = c.querySelector(".cat-title") || c.querySelector("h3");
      return {
        id: c.dataset.cat, addon: c.dataset.addon === "1" || c.dataset.cat === "addons",
        name: t.textContent.replace(/^\s*\d+\s*/, "").trim(),
        services: $$(".svc", c).map(function (li) {
          return { slug: li.id.replace(/^svc-/, ""), name: li.dataset.name, price: +li.dataset.price || 0, plus: li.dataset.plus === "1",
            dep: li.dataset.dep === "" ? null : +li.dataset.dep, min: +li.dataset.min || 0, dur: li.dataset.dur };
        })
      };
    }).filter(function (c) { return c.services.length; });
  }
  function svcBy(slug) { for (var i = 0; i < MENU.length; i++) for (var j = 0; j < MENU[i].services.length; j++) if (MENU[i].services[j].slug === slug) return MENU[i].services[j]; return null; }
  function catOfSvc(slug) { for (var i = 0; i < MENU.length; i++) if (MENU[i].services.some(function (s) { return s.slug === slug; })) return MENU[i]; return null; }
  function addonList() { var a = MENU.filter(function (c) { return c.addon; })[0]; return a ? a.services : []; }

  // Her descriptions keep **bold** from the panel. Split on it and build real <strong> nodes.
  function richParas(text, box) {
    String(text).split(/\n\s*\n/).forEach(function (para) {
      para = para.trim(); if (!para) return;
      var p = el("p");
      para.split("**").forEach(function (bit, i) { if (!bit) return; p.appendChild(i % 2 ? el("strong", null, bit) : document.createTextNode(bit)); });
      box.appendChild(p);
    });
  }
  function renderMenu(cats, svcs) {
    var list = $("menu-list"), first = list.firstChild, frag = document.createDocumentFragment(), n = 0;
    cats.forEach(function (c, ci) {
      var mine = svcs.filter(function (s) { return s.category_id === c.id && !s.hidden; });
      if (!mine.length || c.hidden) return;
      var sec = el("section", "cat"); sec.dataset.cat = c.id; if (c.addon) sec.dataset.addon = "1"; sec.setAttribute("aria-labelledby", "cat-" + c.id);
      var head = el("header", "cat-head"), h3 = el("h3"); h3.id = "cat-" + c.id;
      h3.appendChild(el("span", "cat-no", pad(ci + 1))); h3.appendChild(document.createTextNode(" " + clean(c.name, 40)));
      head.appendChild(h3); if (c.note) head.appendChild(el("p", "cat-note", clean(c.note, 120))); sec.appendChild(head);
      var ol = el("ol", "svc-list");
      mine.forEach(function (s) {
        var li = el("li", "svc"), name = clean(s.name, 60), dur = clean(s.duration, 30);
        li.id = "svc-" + s.slug; li.dataset.name = name; li.dataset.price = s.price; li.dataset.plus = s.plus ? "1" : "0";
        li.dataset.dep = s.deposit == null ? "" : s.deposit; li.dataset.min = s.minutes; li.dataset.dur = dur;
        var b = el("button", "svc-btn"); b.type = "button"; b.setAttribute("aria-haspopup", "dialog"); b.dataset.svc = s.slug;
        b.appendChild(el("span", "svc-name", name)); var lead = el("span", "svc-lead"); lead.setAttribute("aria-hidden", "true"); b.appendChild(lead);
        b.appendChild(el("span", "svc-price", "$" + s.price + (s.plus ? "+" : "")));
        var meta = el("span", "svc-meta"); meta.appendChild(el("span", null, c.addon ? "Add-on" : s.deposit == null ? "No deposit listed" : "Deposit $" + s.deposit));
        var pl = el("span", "plus", "+"); pl.setAttribute("aria-hidden", "true"); meta.appendChild(pl); meta.appendChild(el("span", null, dur));
        b.appendChild(meta); li.appendChild(b);
        var d = el("div", "svc-desc"); richParas(clean(s.description, 1500).replace(/\r/g, ""), d); li.appendChild(d);
        ol.appendChild(li); n++;
      });
      sec.appendChild(ol); frag.appendChild(sec);
    });
    if (!n) return false;
    $$("#menu-list > .cat").forEach(function (c) { c.remove(); });
    list.insertBefore(frag, list.firstChild);
    var mn = $("menu-n"); if (mn) mn.textContent = n + " services";
    if (window.__mlMenu) window.__mlMenu();
    return true;
  }

  /* ═══ Booking state ═══ */
  var state = { cat: null, svc: null, adds: [], date: null, time: null, paid: false, sentKey: null };
  var KEY = "ml-booking";
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ cat: state.cat, svc: state.svc, adds: state.adds, date: state.date, time: state.time, paid: state.paid, sentKey: state.sentKey, name: $("bk-name").value, phone: $("bk-phone").value, notes: $("bk-notes").value })); } catch (e) {}
  }
  (function load() {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (!s) return;
      state.cat = s.cat || null; state.svc = s.svc || null; state.adds = Array.isArray(s.adds) ? s.adds : []; state.date = s.date || null; state.time = s.time || null;
      state.paid = !!s.paid; state.sentKey = s.sentKey || null;
      $("bk-name").value = s.name || ""; $("bk-phone").value = s.phone || ""; $("bk-notes").value = s.notes || "";
    } catch (e) {}
  })();
  if (/[?&]deposit=paid/.test(location.search)) {
    state.paid = true;
    try { history.replaceState(null, "", location.pathname + "#book"); } catch (e) {}
  }

  /* ─── step 1: service ─── */
  function renderService() {
    var bookable = MENU.filter(function (c) { return !c.addon; });
    if (!state.cat && state.svc) { var c0 = catOfSvc(state.svc); if (c0) state.cat = c0.id; }
    if (state.cat && !bookable.some(function (c) { return c.id === state.cat; })) { state.cat = null; state.svc = null; }
    var cats = $("bk-cats"); cats.textContent = "";
    bookable.forEach(function (c) {
      var b = el("button", "chip", c.name); b.type = "button"; b.dataset.cat = c.id; b.setAttribute("aria-pressed", String(state.cat === c.id)); cats.appendChild(b);
    });
    var box = $("bk-svcs"); box.textContent = "";
    var cat = bookable.filter(function (c) { return c.id === state.cat; })[0];
    if (cat) cat.services.forEach(function (s) {
      var b = el("button", "bk-svc"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(state.svc === s.slug)); b.dataset.svc = s.slug;
      b.appendChild(el("span", "bk-svc-n", s.name)); b.appendChild(el("span", "bk-svc-p", "$" + s.price + (s.plus ? "+" : "")));
      b.appendChild(el("span", "bk-svc-m", (s.dep == null ? "No deposit listed" : "Deposit $" + s.dep) + " · " + s.dur));
      box.appendChild(b);
    });
    else box.appendChild(el("p", "bk-hint", "Pick a category to see its services."));
    var adds = addonList(), ab = $("bk-adds-list"); ab.textContent = "";
    state.adds = state.adds.filter(function (a) { return adds.some(function (x) { return x.slug === a; }); });
    $("bk-adds").hidden = !state.svc || !adds.length;
    adds.forEach(function (a) {
      var l = el("label", "bk-add"), c = el("input"); c.type = "checkbox"; c.value = a.slug; c.checked = state.adds.indexOf(a.slug) > -1;
      l.appendChild(c); l.appendChild(el("span", "bk-add-n", a.name)); l.appendChild(el("span", "bk-add-p", "+$" + a.price + (a.plus ? "+" : "") + " · " + a.dur)); ab.appendChild(l);
    });
  }
  $("bk-cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b) return;
    if (state.cat !== b.dataset.cat) { state.cat = b.dataset.cat; state.svc = null; }
    renderService(); update();
  });
  $("bk-svcs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-svc]"); if (!b) return;
    state.svc = b.dataset.svc; renderService(); update();
    var nb = document.querySelector('#bk-svcs [data-svc="' + state.svc + '"]'); if (nb) nb.focus();
  });
  $("bk-adds-list").addEventListener("change", function (e) {
    var v = e.target.value; if (!v) return;
    state.adds = state.adds.filter(function (a) { return a !== v; }); if (e.target.checked) state.adds.push(v);
    update();
  });

  /* ─── step 2: day and time ─── */
  var OPEN = {}, schedState = LIVE_ON ? "loading" : "off", view = new Date(today.getFullYear(), today.getMonth(), 1);
  function loadTimes() {
    if (!LIVE_ON) { schedDone("off"); return; }
    get("availability?select=date,start_time,status&status=eq.open&date=gte." + iso(today) + "&order=date.asc,start_time.asc&limit=1000").then(function (rows) {
      OPEN = {};
      rows.forEach(function (r) { (OPEN[r.date] = OPEN[r.date] || []).push(String(r.start_time).slice(0, 5)); });
      var first = Object.keys(OPEN).sort()[0];
      if (first && !state.date) { var f = parseDay(first); view = new Date(f.getFullYear(), f.getMonth(), 1); }
      if (state.date && (!OPEN[state.date] || OPEN[state.date].indexOf(state.time) < 0)) { if (!OPEN[state.date]) state.date = null; state.time = null; }
      schedDone(Object.keys(OPEN).length ? "live" : "empty");
    }).catch(function () { schedDone("off"); });
  }
  function schedDone(s) { schedState = s; $("bk-cal").removeAttribute("aria-busy"); renderCal(); renderSlots(); update(); }
  function renderCal() {
    $("bk-month").textContent = MON[view.getMonth()] + " " + view.getFullYear();
    var max = new Date(today.getFullYear(), today.getMonth() + CONFIG.monthsAhead, 1);
    $("bk-prev").disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    $("bk-next").disabled = view >= max;
    var grid = $("bk-days"); grid.textContent = "";
    for (var i = 0; i < view.getDay(); i++) grid.appendChild(el("span", "bk-day blank"));
    var n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= n; d++) {
      var dt = new Date(view.getFullYear(), view.getMonth(), d), k = iso(dt), open = !!OPEN[k] && dt >= today;
      var b = el("button", "bk-day" + (open ? " open" : "") + (k === state.date ? " sel" : ""), String(d)); b.type = "button"; b.dataset.k = k;
      b.disabled = !open; b.setAttribute("aria-label", fmtDay(dt) + (open ? ", " + OPEN[k].length + " open time" + (OPEN[k].length > 1 ? "s" : "") : ", no open times"));
      if (k === state.date) b.setAttribute("aria-pressed", "true");
      grid.appendChild(b);
    }
    var note = $("bk-note");
    note.textContent = schedState === "loading" ? "Loading open times…" : schedState === "off" ? "Online booking is still being set up. Text " + CONFIG.phoneText + " to book for now."
      : schedState === "empty" ? "No open times right now. Text " + CONFIG.phoneText + " and ask about the next opening." : "Bold days have open times.";
    $("bk-fallback").hidden = schedState !== "off";
  }
  function renderSlots() {
    var box = $("bk-slots"); box.textContent = "";
    (state.date && OPEN[state.date] || []).forEach(function (t) {
      var b = el("button", "chip bk-slot", fmtTime(t)); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.t = t; b.setAttribute("aria-checked", String(state.time === t)); box.appendChild(b);
    });
  }
  $("bk-prev").addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $("bk-next").addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });
  $("bk-days").addEventListener("click", function (e) {
    var b = e.target.closest("[data-k]"); if (!b || b.disabled) return;
    state.date = b.dataset.k; state.time = OPEN[state.date] && OPEN[state.date].length === 1 ? OPEN[state.date][0] : null;
    renderCal(); renderSlots(); update();
    var nb = document.querySelector('#bk-days [data-k="' + state.date + '"]'); if (nb) nb.focus();
  });
  $("bk-slots").addEventListener("click", function (e) {
    var b = e.target.closest("[data-t]"); if (!b) return;
    state.time = b.dataset.t; renderSlots(); update();
  });

  /* ─── summary ─── */
  function digits() { var d = $("bk-phone").value.replace(/\D/g, ""); return d.length === 11 && d[0] === "1" ? d.slice(1) : d; }
  function picks() {
    var s = svcBy(state.svc); if (!s) return null;
    var adds = state.adds.map(svcBy).filter(Boolean);
    var total = s.price + adds.reduce(function (a, x) { return a + x.price; }, 0), plus = s.plus || adds.some(function (x) { return x.plus; });
    var min = s.min + adds.reduce(function (a, x) { return a + x.min; }, 0);
    return { s: s, adds: adds, total: total, plus: plus, min: min || 60, dep: s.dep };
  }
  function bookingKey() { return [state.svc, state.adds.join(","), state.date, state.time].join("|"); }
  function setDD(id, text, empty) { var e = $(id); e.textContent = text || empty; e.classList.toggle("empty", !text); }
  function update() {
    var p = picks();
    $("bk-t-name").textContent = p ? p.s.name : "Pick a service";
    setDD("bk-t-adds", p && p.adds.length ? p.adds.map(function (a) { return a.name; }).join(", ") : "", "None");
    setDD("bk-t-day", state.date ? fmtDay(parseDay(state.date)) : "", "Not picked yet");
    setDD("bk-t-time", state.time ? fmtTime(state.time) : "", "Not picked yet");
    setDD("bk-t-len", p ? "About " + durText(p.min) : "", "—");
    $("bk-t-total").textContent = p ? "$" + p.total + (p.plus ? "+" : "") : "$0";
    $("bk-t-dep").textContent = p ? (p.dep == null ? "None listed" : "$" + p.dep) : "—";
    $("bk-t-due").textContent = p ? "$" + Math.max(0, p.total - (p.dep || 0)) + (p.plus ? "+" : "") : "—";
    var pay = $("bk-pay");
    pay.textContent = state.paid ? "Deposit paid ✓" : p && p.dep ? "Pay the $" + p.dep + " deposit" : "Pay the deposit";
    pay.classList.toggle("paid", state.paid); pay.disabled = false; pay.removeAttribute("aria-busy");
    pay.hidden = !!p && p.dep == null;
    $("bk-t-err").textContent = "";
    var sent = !!state.sentKey && state.sentKey === bookingKey() && !missing();
    $("bk-after").hidden = !sent;
    var timed = !!(state.date && state.time && p);
    document.querySelector(".bk-after-btns").hidden = !timed;
    if (sent && timed) $("bk-gcal").href = gcalUrl();
    ["bk-s1", "bk-s2", "bk-s3"].forEach(function (id, i) { $(id).classList.toggle("done", i === 0 ? !!p : i === 1 ? !!(state.date && state.time) : !!($("bk-name").value.trim() && digits().length === 10)); });
    save();
  }
  ["bk-name", "bk-phone", "bk-notes"].forEach(function (id) { $(id).addEventListener("input", function () { if (id !== "bk-notes") fieldErr(id, ""); update(); }); });
  $("bk-phone").addEventListener("blur", function () {
    var d = digits();
    if (d.length === 10) { this.value = "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6); update(); }
    else if (d.length) fieldErr("bk-phone", "Use all 10 digits, like (414) 555-0123.");
  });
  function fieldErr(id, msg) {
    var out = $(id === "bk-name" ? "bk-e-name" : "bk-e-phone"), inp = $(id); if (!out) return;
    out.textContent = msg || ""; if (msg) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid");
  }
  function missing() {
    if (!svcBy(state.svc)) return { m: "Pick a service first.", go: "bk-h1" };
    if (schedState === "off" || schedState === "empty") return null; // text-only mode: no day or time to pick
    if (!state.date) return { m: "Pick a day with open times.", go: "bk-h2" };
    if (!state.time) return { m: "Pick a time.", go: "bk-h2" };
    if (!$("bk-name").value.trim()) return { m: "Add your name.", field: "bk-name" };
    if (digits().length !== 10) return { m: "Add a 10-digit phone number she can text back.", field: "bk-phone" };
    return null;
  }
  function showErr(x) {
    $("bk-t-err").textContent = x.m;
    if (x.field) { fieldErr(x.field, x.m); $(x.field).focus(); }
    else { var h = $(x.go); h.scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "center" }); h.focus({ preventScroll: true }); }
  }

  /* ─── send: a text to her phone, and a copy in her booking list ─── */
  function message() {
    var p = picks(), lines = ["Hi Mar Latrice! I would like to book.", "", "Service: " + p.s.name + " ($" + p.s.price + (p.s.plus ? "+" : "") + ")"];
    if (p.adds.length) lines.push("Add-ons: " + p.adds.map(function (a) { return a.name; }).join(", "));
    if (state.date && state.time) { lines.push("Day: " + fmtDay(parseDay(state.date)) + " " + parseDay(state.date).getFullYear()); lines.push("Time: " + fmtTime(state.time)); }
    else lines.push("What times do you have open?");
    lines.push("Estimated total: $" + p.total + (p.plus ? "+" : ""));
    if ($("bk-name").value.trim()) lines.push("", "Name: " + $("bk-name").value.trim());
    if ($("bk-phone").value.trim()) lines.push("Phone: " + $("bk-phone").value.trim());
    if ($("bk-notes").value.trim()) lines.push("Notes: " + $("bk-notes").value.trim());
    if (p.dep != null) lines.push("", state.paid ? "I paid the $" + p.dep + " deposit online." : "I will pay the $" + p.dep + " deposit to hold my spot.");
    return lines.join("\n");
  }
  var savedKey = null, savedId = null;
  function saveRequest(via) {
    var key = bookingKey() + "|" + digits(), p = picks();
    if (!LIVE_ON || schedState !== "live" || !p || !state.date || !state.time) return Promise.resolve(null);
    if (savedKey === key && !(via !== "deposit" && state.paid)) return Promise.resolve(savedId);
    if ($("bk-web").value) return Promise.resolve(null); // bots fill the hidden field
    return rpc("submit_booking_request", {
      p_name: clean($("bk-name").value, 60), p_phone: digits(), p_style: clean(p.s.name, 90), p_addons: clean(p.adds.map(function (a) { return a.name; }).join(", "), 200),
      p_date: state.date, p_time: state.time, p_duration_min: Math.min(1440, Math.max(15, p.min)), p_total: p.total, p_total_plus: p.plus, p_deposit: p.dep,
      p_notes: clean($("bk-notes").value, 400), p_paid_said: !!state.paid, p_sent_by: via, p_website: $("bk-web").value
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (id) {
      savedKey = key; savedId = typeof id === "string" ? id : null;
      if (state.sentKey === bookingKey()) $("bk-saved").hidden = false;
      if (savedId) fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: savedId }), keepalive: true }).catch(function () {});
      return savedId;
    }).catch(function () { return null; });
  }
  $("bk-send").addEventListener("click", function () {
    var m = missing(); if (m) return showErr(m);
    state.sentKey = bookingKey(); update(); saveRequest("text");
    var sep = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? "&" : "?";
    window.location.href = "sms:" + CONFIG.phone + sep + "body=" + encodeURIComponent(message());
  });
  $("bk-pay").addEventListener("click", function () {
    var m = missing(); if (m) return showErr(m);
    var p = picks(), link = p && p.dep != null ? CONFIG.depositLinks[p.dep] : "";
    if (!link) { toast("Online deposits aren't set up yet. Send your request, and she'll text you how to pay the deposit."); return; }
    save();
    var btn = this; btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = "Opening checkout…";
    saveRequest("deposit").then(function (id) {
      var ref = id || ($("bk-name").value.trim() + "_" + state.date + "_" + state.time).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 190);
      window.location.href = link + (link.indexOf("?") > -1 ? "&" : "?") + "client_reference_id=" + encodeURIComponent(ref);
    });
  });
  addEventListener("pageshow", function (e) { if (e.persisted) update(); });

  /* ─── save it to a calendar while waiting (marked tentative) ─── */
  function startEnd() {
    var d = parseDay(state.date), t = state.time.split(":"); d.setHours(+t[0], +t[1], 0, 0);
    return [d, new Date(d.getTime() + picks().min * 60000)];
  }
  function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; }
  function calTitle() { return "Mar Latrice Styles: " + picks().s.name + " (pending)"; }
  function calDetails() { return "Booking request sent to Mar Latrice. Not confirmed until she texts you back. Questions? Text " + CONFIG.phoneText + "."; }
  function gcalUrl() {
    var se = startEnd();
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(calTitle()) + "&dates=" + stamp(se[0]) + "/" + stamp(se[1]) +
      "&ctz=America/Chicago&location=" + encodeURIComponent(CONFIG.address) + "&details=" + encodeURIComponent(calDetails());
  }
  function icsEsc(s) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function fold(line) { var out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); }
  $("bk-ics").addEventListener("click", function () {
    var se = startEnd(), utc = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mar Latrice Styles//booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:" + utc + "-" + Math.random().toString(36).slice(2) + "@marlatricestyles", "DTSTAMP:" + utc, "DTSTART:" + stamp(se[0]), "DTEND:" + stamp(se[1]), "STATUS:TENTATIVE",
      "SUMMARY:" + icsEsc(calTitle()), "DESCRIPTION:" + icsEsc(calDetails()), "LOCATION:" + icsEsc(CONFIG.address),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Hair appointment at Mar Latrice Styles tomorrow"), "TRIGGER:-PT24H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
    var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    var a = el("a"); a.href = url; a.download = "mar-latrice-appointment.ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });
  $("bk-reset").addEventListener("click", function () {
    state = { cat: null, svc: null, adds: [], date: null, time: null, paid: false, sentKey: null };
    ["bk-name", "bk-phone", "bk-notes"].forEach(function (id) { $(id).value = ""; });
    fieldErr("bk-name", ""); fieldErr("bk-phone", "");
    renderService(); renderCal(); renderSlots(); update(); toast("Booking cleared.");
  });

  /* ─── "Book this service" in the menu's detail sheet ─── */
  var sheet = $("sheet");
  $("sheet-book").addEventListener("click", function () {
    var slug = sheet.dataset.svc, s = svcBy(slug), c = catOfSvc(slug);
    if (s && c) {
      if (c.addon) { if (state.adds.indexOf(slug) < 0) state.adds.push(slug); }
      else { state.cat = c.id; state.svc = slug; }
      renderService(); update();
    }
    if (sheet.open) sheet.close();
    var target = $(c && c.addon && !state.svc ? "bk-s1" : state.svc && !state.date ? "bk-s2" : "book");
    setTimeout(function () { target.scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" }); }, 60);
  });

  /* ═══ Live content from her panel ═══ */
  function loadMenu() {
    if (!LIVE_ON) return Promise.resolve();
    return Promise.all([
      get("service_categories?select=id,name,note,addon,hidden,sort&order=sort.asc&limit=40"),
      get("services?select=slug,category_id,name,price,plus,deposit,duration,minutes,description,hidden,sort&order=sort.asc&limit=300")
    ]).then(function (r) { if (renderMenu(r[0], r[1])) { readMenu(); renderService(); update(); } }).catch(function () {});
  }
  function loadPolicies() {
    if (!LIVE_ON) return;
    Promise.all([get("site_policies?select=big,title,body,hidden,sort&order=sort.asc&limit=30"), get("faq_items?select=q,a,hidden,sort&order=sort.asc&limit=40")]).then(function (r) {
      var pols = r[0].filter(function (x) { return !x.hidden; }), list = $("pol-list");
      if (pols.length) {
        list.textContent = "";
        pols.forEach(function (x, i) {
          var li = el("li", "pol is-in"); li.setAttribute("data-anim", ""); li.style.setProperty("--i", i);
          li.appendChild(el("p", "pol-key", clean(x.big, 14)));
          var h = el("h3"); h.appendChild(el("span", "pol-no", pad(i + 1))); h.appendChild(document.createTextNode(" " + clean(x.title, 40))); li.appendChild(h);
          li.appendChild(el("p", null, clean(x.body, 700))); list.appendChild(li);
        });
        var more = document.querySelector(".pol-more"); if (more) more.textContent = "Show all " + pols.length + " policies";
      }
      var faqs = r[1].filter(function (x) { return !x.hidden; }), fl = $("faq-list");
      fl.textContent = "";
      faqs.forEach(function (x) { var d = el("details", "faq"); d.appendChild(el("summary", null, clean(x.q, 120))); d.appendChild(el("p", null, clean(x.a, 500))); fl.appendChild(d); });
      $("faq").hidden = !faqs.length;
    }).catch(function () {});
  }
  function loadReviews() {
    if (!LIVE_ON) return;
    get("reviews?select=name,body,stars,service,source&hidden=eq.false&order=sort.asc&limit=30").then(function (list) {
      var ul = $("kind-list"); ul.textContent = "";
      list.forEach(function (x) {
        var body = clean(x.body, 400), name = clean(x.name, 40); if (!body || !name) return;
        var li = el("li", "kind-card"), st = Math.round(+x.stars);
        if (st >= 1 && st <= 5) { var s = el("p", "kind-stars", "★★★★★".slice(0, st)); s.setAttribute("aria-label", st + " out of 5 stars"); li.appendChild(s); }
        li.appendChild(el("blockquote", null, body));
        li.appendChild(el("p", "tag kind-who", [name, clean(x.service, 40), clean(x.source, 20) ? "via " + clean(x.source, 20) : ""].filter(Boolean).join("  |  ")));
        ul.appendChild(li);
      });
      $("reviews").hidden = !ul.children.length;
    }).catch(function () {});
  }
  function loadGallery() {
    if (!LIVE_ON) return;
    get("gallery_photos?select=src,caption,posted,link,width,height,hidden,sort&hidden=eq.false&order=sort.asc&limit=60").then(function (rows) {
      var store = LIVE.url.replace(/\/+$/, "") + "/storage/v1/object/public/gallery/", g = document.querySelector("#work .gallery"); if (!g || !rows.length) return;
      var frag = document.createDocumentFragment(), n = 0;
      rows.forEach(function (x) {
        var m = String(x.src).match(/^builtin:(work-\d{2})$/), up = /^uploads\/[a-f0-9-]+$/.test(x.src); if (!m && !up) return;
        var w = Math.round(+x.width) || 800, h = Math.round(+x.height) || 1067, fig = el("figure", "shot is-in"); fig.setAttribute("data-anim", ""); fig.style.setProperty("--ar", (w / h).toFixed(4));
        var link = /^https:\/\/(www\.)?instagram\.com\//.test(x.link || "") ? x.link : null, wrap = link ? el("a") : el("div", "shot-in");
        if (link) { wrap.href = link; wrap.target = "_blank"; wrap.rel = "noopener"; }
        var img = el("img"); img.loading = "lazy"; img.decoding = "async"; img.width = 800; img.height = Math.round(800 * h / w); img.alt = clean(x.caption, 80) || "Hair by Mar Latrice";
        if (m) { img.src = "img/web/" + m[1] + "-800.webp"; img.srcset = ["800", "1200", "1600"].map(function (s) { return "img/web/" + m[1] + "-" + s + ".webp " + s + "w"; }).join(", "); }
        else { img.src = store + x.src + "/800"; img.srcset = store + x.src + "/800 800w, " + store + x.src + "/1600 1600w"; }
        img.sizes = "(min-width: 960px) 30vw, 92vw";
        var cap = el("figcaption"), tg = el("span", "tag"); n++;
        tg.appendChild(el("span", null, pad(n))); if (x.posted) { var i = el("i", null, "|"); i.setAttribute("aria-hidden", "true"); tg.appendChild(i); tg.appendChild(el("span", null, clean(x.posted, 20))); }
        cap.appendChild(tg); cap.appendChild(el("span", "cap", clean(x.caption, 80))); if (link) cap.appendChild(el("span", "ig", "View post"));
        wrap.appendChild(img); wrap.appendChild(cap); fig.appendChild(wrap); frag.appendChild(fig);
      });
      if (n) { g.textContent = ""; g.appendChild(frag); }
    }).catch(function () {});
  }

  /* ═══ Visit counts for her panel: totals per day, no cookies, nothing about who visited ═══ */
  function track(kind) {
    if (!LIVE_ON) return;
    var k = "ml-seen-" + kind + "-" + iso(new Date());
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) {}
    rpc("track_visit", { p_kind: kind }, { keepalive: true }).catch(function () {});
  }

  readMenu(); renderService(); renderCal(); update();
  loadMenu().then(function () { loadTimes(); });
  loadPolicies(); loadReviews(); loadGallery();
  track("visit");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { track("booking"); io.disconnect(); } }, { threshold: 0.2 });
    io.observe($("book"));
  }
})();
