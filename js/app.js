/* First-Year Engineering Calendar.

   One page, four surfaces: the calendar itself (week or month, filtered), the
   flyer showcase that cycles through whatever is in view, a full-screen
   slideshow for lobby screens and lecture halls, and the two office workflows —
   submitting an event and reviewing the queue.

   Rendering is deliberately targeted rather than wholesale: the showcase ticks
   five times a second, so only the pieces that actually changed get rebuilt,
   and the surfaces that hold typed-in text (the submit form, the reviewer's
   feedback box) are built once and patched in place. */
(function () {
  "use strict";

  var D = window.CalDates;
  var C = window.CalData;
  var S = window.CalStore;   /* the live calendar: seed + everything since */
  var ICS = window.CalIcs;

  /* ======================================================================
     DOM helpers
     ====================================================================== */

  function append(node, kids) {
    if (kids === null || kids === undefined || kids === false) return;
    if (Array.isArray(kids)) {
      kids.forEach(function (k) { append(node, k); });
    } else if (typeof kids === "string" || typeof kids === "number") {
      node.appendChild(document.createTextNode(String(kids)));
    } else {
      node.appendChild(kids);
    }
  }

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (key) {
      var v = props[key];
      if (v === null || v === undefined || v === false) return;
      if (key === "class") node.className = v;
      else if (key === "text") node.textContent = v;
      else if (key === "value") node.value = v;
      else if (key === "onClick") node.addEventListener("click", v);
      else if (key === "onChange") node.addEventListener("change", v);
      else if (key === "onInput") node.addEventListener("input", v);
      else if (key === "onKeyDown") node.addEventListener("keydown", v);
      else if (v === true) node.setAttribute(key, "");
      else node.setAttribute(key, v);
    });
    append(node, kids);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fill(node, kids) {
    clear(node);
    append(node, kids);
  }

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function one(selector, root) {
    return (root || document).querySelector(selector);
  }

  /* ======================================================================
     State
     ====================================================================== */

  var state = {
    anchor: C.CONFIG.today,
    view: C.CONFIG.defaultView === "month" ? "month" : "week",
    active: 0,          // index into visible(), the flyer on the stage
    t: 0,               // 0..1 progress through the current slide
    selected: {},       // filter group key -> chosen tag
    query: "",          // free-text search, across every field a student reads
    detailId: null,
    submitOpen: false,
    submitted: false,
    reviewOpen: false,
    slideshow: false,

    // submit form — the draft survives closing and reopening the overlay
    draft: null,
    errors: {},
    customTags: [],

    // review queue
    reviewSel: 0,
    approvedNew: [],
    changesOpen: false,
    feedback: "",
    note: ""
  };

  var overlays = one("#overlays");

  /* Whatever had focus before an overlay opened, so closing it puts the caret
     back where the user left it rather than at the top of the document. */
  var focusBeforeOverlay = null;

  /* A short-lived line under the toolbar: "Copied", "3 events downloaded". */
  var toastTimer = null;

  function toast(message) {
    var node = one("#toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    syncSubRow();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.hidden = true;
      syncSubRow();
    }, 2600);
  }

  /* ======================================================================
     Derived data
     ====================================================================== */

  /* Whole days apart, counted off the calendar rather than off the clock:
     subtracting two local midnights across a daylight-saving change is an
     hour out, which is enough to miscount the weeks in a month. */
  function daysBetween(a, b) {
    return Math.round((
      Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
    ) / 86400000);
  }

  /* The month grid always runs whole Monday-to-Sunday weeks, so it reaches
     into the months either side. Those days are drawn, and what is drawn is
     what is in view — otherwise the grid shows events the count denies. */
  function monthSpan(anchor) {
    var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    var start = D.mondayOf(first);
    var weeks = Math.ceil((daysBetween(start, last) + 1) / 7);
    return {
      from: start,
      to: D.addDays(start, weeks * 7 - 1),
      month: first.getMonth(),
      year: first.getFullYear(),
      weeks: weeks
    };
  }

  /* The date span the calendar is showing: a Monday-to-Sunday week, or the
     weeks a calendar month is drawn across. */
  function range() {
    var a = D.fromIso(state.anchor);
    if (state.view === "month") return monthSpan(a);
    var mon = D.mondayOf(a);
    return { from: mon, to: D.addDays(mon, 6) };
  }

  /* An event survives a filter group if it carries the chosen tag — or, for
     the discipline group, if it is open to all disciplines. */
  function matchesFilters(ev) {
    var tags = S.allTags(ev);
    return C.GROUPS.every(function (g) {
      var chosen = state.selected[g.key];
      if (!chosen) return true;
      if (tags.indexOf(chosen) > -1) return true;
      return !!g.openToAll && tags.indexOf("All disciplines") > -1;
    });
  }

  /* Search reads everything a student sees, tags included — the submit form
     promises organisers their own tags are searchable, so they have to be.
     Words are ANDed, so "cookie friday" narrows rather than widens. */
  function matchesQuery(ev) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    var haystack = [ev.title, ev.org, ev.place, ev.blurb]
      .concat(S.allTags(ev)).join(" ").toLowerCase();
    return q.split(/\s+/).every(function (word) {
      return haystack.indexOf(word) > -1;
    });
  }

  function keep(ev) {
    return matchesFilters(ev) && matchesQuery(ev);
  }

  function byWhen(a, b) {
    return a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1);
  }

  function eventsOn(iso) {
    return S.events()
      .filter(function (e) { return e.date === iso && keep(e); })
      .sort(function (a, b) { return a.start - b.start; });
  }

  /* Everything in range and past the filters, in the order it happens. */
  function visible() {
    var r = range();
    var from = D.toIso(r.from);
    var to = D.toIso(r.to);
    return S.events()
      .filter(function (e) { return e.date >= from && e.date <= to && keep(e); })
      .sort(byWhen);
  }

  /* Matches anywhere on the calendar, not just in view — a search that finds
     nothing this week should say how much it would find if you looked wider. */
  function matchesEverywhere() {
    return S.events().filter(keep).sort(byWhen);
  }

  function isToday(iso) { return iso === C.CONFIG.today; }
  function isPast(iso) { return iso < C.CONFIG.today; }

  /* Null when the view is empty — the showcase then says so rather than
     putting some other week's flyer on the stage. */
  function current(vis) {
    vis = vis || visible();
    if (!vis.length) return null;
    return vis[Math.min(state.active, vis.length - 1)];
  }

  /* The soonest event that would still answer the current filters and search,
     for the "jump ahead" offer on an empty view. Null once the last one has
     passed. */
  function nextUpcoming() {
    return matchesEverywhere().filter(function (e) {
      return e.date >= C.CONFIG.today;
    })[0] || null;
  }

  function anyFilter() {
    return Object.keys(state.selected).length > 0;
  }

  function anyNarrowing() {
    return anyFilter() || state.query.trim().length > 0;
  }

  function rangeLabel() {
    var r = range();
    var M = D.MONTHS;
    /* The month view is named for its month, not for the neighbouring Monday
       its grid happens to start on. */
    if (state.view === "month") return M[r.month] + " " + r.year;
    if (r.from.getMonth() === r.to.getMonth()) {
      return M[r.from.getMonth()] + " " + r.from.getDate() + " – " + r.to.getDate() + ", " + r.to.getFullYear();
    }
    return M[r.from.getMonth()] + " " + r.from.getDate() + " – " +
      M[r.to.getMonth()] + " " + r.to.getDate() + ", " + r.to.getFullYear();
  }

  /* ======================================================================
     Flyers
     ====================================================================== */

  /* Three ways an event's flyer can appear: the artwork itself, a small
     cover-cropped thumbnail, and — for an event with no flyer yet — a set
     page built from the event's own text so the stage never goes blank. */
  function flyerNode(ev, mode) {
    var flyer = S.flyerOf(ev);

    if (flyer) {
      return el("img", {
        class: "flyer flyer--" + mode,
        src: flyer.image,
        alt: ev.title + " flyer",
        loading: mode === "thumb" ? "lazy" : null
      });
    }

    if (mode !== "stage") {
      return el("span", { class: "flyer-placeholder" }, el("span", { text: "Flyer to come" }));
    }

    return el("div", { class: "flyer-set" }, [
      el("div", { class: "flyer-set__org", text: ev.org }),
      el("div", { class: "flyer-set__title", text: ev.title }),
      el("div", { class: "flyer-set__meta", text: ev.time + " · " + ev.place }),
      el("div", { class: "flyer-set__blurb", text: ev.blurb }),
      el("div", { class: "flyer-set__note", text: "Flyer page not yet submitted" })
    ]);
  }

  /* ======================================================================
     Actions
     ====================================================================== */

  function go(i) {
    var n = Math.max(1, visible().length);
    state.active = ((i % n) + n) % n;
    state.t = 0;
    renderShowcase();
    scrollActiveIntoView();
  }

  function shift(dir) {
    var a = D.fromIso(state.anchor);
    var next = state.view === "month"
      ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
      : D.addDays(a, dir * 7);
    state.anchor = D.toIso(next);
    state.active = 0;
    state.t = 0;
    render();
  }

  function setView(view) {
    if (state.view === view) return;
    state.view = view;
    state.active = 0;
    state.t = 0;
    render();
  }

  function setFilter(key, value) {
    if (value) state.selected[key] = value;
    else delete state.selected[key];
    state.active = 0;
    state.t = 0;
    render();
  }

  function clearFilters() {
    state.selected = {};
    state.query = "";
    var box = one("#search");
    if (box) box.value = "";
    state.active = 0;
    state.t = 0;
    render();
  }

  function setQuery(value) {
    state.query = value;
    state.active = 0;
    state.t = 0;
    render();
  }

  function goToDate(iso) {
    state.anchor = iso;
    state.active = 0;
    state.t = 0;
    render();
  }

  /* ======================================================================
     Routing

     Four things belong in the URL: an event, and the three overlays. An event
     link is the one a student sends a friend, and putting the overlays there
     too means the browser's Back button closes them, which on a phone is the
     gesture people actually reach for.

     The hash is written by the state, never read back into it except through
     `applyRoute`, so there is exactly one direction of flow.
     ====================================================================== */

  var applyingRoute = false;

  function hashForState() {
    if (state.detailId) return "#event/" + encodeURIComponent(state.detailId);
    if (state.reviewOpen) return "#review";
    if (state.submitOpen) return "#submit";
    if (state.slideshow) return "#slideshow";
    return "";
  }

  function syncHash() {
    if (applyingRoute) return;
    var want = hashForState();
    if ((location.hash || "") === want) return;

    var url = location.pathname + location.search + want;
    var standingOnOurs = !!(history.state && history.state.fye);

    if (!want) {
      /* Closing: rewind when we are standing on an entry we pushed, and
         otherwise just tidy the URL — calling back() on the entry the user
         arrived at would take them off the site entirely. */
      if (standingOnOurs) history.back();
      else history.replaceState(null, "", url);
      return;
    }

    /* Opening from the calendar pushes, so Back closes. Moving between
       overlays — stepping through events in the modal, most of all —
       replaces: twenty flyers read in a row should not be twenty presses of
       Back to get out of, and Escape has to close on the first press. */
    if (standingOnOurs) history.replaceState({ fye: true }, "", url);
    else history.pushState({ fye: true }, "", url);
  }

  function applyRoute() {
    var raw = location.hash || "";
    var lower = raw.toLowerCase();
    var event = /^#event\/(.+)$/i.exec(raw);

    applyingRoute = true;
    state.detailId = null;
    state.submitOpen = false;
    state.reviewOpen = false;
    state.slideshow = false;

    if (event) {
      var id = decodeURIComponent(event[1]);
      var found = S.eventById(id);
      if (found) {
        state.detailId = id;
        /* A link to an event has to land on the week that holds it. */
        if (found.date < D.toIso(range().from) || found.date > D.toIso(range().to)) {
          state.anchor = found.date;
        }
      }
    } else if (lower === "#review") {
      state.reviewOpen = true;
      state.note = "";
    } else if (lower === "#submit") {
      state.submitOpen = true;
    } else if (lower === "#slideshow") {
      /* Set on arrival without asking for fullscreen — that needs a gesture,
         and a page load is not one. */
      state.slideshow = true;
    }

    applyingRoute = false;
    render();
  }

  function openDetail(id) {
    if (!state.detailId) focusBeforeOverlay = document.activeElement;
    state.detailId = id;
    render();
  }

  function closeDetail() {
    state.detailId = null;
    render();
    restoreFocus();
  }

  /* Step through the events in view from inside the detail modal. */
  function stepDetail(dir) {
    var vis = visible();
    if (vis.length < 2) return;
    var at = vis.findIndex(function (e) { return e.id === state.detailId; });
    if (at === -1) return;
    var next = vis[((at + dir) % vis.length + vis.length) % vis.length];
    state.detailId = next.id;
    state.active = vis.indexOf(next);
    state.t = 0;
    render();
  }

  function restoreFocus() {
    var node = focusBeforeOverlay;
    focusBeforeOverlay = null;
    if (node && document.contains(node) && typeof node.focus === "function") {
      node.focus();
    }
  }

  /* ======================================================================
     Overlay bookkeeping — any full-surface overlay freezes the page behind it
     ====================================================================== */

  function overlayOpen() {
    return state.submitOpen || state.reviewOpen || state.slideshow || !!state.detailId;
  }

  function syncOverlayState() {
    var locked = overlayOpen();
    var value = locked ? "hidden" : "";
    document.body.style.overflow = value;
    document.documentElement.style.overflow = value;

    /* The page behind an overlay is visible but must not be reachable: without
       this, Tab walks straight out of the dialog into the calendar underneath
       and a screen reader reads both at once. */
    var app = one(".app");
    if (app) {
      app.inert = locked;
      if (locked) app.setAttribute("aria-hidden", "true");
      else app.removeAttribute("aria-hidden");
    }
  }

  /* ======================================================================
     The showcase: stage, hero line, countdown and reel
     ====================================================================== */

  function scrollActiveIntoView() {
    var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* After the DOM settles, centre the active row in each reel. scrollIntoView
       is no good here — it would drag the whole page along with the list. */
    setTimeout(function () {
      all("[data-reel]").forEach(function (list) {
        var item = one('[data-active="true"]', list);
        if (!item) return;
        var top = item.offsetTop - list.offsetTop - (list.clientHeight - item.clientHeight) / 2;
        list.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
      });
    }, 60);
  }

  /* What the stage shows when the week or month holds nothing: why it is empty,
     and a way forward when there is still something later on the calendar. */
  function emptyStageNode() {
    var narrowed = anyNarrowing();
    var upcoming = nextUpcoming();
    var elsewhere = narrowed ? matchesEverywhere().length : 0;

    var line = narrowed
      ? (state.query.trim()
          ? "Nothing here matches “" + state.query.trim() + "”."
          : "Nothing here matches that filter.")
      : "Nothing scheduled this " + (state.view === "month" ? "month" : "week") + ".";

    return el("div", { class: "stage-empty" }, [
      el("div", { class: "stage-empty__line", text: line }),
      /* When a narrowed view still has hits further out, say so before
         offering to throw the search away — jumping is usually what was
         meant. */
      narrowed && elsewhere
        ? el("div", {
            class: "stage-empty__hint",
            text: elsewhere === 1
              ? "1 match elsewhere on the calendar."
              : elsewhere + " matches elsewhere on the calendar."
          })
        : null,
      upcoming
        ? el("button", {
            type: "button",
            class: "btn-quiet",
            text: (narrowed ? "First match · " : "Next event · ") + D.longDayLabel(upcoming.date),
            onClick: function () { goToDate(upcoming.date); }
          })
        : null,
      narrowed
        ? el("button", {
            type: "button", class: "btn-quiet", text: "Clear filters and search",
            onClick: clearFilters
          })
        : null
    ]);
  }

  function paintStage(node, cur) {
    /* A sentinel key so an empty stage is not repainted every tick either. It
       has to name everything the empty message reads — the anchor and the
       query included, or stepping between two empty weeks leaves the previous
       week's "Next event" date sitting on the stage. */
    var key = cur
      ? cur.id
      : ["empty", state.view, state.anchor, state.query,
         JSON.stringify(state.selected)].join("~");
    if (node.dataset.event === key) return;
    node.dataset.event = key;
    fill(node, cur ? flyerNode(cur, "stage") : emptyStageNode());
  }

  /* Two reels share this markup: the page's numbered running order, and the
     slideshow's compact "what's next" list. */
  function buildReel(list, vis) {
    var compact = list.dataset.reel === "fx";

    fill(list, vis.map(function (ev, i) {
      var d = D.fromIso(ev.date);
      var when = compact
        ? D.DOW[D.dowIndex(d)] + " " + d.getDate() + " · " + ev.time
        : D.longDayLabel(ev.date) + " · " + ev.time;

      var lines = [
        el("span", { class: "reel__title", text: ev.title }),
        el("span", { class: "reel__when", text: when })
      ];

      return el("button", {
        type: "button",
        class: "reel__item" +
          (isPast(ev.date) ? " is-past" : "") +
          (isToday(ev.date) ? " is-today" : ""),
        onClick: function () { go(i); }
      }, compact ? lines : [
        el("span", { class: "reel__n", text: String(i + 1).padStart(2, "0") }),
        el("span", { class: "reel__text" }, lines)
      ]);
    }));
  }

  function renderShowcase() {
    var vis = visible();
    var cur = current(vis);
    var activeIndex = Math.min(state.active, Math.max(0, vis.length - 1));
    var signature = vis.map(function (e) { return e.id; }).join("|");

    /* Nothing to show: the showcase collapses to its one line instead of
       holding open 60vh of empty stage. */
    var showcase = one("[data-showcase]");
    if (showcase) showcase.classList.toggle("is-empty", !cur);

    all("[data-stage]").forEach(function (node) { paintStage(node, cur); });

    all("[data-cur]").forEach(function (node) {
      var field = node.dataset.cur;
      if (!cur) { node.textContent = ""; return; }
      if (field === "org") node.textContent = cur.org;
      else if (field === "title") node.textContent = cur.title;
      else if (field === "place") node.textContent = cur.place;
      else if (field === "when") node.textContent = D.longDayLabel(cur.date) + ", " + cur.time;
    });

    all("[data-reel]").forEach(function (list) {
      if (list.dataset.signature !== signature) {
        buildReel(list, vis);
        list.dataset.signature = signature;
      }
      all(".reel__item", list).forEach(function (item, i) {
        item.setAttribute("data-active", i === activeIndex ? "true" : "false");
      });
    });

    paintCountdown(vis);
  }

  function paintCountdown(vis) {
    vis = vis || visible();
    var secs = C.CONFIG.slideSeconds;
    var left = Math.max(1, Math.ceil(secs * (1 - state.t)));
    /* Empty views say so on the stage itself, so the line under it goes quiet.
       So does a paused one — a frozen number counting nothing down reads as a
       bug rather than as a deliberate hold. */
    var text = vis.length > 1
      ? (timerRunning() ? "Next event in " + left + "s" : "Paused")
      : vis.length === 1 ? "One event in this view" : "";
    all("[data-countdown]").forEach(function (node) { node.textContent = text; });
  }

  /* ======================================================================
     Filters — built once, then patched, so a select keeps focus on change
     ====================================================================== */

  var filtersBuilt = false;

  /* The custom group is the one list that grows: a tag the office approves in
     the review queue has to be filterable straight away. */
  function chipsFor(g) {
    return g.key === "custom" ? S.customTags() : g.chips;
  }

  function paintOptions(select, g) {
    var options = [{ value: "", label: g.any }].concat(
      chipsFor(g).map(function (c) { return { value: c, label: c }; })
    );
    var signature = options.map(function (o) { return o.value; }).join("|");
    if (select.dataset.options === signature) return;
    select.dataset.options = signature;
    fill(select, options.map(function (o) {
      return el("option", { value: o.value, text: o.label });
    }));
  }

  function renderFilters() {
    var host = one("#filters");

    if (!filtersBuilt) {
      fill(host, C.GROUPS.map(function (g) {
        return el("select", {
          class: "filters__select",
          "data-group": g.key,
          "aria-label": g.any,
          onChange: function (e) { setFilter(g.key, e.target.value); }
        });
      }).concat(
        el("button", {
          type: "button",
          class: "btn-link",
          "data-clear": true,
          onClick: clearFilters,
          text: "Clear"
        })
      ));
      filtersBuilt = true;
    }

    all("select[data-group]", host).forEach(function (select) {
      var g = C.GROUPS.filter(function (x) { return x.key === select.dataset.group; })[0];
      paintOptions(select, g);

      var chosen = state.selected[select.dataset.group] || "";
      /* A filter can be left pointing at a tag that no longer exists — the
         event carrying it was declined out of the queue, say. Drop it rather
         than filtering everything away with an option nobody can see. */
      if (chosen && chipsFor(g).indexOf(chosen) === -1) {
        delete state.selected[select.dataset.group];
        chosen = "";
      }
      if (select.value !== chosen) select.value = chosen;
      select.classList.toggle("is-on", !!chosen);
    });

    one("[data-clear]", host).hidden = !anyNarrowing();
  }

  /* ======================================================================
     Toolbar
     ====================================================================== */

  function renderToolbar() {
    var vis = visible();
    var label = rangeLabel();
    all("[data-range]").forEach(function (node) { node.textContent = label; });

    one("#visible-count").textContent =
      (vis.length === 1 ? "1 event" : vis.length + " events") +
      (anyNarrowing() ? " matching" : " showing");

    one('[data-action="view-week"]').classList.toggle("is-on", state.view === "week");
    one('[data-action="view-month"]').classList.toggle("is-on", state.view === "month");

    /* Nothing in view is nothing to export. */
    var download = one('[data-action="download-view"]');
    download.disabled = vis.length === 0;
    download.title = vis.length === 1
      ? "Download this event as a calendar file"
      : "Download these " + vis.length + " events as a calendar file";

    /* Only offered once the visitor has actually changed something — for
       everyone else it is a button that undoes nothing. */
    one('[data-action="reset-store"]').hidden = !S.isDirty();
    syncSubRow();
  }

  /* The strip under the toolbar collapses entirely when it holds nothing, so
     an empty row never opens a gap in the rule above the calendar. */
  function syncSubRow() {
    var row = one("#toolbar-sub");
    row.hidden = Array.prototype.every.call(row.children, function (node) {
      return node.hidden;
    });
  }

  function downloadView() {
    var vis = visible();
    if (!ICS.download(vis, "fye-" + rangeLabel())) return;
    toast(vis.length === 1 ? "1 event downloaded" : vis.length + " events downloaded");
  }

  /* ======================================================================
     Week and month grids
     ====================================================================== */

  function eventCard(ev) {
    return el("button", {
      type: "button",
      class: "eventcard" + (isPast(ev.date) ? " is-past" : ""),
      onClick: function () { openDetail(ev.id); }
    }, [
      el("span", { class: "eventcard__thumb" }, flyerNode(ev, "thumb")),
      el("span", { class: "eventcard__body" }, [
        el("span", { class: "eventcard__time", text: ev.time }),
        el("span", { class: "eventcard__title", text: ev.title }),
        el("span", { class: "eventcard__place", text: ev.place })
      ])
    ]);
  }

  /* A day with nothing in it means two different things, and saying the wrong
     one sends people looking for events that were only ever filtered out. */
  function emptyDayText() {
    return anyNarrowing() ? "No matches" : "Nothing scheduled";
  }

  function weekGrid() {
    var r = range();
    var vis = visible();

    return el("section", { class: "week" },
      el("div", { class: "week__grid" }, D.DOW.map(function (label, i) {
        var d = D.addDays(r.from, i);
        var iso = D.toIso(d);
        var events = vis.filter(function (e) { return e.date === iso; });

        return el("div", {
          class: "week__day" +
            (isToday(iso) ? " is-today" : "") +
            (isPast(iso) ? " is-past" : "")
        }, [
          el("div", { class: "week__head" }, [
            /* The month prints on the first column and wherever a month turns over. */
            el("div", {
              class: "week__month",
              text: (d.getDate() === 1 || i === 0) ? D.MSHORT[d.getMonth()] : ""
            }),
            el("div", { class: "week__date" }, [
              el("span", { class: "week__num", text: String(d.getDate()) }),
              el("span", { class: "week__dow", text: label }),
              isToday(iso) ? el("span", { class: "week__today", text: "Today" }) : null
            ])
          ]),
          el("div", { class: "week__events" },
            events.length
              ? events.map(eventCard)
              : el("div", { class: "week__empty", text: emptyDayText() })
          )
        ]);
      }))
    );
  }

  function monthGrid() {
    var r = range();
    var cells = [];

    for (var i = 0; i < r.weeks * 7; i++) {
      var d = D.addDays(r.from, i);
      var iso = D.toIso(d);
      var inMonth = d.getMonth() === r.month;
      /* A day that starts a month says so, rather than repeating a bare 1. */
      var num = d.getDate() === 1 ? D.MSHORT[d.getMonth()] + " 1" : String(d.getDate());

      cells.push(el("div", {
        class: "month__cell" +
          (inMonth ? "" : " is-outside") +
          (isToday(iso) ? " is-today" : "") +
          (isPast(iso) ? " is-past" : "")
      }, [
        el("div", { class: "month__num", text: num }),
        el("div", { class: "month__events" }, eventsOn(iso).map(function (ev) {
          return el("button", {
            type: "button",
            class: "monthevent" + (isPast(ev.date) ? " is-past" : ""),
            onClick: function () { openDetail(ev.id); }
          }, [
            el("span", { class: "monthevent__time", text: ev.time }),
            el("span", { class: "monthevent__title", text: ev.title })
          ]);
        }))
      ]));
    }

    return el("section", { class: "month" }, [
      el("div", { class: "month__dow" }, D.DOW.map(function (label) {
        return el("div", { text: label });
      })),
      el("div", { class: "month__grid" }, cells)
    ]);
  }

  var gridSignature = null;

  /* Bumped whenever the store changes underneath us, so every cache keyed on
     a signature knows to let go. */
  var revision = 0;
  S.onChange(function () { revision++; });

  function renderCalendar() {
    /* The grid only depends on the view, the anchor, the filters and the
       search — not on which flyer is on the stage — so it is rebuilt only
       when one of those changes. `revision` covers events published out of
       the review queue, which change the grid without changing the view. */
    var signature = [state.view, state.anchor, state.query,
                     JSON.stringify(state.selected), revision].join("~");
    if (signature === gridSignature) return;
    gridSignature = signature;
    fill(one("#calendar"), state.view === "month" ? monthGrid() : weekGrid());
  }

  /* ======================================================================
     Event detail
     ====================================================================== */

  /* The link that identifies this event anywhere — what Copy link puts on the
     clipboard and what a shared URL resolves back to. */
  function linkTo(ev) {
    return location.origin === "null" || location.protocol === "file:"
      ? location.href.split("#")[0] + "#event/" + encodeURIComponent(ev.id)
      : location.origin + location.pathname + location.search +
        "#event/" + encodeURIComponent(ev.id);
  }

  function copyLink(ev) {
    var url = linkTo(ev);
    var done = function () { toast("Link copied"); };
    var failed = function () {
      /* Clipboard access is refused on insecure origins and in some embedded
         browsers; showing the URL still lets someone copy it by hand. */
      window.prompt("Copy this link", url);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, failed);
    } else {
      failed();
    }
  }

  function detailOverlay(ev) {
    var flyer = S.flyerOf(ev);
    var vis = visible();
    var stepable = vis.length > 1 && vis.some(function (e) { return e.id === ev.id; });

    var panel = el("div", {
      class: "modal__panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": ev.title,
      tabindex: "-1",
      onClick: function (e) { e.stopPropagation(); }
    }, [
      el("div", { class: "modal__flyer" }, flyerNode(ev, "stage")),
      el("div", { class: "modal__info" }, [
        el("div", { class: "modal__topline" }, [
          el("div", { class: "kicker", text: ev.org }),
          isPast(ev.date)
            ? el("span", { class: "badge badge--past", text: "Already happened" })
            : isToday(ev.date)
              ? el("span", { class: "badge badge--today", text: "Today" })
              : null
        ]),
        el("h2", { class: "modal__title", text: ev.title }),
        el("div", { class: "modal__rule" }),
        el("div", { class: "modal__when", text: D.longDayLabel(ev.date) + ", " + ev.time }),
        el("div", { class: "modal__place", text: ev.place }),
        el("p", { class: "modal__blurb", text: ev.blurb }),
        el("div", { class: "chips" }, S.allTags(ev).map(function (t) {
          return el("span", { class: "chip", text: t });
        })),
        el("div", { class: "modal__actions" }, [
          el("button", {
            type: "button", class: "btn-primary", text: "Add to calendar",
            onClick: function () {
              if (ICS.download([ev], ev.title)) toast("Calendar file downloaded");
            }
          }),
          /* Only offered when there is a page to open. */
          flyer ? el("a", {
            class: "btn-secondary btn-secondary--link",
            href: flyer.page,
            target: "_blank",
            rel: "noopener",
            text: "Open the flyer page"
          }) : null,
          el("button", {
            type: "button", class: "btn-secondary", text: "Copy link",
            onClick: function () { copyLink(ev); }
          }),
          el("button", { type: "button", class: "btn-secondary", onClick: closeDetail, text: "Close" })
        ]),
        stepable
          ? el("div", { class: "modal__step" }, [
              el("button", {
                type: "button", class: "btn-quiet", text: "‹ Previous",
                onClick: function () { stepDetail(-1); }
              }),
              el("button", {
                type: "button", class: "btn-quiet", text: "Next ›",
                onClick: function () { stepDetail(1); }
              })
            ])
          : null
      ])
    ]);

    return el("div", { class: "modal", onClick: closeDetail }, panel);
  }

  /* ======================================================================
     Submit an event
     ====================================================================== */

  /* The draft lives in state rather than in the DOM, so a validation pass can
     rebuild the whole form without throwing away a word of what was typed. */
  function blankDraft() {
    return {
      title: "", org: "", place: "", blurb: "",
      date: "", startTime: "", endTime: "",
      repeat: "", repeatUntil: "",
      /* Open to everyone unless the submitter narrows it. A blank discipline
         would drop the event out of every discipline filter, which is the
         opposite of what leaving a field alone should mean. */
      tags: { discipline: "All disciplines" },
      by: "", email: "",
      flyerName: "", flyerImage: null, flyerNote: ""
    };
  }

  function draft() {
    if (!state.draft) state.draft = blankDraft();
    return state.draft;
  }

  /* "18:30" -> 18.5. Empty or malformed reads as null so validation, not
     arithmetic, is what reports it. */
  function decimalFromTimeInput(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mins = Number(m[2]);
    if (h > 23 || mins > 59) return null;
    return h + mins / 60;
  }

  /* The copy asks for a CSU address and the office replies to it, so anything
     else is a submission nobody can follow up. Subdomains count — the seeded
     submitter is on rams.colostate.edu. */
  function looksLikeCsuEmail(value) {
    return /^[^\s@]+@([a-z0-9-]+\.)*colostate\.edu$/i.test(String(value || "").trim());
  }

  function validateDraft(d) {
    var errors = {};

    if (!d.title.trim()) errors.title = "Give the event a name.";
    if (!d.org.trim()) errors.org = "Say who is hosting it.";
    if (!d.place.trim()) errors.place = "Say where it is.";
    if (d.blurb.trim().length < 20) {
      errors.blurb = "A sentence or two, so a first-year knows what they are walking into.";
    }

    if (!d.date) {
      errors.date = "Pick a date.";
    } else if (d.date < C.CONFIG.today) {
      errors.date = "That date has already passed.";
    }

    var start = decimalFromTimeInput(d.startTime);
    var end = decimalFromTimeInput(d.endTime);
    if (start === null) errors.startTime = "Pick a start time.";
    if (end === null) errors.endTime = "Pick an end time.";
    else if (start !== null && end <= start) errors.endTime = "The end has to come after the start.";

    if (d.repeat && !d.repeatUntil) {
      errors.repeatUntil = "Say when the series stops.";
    } else if (d.repeat && d.repeatUntil && d.repeatUntil < d.date) {
      errors.repeatUntil = "That is before the first date.";
    }

    if (!d.by.trim()) errors.by = "We need a name to reply to.";
    if (!d.email.trim()) errors.email = "We need an address to reply to.";
    else if (!looksLikeCsuEmail(d.email)) errors.email = "Use your colostate.edu address.";

    return errors;
  }

  /* A label wrapping its control, so the caption is the control's accessible
     name without needing ids. `name` ties it to its validation message. */
  function labelled(labelText, control, opts) {
    opts = opts || {};
    var message = opts.name ? state.errors[opts.name] : null;
    if (message && control.setAttribute) control.setAttribute("aria-invalid", "true");

    return el("label", {
      class: "field" + (opts.extraClass ? " " + opts.extraClass : "") +
        (message ? " field--error" : "")
    }, [
      el("span", { class: "field__label", text: labelText }),
      control,
      message ? el("span", { class: "field__error", text: message }) : null
    ]);
  }

  function selectOf(options, props) {
    return el("select", props || {}, options.map(function (o) {
      return el("option", { value: o.value, text: o.label });
    }));
  }

  function groupOptions(g) {
    return [{ value: "", label: g.any }].concat(
      g.chips.map(function (c) { return { value: c, label: c }; })
    );
  }

  /* The submit form asks a different question from the filter bar. "Any
     discipline" is a filter that stops filtering; the submitter's equivalent
     is a claim about the event — that it is open to everyone — and it carries
     the tag the seeded events use for exactly that. */
  function submitOptions(g) {
    if (g.key !== "discipline") return groupOptions(g);
    return [{ value: "All disciplines", label: "Open to every discipline" }].concat(
      g.chips.map(function (c) { return { value: c, label: c }; })
    );
  }

  /* A text control bound to one key of the draft. Writing straight into the
     draft on every keystroke means no render is needed to keep them in step. */
  function bound(tag, key, props) {
    var node = el(tag, Object.assign({ class: "input" }, props || {}));
    node.value = draft()[key];
    node.addEventListener("input", function (e) { draft()[key] = e.target.value; });
    return node;
  }

  /* ----------------------------------------------------------------------
     The flyer upload

     There is no server to post a file to, so an uploaded image is downscaled
     in the browser and carried as a data URL — small enough to sit in
     localStorage, and real enough that the reviewer sees the actual artwork
     rather than a hatched rectangle. A PDF cannot be rendered this way, so
     only its name travels and the office attaches the page itself.
     ---------------------------------------------------------------------- */

  var MAX_UPLOAD = 12 * 1024 * 1024;
  var MAX_EDGE = 1400;

  function readFlyer(file, done) {
    if (!file) { done(null); return; }

    if (file.size > MAX_UPLOAD) {
      done({ error: "That file is over 12 MB. Export it smaller and try again." });
      return;
    }

    if (file.type === "application/pdf") {
      done({ name: file.name, image: null, note: "PDF received — the office attaches the page itself." });
      return;
    }

    if (file.type.indexOf("image/") !== 0) {
      done({ error: "Flyers have to be a PDF or an image." });
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () { done({ error: "That file could not be read." }); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { done({ error: "That image could not be opened." }); };
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          done({
            name: file.name,
            image: canvas.toDataURL("image/jpeg", 0.85),
            note: "Ready — this is what the reviewer sees."
          });
        } catch (e) {
          /* A canvas tainted by a cross-origin source cannot be exported. */
          done({ name: file.name, image: null, note: "Received — preview unavailable." });
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function submitDone() {
    var sub = state.submitted;
    var dates = S.occurrences(sub);

    return el("div", { class: "done" }, [
      el("div", { class: "done__kicker", text: "Received" }),
      el("h3", { class: "done__title", text: "Your event is in the review queue." }),

      /* Reading the submission back is the only confirmation there is that the
         right thing was sent — worth more here than another line of reassurance. */
      el("div", { class: "done__recap" }, [
        el("div", { class: "done__recaptitle", text: sub.title }),
        el("div", { class: "done__recapline", text: sub.org + " · " + sub.place }),
        el("div", {
          class: "done__recapline",
          text: D.longDayLabel(sub.date) + ", " + sub.time +
            (dates.length > 1 ? " · " + dates.length + " dates" : "")
        }),
        sub.flyer
          ? el("div", { class: "done__recapline", text: "Flyer: " + sub.flyer })
          : el("div", { class: "done__recapline", text: "No flyer — it will list as text." })
      ]),

      el("p", {
        class: "done__body",
        text: "The Common First-Year office reviews submissions on weekdays. You'll get an email at " +
          sub.email + " once it is approved, and the event appears on the calendar the moment it is."
      }),
      el("div", { class: "done__actions" }, [
        el("button", {
          type: "button", class: "btn-primary", text: "Submit another",
          onClick: function () {
            state.submitted = false;
            state.draft = blankDraft();
            state.customTags = [];
            state.errors = {};
            renderSubmit();
          }
        }),
        el("button", { type: "button", class: "btn-secondary", text: "Back to calendar", onClick: closeSubmit })
      ])
    ]);
  }

  /* Turn the draft into a submission and put it in the queue. */
  function sendDraft() {
    var d = draft();
    state.errors = validateDraft(d);

    if (Object.keys(state.errors).length) {
      renderSubmit();
      /* Send focus to the first thing that needs fixing, rather than leaving
         the caret wherever the Send button was. */
      var firstBad = one(".field--error .input, .field--error select", submitNode);
      if (firstBad) firstBad.focus();
      return;
    }

    var start = decimalFromTimeInput(d.startTime);
    var end = decimalFromTimeInput(d.endTime);

    var chosen = Object.keys(d.tags)
      .map(function (k) { return d.tags[k]; })
      .filter(Boolean);

    state.submitted = S.submit({
      title: d.title.trim(),
      org: d.org.trim(),
      place: d.place.trim(),
      blurb: d.blurb.trim(),
      date: d.date,
      start: start,
      time: D.spanLabel(start, end),
      repeat: d.repeat,
      repeatUntil: d.repeat ? d.repeatUntil : null,
      tags: chosen.concat(state.customTags),
      newTags: state.customTags.filter(function (t) {
        return S.customTags().indexOf(t) === -1;
      }),
      by: d.by.trim(),
      email: d.email.trim(),
      flyer: d.flyerName || null,
      flyerImage: d.flyerImage
    });

    /* The draft has served its purpose; it is only held across a close so a
       half-finished form survives, and this one is finished. */
    state.draft = blankDraft();
    state.customTags = [];
    state.errors = {};
    renderSubmit();
  }

  /* Built as its own node because the read is asynchronous: the status line
     has to repaint when the file lands, without disturbing the rest of the
     form or the caret sitting in it. */
  function flyerField(d) {
    var status = el("div", { class: "dropzone__status" });

    function paintStatus() {
      status.hidden = !(d.flyerName || d.flyerNote);
      fill(status, [
        d.flyerImage
          ? el("img", { class: "dropzone__preview", src: d.flyerImage, alt: "Flyer preview" })
          : null,
        el("div", {}, [
          d.flyerName ? el("div", { class: "dropzone__file", text: d.flyerName }) : null,
          d.flyerNote ? el("div", { class: "dropzone__note", text: d.flyerNote }) : null,
          d.flyerName
            ? el("button", {
                type: "button", class: "btn-link", text: "Remove",
                onClick: function () {
                  d.flyerName = "";
                  d.flyerImage = null;
                  d.flyerNote = "";
                  if (input.value) input.value = "";
                  paintStatus();
                }
              })
            : null
        ])
      ]);
    }

    var input = el("input", {
      type: "file",
      accept: "application/pdf,image/*",
      onChange: function (e) {
        var file = e.target.files && e.target.files[0];
        d.flyerNote = file ? "Reading…" : "";
        d.flyerName = "";
        d.flyerImage = null;
        paintStatus();

        readFlyer(file, function (result) {
          if (!result) { d.flyerNote = ""; paintStatus(); return; }
          if (result.error) {
            d.flyerName = "";
            d.flyerImage = null;
            d.flyerNote = result.error;
            e.target.value = "";
          } else {
            d.flyerName = result.name;
            d.flyerImage = result.image;
            d.flyerNote = result.note;
          }
          paintStatus();
        });
      }
    });

    paintStatus();

    return el("label", { class: "field" }, [
      el("span", { class: "field__label", text: "Flyer page" }),
      el("span", { class: "dropzone" }, [
        el("span", { text: "One page, PDF or image. This is what students and the projector actually see, so make it readable from the back of a room." }),
        input,
        status
      ])
    ]);
  }

  function submitForm() {
    var d = draft();

    /* "Repeat until" only makes sense once something repeats. */
    var untilInput = el("input", { type: "date", class: "input input--sm", min: d.date || null });
    untilInput.value = d.repeatUntil;
    untilInput.addEventListener("input", function (e) { d.repeatUntil = e.target.value; });

    var until = labelled("Repeat until", untilInput, { name: "repeatUntil", extraClass: "field--until" });
    until.hidden = !d.repeat;

    var repeat = selectOf(C.REPEAT_OPTIONS, {
      class: "select",
      onChange: function (e) {
        d.repeat = e.target.value;
        until.hidden = !e.target.value;
        if (!e.target.value) { d.repeatUntil = ""; untilInput.value = ""; }
      }
    });
    repeat.value = d.repeat;

    var chosenTags = el("div", { class: "taglist" });
    var tagInput = el("input", {
      type: "text",
      class: "input input--tag",
      placeholder: "Write a new one",
      onKeyDown: function (e) {
        if (e.key === "Enter") { e.preventDefault(); addTag(tagInput.value); tagInput.value = ""; }
      }
    });

    var approvedPicker = selectOf(
      [{ value: "", label: "Custom Tags" }],
      { class: "select select--tag select--picker", "aria-label": "Approved custom tags" }
    );

    function paintTags() {
      fill(chosenTags, state.customTags.map(function (tag) {
        return el("span", { class: "tagchip" }, [
          tag,
          el("button", {
            type: "button", class: "tagchip__remove", title: "Remove tag",
            "aria-label": "Remove " + tag,
            onClick: function () {
              state.customTags = state.customTags.filter(function (x) { return x !== tag; });
              paintTags();
            },
            text: "×"
          })
        ]);
      }));

      /* Offer only the approved tags that are not already on this submission. */
      fill(approvedPicker, [{ value: "", label: "Custom Tags" }].concat(
        S.customTags()
          .filter(function (t) { return state.customTags.indexOf(t) === -1; })
          .map(function (t) { return { value: t, label: t }; })
      ).map(function (o) { return el("option", { value: o.value, text: o.label }); }));
      approvedPicker.value = "";
    }

    function addTag(raw) {
      var tag = (raw || "").trim().replace(/\s+/g, " ");
      if (!tag) return;
      var already = state.customTags.some(function (t) {
        return t.toLowerCase() === tag.toLowerCase();
      });
      if (!already) state.customTags = state.customTags.concat([tag]);
      paintTags();
    }

    approvedPicker.addEventListener("change", function (e) {
      if (e.target.value) addTag(e.target.value);
    });

    paintTags();

    var errorCount = Object.keys(state.errors).length;

    return el("div", { class: "submit" }, [
      el("div", { class: "submit__form" }, [

        errorCount
          ? el("div", { class: "alert", role: "alert", tabindex: "-1" }, [
              el("strong", {
                text: errorCount === 1
                  ? "One thing needs fixing before this can be sent."
                  : errorCount + " things need fixing before this can be sent."
              }),
              el("ul", { class: "alert__list" }, Object.keys(state.errors).map(function (k) {
                return el("li", { text: state.errors[k] });
              }))
            ])
          : null,

        labelled("Event title",
          bound("input", "title", { type: "text", placeholder: "Soldering 101" }),
          { name: "title" }),
        labelled("Hosting club or organization",
          bound("input", "org", { type: "text", placeholder: "IEEE Student Branch" }),
          { name: "org" }),

        el("div", { class: "submit__times" }, [
          labelled("Date",
            bound("input", "date", { type: "date", class: "input input--sm", min: C.CONFIG.today }),
            { name: "date" }),
          labelled("Starts", bound("input", "startTime", { type: "time", class: "input input--sm" }),
            { name: "startTime" }),
          labelled("Ends", bound("input", "endTime", { type: "time", class: "input input--sm" }),
            { name: "endTime" })
        ]),

        el("div", { class: "submit__repeat" }, [
          labelled("Repeats", repeat, { extraClass: "field--grow" }),
          until
        ]),

        labelled("Location",
          bound("input", "place", { type: "text", placeholder: "Engineering E101 Lab" }),
          { name: "place" }),
        labelled("What happens there", bound("textarea", "blurb", {
          rows: "4",
          placeholder: "Two or three sentences a first-year would read before deciding to come."
        }), { name: "blurb" }),

        el("div", { class: "group" }, [
          el("div", { class: "group__label", text: "Tags students filter by" }),
          el("div", { class: "group__selects" }, C.GROUPS
            /* Custom tags have their own section below. Time of day is not
               offered at all: it is derived from the start time, so letting
               someone tag a 6pm event "Morning" would only ever be wrong. */
            .filter(function (g) { return g.key !== "custom" && g.key !== "time"; })
            .map(function (g) {
              var select = selectOf(submitOptions(g), {
                class: "select select--tag",
                "aria-label": g.any,
                onChange: function (e) { d.tags[g.key] = e.target.value; }
              });
              select.value = d.tags[g.key] || "";
              return select;
            }))
        ]),

        el("div", { class: "group group--tags" }, [
          el("div", { class: "group__label", text: "Your own tags" }),
          el("div", {
            class: "group__note",
            text: "Anything the lists above miss — a competition name, a course number, a series your club runs. Students see these on the event and can search them."
          }),
          el("div", { class: "tagrow" }, [
            approvedPicker,
            el("span", { class: "tagrow__or", text: "or" }),
            tagInput,
            el("button", {
              type: "button", class: "btn-outline-accent", text: "Add tag",
              onClick: function () { addTag(tagInput.value); tagInput.value = ""; }
            })
          ]),
          chosenTags,
          el("div", {
            class: "group__hint",
            text: "A new tag becomes filterable for everyone once the office approves it."
          })
        ]),

        flyerField(d),

        el("div", { class: "submit__who" }, [
          labelled("Your name", bound("input", "by", { type: "text", class: "input input--sm" }),
            { name: "by" }),
          labelled("CSU email", bound("input", "email", {
            type: "email", class: "input input--sm", placeholder: "name@colostate.edu"
          }), { name: "email" })
        ]),

        el("div", { class: "submit__actions" }, [
          el("button", {
            type: "button", class: "btn-primary btn-primary--lg", text: "Send for approval",
            onClick: sendDraft
          }),
          el("button", { type: "button", class: "btn-secondary btn-secondary--lg", text: "Cancel", onClick: closeSubmit })
        ])
      ]),

      el("aside", { class: "sidenote" }, [
        el("div", { class: "kicker", text: "Before you send" }),
        el("div", { class: "sidenote__rule" }),
        el("p", { text: "Every submission is reviewed by the First-Year team before it appears. Please allow for up to 3 business days for approval." }),
        el("p", { text: "Events without a flyer still get listed, but they show a placeholder card and are easier to scroll past." })
      ])
    ]);
  }

  function csuHeader(title, titleClass, actions) {
    return el("header", { class: "csu-header" }, [
      el("div", { class: "csu-header__top" },
        el("div", { class: "csu-header__brand" }, [
          el("span", { class: "csu-header__sig" },
            el("img", { src: "assets/csu/sig-stack.svg", alt: "Colorado State University" })),
          el("div", { class: "csu-header__unit", text: "Walter Scott, Jr. College of Engineering" })
        ])),
      el("div", { class: "csu-header__bar" }, [
        el("h2", { class: "csu-header__title " + titleClass, text: title }),
        actions
      ]),
      el("div", { class: "csu-rule" })
    ]);
  }

  var submitNode = null;

  function renderSubmit() {
    if (!state.submitOpen) {
      if (submitNode) { submitNode.remove(); submitNode = null; }
      return;
    }

    var body = state.submitted ? submitDone() : submitForm();

    if (submitNode) {
      var host = one("[data-submit-body]", submitNode);
      fill(host, body);
      submitNode.scrollTop = 0;
      return;
    }

    submitNode = el("div", { class: "overlay overlay--submit" }, [
      csuHeader("Submit an Event", "csu-header__title--sub",
        el("button", {
          type: "button", class: "btn-brand btn-brand--ghost btn-brand--sm",
          text: "Back to calendar", onClick: closeSubmit
        })),
      el("div", { "data-submit-body": true }, body)
    ]);
    overlays.appendChild(submitNode);
  }

  function openSubmit() {
    if (!state.submitOpen) focusBeforeOverlay = document.activeElement;
    state.submitOpen = true;
    state.submitted = false;
    state.errors = {};
    render();
  }

  function closeSubmit() {
    state.submitOpen = false;
    state.submitted = false;
    state.errors = {};
    /* The draft is kept: closing the overlay by accident, or to go and check
       a room number, should not cost someone the form they half-filled. */
    render();
    restoreFocus();
  }

  /* ======================================================================
     Review queue
     ====================================================================== */

  function currentSubmission() {
    var queue = S.queue();
    var i = Math.min(state.reviewSel, Math.max(0, queue.length - 1));
    return queue[i] || null;
  }

  /* After a decision the queue is one shorter, so the selection has to be
     pulled back inside it, and the whole page — not just this overlay —
     rerendered: an approval has just put events on the calendar behind. */
  function afterDecision(note) {
    state.reviewSel = Math.min(state.reviewSel, Math.max(0, S.queue().length - 1));
    state.changesOpen = false;
    state.feedback = "";
    state.approvedNew = [];
    state.note = note;
    render();
  }

  function approveCurrent(sub) {
    var made = S.approve(sub, state.approvedNew);
    var where = made.length === 1
      ? "on " + D.longDayLabel(made[0].date)
      : "across " + made.length + " dates";
    afterDecision("Approved — “" + sub.title + "” is on the calendar " + where +
      ", and " + sub.by + " has been emailed.");
  }

  function declineCurrent(sub) {
    S.decline(sub);
    afterDecision("Declined. " + sub.by + " has been emailed the reason.");
  }

  function reviewEmpty() {
    return el("div", { class: "done" }, [
      el("div", { class: "done__kicker", text: "Queue clear" }),
      el("h3", { class: "done__title", text: "Nothing waiting on you." }),
      el("p", {
        class: "done__body",
        text: "Every submission has been decided. New ones land here as soon as they are sent, and the submitter is emailed the moment you approve or decline."
      }),
      /* The last decision is the only record of what just happened, so it
         outlives the card it was made on. */
      state.note ? el("div", { class: "done__note", text: state.note }) : null,
      el("div", { class: "done__actions" },
        el("button", { type: "button", class: "btn-primary", text: "Back to calendar", onClick: closeReview }))
    ]);
  }

  function newTagChip(tag) {
    var chip = el("span", { class: "chip chip--lg chip--new" });

    function paint() {
      var approved = state.approvedNew.indexOf(tag) !== -1;
      chip.className = "chip chip--lg chip--new" + (approved ? " is-approved" : "");
      fill(chip, [
        tag,
        el("button", {
          type: "button", class: "chip__action",
          text: approved ? "Approved" : "Approve",
          onClick: function () {
            state.approvedNew = approved
              ? state.approvedNew.filter(function (x) { return x !== tag; })
              : state.approvedNew.concat([tag]);
            paint();
          }
        })
      ]);
    }

    paint();
    return chip;
  }

  function reviewBody() {
    var sub = currentSubmission();
    if (!sub) return reviewEmpty();

    var queue = S.queue();
    var dates = S.occurrences(sub);

    var sendButton = el("button", {
      type: "button", class: "btn-primary", text: "Send feedback",
      onClick: function () {
        S.noteFeedback(sub);
        state.changesOpen = false;
        state.note = "Feedback sent to " + sub.by + " at " + sub.email + ". The submission stays in the queue.";
        state.feedback = "";
        renderReview();
      }
    });
    sendButton.disabled = state.feedback.trim().length === 0;

    var feedbackBox = el("textarea", {
      class: "input",
      rows: "4",
      placeholder: "The room is booked that night — can you confirm an alternate location and resend?",
      value: state.feedback,
      onInput: function (e) {
        /* Kept in state so it survives a rebuild of the pane, but typing does
           not trigger one — only the Send button's enabled-ness changes. */
        state.feedback = e.target.value;
        sendButton.disabled = state.feedback.trim().length === 0;
      }
    });

    var feedback = el("div", { class: "feedback" }, [
      el("label", { class: "field" }, [
        el("span", { class: "field__label", text: "What needs to change?" }),
        feedbackBox
      ]),
      el("div", {
        class: "feedback__to",
        text: "Goes to " + sub.email + " with the submission attached. It stays in the queue until they resend."
      }),
      el("div", { class: "feedback__actions" }, [
        sendButton,
        el("button", {
          type: "button", class: "btn-secondary", text: "Cancel",
          onClick: function () { state.changesOpen = false; state.feedback = ""; renderReview(); }
        })
      ])
    ]);

    return el("div", { class: "review" }, [

      el("aside", { class: "queue" }, [
        el("div", { class: "queue__head" }, [
          el("span", { class: "kicker", text: "Waiting" }),
          el("span", { class: "queue__count", text: String(queue.length) })
        ]),
        queue.map(function (p, i) {
          return el("button", {
            type: "button",
            class: "queue__item" + (p.id === sub.id ? " is-on" : ""),
            onClick: function () {
              state.reviewSel = i;
              state.note = "";
              state.changesOpen = false;
              state.feedback = "";
              state.approvedNew = [];
              renderReview();
            }
          }, [
            el("span", { class: "queue__title", text: p.title }),
            el("span", { class: "queue__org", text: p.org }),
            el("span", { class: "queue__sent" }, [
              "Sent " + p.submitted,
              p.awaiting ? el("span", { class: "queue__flag", text: " · changes requested" }) : null
            ])
          ]);
        })
      ]),

      el("div", { class: "review__panes" }, [

        el("div", { class: "sub" }, [
          el("div", { class: "kicker", text: sub.org }),
          el("h3", { class: "sub__title", text: sub.title }),
          el("div", {
            class: "sub__when",
            text: D.shortDayLabel(sub.date) + ", " + sub.time + " · " + sub.place
          }),
          /* A repeating submission is not one decision — say how many events
             approving it will actually create. */
          dates.length > 1
            ? el("div", {
                class: "sub__series",
                text: "Approving publishes " + dates.length + " events, " +
                  D.shortDayLabel(dates[0]) + " through " +
                  D.shortDayLabel(dates[dates.length - 1]) + "."
              })
            : null,
          el("p", { class: "sub__blurb", text: sub.blurb }),

          el("div", { class: "sub__block" }, [
            el("div", { class: "field__label", text: "Tags on the submission" }),
            el("div", { class: "sub__chips" }, (sub.tags || []).map(function (t) {
              return el("span", { class: "chip chip--lg", text: t });
            }))
          ]),

          (sub.newTags || []).length
            ? el("div", { class: "sub__block sub__block--new" }, [
                el("div", { class: "sub__newlabel", text: "New custom tags — approve to make filterable" }),
                el("div", { class: "sub__chips sub__chips--new" }, sub.newTags.map(newTagChip))
              ])
            : null,

          el("div", { class: "sub__decide" }, [
            el("button", {
              type: "button", class: "btn-primary",
              text: dates.length > 1 ? "Approve and publish " + dates.length : "Approve and publish",
              onClick: function () { approveCurrent(sub); }
            }),
            el("button", {
              type: "button", class: "btn-secondary", text: "Request changes",
              onClick: function () { state.changesOpen = true; state.note = ""; renderReview(); }
            }),
            el("button", {
              type: "button", class: "btn-decline", text: "Decline",
              onClick: function () { declineCurrent(sub); }
            })
          ]),

          state.changesOpen ? feedback : null,
          state.note ? el("div", { class: "sub__note", text: state.note }) : null
        ]),

        el("div", { class: "meta" }, [
          el("div", {}, [
            el("span", { class: "meta__label meta__label--flyer", text: "Flyer" }),
            sub.flyer
              ? el("div", { class: "flyerproof" }, [
                  /* The artwork itself when it came through as an image; the
                     hatched sheet only stands in for a PDF, which the browser
                     cannot render here. */
                  sub.flyerImage
                    ? el("img", {
                        class: "flyerproof__image",
                        src: sub.flyerImage,
                        alt: "Flyer submitted for " + sub.title
                      })
                    : el("div", { class: "flyerproof__sheet" }),
                  el("div", { class: "flyerproof__name", text: sub.flyer })
                ])
              : el("div", {
                  class: "meta__none",
                  text: "No flyer attached. The event will show as a text listing."
                })
          ]),
          el("div", {}, [
            el("div", { class: "meta__label", text: "Submitted by" }),
            el("div", { class: "meta__value", text: sub.by }),
            el("div", { class: "meta__sub" },
              el("a", { href: "mailto:" + sub.email, text: sub.email }))
          ]),
          el("div", {}, [
            el("div", { class: "meta__label", text: "Repeats" }),
            el("div", { class: "meta__value", text: C.repeatLabel(sub.repeat, sub.repeatUntil) })
          ]),
          el("div", {}, [
            el("div", { class: "meta__label", text: "Received" }),
            el("div", { class: "meta__value", text: sub.submitted })
          ])
        ])
      ])
    ]);
  }

  var reviewNode = null;

  function renderReview() {
    if (!state.reviewOpen) {
      if (reviewNode) { reviewNode.remove(); reviewNode = null; }
      return;
    }

    if (reviewNode) {
      fill(one("[data-review-body]", reviewNode), reviewBody());
      return;
    }

    reviewNode = el("div", { class: "overlay overlay--review" }, [
      csuHeader("Review Queue", "csu-header__title--sub",
        el("button", {
          type: "button", class: "btn-brand btn-brand--ghost btn-brand--sm",
          text: "Back to calendar", onClick: closeReview
        })),
      el("div", { "data-review-body": true }, reviewBody())
    ]);
    overlays.appendChild(reviewNode);
  }

  function openReview() {
    if (!state.reviewOpen) focusBeforeOverlay = document.activeElement;
    state.reviewOpen = true;
    state.note = "";
    render();
  }

  function closeReview() {
    state.reviewOpen = false;
    state.changesOpen = false;
    state.feedback = "";
    state.approvedNew = [];
    render();
    restoreFocus();
  }

  /* ======================================================================
     Slideshow — the lobby-screen / lecture-hall view
     ====================================================================== */

  var slideshowNode = null;

  function renderSlideshow() {
    if (!state.slideshow) {
      if (slideshowNode) { slideshowNode.remove(); slideshowNode = null; }
      return;
    }
    if (slideshowNode) return;

    slideshowNode = el("div", { class: "overlay overlay--fx" }, [
      el("header", { class: "csu-header" }, [
        el("div", { class: "csu-header__top" },
          el("div", { class: "csu-header__brand" }, [
            el("span", { class: "csu-header__sig" },
              el("img", { src: "assets/csu/sig-stack.svg", alt: "Colorado State University" })),
            el("div", { class: "csu-header__unit", text: "Walter Scott, Jr. College of Engineering" })
          ])),
        el("div", { class: "csu-header__bar" }, [
          el("h2", { class: "csu-header__title csu-header__title--fx", text: "This week in the Engineering Community" }),
          el("div", { class: "csu-header__actions csu-header__actions--fx" }, [
            el("span", { class: "csu-header__range", "data-range": true }),
            el("button", {
              type: "button", class: "btn-brand btn-brand--ghost btn-brand--sm",
              text: "Exit", onClick: stopSlideshow
            })
          ])
        ]),
        el("div", { class: "csu-rule" })
      ]),

      el("div", { class: "fx__body" }, [
        el("div", { class: "fx__stage", "data-stage": true }),
        el("div", { class: "fx__meta" }, [
          el("div", { class: "fx__row" }, [
            el("div", { class: "fx__kicker", "data-cur": "org" }),
            el("div", { class: "fx__when", "data-cur": "when" })
          ]),
          el("div", { class: "fx__row" }, [
            el("div", { class: "fx__title", "data-cur": "title" }),
            el("div", { class: "fx__place", "data-cur": "place" })
          ])
        ]),
        el("div", { class: "fx__countdown", "data-countdown": true }),
        el("aside", { class: "reel reel--fx" }, [
          /* The label follows the view: run the projector on the month grid
             and "Upcoming this week" is simply wrong. */
          el("div", {
            class: "kicker reel__label",
            text: state.view === "month" ? "Upcoming this month" : "Upcoming this week"
          }),
          el("div", { class: "reel__list", "data-reel": "fx" })
        ])
      ]),

      el("div", { class: "fx__foot" }, [
        el("span", {
          class: "fx__hint",
          text: "← → or space to step · Esc to exit"
        })
      ])
    ]);

    overlays.appendChild(slideshowNode);
  }

  function startSlideshow() {
    if (!state.slideshow) focusBeforeOverlay = document.activeElement;
    state.slideshow = true;
    state.t = 0;
    render();
    try {
      var p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* fullscreen is a nicety, not a requirement */ }
  }

  function stopSlideshow() {
    state.slideshow = false;
    render();
    restoreFocus();
    try {
      if (document.fullscreenElement) {
        var p = document.exitFullscreen();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* already out of fullscreen */ }
  }

  /* ======================================================================
     Render
     ====================================================================== */

  function render() {
    renderCalendar();
    renderSubmit();
    renderReview();
    renderSlideshow();

    var detail = state.detailId
      ? S.eventById(state.detailId)
      : null;

    var existing = one(".modal", overlays);
    if (existing) existing.remove();
    if (detail) {
      var node = detailOverlay(detail);
      overlays.appendChild(node);
      one(".modal__panel", node).focus();
    }

    /* Overlays bring their own [data-range], [data-stage], [data-cur] and
       [data-reel] nodes, so the painters run once everything is mounted. */
    renderFilters();
    renderToolbar();
    renderShowcase();
    syncOverlayState();
    syncHash();
  }

  /* ======================================================================
     The slide timer

     The showcase advances on its own, which is right when someone is looking
     at it and wrong the moment they are not: reading an event's detail while
     the flyer behind it changes every nine seconds is disorienting, and a
     background tab burning a timer for nobody is pure waste.
     ====================================================================== */

  function timerRunning() {
    if (document.hidden) return false;
    if (state.detailId || state.submitOpen || state.reviewOpen) return false;
    return visible().length > 1;
  }

  function tick() {
    if (!timerRunning()) return;

    var secs = C.CONFIG.slideSeconds;
    var next = state.t + 0.2 / secs;
    if (next >= 1) {
      state.t = 0;
      state.active = (state.active + 1) % Math.max(1, visible().length);
      renderShowcase();
      scrollActiveIntoView();
    } else {
      state.t = next;
      paintCountdown();
    }
  }

  /* ======================================================================
     Wiring
     ====================================================================== */

  function onKeyDown(e) {
    var tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    /* Shift+R is the office's way into the review queue. */
    if (e.shiftKey && (e.key === "R" || e.key === "r") && !typing) {
      e.preventDefault();
      if (state.reviewOpen) closeReview(); else openReview();
      return;
    }

    if (e.key === "Escape") {
      if (state.detailId) { closeDetail(); return; }
      if (state.submitOpen) { closeSubmit(); return; }
      if (state.reviewOpen) { closeReview(); return; }
      if (state.slideshow) { stopSlideshow(); return; }
      /* Nothing open and a search running: Escape clears it, which is what
         the key does in every other search box. */
      if (state.query) { clearFilters(); return; }
    }

    if (typing) return;

    if (state.slideshow) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(state.active + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(state.active - 1); }
      return;
    }

    /* Arrows step between events inside an open event; on the calendar itself
       they step the week or month, matching the toolbar's ‹ ›. */
    if (state.detailId) {
      if (e.key === "ArrowRight") { e.preventDefault(); stepDetail(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stepDetail(-1); }
      return;
    }

    if (state.submitOpen || state.reviewOpen) return;

    if (e.key === "ArrowRight") { e.preventDefault(); shift(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); shift(-1); }
    /* "/" focuses search, the convention everywhere else on the web. */
    if (e.key === "/") {
      e.preventDefault();
      var box = one("#search");
      if (box) { box.focus(); box.select(); }
    }
  }

  function goToday() {
    state.anchor = C.CONFIG.today;
    state.active = 0;
    state.t = 0;
    render();
  }

  function start() {
    one('[data-action="open-submit"]').addEventListener("click", openSubmit);
    one('[data-action="start-slideshow"]').addEventListener("click", startSlideshow);
    one('[data-action="prev"]').addEventListener("click", function () { shift(-1); });
    one('[data-action="next"]').addEventListener("click", function () { shift(1); });
    one('[data-action="today"]').addEventListener("click", goToday);
    one('[data-action="view-week"]').addEventListener("click", function () { setView("week"); });
    one('[data-action="view-month"]').addEventListener("click", function () { setView("month"); });
    one('[data-action="download-view"]').addEventListener("click", downloadView);

    one('[data-action="reset-store"]').addEventListener("click", function () {
      if (!window.confirm("Discard every submission and approval made in this browser? The calendar goes back to what it ships with.")) return;
      S.reset();
      state.reviewSel = 0;
      state.note = "";
      gridSignature = null;
      render();
      toast("Back to the shipped calendar");
    });

    var search = one("#search");
    search.value = state.query;
    search.addEventListener("input", function (e) { setQuery(e.target.value); });
    /* type="search" clears on Escape without firing input in some browsers. */
    search.addEventListener("search", function (e) { setQuery(e.target.value); });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", applyRoute);

    /* Coming back to a tab that has been open since yesterday should not show
       yesterday as today. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      var now = D.toIso(new Date());
      if (now !== C.CONFIG.today) {
        C.CONFIG.today = now;
        gridSignature = null;
      }
      state.t = 0;
      render();
    });

    applyRoute();
    setInterval(tick, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
