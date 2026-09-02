/* Telling the server what happened on the page.

   One function, posted to /api/metric, which writes a single Analytics Engine
   data point and answers 204. The schema and the list of what is recorded live
   on the server, at the top of functions/_lib/metrics.js, because that is the
   only place that can enforce it — this file is a sender, not an authority.

   It exists alongside the Cloudflare Web Analytics beacon in index.html rather
   than instead of it. The beacon is a third-party script from
   static.cloudflareinsights.com: ad blockers stop it, Brave stops it, and CSU's
   own filtering stopped this entire domain for ten days in August. This is
   same-origin, so nothing between the student and the calendar can drop it
   without dropping the calendar too. It is also the only one of the two that
   can see what the office actually asks about — which events get opened, what
   gets added to a calendar, whether anyone uses the slideshow.

   Nothing here identifies anybody. No cookie is set, no id is generated, no
   value is read out of storage, and no text anybody typed is sent. Two loads by
   the same person are two unrelated data points and there is nothing on either
   side that could join them, which is also why there is no Do Not Track check:
   what DNT and GPC ask a site to stop doing is follow a person, and there is
   nothing here to turn off.

   Every failure is silent and every call is fire-and-forget. A student's
   calendar must never be slower, or more broken, because a counter did not get
   written. */
(function () {
  "use strict";

  var ENDPOINT = "/api/metric";

  /* Held open by name so that a burst collapses to its last state rather than
     sending one of each. Only `search` uses this — see soon() below. */
  var pending = {};

  function send(name, fields) {
    fields = fields || {};

    var payload = {
      name: name,
      subject: fields.subject || "",
      detail: fields.detail || "",
      surface: fields.surface || "",
      value: typeof fields.value === "number" ? fields.value : 0
    };

    var body;
    try {
      body = JSON.stringify(payload);
    } catch (e) {
      return;
    }

    /* sendBeacon is the right tool: the browser owns the request from here, it
       survives the page being closed a moment later, and it cannot hold up
       anything the person is actually doing. It can refuse — there is a queue
       limit — and it is absent on old browsers, so there is a fallback.

       The Blob's type is what sets the Content-Type; without it sendBeacon
       sends text/plain, which parses on the server either way but describes
       the body wrongly to anything looking at the traffic. */
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch (e) { /* fall through */ }

    /* keepalive so this behaves like sendBeacon on the way out of the page.
       The rejection handler is not optional: an unhandled rejection from a
       counter would reach the console of a page that is working perfectly. */
    try {
      fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: body
      }).catch(function () {});
    } catch (e) { /* nothing further to try, and nothing to report */ }
  }

  /* Record something now. */
  function track(name, fields) {
    try { send(name, fields); } catch (e) { /* never the page's problem */ }
  }

  /* Record something once the person has stopped doing it. Search fires on
     every keystroke, and "coo", "cook", "cooki", "cookie" is one search being
     typed, not four searches — sending all four would make the busiest metric
     on the site a measure of typing speed. */
  function soon(name, fields, ms) {
    try {
      if (pending[name]) clearTimeout(pending[name]);
      pending[name] = setTimeout(function () {
        delete pending[name];
        send(name, fields);
      }, ms || 900);
    } catch (e) { /* never the page's problem */ }
  }

  window.CalMetrics = { track: track, soon: soon };
})();
