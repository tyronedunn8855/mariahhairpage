/* Mar Latrice Styles: menu filter + search, service detail sheet, light reveals.
   Everything works from the static HTML; this file only adds behavior. */
(function () {
  "use strict";

  var BOOK_URL = "https://book.squareup.com/appointments/f7l38h8jynq6mi/location/LTZVHPWPYR78E/services";
  var TEXT_NUMBER = "(414) 935-8785";

  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- header border on scroll ---------- */
  var top = document.getElementById("top");
  var onScroll = function () { top.classList.toggle("is-scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- menu filter + search ---------- */
  var list = document.getElementById("menu-list");
  var cats = Array.prototype.slice.call(list.querySelectorAll(".cat"));
  var rows = Array.prototype.slice.call(list.querySelectorAll(".svc"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var q = document.getElementById("q");
  var count = document.getElementById("count");
  var empty = document.getElementById("empty");
  var active = "all";

  rows.forEach(function (r) {
    r._text = (r.textContent + " " + r.closest(".cat").querySelector("h3").textContent).toLowerCase().replace(/\s+/g, " ");
  });

  /* ---------- categories fold open and shut ----------
     Built here so scripts/build_menu.py can keep regenerating the menu HTML untouched.
     The first two categories start open. Searching or picking a chip opens every match. */
  var userOpen = {};
  cats.forEach(function (c, i) {
    var h3 = c.querySelector("h3"), list = c.querySelector(".svc-list");
    var prices = Array.prototype.map.call(c.querySelectorAll(".svc-price"), function (p) { return parseFloat(p.textContent.replace(/[^0-9.]/g, "")) || 0; });
    var n = prices.length, low = Math.min.apply(null, prices);
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "cat-toggle";
    list.id = list.id || "list-" + c.dataset.cat;
    btn.setAttribute("aria-controls", list.id);
    var title = document.createElement("span"); title.className = "cat-title";
    while (h3.firstChild) title.appendChild(h3.firstChild);
    var sum = document.createElement("span"); sum.className = "cat-sum";
    sum.textContent = n + (n === 1 ? " service" : " services") + (low ? " · from $" + low : "");
    btn.appendChild(title); btn.appendChild(sum); h3.appendChild(btn);
    var body = document.createElement("div"); body.className = "cat-body";
    list.parentNode.insertBefore(body, list); body.appendChild(list);
    userOpen[c.dataset.cat] = i < 2;
    btn.addEventListener("click", function () { userOpen[c.dataset.cat] = c.classList.contains("is-shut"); syncFold(); });
  });
  function setOpen(c, open) {
    c.classList.toggle("is-shut", !open);
    c.querySelector(".cat-toggle").setAttribute("aria-expanded", String(open));
    var l = c.querySelector(".svc-list"); if ("inert" in l) l.inert = !open;
  }
  function syncFold() {
    var filtering = active !== "all" || q.value.trim() !== "";
    cats.forEach(function (c) { setOpen(c, filtering || !!userOpen[c.dataset.cat]); });
  }

  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    cats.forEach(function (c) {
      var inCat = active === "all" || c.dataset.cat === active;
      var visible = 0;
      c.querySelectorAll(".svc").forEach(function (r) {
        var ok = inCat && (!term || r._text.indexOf(term) !== -1);
        r.hidden = !ok;
        if (ok) visible++;
      });
      c.hidden = visible === 0;
      shown += visible;
    });
    empty.hidden = shown !== 0;
    count.textContent = shown === rows.length ? "Showing all " + rows.length + " services"
      : "Showing " + shown + " of " + rows.length + " services";
    syncFold();
  }
  syncFold();

  chips.forEach(function (b) {
    b.addEventListener("click", function () {
      active = b.dataset.filter;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      apply();
    });
  });
  q.addEventListener("input", apply);
  document.getElementById("reset").addEventListener("click", function () {
    q.value = ""; active = "all";
    chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.filter === "all")); });
    apply(); q.focus();
  });

  /* ---------- detail sheet ---------- */
  var sheet = document.getElementById("sheet");
  var lastFocus = null;
  var $ = function (id) { return document.getElementById(id); };

  function openService(id, opener) {
    var li = document.getElementById("svc-" + id);
    if (!li) return;
    var cat = li.closest(".cat");
    if (cat.classList.contains("is-shut")) { userOpen[cat.dataset.cat] = true; syncFold(); }
    var catName = cat.querySelector(".cat-title").textContent.replace(/^\s*\d+\s*/, "").trim();
    var meta = li.querySelectorAll(".svc-meta > span:not(.plus)");
    var dep = meta[0].textContent.trim();
    var price = li.querySelector(".svc-price").textContent.trim();
    var name = li.dataset.name;

    $("sheet-cat").innerHTML = "";
    [catName, price.indexOf("+") > -1 ? "Starting price" : "Set price"].forEach(function (t, i) {
      if (i) { var sep = document.createElement("i"); sep.setAttribute("aria-hidden", "true"); sep.textContent = "|"; $("sheet-cat").appendChild(sep); }
      var s = document.createElement("span"); s.textContent = t; $("sheet-cat").appendChild(s);
    });
    $("sheet-name").textContent = name;
    $("sheet-price").textContent = price;
    $("sheet-dep").textContent = dep === "Add-on" ? "Add-on" : dep.replace(/^Deposit\s*/, "");
    $("sheet-dur").textContent = meta[1].textContent.trim();
    $("sheet-desc").innerHTML = li.querySelector(".svc-desc").innerHTML;

    var hint = $("sheet-hint");
    hint.innerHTML = "";
    var t1 = document.createTextNode(dep === "Add-on"
      ? "On Square, add “" + name + "” to an eligible service. Questions? Text "
      : "On Square, choose “" + name + "”. Questions? Text ");
    var a = document.createElement("a"); a.href = "sms:+14149358785"; a.textContent = TEXT_NUMBER;
    hint.appendChild(t1); hint.appendChild(a); hint.appendChild(document.createTextNode(". Text only, no calls."));

    lastFocus = opener || document.activeElement;
    if (typeof sheet.showModal === "function") {
      sheet.showModal();
      sheet.querySelector(".sheet-close").focus();
    } else {
      window.open(BOOK_URL, "_blank", "noopener");
    }
  }

  list.addEventListener("click", function (e) {
    var b = e.target.closest(".svc-btn");
    if (b) openService(b.dataset.svc, b);
  });
  document.querySelectorAll(".js-open").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (typeof sheet.showModal !== "function") return; // fall back to the anchor jump
      e.preventDefault();
      openService(a.dataset.svc, a);
    });
  });
  sheet.addEventListener("close", function () {
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });
  // click on the backdrop closes
  sheet.addEventListener("click", function (e) {
    if (e.target === sheet) sheet.close();
  });

  /* ---------- policies on phones: the first four, then a button for the rest ---------- */
  var polList = document.getElementById("pol-list"), polMore = document.querySelector(".pol-more");
  if (polList && polMore) {
    var phoneMq = window.matchMedia("(max-width: 640px)");
    var setShort = function () {
      var short = phoneMq.matches && polMore.getAttribute("aria-expanded") !== "true";
      polList.classList.toggle("is-short", short);
      polMore.hidden = !phoneMq.matches || !short;
    };
    polMore.addEventListener("click", function () { polMore.setAttribute("aria-expanded", "true"); setShort(); polList.querySelectorAll(".pol")[4].focus && polList.querySelectorAll(".pol")[4].setAttribute("tabindex", "-1"); polList.querySelectorAll(".pol")[4].focus(); });
    phoneMq.addEventListener("change", setShort);
    setShort();
  }

  /* ---------- smooth scroll (Lenis 1.1.14, wheel and trackpad only; touch stays native) ---------- */
  var reduce = !!window.__rm;
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
    var headerH = function () { return top.offsetHeight + 12; };
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains("js-open") && typeof sheet.showModal === "function") return;
      var id = a.getAttribute("href"); if (id.length < 2) return;
      var t = document.querySelector(id); if (!t) return;
      e.preventDefault();
      lenis.scrollTo(t, { offset: -headerH(), duration: 1.1 });
      history.replaceState(null, "", id);
    });
    sheet.addEventListener("close", function () { lenis.start(); });
    var openNative = sheet.showModal && sheet.showModal.bind(sheet);
    if (openNative) sheet.showModal = function () { lenis.stop(); openNative(); };
  }

  /* ---------- reveals ---------- */
  // More blocks rise in, and siblings get a capped stagger index (--i)
  ["[data-anim]", ".lockup .display", ".lockup > .tag", ".steps-list li", ".ticket", ".filters", ".visit-block", ".signoff", ".menu-cta", ".work-foot", ".steps-foot", ".silk-copy"].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) { el.setAttribute("data-anim", ""); });
  });
  document.querySelectorAll(".steps-list, .gallery, .pol-list, .visit-grid").forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (el, i) { el.style.setProperty("--i", i); });
  });
  var anim = document.querySelectorAll("[data-anim], [data-draw]");
  function reveal() {
    if (reduce || !("IntersectionObserver" in window)) {
      anim.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    // A heading that starts fully clipped has no visible area, so the observer watches its parent block
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        (en.target._reveals || [en.target]).forEach(function (el) { el.classList.add("is-in"); });
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    anim.forEach(function (el) {
      var watch = el.classList.contains("display") ? el.parentElement : el;
      if (watch !== el) { (watch._reveals = watch._reveals || []).push(el); if (watch._reveals.length > 1) return; }
      io.observe(watch);
    });
    // Safety: anything above the screen after a jump shows at once
    window.addEventListener("hashchange", function () { anim.forEach(function (el) { if (el.getBoundingClientRect().bottom < 0) el.classList.add("is-in"); }); });
  }

  /* ---------- loader: tracks the fonts and the portrait, then lifts ---------- */
  var root = document.documentElement, ld = document.getElementById("ld");
  if (root.classList.contains("intro") && ld) {
    var rule = ld.querySelector(".ld-rule"), t0 = performance.now(), MIN = 720, MAX = 2400;
    var parts = { fonts: 0, photo: 0 };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { parts.fonts = 1; });
    var hero = document.querySelector(".hero-photo img");
    if (!hero || hero.complete) parts.photo = 1;
    else { hero.addEventListener("load", function () { parts.photo = 1; }); hero.addEventListener("error", function () { parts.photo = 1; }); }
    if (lenis) lenis.stop();
    var shown = 0, done = false;
    (function tick() {
      if (done) return;
      var el = performance.now() - t0;
      // The portrait reveals on its own, so only the fonts gate the loader (keeps first paint fast)
      var target = Math.min(parts.fonts, el / MIN);
      shown += (target - shown) * 0.18;
      rule.style.setProperty("--p", shown.toFixed(3));
      if ((target >= 1 && shown > 0.98) || el > MAX) finish(); else requestAnimationFrame(tick);
    })();
    function finish() {
      done = true;
      rule.style.setProperty("--p", 1);
      root.classList.add("ld-out");
      reveal(); // the hero rises while the loader lifts off it
      setTimeout(function () {
        root.classList.remove("intro", "ld-out");
        if (ld.parentNode) ld.parentNode.removeChild(ld);
        if (lenis) lenis.start();
      }, 720);
    }
    // Any key or tap skips it
    var skip = function () { if (!done) finish(); };
    window.addEventListener("keydown", skip, { once: true });
    ld.addEventListener("pointerdown", skip, { once: true });
  } else {
    if (ld && ld.parentNode) ld.parentNode.removeChild(ld);
    reveal();
  }

  /* ---------- phone dock: shows once the hero buttons scroll away ---------- */
  var dock = document.querySelector(".dock"), heroActions = document.querySelector(".hero-actions"), foot = document.querySelector(".foot");
  if (dock && heroActions && "IntersectionObserver" in window) {
    var heroGone = false, footIn = false;
    var paint = function () { dock.classList.toggle("is-on", heroGone && !footIn); };
    new IntersectionObserver(function (en) { heroGone = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; paint(); }).observe(heroActions);
    if (foot) new IntersectionObserver(function (en) { footIn = en[0].isIntersecting; paint(); }, { rootMargin: "0px 0px -40% 0px" }).observe(foot);
  }
})();
