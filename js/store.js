/* The live calendar.

   `data.js` is the seed — the events, queue and tags the app ships with, and
   the seam where a real backend goes. This file is what the app actually reads
   and writes: the seed plus everything that has happened since, persisted to
   localStorage so a submission survives a reload.

   Only the delta is stored, never the seed. Editing `data.js` therefore still
   changes what everyone sees, and a stored delta cannot pin an old copy of a
   seeded event in place.

   Swapping localStorage for a server means reimplementing `load` and `save`
   and nothing else — every mutation below already funnels through `save`. */
window.CalStore = (function () {
  "use strict";

  var D = window.CalDates;
  var C = window.CalData;

  var KEY = "fye-calendar.v1";

  /* published  — events approved out of the queue, and the id they came from
     queue      — submissions waiting, in arrival order
     decided    — ids of seeded submissions already dealt with
     tags       — custom tags the office has approved since the seed
     tagsByEvent, flyers — per-event custom tags and uploaded artwork */
  var EMPTY = {
    published: [],
    queue: [],
    decided: [],
    tags: [],
    tagsByEvent: {},
    flyers: {}
  };

  var delta = load();
  var listeners = [];

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return clone(EMPTY);
      var parsed = JSON.parse(raw);
      var out = clone(EMPTY);
      Object.keys(EMPTY).forEach(function (k) {
        if (parsed && parsed[k]) out[k] = parsed[k];
      });
      return out;
    } catch (e) {
      /* Private browsing, a disabled store, or something we wrote in an older
         shape. Losing the delta is survivable; refusing to start is not. */
      return clone(EMPTY);
    }
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /* Flyer artwork is by far the biggest thing in here, so a quota failure is
     retried without it rather than dropping the submission itself. */
  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(delta));
    } catch (e) {
      try {
        var lean = clone(delta);
        lean.flyers = {};
        window.localStorage.setItem(KEY, JSON.stringify(lean));
        delta.flyers = {};
      } catch (e2) { /* nothing persists this session; the app still works */ }
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }

  /* ======================================================================
     Reading
     ====================================================================== */

  function events() {
    return C.EVENTS.concat(delta.published);
  }

  function eventById(id) {
    return events().filter(function (e) { return e.id === id; })[0] || null;
  }

  /* Seeded submissions that have not been decided, then everything submitted
     since, oldest first — the order a reviewer works through them. */
  function queue() {
    return C.PENDING
      .filter(function (p) { return delta.decided.indexOf(p.id) === -1; })
      .concat(delta.queue);
  }

  function customTags() {
    return C.CUSTOM_TAGS.concat(delta.tags.filter(function (t) {
      return C.CUSTOM_TAGS.indexOf(t) === -1;
    }));
  }

  function tagsFor(id) {
    return (C.CUSTOM_BY_EVENT[id] || []).concat(delta.tagsByEvent[id] || []);
  }

  /* Every tag an event answers to: its own, its time of day, "Free" (nothing
     on this calendar costs anything), and any approved custom tags. */
  function allTags(ev) {
    return ev.tags.concat([C.timeOfDay(ev), "Free"], tagsFor(ev.id));
  }

  /* Seeded artwork, plus anything uploaded through the submit form. */
  function flyer(key) {
    if (!key) return null;
    return C.FLYERS[key] || delta.flyers[key] || null;
  }

  function flyerOf(ev) {
    return flyer(ev && ev.flyer);
  }

  /* ======================================================================
     Writing
     ====================================================================== */

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 6);
  }

  /* A submission straight off the form. Everything it needs to become an
     event later is captured now, because the submitter is not coming back. */
  function submit(draft) {
    var sub = {
      id: uid("s"),
      title: draft.title,
      org: draft.org,
      place: draft.place,
      date: draft.date,
      start: draft.start,
      time: draft.time,
      blurb: draft.blurb,
      tags: draft.tags || [],
      newTags: draft.newTags || [],
      repeat: draft.repeat || "",
      repeatUntil: draft.repeatUntil || null,
      by: draft.by,
      email: draft.email,
      flyer: draft.flyer || null,
      flyerImage: draft.flyerImage || null,
      submitted: "just now",
      submittedAt: Date.now()
    };
    delta.queue = delta.queue.concat([sub]);
    save();
    return sub;
  }

  function drop(sub) {
    if (C.PENDING.some(function (p) { return p.id === sub.id; })) {
      delta.decided = delta.decided.concat([sub.id]);
    } else {
      delta.queue = delta.queue.filter(function (x) { return x.id !== sub.id; });
    }
  }

  /* Every date a repeating submission lands on, capped so a runaway rule can
     never flood the calendar. A one-off is just its own date. */
  function occurrences(sub) {
    var dates = [sub.date];
    if (!sub.repeat || !sub.repeatUntil) return dates;

    var step = sub.repeat === "weekly" ? 7 : sub.repeat === "biweekly" ? 14 : 0;
    var cursor = D.fromIso(sub.date);
    var last = D.fromIso(sub.repeatUntil);

    for (var i = 0; i < 60; i++) {
      /* "Monthly, same weekday" means the 2nd Tuesday stays the 2nd Tuesday,
         which is four or five weeks out depending on the month — not a date
         that can be reached by adding a fixed number of days. */
      cursor = step
        ? D.addDays(cursor, step)
        : sameWeekdayNextMonth(cursor);
      if (cursor > last) break;
      dates.push(D.toIso(cursor));
    }
    return dates;
  }

  function sameWeekdayNextMonth(d) {
    var nth = Math.floor((d.getDate() - 1) / 7);
    var first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    var offset = (D.dowIndex(d) - D.dowIndex(first) + 7) % 7;
    var target = D.addDays(first, offset + nth * 7);
    /* A 5th Tuesday does not exist every month; fall back to the 4th. */
    return target.getMonth() === first.getMonth() ? target : D.addDays(target, -7);
  }

  /* Approve: the submission leaves the queue and becomes one event per
     occurrence, the approved custom tags become filterable for everyone, and
     any uploaded artwork joins the flyer registry. */
  function approve(sub, approvedTags) {
    var keep = (approvedTags || []).filter(function (t) {
      return (sub.newTags || []).indexOf(t) > -1;
    });

    var flyerKey = null;
    if (sub.flyerImage) {
      flyerKey = uid("f");
      delta.flyers[flyerKey] = { image: sub.flyerImage, page: sub.flyerImage };
    }

    var dates = occurrences(sub);
    var made = dates.map(function (iso, i) {
      var id = uid("e") + (dates.length > 1 ? "-" + (i + 1) : "");
      var custom = keep.concat(
        (sub.tags || []).filter(function (t) { return isCustom(t); })
      );
      if (custom.length) delta.tagsByEvent[id] = unique(custom);

      return {
        id: id,
        date: iso,
        start: sub.start,
        time: sub.time,
        title: sub.title,
        org: sub.org,
        place: sub.place,
        flyer: flyerKey,
        blurb: sub.blurb,
        tags: (sub.tags || []).filter(function (t) { return !isCustom(t); }),
        fromSubmission: sub.id
      };
    });

    delta.published = delta.published.concat(made);
    delta.tags = unique(delta.tags.concat(keep));
    drop(sub);
    save();
    return made;
  }

  /* A tag is "custom" when it is not one of the fixed filter chips — those are
     the only values `tags` is meant to hold. "All disciplines" is not a chip
     but is not custom either: it is the discipline group's open-to-everyone
     answer, and the seeded events carry it. */
  function isCustom(tag) {
    if (tag === "All disciplines") return false;
    return !C.GROUPS.some(function (g) {
      return g.key !== "custom" && g.chips.indexOf(tag) > -1;
    });
  }

  function unique(list) {
    return list.filter(function (v, i) { return list.indexOf(v) === i; });
  }

  function decline(sub) {
    drop(sub);
    save();
  }

  /* Requesting changes leaves the submission in the queue — the submitter has
     to resend — so only the note about it is recorded. */
  function noteFeedback(sub) {
    var found = delta.queue.filter(function (x) { return x.id === sub.id; })[0];
    if (found) { found.awaiting = true; save(); }
    return sub;
  }

  function reset() {
    delta = clone(EMPTY);
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ }
    listeners.forEach(function (fn) { fn(); });
  }

  /* True once anything has been submitted, approved or declined — the page
     uses it to offer a way back to the shipped state. */
  function isDirty() {
    return delta.published.length > 0 || delta.queue.length > 0 ||
      delta.decided.length > 0 || delta.tags.length > 0;
  }

  return {
    events: events,
    eventById: eventById,
    queue: queue,
    customTags: customTags,
    allTags: allTags,
    flyer: flyer,
    flyerOf: flyerOf,
    occurrences: occurrences,
    submit: submit,
    approve: approve,
    decline: decline,
    noteFeedback: noteFeedback,
    onChange: onChange,
    isDirty: isDirty,
    reset: reset
  };
})();
