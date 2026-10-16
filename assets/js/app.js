/*
 * Site behaviour: theme, language switcher, menu, copy buttons, the step
 * player, roadmap progress and practice filters. Classic script (no modules)
 * so the built site also works when opened straight from the file system.
 */
(function () {
  "use strict";

  var doc = document.documentElement;
  var KEY = { theme: "dsa-academy:theme", lang: "dsa-academy:lang", progress: "dsa-academy:progress" };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(k, v) {
    try { if (v === undefined) return window.localStorage.getItem(k); window.localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ------------------------------------------------------------ theme
  function effectiveTheme() {
    var t = doc.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelTheme(btn) {
    btn.setAttribute("aria-label", effectiveTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  $$("[data-theme-toggle]").forEach(function (btn) {
    labelTheme(btn);
    btn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      doc.setAttribute("data-theme", next);
      store(KEY.theme, next);
      labelTheme(btn);
    });
  });

  // ------------------------------------------------------------- menu
  $$("[data-menu-toggle]").forEach(function (btn) {
    var nav = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
    });
  });

  // --------------------------------------------------------- language
  function currentLang() { return doc.getAttribute("data-lang"); }
  function syncLangUi() {
    var lang = currentLang();
    $$("[data-lang-select]").forEach(function (s) { s.value = lang; });
    $$(".code-tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-lang") === lang)); });
    // A block without the chosen language (some designs are Java-only)
    // falls back to its first language instead of showing nothing.
    $$(".codeblock").forEach(function (b) {
      var panes = $$(".code-pane", b);
      panes.forEach(function (p) { p.classList.remove("is-fallback"); });
      var has = panes.some(function (p) { return p.getAttribute("data-lang") === lang; });
      if (!has && panes[0]) {
        panes[0].classList.add("is-fallback");
        var tab = $('.code-tab[data-lang="' + panes[0].getAttribute("data-lang") + '"]', b);
        if (tab) tab.setAttribute("aria-selected", "true");
      }
    });
  }
  function setLang(lang) {
    doc.setAttribute("data-lang", lang);
    store(KEY.lang, lang);
    syncLangUi();
    document.dispatchEvent(new CustomEvent("dsa:lang", { detail: lang }));
  }
  $$("[data-lang-select]").forEach(function (s) { s.addEventListener("change", function () { setLang(s.value); }); });
  $$("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang")); });
  });
  // Arrow keys move between language tabs.
  $$(".code-tabs").forEach(function (list) {
    list.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var tabs = $$(".code-tab", list);
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[j].focus();
      setLang(tabs[j].getAttribute("data-set-lang"));
      e.preventDefault();
    });
  });
  // Another tab changed the language: follow it.
  window.addEventListener("storage", function (e) { if (e.key === KEY.lang && e.newValue) { doc.setAttribute("data-lang", e.newValue); syncLangUi(); document.dispatchEvent(new CustomEvent("dsa:lang")); } });
  syncLangUi();

  // ------------------------------------------------------------- copy
  $$("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pane = btn.closest(".code-pane");
      var text = $(".code-raw", pane).value;
      function done() {
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(function () { btn.textContent = "Copy code"; btn.classList.remove("copied"); }, 1800);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { btn.textContent = "Select and copy manually"; }
        document.body.removeChild(ta);
      }
    });
  });

  // ---------------------------------------------------- array renderer
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  var renderers = {};
  // Generic array renderer. A step's state looks like:
  //   { cells: [..], pointers: { name: index|null }, roles: { name: "left"|"right"|"mid" },
  //     marks: { index: "out"|"found"|"left"|"right"|"mid"|"new"|"done" },
  //     window: [from, to] | null, vars: { label: value }, good: "label" }
  renderers.array = {
    CELL: 56, GAP: 10, TOP: 44,
    create: function (stage, first) {
      var n = first.cells.length, R = this;
      var used = n * (R.CELL + R.GAP) - R.GAP;
      var width = Math.max(used, 330);
      var offset = (width - used) / 2;
      var svg = el("svg", { viewBox: (-6 - offset) + " 0 " + (width + 12) + " " + (R.TOP + R.CELL + 62), role: "img" });
      var win = el("rect", { "class": "v-window", y: R.TOP - 6, height: R.CELL + 12, rx: 10, width: 0 }, svg);
      var cells = [];
      for (var i = 0; i < n; i++) {
        var g = el("g", { "class": "v-cell", transform: "translate(" + i * (R.CELL + R.GAP) + "," + R.TOP + ")" }, svg);
        el("rect", { width: R.CELL, height: R.CELL, rx: 6 }, g);
        var t = el("text", { "class": "v-val", x: R.CELL / 2, y: R.CELL / 2 }, g);
        var ix = el("text", { "class": "v-idx", x: R.CELL / 2, y: R.CELL + 18 }, g);
        ix.textContent = i;
        cells.push({ g: g, val: t });
      }
      var ptrs = {};
      Object.keys(first.pointers || {}).forEach(function (name) {
        var role = (first.roles || {})[name] || "mid";
        var g = el("g", { "class": "v-ptr v-ptr-" + role }, svg);
        el("path", { d: "M-8 26h16l-8 11z" }, g);
        var tx = el("text", { x: 0, y: 18 }, g);
        tx.textContent = name;
        ptrs[name] = g;
      });
      var readout = el("text", { "class": "v-readout", x: -offset, y: R.TOP + R.CELL + 50 }, svg);
      stage.innerHTML = "";
      stage.appendChild(svg);
      return { svg: svg, cells: cells, ptrs: ptrs, readout: readout, win: win };
    },
    update: function (view, s) {
      var R = this, p = s.pointers || {}, marks = s.marks || {};
      view.cells.forEach(function (c, i) {
        var v = s.cells[i];
        c.val.textContent = v === null || v === undefined ? "" : v;
        c.g.setAttribute("class", "v-cell" + (marks[i] ? " is-" + marks[i] : "") + (v === null || v === undefined ? " is-empty" : ""));
      });
      if (s.window) {
        view.win.setAttribute("x", s.window[0] * (R.CELL + R.GAP) - 6);
        view.win.setAttribute("width", (s.window[1] - s.window[0] + 1) * (R.CELL + R.GAP) - R.GAP + 12);
        view.win.style.opacity = 1;
      } else view.win.style.opacity = 0;
      // Pointers on the same cell fan out so every label stays readable.
      var byIdx = {};
      Object.keys(view.ptrs).forEach(function (name) {
        var idx = p[name];
        if (idx === null || idx === undefined) return;
        (byIdx[idx] = byIdx[idx] || []).push(name);
      });
      Object.keys(view.ptrs).forEach(function (name) {
        var g = view.ptrs[name], idx = p[name];
        var hidden = idx === null || idx === undefined;
        g.classList.toggle("is-hidden", hidden);
        if (hidden) return;
        var group = byIdx[idx], k = group.indexOf(name);
        var dx = (k - (group.length - 1) / 2) * 30;
        g.style.transform = "translate(" + (idx * (R.CELL + R.GAP) + R.CELL / 2 + dx) + "px, 0px)";
      });
      view.readout.textContent = "";
      Object.keys(s.vars || {}).forEach(function (label, i) {
        var a = el("tspan", { dx: i ? 18 : 0 }, view.readout);
        a.textContent = label + " = ";
        var b = el("tspan", { "class": s.good === label ? "v-good" : "v-strong" }, view.readout);
        b.textContent = s.vars[label];
      });
    }
  };

  // ----------------------------------------------------------- player
  function Player(root) {
    var cfg = JSON.parse(root.getAttribute("data-player"));
    var vis = window.DSAVisualizers[cfg.visualizer];
    var renderer = renderers[vis.renderer];
    var stage = $(".v-stage", root), caption = $(".caption", root), counter = $("[data-counter]", root);
    var btn = {};
    $$("[data-act]", root).forEach(function (b) { btn[b.getAttribute("data-act")] = b; });
    var speedSel = $("[data-speed]", root);
    var form = $(".try-form", root), errorBox = $(".form-error", root);
    var steps = [], i = 0, view = null, timer = null;

    function highlightCode() {
      if (!cfg.codeId) return;
      var block = document.getElementById(cfg.codeId);
      if (!block) return;
      $$(".ln.is-active", block).forEach(function (l) { l.classList.remove("is-active"); });
      var pane = $('.code-pane[data-lang="' + currentLang() + '"]', block) || $(".code-pane.is-fallback", block);
      if (!pane || !steps[i]) return;
      var anchors = JSON.parse(pane.getAttribute("data-anchors"));
      (anchors[steps[i].anchor] || []).forEach(function (n) {
        var line = $('.ln[data-line="' + n + '"]', pane);
        if (line) line.classList.add("is-active");
      });
    }

    function show(k) {
      i = Math.max(0, Math.min(k, steps.length - 1));
      renderer.update(view, steps[i].state);
      caption.textContent = steps[i].caption;
      counter.textContent = "Step " + (i + 1) + " of " + steps.length;
      btn.back.disabled = i === 0;
      btn.forward.disabled = i === steps.length - 1;
      highlightCode();
    }

    function stop() {
      clearInterval(timer); timer = null;
      root.classList.remove("playing");
      btn.play.setAttribute("aria-label", "Play");
    }
    function play() {
      if (i >= steps.length - 1) show(0);
      root.classList.add("playing");
      btn.play.setAttribute("aria-label", "Pause");
      clearInterval(timer);
      timer = setInterval(function () {
        if (i >= steps.length - 1) return stop();
        show(i + 1);
      }, Number(speedSel.value));
    }

    function load(input) {
      stop();
      steps = vis.generate(input);
      view = renderer.create(stage, steps[0].state);
      show(0);
    }

    btn.play.addEventListener("click", function () { timer ? stop() : play(); });
    btn.forward.addEventListener("click", function () { stop(); show(i + 1); });
    btn.back.addEventListener("click", function () { stop(); show(i - 1); });
    btn.restart.addEventListener("click", function () { stop(); show(0); });
    speedSel.addEventListener("change", function () { if (timer) play(); });
    root.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowRight") { stop(); show(i + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { stop(); show(i - 1); e.preventDefault(); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = {};
      vis.inputs.forEach(function (f) { raw[f.name] = form.elements[f.name].value; });
      var r = vis.parse(raw);
      if (r.error) { errorBox.textContent = r.error; return; }
      errorBox.textContent = "";
      load(r.value);
      if (!reduceMotion) play();
    });
    document.addEventListener("dsa:lang", highlightCode);

    load(cfg.input);

    if (cfg.autoplay && !reduceMotion && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { io.disconnect(); setTimeout(play, 600); }
      }, { threshold: 0.6 });
      io.observe(root);
    }
  }
  $$("[data-player]").forEach(function (p) { new Player(p); });

  // ------------------------------------------------- roadmap progress
  var roadmap = $(".roadmap");
  if (roadmap) {
    var done;
    try { done = JSON.parse(store(KEY.progress) || "[]"); } catch (e) { done = []; }
    var doneSet = {};
    done.forEach(function (id) { doneSet[id] = true; });
    var topicsEls = $$(".topic", roadmap);

    function save() {
      store(KEY.progress, JSON.stringify(Object.keys(doneSet).filter(function (k) { return doneSet[k]; })));
    }
    function setMeter(m, n, total) {
      m.setAttribute("aria-valuenow", n);
      m.setAttribute("aria-valuetext", n + " of " + total + " done");
      m.firstElementChild.style.width = (total ? (100 * n) / total : 0) + "%";
    }
    function refresh() {
      var count = 0, next = null;
      topicsEls.forEach(function (t) {
        var id = t.getAttribute("data-topic");
        var isDone = !!doneSet[id];
        $("[data-done]", t).checked = isDone;
        t.classList.toggle("is-done", isDone);
        t.classList.remove("is-next");
        $$("[data-need]", t).forEach(function (a) { a.classList.toggle("is-met", !!doneSet[a.getAttribute("data-need")]); });
        if (isDone) count++;
        else if (!next) {
          var needs = (t.getAttribute("data-needs") || "").split(" ").filter(Boolean);
          if (needs.every(function (n) { return doneSet[n]; })) next = t;
        }
      });
      $$(".stage", roadmap).forEach(function (s) {
        var ts = $$(".topic", s), n = ts.filter(function (t) { return doneSet[t.getAttribute("data-topic")]; }).length;
        setMeter($("[data-stage-meter]", s), n, ts.length);
        s.classList.toggle("is-complete", n === ts.length);
      });
      $("[data-done-count]").textContent = count;
      setMeter($("[data-total-meter]"), count, topicsEls.length);
      var nu = $("[data-next-up]");
      if (next) {
        next.classList.add("is-next");
        var name = $(".topic-name", next).textContent;
        nu.innerHTML = "";
        nu.appendChild(document.createTextNode("Next up: "));
        var a = document.createElement("a");
        a.href = "#" + next.id; a.textContent = name;
        nu.appendChild(a);
      } else {
        nu.textContent = count === topicsEls.length ? "You've finished every topic on the roadmap." : "Finish the prerequisites above to unlock the next topic.";
      }
    }
    $$("[data-done]", roadmap).forEach(function (cb) {
      cb.addEventListener("change", function () {
        doneSet[cb.getAttribute("data-done")] = cb.checked;
        save(); refresh();
      });
    });
    var reset = $("[data-reset-progress]");
    reset.addEventListener("click", function () {
      if (!window.confirm("Clear all progress on this roadmap? This can't be undone.")) return;
      doneSet = {}; save(); refresh();
    });
    refresh();
  }

  // -------------------------------------------------- practice filters
  var filters = $("[data-filters]");
  if (filters) {
    var rows = $$("table.practice tbody tr");
    var out = $("[data-filter-count]");
    filters.addEventListener("change", function () {
      var f = { pattern: filters.elements.pattern.value, structures: filters.elements.structures.value, difficulty: filters.elements.difficulty.value };
      var shown = 0;
      rows.forEach(function (r) {
        var ok = (!f.pattern || r.getAttribute("data-pattern") === f.pattern) &&
          (!f.difficulty || r.getAttribute("data-difficulty") === f.difficulty) &&
          (!f.structures || r.getAttribute("data-structures").split(" ").indexOf(f.structures) > -1);
        r.hidden = !ok;
        if (ok) shown++;
      });
      out.textContent = shown === 0 ? "No problems match these filters. Clear one to see more." : shown + " problem" + (shown === 1 ? "" : "s");
    });
  }
})();
