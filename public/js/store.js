/* The live calendar, backed by the API.

   The whole of app.js reads the calendar synchronously — `events()` inside a
   render function, `flyerOf()` while painting a card — and rewriting all of that
   to be asynchronous would touch every render path for no benefit. So the read
   interface below is unchanged and still synchronous: it answers out of an
   in-memory cache.

   What changed is where the cache comes from. `hydrate()` fetches, fills it and
   fires the listeners; the existing onChange → re-render wiring then repaints
   exactly as it did when the data was a local array. Mutations are the only
   things that became asynchronous, because they are the only things that have
   to wait for a server to agree.

   Nothing is persisted in the browser any more. The database is the one copy,
   which is what makes two reviewers see the same queue. */
window.CalStore = (function () {
  "use strict";

  var C = window.CalData;

  /* Everything the calendar knows, replaced wholesale on each hydrate. Partial
     updates would need merge rules, and a wrong merge shows somebody an event
     that is not there. */
  var cache = {
    events: [],
    customTags: [],
    queue: [],
    queueTags: {},
    queueNewTags: {},
    /* The review screen's view of what is already published: every event with
       the submission that produced it, that submission's repeat rule, and the
       custom tag catalogue with its approval state. Only filled on the review
       screen, because only /api/admin can answer for it. */
    published: [],
    seriesRules: {},
    tagCatalog: []
  };

  var listeners = [];
  var status = { loaded: false, loading: false, error: null };

  function onChange(fn) { listeners.push(fn); }
  function changed() { listeners.forEach(function (fn) { fn(); }); }

  /* ======================================================================
     Talking to the API
     ====================================================================== */

  function request(path, options) {
    return fetch(path, options).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (body) {
          if (res.ok) return body;
          var err = new Error(body.error || "That did not work.");
          err.status = res.status;
          err.field = body.field || null;
          throw err;
        });
    });
  }

  /* Read the calendar. `withQueue` additionally asks for the two things the
     review screen runs on — the queue of submissions waiting, and everything
     already published — both of which are behind Access. They are only
     requested on that screen, and a refusal there is reported rather than
     swallowed.

     `fresh` bypasses the caches. /api/events is cached for a minute at the
     edge, which is right for the hundreds of people reading the calendar and
     wrong for the one person who just changed it: a reviewer who approves an
     event and does not see it appear concludes the approval failed. A unique
     query string is a different cache key, so it reaches the database. */
  function hydrate(withQueue, fresh) {
    status.loading = true;
    status.error = null;
    changed();

    var eventsUrl = fresh ? "/api/events?t=" + Date.now() : "/api/events";
    var wanted = [request(eventsUrl)];
    if (withQueue) {
      wanted.push(request("/api/admin/queue"));
      wanted.push(request("/api/admin/published"));
    }

    return Promise.all(wanted)
      .then(function (results) {
        cache.events = results[0].events || [];
        cache.customTags = results[0].customTags || [];

        if (results[1]) {
          cache.queue = results[1].queue || [];
          cache.queueTags = results[1].tags || {};
          cache.queueNewTags = results[1].newTags || {};
        }

        if (results[2]) {
          cache.published = results[2].events || [];
          cache.seriesRules = results[2].series || {};
          cache.tagCatalog = results[2].tags || [];
        }

        status.loaded = true;
        status.loading = false;
        status.error = null;
        changed();
        return cache;
      })
      .catch(function (err) {
        status.loading = false;
        /* A failed hydrate leaves whatever was already shown in place. A
           calendar that has gone stale for a minute is better than one that
           empties itself because a request timed out. */
        status.error = err;
        changed();
        throw err;
      });
  }

  function state() {
    return {
      loaded: status.loaded,
      loading: status.loading,
      error: status.error
    };
  }

  /* ======================================================================
     Reading — synchronous, from the cache
     ====================================================================== */

  function events() { return cache.events; }

  function eventById(id) {
    return cache.events.filter(function (e) { return e.id === id; })[0] || null;
  }

  function queue() { return cache.queue; }

  /* Everything on the calendar as the reviewer sees it, which is not quite what
     `events()` holds: these carry the submission that produced them and every
     tag on the row, including ones nobody can currently filter by. */
  function published() { return cache.published; }

  /* The repeat rule a series was approved from — the sentence the reviewer read
     before they pressed Approve. Absent for the seeded events, which had no
     submission behind them. */
  function seriesRule(id) { return cache.seriesRules[id] || null; }

  /* Every custom tag the calendar knows, approved or not, with how many events
     carry it. `customTags()` above is the filter bar's list and holds only the
     approved ones; this is the list the office decides that from. */
  function tagCatalog() { return cache.tagCatalog; }

  function customTags() { return cache.customTags; }

  /* Tags a queued submission carries, split into ones the calendar already
     knows and ones the submitter invented. The reviewer approves the second
     list; the server decides which is which. */
  function submissionTags(id) { return cache.queueTags[id] || []; }
  function submissionNewTags(id) { return cache.queueNewTags[id] || []; }

  /* Every tag an event answers to: its own — which now arrive from the server
     already including any approved custom ones — plus its time of day and
     "Free", since nothing on this calendar costs anything. */
  function allTags(ev) {
    return (ev.tags || []).concat([C.timeOfDay(ev), "Free"]);
  }

  /* Two kinds of artwork behind one call. A bundled key like "peru" is a file
     committed to the repo; anything else is an upload in R2, served from
     /uploads. The rest of the app never has to know the difference.

     Three renderings come back, because one file cannot serve all three sizes.
     A flyer is drawn at 154x96 in a card, at most of a projector screen on the
     stage, and at its own full resolution when somebody opens the page. Handing
     the card the original meant a week's grid pulled several megabytes to fill
     six thumbnails, which is what made them sit blank on a slow connection.

     `thumb` and `image` are derived key names, not stored ones: the renditions
     are written beside the original at upload. When one is missing — an old
     upload, or a browser whose canvas encode failed — /uploads serves the
     original instead, so a derived name always resolves to something. The one
     exception is the one original that is not an image: see below. */
  function flyer(key) {
    if (!key) return null;

    var bundled = C.FLYERS[key];
    if (bundled) return { thumb: bundled.image, image: bundled.image, page: bundled.page };

    var url = "/uploads/" + key;

    /* Nothing can put a PDF in an <img>. What it can have is a picture of its
       first page, taken in the submitter's browser at upload — and the key
       says whether it got one: `.r.pdf` was rasterised, plain `.pdf` was not,
       because the browser was too old or the file too strange. Only the second
       has nothing to draw.

       The distinction is in the key rather than in the database because this
       function is synchronous and holds nothing else. api/flyers.js decides
       which name to issue, and only ever issues `.r.pdf` once both renditions
       are safely written. */
    if (/\.pdf$/i.test(key) && !/\.r\.pdf$/i.test(key)) {
      return { thumb: null, image: null, page: url };
    }

    return { thumb: url + ".t.jpg", image: url + ".d.jpg", page: url };
  }

  function flyerOf(ev) { return flyer(ev && ev.flyer); }

  /* Every date a repeating submission lands on. The server does this again
     when approving — it is the one that counts — but the reviewer is told how
     many events approving will create before they press it, and that number
     has to be right. Keep this in step with functions/_lib/submission.js. */
  function occurrences(sub) {
    var D = window.CalDates;
    var dates = [sub.date];
    if (!sub.repeat || !sub.repeatUntil) return dates;

    var step = sub.repeat === "weekly" ? 7 : sub.repeat === "biweekly" ? 14 : 0;
    var cursor = D.fromIso(sub.date);
    var last = D.fromIso(sub.repeatUntil);

    for (var i = 0; i < 60; i++) {
      cursor = step ? D.addDays(cursor, step) : sameWeekdayNextMonth(cursor);
      if (cursor > last) break;
      dates.push(D.toIso(cursor));
    }
    return dates;
  }

  function sameWeekdayNextMonth(d) {
    var D = window.CalDates;
    var nth = Math.floor((d.getDate() - 1) / 7);
    var first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    var offset = (D.dowIndex(d) - D.dowIndex(first) + 7) % 7;
    var target = D.addDays(first, offset + nth * 7);
    /* A 5th Tuesday does not exist every month; fall back to the 4th. */
    return target.getMonth() === first.getMonth() ? target : D.addDays(target, -7);
  }

  /* ======================================================================
     Writing — asynchronous, through the API
     ====================================================================== */

  /* What the calendar draws a flyer into, at the two sizes that are not the
     original. 308 is a 154px card thumbnail on a 2x screen; 1400 covers the
     stage on a lecture-hall projector, where the flyer is meant to be read
     from the back of the room. */
  var THUMB_WIDTH = 308;
  var DISPLAY_WIDTH = 1400;

  /* Uploads first and separately, so a 10 MB file is not re-sent every time a
     validation message sends the submitter back to the form. Resolves to the
     key the submission then references.

     The two smaller renderings are made here, in the submitter's browser,
     because a Worker has no image decoder to make them with. They ride along
     with the original in the same request. */
  function uploadFlyer(file) {
    return renditions(file).then(function (small) {
      var form = new FormData();
      form.append("flyer", file);
      if (small.thumb) form.append("thumb", small.thumb, "thumb.jpg");
      if (small.display) form.append("display", small.display, "display.jpg");
      return request("/api/flyers", { method: "POST", body: form })
        .then(function (body) { return body.key; });
    });
  }

  /* Both renderings, or as many as this browser and this file allow. A missing
     rendition is an optimisation lost, never a submission refused — so every
     failure here resolves empty rather than rejecting, and the flyer still
     uploads whole. */
  function renditions(file) {
    var type = String(file.type || "").toLowerCase();

    if (type === "application/pdf") return pdfRenditions(file);
    if (!/^image\//i.test(type)) return Promise.resolve({});

    return loadImage(file)
      .then(function (img) {
        return Promise.all([
          scaled(img, THUMB_WIDTH, 0.82),
          scaled(img, DISPLAY_WIDTH, 0.85)
        ]);
      })
      .then(function (out) { return { thumb: out[0], display: out[1] }; })
      .catch(function () { return {}; });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("undecodable")); };
      img.src = url;
    });
  }

  /* The same two renderings, made from a PDF instead of an image.

     A PDF is the one upload that cannot fall back on its original: an <img>
     can display a JPEG that was never resized, but nothing can display a PDF.
     So this is not the optimisation the image path is — it is the whole
     difference between a flyer that appears on the calendar and a flyer that
     is a line of text and a link.

     Which is also why both renderings have to arrive or neither counts. A pair
     with a hole in it would leave some other page reaching for a rendition
     that is not there, and the thing behind it is a PDF. */
  function pdfRenditions(file) {
    return loadPdf()
      .then(function (pdf) { return pdf.firstPage(file, DISPLAY_WIDTH); })
      .then(function (canvas) {
        return Promise.all([
          scaled(canvas, THUMB_WIDTH, 0.82),
          /* Encoded, not scaled: the page was rendered at DISPLAY_WIDTH
             already, and `scaled` would decline to widen what is that wide. */
          encode(canvas, 0.85)
        ]);
      })
      .then(function (out) {
        return out[0] && out[1] ? { thumb: out[0], display: out[1] } : {};
      })
      .catch(function () { return {}; });
  }

  /* pdf.js, fetched the first time somebody attaches a PDF and not before.

     It is reached through a module because that is the only way to load it,
     and through an injected <script> rather than `import()` because this file
     has to keep parsing on browsers that have never heard of either. A browser
     with no module support ignores `type="module"` silently — no load event,
     no error event, nothing to wait for — so it is asked first rather than
     waited on. */
  var pdfLoad = null;

  function loadPdf() {
    if (pdfLoad) return pdfLoad;

    pdfLoad = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      if (!("noModule" in script)) throw new Error("no module support");

      script.type = "module";
      script.src = "js/pdf-bridge.mjs";
      script.onload = function () {
        window.CalPdf ? resolve(window.CalPdf) : reject(new Error("pdf.js did not load"));
      };
      script.onerror = function () { reject(new Error("pdf.js did not load")); };
      document.head.appendChild(script);
    });

    /* A failure is this attempt's, not this browser's: a submitter who lost
       the network mid-upload and tries again gets a fresh attempt rather than
       a permanent no. */
    pdfLoad.catch(function () { pdfLoad = null; });
    return pdfLoad;
  }

  /* Null when the original is already no wider than the target: re-encoding it
     would spend bytes to gain nothing, and /uploads falls back to the original
     for a rendition that was never written. */
  function scaled(source, width, quality) {
    /* An <img> carries its true size on `naturalWidth`, where `width` means
       something else; a canvas from the PDF path has only `width`. */
    var w = source.naturalWidth || source.width;
    var h = source.naturalHeight || source.height;
    if (!w || !h || w <= width) return Promise.resolve(null);

    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round(h * width / w));

    var ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.imageSmoothingQuality = "high";
    /* JPEG carries no alpha, and an unpainted canvas is transparent black — a
       flyer with a transparent ground would come out on black without this. */
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    return encode(canvas, quality);
  }

  /* Separate from `scaled` because the PDF path arrives holding a canvas that
     is already the right size and has nothing left to scale. */
  function encode(canvas, quality) {
    return new Promise(function (resolve) {
      if (!canvas.toBlob) return resolve(null);
      canvas.toBlob(function (blob) {
        /* toBlob falls back to PNG when a type is not supported, which for a
           full-size flyer is larger than what we started with. Take JPEG or
           take nothing. */
        resolve(blob && blob.type === "image/jpeg" ? blob : null);
      }, "image/jpeg", quality);
    });
  }

  function submit(draft) {
    return request("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
  }

  function approve(id, approvedTags) {
    return request("/api/admin/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, approvedTags: approvedTags || [] })
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  function decline(id) {
    return request("/api/admin/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  /* The four things the review screen can do to a published event. Each
     re-hydrates before it resolves, and each does so with `fresh` set: the
     calendar is cached for a minute at the edge, and a reviewer who removes an
     event and still sees it concludes the removal failed. */

  /* Everything a published event says, rewritten. `what` is { id } for one
     event or { series } for every date one approval wrote, and the rest is the
     whole record — title, org, place, blurb, start, time, tags, flyer — not
     only the fields that changed. The server writes all of it; see
     functions/api/admin/edit.js for why a patch would not do.

     `flyer` is a key or null, and a new one is uploaded through `uploadFlyer`
     first, exactly as the submit form does it. This call only ever carries the
     key. */
  function editEvent(what) {
    return request("/api/admin/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(what)
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  function removeEvent(what) {
    return request("/api/admin/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(what)
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  function rescheduleEvent(id, date) {
    return request("/api/admin/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, date: date })
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  function setTagApproved(name, approved) {
    return request("/api/admin/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, approved: approved })
    }).then(function (result) {
      return hydrate(true, true).then(function () { return result; });
    });
  }

  function noteFeedback(id) {
    return request("/api/admin/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    }).then(function (result) {
      return hydrate(true).then(function () { return result; });
    });
  }

  return {
    hydrate: hydrate,
    state: state,
    events: events,
    eventById: eventById,
    queue: queue,
    published: published,
    seriesRule: seriesRule,
    tagCatalog: tagCatalog,
    customTags: customTags,
    submissionTags: submissionTags,
    submissionNewTags: submissionNewTags,
    allTags: allTags,
    flyer: flyer,
    flyerOf: flyerOf,
    occurrences: occurrences,
    uploadFlyer: uploadFlyer,
    submit: submit,
    approve: approve,
    decline: decline,
    editEvent: editEvent,
    removeEvent: removeEvent,
    rescheduleEvent: rescheduleEvent,
    setTagApproved: setTagApproved,
    noteFeedback: noteFeedback,
    onChange: onChange
  };
})();
