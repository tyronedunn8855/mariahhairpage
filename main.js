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
  }

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
    var catName = cat.querySelector("h3").textContent.replace(/^\s*\d+\s*/, "").trim();
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

  /* ---------- reveals ---------- */
  var anim = document.querySelectorAll("[data-anim], [data-draw]");
  var reduce = !!window.__rm;
  if (reduce || !("IntersectionObserver" in window)) {
    anim.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    anim.forEach(function (el) { io.observe(el); });
  }
})();
