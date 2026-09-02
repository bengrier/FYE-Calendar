/* POST /api/metric — the page telling the server that something happened.

   The second public write endpoint on a public site, and much smaller than the
   first: it writes one Analytics Engine data point and nothing else. It touches
   no database, creates no row anybody has to review, and returns no content.
   The schema, and what is deliberately never recorded, are at the top of
   functions/_lib/metrics.js.

   The page reaches this with navigator.sendBeacon, which cannot read a reply, so
   there is nothing useful to say back: every outcome is 204. A refusal that the
   caller cannot see is not worth phrasing, and phrasing it would only tell
   somebody probing the endpoint which of their guesses was closer.

   No rate limiting, unlike POST /api/submissions, and that is a decision rather
   than an omission. The limiter there counts in D1 because what it protects is
   the office's queue — a human reads every row. Nothing here is read by a human,
   or kept beyond three months, or costs anything: Analytics Engine's free
   allowance is a hundred thousand data points a day and this endpoint is one
   point per call. Counting attempts in D1 would mean a database write on every
   page view of a site that currently serves most page views out of cache, which
   is a real cost imposed to prevent an imaginary one.

   What flooding this can do is make the numbers wrong. The defences against
   that are that only the names marked `client` in NAMES are accepted at all,
   that a data point carries the hostname it arrived on, and that nothing here
   feeds a decision that could not survive being off. If the numbers ever do get
   poisoned, the honest fix is Turnstile or a signed page token, not a counter. */

import { methodNotAllowed, readJson } from "../_lib/http.js";
import { NAMES, record } from "../_lib/metrics.js";

/* 204 with no body: nothing to parse, nothing to cache, nothing revealed. */
function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  if (!body) return noContent();

  var name = typeof body.name === "string" ? body.name : "";

  /* `client: false` names are written by Functions from things the server
     already knows to be true. Accepting one here would let anyone post
     submissions that were never submitted. */
  if (!Object.prototype.hasOwnProperty.call(NAMES, name)) return noContent();
  if (!NAMES[name].client) return noContent();

  /* record() does the rest of the validation — unknown fields ignored, strings
     truncated, a non-number value becomes 0 — and never throws. */
  record(context, name, {
    subject: body.subject,
    detail: body.detail,
    surface: body.surface,
    value: body.value
  });

  return noContent();
}
