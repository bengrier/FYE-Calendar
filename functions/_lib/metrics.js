/* Writing the calendar's own usage numbers.

   Directories under /functions whose name begins with an underscore are not
   routed, so nothing in here is reachable as a URL. The route that is — the one
   the page posts to — is functions/api/metric.js, and it is a thin wrapper
   around `record` below.

   Why this exists at all is in wrangler.toml next to the binding: the per-domain
   analytics Cloudflare would normally provide belongs to a zone, and this
   deployment has no zone. The Web Analytics beacon in public/index.html covers
   page views and is a third-party script anything can block. This is the part
   that cannot be blocked, because it is our own origin, and it is the part that
   answers what the office actually asks — which events people open, what they
   add to their calendars, which filters they use.

   ======================================================================
   The schema
   ======================================================================

   Analytics Engine has no column names. A data point is an ordered array of
   blobs and an ordered array of doubles, and SQL addresses them by position:
   blob1, blob2, double1. So the positions are the schema, they are fixed here,
   and nothing may be inserted in the middle of either list — an existing row
   cannot be migrated, so a shifted position silently reinterprets three months
   of history. Add to the end, never into the middle.

     index1   the metric name, again. This is the sampling key: Analytics Engine
              samples per index value, so a rare metric like `slideshow` keeps
              its resolution instead of being thinned out alongside the common
              ones. Limit is 96 bytes; a name is far shorter.

     blob1    name      which metric this is — one of NAMES below
     blob2    subject   what it happened to: an event id, a tag, a filter value.
                        "" when the metric has no subject
     blob3    detail    a second dimension whose meaning depends on the metric:
                        the organisation for an event, the filter key for a
                        filter. "" when there is none
     blob4    surface   where in the page it happened: calendar, detail,
                        showcase, slideshow, embed, submit, server
     blob5    host      the hostname asked. Splits calendar.fyetools.com from
                        fye-calendar.pages.dev, which matters because the second
                        is the reviewers' address and its traffic is the office,
                        not students
     blob6    country   two-letter country from Cloudflare's own edge. Coarse on
                        purpose — it is the only geography recorded, and a
                        country is not a person

     double1  count     always 1, so a total is SUM(_sample_interval * double1)
     double2  value     a number the metric carries: how many events were in a
                        downloaded .ics, how many results a search matched. 0
                        when the metric has no number

   ======================================================================
   What is deliberately not here
   ======================================================================

   No IP address. No user agent. No cookie, session id or visitor id — nothing
   joins two data points into one person, by construction rather than by policy.
   No search text: `search` records how many results came back and not a
   character of what was typed, because a search box on a public site collects
   whatever somebody types into it and that is not a thing to keep for three
   months. Wanting the terms is a reasonable thing for the office to want; it is
   a decision for them to make out loud, and the change would be here.

   Event ids and organisation names are recorded, and both are already public —
   they are on the calendar and in the URL of every shared link.

   ======================================================================
   Reading it back
   ======================================================================

   Sampling means a row can stand for many. Never COUNT(*) — that counts rows
   Analytics Engine kept, not things that happened. Always weight:

     SELECT blob2 AS event, SUM(_sample_interval * double1) AS opens
     FROM fye_calendar
     WHERE blob1 = 'event_open' AND timestamp > NOW() - INTERVAL '30' DAY
     GROUP BY event ORDER BY opens DESC LIMIT 20

   README has the rest of the queries and how to get a token to run them. */

/* Every metric the system knows. A name not in here is not recorded — which is
   what stops a typo in a call site from creating a second, near-identical
   metric that quietly splits a total in half.

   `client` says whether the page is allowed to send it. The two that are not
   are written by Functions from facts the server already has, and a browser
   claiming them would be inventing submissions and cache misses that never
   happened. The endpoint enforces this; see functions/api/metric.js. */
export var NAMES = {
  /* The page loaded. Compare with `events_api_miss` to see roughly how much
     the ad blockers are taking. */
  page:            { client: true },
  /* An event's detail dialog was opened, however it was reached — clicked,
     stepped into with the arrows, or linked to with #event/<id>. */
  event_open:      { client: true },
  /* "Add to my calendar (.ics)" for the one event in the dialog. */
  ics_one:         { client: true },
  /* The toolbar's download for everything currently in view. value = how
     many events were in the file. */
  ics_view:        { client: true },
  /* A filter was set. subject = the value chosen, detail = which filter. */
  filter:          { client: true },
  /* A search ran. value = how many events matched; 0 is the interesting
     case, because it is somebody looking for something that is not there. */
  search:          { client: true },
  /* The slideshow was started — the lobby-screen surface, whose usage there
     is otherwise no way at all to see. */
  slideshow:       { client: true },
  /* The flyer was opened full size from the detail dialog. */
  flyer_open:      { client: true },
  /* The submit form was opened. Against `submitted` below, this is the
     abandonment rate on the one form students are asked to fill in. */
  submit_open:     { client: true },

  /* Server-written, from GET /api/events. Named for what it actually is: that
     response is edge-cached for a minute, so this counts the requests that
     reached the Function and missed the cache, not visits. It is a floor and
     nothing more — but it is a floor no blocker can take away, which is what
     makes it worth having next to `page`. */
  events_api_miss: { client: false },
  /* Server-written, from POST /api/submissions, once a submission has been
     accepted into the queue. The queue table is the real record of this; the
     data point is here so that submissions sit on the same timeline as the
     browsing that led to them. */
  submitted:       { client: false }
};

/* Blobs are capped at 16KB per data point, so this is not about the limit. It
   is about a field that is supposed to hold an event id not quietly becoming a
   place where long strings accumulate. */
var MAX_FIELD = 64;

function text(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_FIELD);
}

function number(value) {
  return typeof value === "number" && isFinite(value) ? value : 0;
}

/* Record one thing that happened. Never throws and never returns anything to
   wait on: analytics failing is not a reason for a student's submission to fail,
   or for the calendar not to load.

   Three separate ways this can be a no-op, all of them fine:

     - the binding is absent or inert, which is what a local `wrangler pages
       dev` run is: nothing written there reaches the real dataset, so local
       traffic can never show up in the numbers;
     - the name is not in NAMES, which is a bug in a call site rather than
       anything the request did wrong;
     - writeDataPoint itself throws, which nothing downstream should notice. */
export function record(context, name, fields) {
  try {
    var dataset = context && context.env && context.env.ANALYTICS;
    if (!dataset || typeof dataset.writeDataPoint !== "function") return;
    if (!Object.prototype.hasOwnProperty.call(NAMES, name)) return;

    fields = fields || {};

    var request = context.request;
    var host = "";
    var country = "";

    if (request) {
      try { host = new URL(request.url).hostname; } catch (e) { /* not worth a metric */ }
      if (request.cf && typeof request.cf.country === "string") country = request.cf.country;
    }

    dataset.writeDataPoint({
      indexes: [name],
      blobs: [
        name,
        text(fields.subject),
        text(fields.detail),
        text(fields.surface) || "server",
        text(host),
        text(country)
      ],
      doubles: [1, number(fields.value)]
    });
  } catch (e) {
    /* Deliberately silent. A counter that cannot be written is not an event
       worth logging on every request that fails to write it. */
  }
}
