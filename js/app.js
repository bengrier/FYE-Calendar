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
    detailId: null,
    submitOpen: false,
    submitted: false,
    reviewOpen: false,
    slideshow: false,

    // submit form
    customTags: [],

    // review queue
    pending: C.PENDING.slice(),
    reviewSel: 0,
    approvedNew: [],
    changesOpen: false,
    feedback: "",
    note: ""
  };

  var overlays = one("#overlays");

  /* ======================================================================
     Derived data
     ====================================================================== */

  /* The date span the calendar is showing: a Monday-to-Sunday week, or a
     calendar month. */
  function range() {
    var a = D.fromIso(state.anchor);
    if (state.view === "month") {
      return {
        from: new Date(a.getFullYear(), a.getMonth(), 1),
        to: new Date(a.getFullYear(), a.getMonth() + 1, 0)
      };
    }
    var mon = D.mondayOf(a);
    return { from: mon, to: D.addDays(mon, 6) };
  }

  /* An event survives a filter group if it carries the chosen tag — or, for
     the discipline group, if it is open to all disciplines. */
  function matchesFilters(ev) {
    var tags = C.allTags(ev);
    return C.GROUPS.every(function (g) {
      var chosen = state.selected[g.key];
      if (!chosen) return true;
      if (tags.indexOf(chosen) > -1) return true;
      return !!g.openToAll && tags.indexOf("All disciplines") > -1;
    });
  }

  function eventsOn(iso) {
    return C.EVENTS
      .filter(function (e) { return e.date === iso && matchesFilters(e); })
      .sort(function (a, b) { return a.start - b.start; });
  }

  /* Everything in range and past the filters, in the order it happens. */
  function visible() {
    var r = range();
    var from = D.toIso(r.from);
    var to = D.toIso(r.to);
    return C.EVENTS
      .filter(function (e) { return e.date >= from && e.date <= to && matchesFilters(e); })
      .sort(function (a, b) {
        return a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1);
      });
  }

  /* Null when the view is empty — the showcase then says so rather than
     putting some other week's flyer on the stage. */
  function current(vis) {
    vis = vis || visible();
    if (!vis.length) return null;
    return vis[Math.min(state.active, vis.length - 1)];
  }

  /* The soonest event anywhere on the calendar, for the "jump ahead" offer on
     an empty view. Null once the last one has passed. */
  function nextUpcoming() {
    return C.EVENTS
      .filter(function (e) { return e.date >= C.CONFIG.today; })
      .sort(function (a, b) {
        return a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1);
      })[0] || null;
  }

  function anyFilter() {
    return Object.keys(state.selected).length > 0;
  }

  function rangeLabel() {
    var r = range();
    var M = D.MONTHS;
    if (state.view === "month") return M[r.from.getMonth()] + " " + r.from.getFullYear();
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
    var flyer = ev.flyer ? C.FLYERS[ev.flyer] : null;

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
    state.active = 0;
    state.t = 0;
    render();
  }

  function openDetail(id) {
    state.detailId = id;
    render();
  }

  function closeDetail() {
    state.detailId = null;
    render();
  }

  /* ======================================================================
     Scroll lock — any full-surface overlay freezes the page behind it
     ====================================================================== */

  function syncScrollLock() {
    var locked = state.submitOpen || state.reviewOpen || state.slideshow || !!state.detailId;
    var value = locked ? "hidden" : "";
    document.body.style.overflow = value;
    document.documentElement.style.overflow = value;
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
    var upcoming = anyFilter() ? null : nextUpcoming();

    return el("div", { class: "stage-empty" }, [
      el("div", {
        class: "stage-empty__line",
        text: anyFilter()
          ? "Nothing here matches that filter."
          : "Nothing scheduled this " + (state.view === "month" ? "month" : "week") + "."
      }),
      anyFilter()
        ? el("button", { type: "button", class: "btn-quiet", text: "Clear the filters", onClick: clearFilters })
        : upcoming
          ? el("button", {
              type: "button",
              class: "btn-quiet",
              text: "Next event · " + D.longDayLabel(upcoming.date),
              onClick: function () {
                state.anchor = upcoming.date;
                state.active = 0;
                state.t = 0;
                render();
              }
            })
          : null
    ]);
  }

  function paintStage(node, cur) {
    /* A sentinel key so an empty stage is not repainted every tick either. */
    var key = cur ? cur.id : " empty:" + state.view + ":" + anyFilter();
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
        class: "reel__item",
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
    /* Empty views say so on the stage itself, so the line under it goes quiet. */
    var text = vis.length > 1
      ? "Next event in " + left + "s"
      : vis.length === 1 ? "One event in this view" : "";
    all("[data-countdown]").forEach(function (node) { node.textContent = text; });
  }

  /* ======================================================================
     Filters — built once, then patched, so a select keeps focus on change
     ====================================================================== */

  var filtersBuilt = false;

  function renderFilters() {
    var host = one("#filters");

    if (!filtersBuilt) {
      fill(host, C.GROUPS.map(function (g) {
        return el("select", {
          class: "filters__select",
          "data-group": g.key,
          "aria-label": g.any,
          onChange: function (e) { setFilter(g.key, e.target.value); }
        }, [{ value: "", label: g.any }].concat(
          g.chips.map(function (c) { return { value: c, label: c }; })
        ).map(function (o) {
          return el("option", { value: o.value, text: o.label });
        }));
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
      var chosen = state.selected[select.dataset.group] || "";
      if (select.value !== chosen) select.value = chosen;
      select.classList.toggle("is-on", !!chosen);
    });

    one("[data-clear]", host).hidden = !anyFilter();
  }

  /* ======================================================================
     Toolbar
     ====================================================================== */

  function renderToolbar() {
    var vis = visible();
    var label = rangeLabel();
    all("[data-range]").forEach(function (node) { node.textContent = label; });

    one("#visible-count").textContent =
      vis.length === 1 ? "1 event showing" : vis.length + " events showing";

    one('[data-action="view-week"]').classList.toggle("is-on", state.view === "week");
    one('[data-action="view-month"]').classList.toggle("is-on", state.view === "month");
  }

  /* ======================================================================
     Week and month grids
     ====================================================================== */

  function eventCard(ev) {
    return el("button", {
      type: "button",
      class: "eventcard",
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

  function weekGrid() {
    var r = range();
    var vis = visible();

    return el("section", { class: "week" },
      el("div", { class: "week__grid" }, D.DOW.map(function (label, i) {
        var d = D.addDays(r.from, i);
        var iso = D.toIso(d);
        var events = vis.filter(function (e) { return e.date === iso; });

        return el("div", { class: "week__day" }, [
          el("div", { class: "week__head" }, [
            /* The month prints on the first column and wherever a month turns over. */
            el("div", {
              class: "week__month",
              text: (d.getDate() === 1 || i === 0) ? D.MSHORT[d.getMonth()] : ""
            }),
            el("div", { class: "week__date" }, [
              el("span", { class: "week__num", text: String(d.getDate()) }),
              el("span", { class: "week__dow", text: label })
            ])
          ]),
          el("div", { class: "week__events" },
            events.length
              ? events.map(eventCard)
              : el("div", { class: "week__empty", text: "Nothing scheduled" })
          )
        ]);
      }))
    );
  }

  function monthGrid() {
    var r = range();
    var start = D.mondayOf(r.from);
    var weeks = Math.ceil((((r.to - start) / 86400000) + 1) / 7);
    var cells = [];

    for (var i = 0; i < weeks * 7; i++) {
      var d = D.addDays(start, i);
      var iso = D.toIso(d);
      var inMonth = d.getMonth() === r.from.getMonth();
      /* A day that starts a month says so, rather than repeating a bare 1. */
      var num = d.getDate() === 1 ? D.MSHORT[d.getMonth()] + " 1" : String(d.getDate());

      cells.push(el("div", { class: "month__cell" + (inMonth ? "" : " is-outside") }, [
        el("div", { class: "month__num", text: num }),
        el("div", { class: "month__events" }, eventsOn(iso).map(function (ev) {
          return el("button", {
            type: "button",
            class: "monthevent",
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

  function renderCalendar() {
    /* The grid only depends on the view, the anchor and the filters — not on
       which flyer is on the stage — so it is rebuilt only when one changes. */
    var signature = [state.view, state.anchor, JSON.stringify(state.selected)].join("~");
    if (signature === gridSignature) return;
    gridSignature = signature;
    fill(one("#calendar"), state.view === "month" ? monthGrid() : weekGrid());
  }

  /* ======================================================================
     Event detail
     ====================================================================== */

  function detailOverlay(ev) {
    var flyer = ev.flyer ? C.FLYERS[ev.flyer] : null;

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
        el("div", { class: "kicker", text: ev.org }),
        el("h2", { class: "modal__title", text: ev.title }),
        el("div", { class: "modal__rule" }),
        el("div", { class: "modal__when", text: D.longDayLabel(ev.date) + ", " + ev.time }),
        el("div", { class: "modal__place", text: ev.place }),
        el("p", { class: "modal__blurb", text: ev.blurb }),
        el("div", { class: "chips" }, C.allTags(ev).map(function (t) {
          return el("span", { class: "chip", text: t });
        })),
        el("div", { class: "modal__actions" }, [
          /* Only offered when there is a page to open. */
          flyer ? el("a", {
            class: "link-button",
            href: flyer.page,
            target: "_blank",
            rel: "noopener",
            text: "Open the flyer page"
          }) : null,
          el("button", { type: "button", class: "btn-secondary", onClick: closeDetail, text: "Close" })
        ])
      ])
    ]);

    return el("div", { class: "modal", onClick: closeDetail }, panel);
  }

  /* ======================================================================
     Submit an event
     ====================================================================== */

  /* A label wrapping its control, so the caption is the control's accessible
     name without needing ids. */
  function labelled(labelText, control, extraClass) {
    return el("label", { class: "field" + (extraClass ? " " + extraClass : "") }, [
      el("span", { class: "field__label", text: labelText }),
      control
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

  function submitDone() {
    return el("div", { class: "done" }, [
      el("div", { class: "done__kicker", text: "Received" }),
      el("h3", { class: "done__title", text: "Your event is in the review queue." }),
      el("p", {
        class: "done__body",
        text: "The Common First-Year office reviews submissions on weekdays. You'll get an email at the address you gave once it is approved, and the event appears on the calendar the moment it is."
      }),
      el("div", { class: "done__actions" }, [
        el("button", {
          type: "button", class: "btn-primary", text: "Submit another",
          onClick: function () { state.submitted = false; state.customTags = []; renderSubmit(); }
        }),
        el("button", { type: "button", class: "btn-secondary", text: "Back to calendar", onClick: closeSubmit })
      ])
    ]);
  }

  function submitForm() {
    /* "Repeat until" only makes sense once something repeats. */
    var until = labelled("Repeat until", el("input", { type: "date", class: "input input--sm" }), "field--until");
    until.hidden = true;

    var repeat = selectOf(C.REPEAT_OPTIONS, {
      class: "select",
      onChange: function (e) { until.hidden = !e.target.value; }
    });

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
        C.CUSTOM_TAGS
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

    return el("div", { class: "submit" }, [
      el("div", { class: "submit__form" }, [
        labelled("Event title", el("input", { type: "text", class: "input", placeholder: "Soldering 101" })),
        labelled("Hosting club or organization", el("input", { type: "text", class: "input", placeholder: "IEEE Student Branch" })),

        el("div", { class: "submit__times" }, [
          labelled("Date", el("input", { type: "date", class: "input input--sm" })),
          labelled("Starts", el("input", { type: "time", class: "input input--sm" })),
          labelled("Ends", el("input", { type: "time", class: "input input--sm" }))
        ]),

        el("div", { class: "submit__repeat" }, [
          labelled("Repeats", repeat, "field--grow"),
          until
        ]),

        labelled("Location", el("input", { type: "text", class: "input", placeholder: "Engineering E101 Lab" })),
        labelled("What happens there", el("textarea", {
          class: "input",
          rows: "4",
          placeholder: "Two or three sentences a first-year would read before deciding to come."
        })),

        el("div", { class: "group" }, [
          el("div", { class: "group__label", text: "Tags students filter by" }),
          el("div", { class: "group__selects" }, C.GROUPS
            .filter(function (g) { return g.key !== "custom"; })
            .map(function (g) {
              return selectOf(groupOptions(g), { class: "select select--tag", "aria-label": g.any });
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

        el("label", { class: "field" }, [
          el("span", { class: "field__label", text: "Flyer page" }),
          el("span", { class: "dropzone" }, [
            el("span", { text: "One page, PDF or image. This is what students and the projector actually see, so make it readable from the back of a room." }),
            el("input", { type: "file", accept: "application/pdf,image/*" })
          ])
        ]),

        el("div", { class: "submit__who" }, [
          labelled("Your name", el("input", { type: "text", class: "input input--sm" })),
          labelled("CSU email", el("input", { type: "email", class: "input input--sm", placeholder: "name@colostate.edu" }))
        ]),

        el("div", { class: "submit__actions" }, [
          el("button", {
            type: "button", class: "btn-primary btn-primary--lg", text: "Send for approval",
            onClick: function () { state.submitted = true; renderSubmit(); }
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
    state.submitOpen = true;
    state.submitted = false;
    state.customTags = [];
    render();
  }

  function closeSubmit() {
    state.submitOpen = false;
    state.submitted = false;
    render();
  }

  /* ======================================================================
     Review queue
     ====================================================================== */

  function currentSubmission() {
    var i = Math.min(state.reviewSel, Math.max(0, state.pending.length - 1));
    return state.pending[i] || null;
  }

  function decide(sub, note) {
    state.pending = state.pending.filter(function (x) { return x.id !== sub.id; });
    state.reviewSel = Math.min(state.reviewSel, Math.max(0, state.pending.length - 1));
    state.changesOpen = false;
    state.feedback = "";
    state.note = note;
    renderReview();
  }

  function reviewEmpty() {
    return el("div", { class: "done" }, [
      el("div", { class: "done__kicker", text: "Queue clear" }),
      el("h3", { class: "done__title", text: "Nothing waiting on you." }),
      el("p", {
        class: "done__body",
        text: "Every submission has been decided. New ones land here as soon as they are sent, and the submitter is emailed the moment you approve or decline."
      }),
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

    var sendButton = el("button", {
      type: "button", class: "btn-primary", text: "Send feedback",
      onClick: function () {
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
          el("span", { class: "queue__count", text: String(state.pending.length) })
        ]),
        state.pending.map(function (p, i) {
          return el("button", {
            type: "button",
            class: "queue__item" + (p.id === sub.id ? " is-on" : ""),
            onClick: function () {
              state.reviewSel = i;
              state.note = "";
              state.changesOpen = false;
              state.feedback = "";
              renderReview();
            }
          }, [
            el("span", { class: "queue__title", text: p.title }),
            el("span", { class: "queue__org", text: p.org }),
            el("span", { class: "queue__sent", text: "Sent " + p.submitted })
          ]);
        })
      ]),

      el("div", { class: "review__panes" }, [

        el("div", { class: "sub" }, [
          el("div", { class: "kicker", text: sub.org }),
          el("h3", { class: "sub__title", text: sub.title }),
          el("div", { class: "sub__when", text: sub.when + " · " + sub.place }),
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
              type: "button", class: "btn-primary", text: "Approve and publish",
              onClick: function () {
                decide(sub, "Approved. It is on the calendar now and " + sub.by + " has been emailed.");
              }
            }),
            el("button", {
              type: "button", class: "btn-secondary", text: "Request changes",
              onClick: function () { state.changesOpen = true; state.note = ""; renderReview(); }
            }),
            el("button", {
              type: "button", class: "btn-decline", text: "Decline",
              onClick: function () {
                decide(sub, "Declined. " + sub.by + " has been emailed the reason.");
              }
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
                  el("div", { class: "flyerproof__sheet" }),
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
            el("div", { class: "meta__sub", text: sub.email })
          ]),
          el("div", {}, [
            el("div", { class: "meta__label", text: "Repeats" }),
            el("div", { class: "meta__value", text: sub.repeat })
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
    state.reviewOpen = true;
    state.note = "";
    render();
  }

  function closeReview() {
    state.reviewOpen = false;
    state.changesOpen = false;
    state.feedback = "";
    if ((location.hash || "").toLowerCase() === "#review") {
      history.replaceState(null, "", location.pathname + location.search);
    }
    render();
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
          el("div", { class: "kicker reel__label", text: "Upcoming this week" }),
          el("div", { class: "reel__list", "data-reel": "fx" })
        ])
      ]),

      el("div", { class: "fx__foot" })
    ]);

    overlays.appendChild(slideshowNode);
  }

  function startSlideshow() {
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
      ? C.EVENTS.filter(function (e) { return e.id === state.detailId; })[0]
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
    syncScrollLock();
  }

  /* ======================================================================
     The slide timer
     ====================================================================== */

  function tick() {
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
    }

    if (state.slideshow && !typing) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(state.active + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(state.active - 1); }
    }
  }

  function onHashChange() {
    if ((location.hash || "").toLowerCase() === "#review") openReview();
  }

  function start() {
    one('[data-action="open-submit"]').addEventListener("click", openSubmit);
    one('[data-action="start-slideshow"]').addEventListener("click", startSlideshow);
    one('[data-action="prev"]').addEventListener("click", function () { shift(-1); });
    one('[data-action="next"]').addEventListener("click", function () { shift(1); });
    one('[data-action="today"]').addEventListener("click", function () {
      state.anchor = C.CONFIG.today;
      state.active = 0;
      state.t = 0;
      render();
    });
    one('[data-action="view-week"]').addEventListener("click", function () { setView("week"); });
    one('[data-action="view-month"]').addEventListener("click", function () { setView("month"); });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);

    render();
    onHashChange();
    setInterval(tick, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
