/* GET /api/admin/published — what is already on the calendar.

   Behind Access; see _middleware.js. The public calendar is served by
   /api/events, and this is deliberately not that endpoint with a different
   name. Three things a reviewer needs are missing from the public one, each
   because the public one is right to leave them out:

   - **`from_submission`.** One approval writes one event row per occurrence,
     and those rows are all a series ever is. A reviewer works on the series —
     "this repeats too long" is a statement about six rows — so the thread that
     ties them together has to be in the response.
   - **The repeat rule.** It lives on the submission, not on the events, and it
     is the sentence the reviewer read when they approved it. Saying "every week
     until Dec 16" back to them is how they recognise the series they mean.
   - **Tags nobody can filter by.** /api/events hides a custom tag the office has
     un-approved, which is the whole point of un-approving one. This screen is
     where that is decided, so it has to show what is actually on the row.

   Never cached, for the same reason the queue is not: someone who has just
   removed an event and is looking at the list it was in must not be shown a
   copy of the answer from before they removed it. */

import { json, methodNotAllowed } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed("GET");

  var db = context.env.DB;

  var results = await db.batch([
    db.prepare(
      "SELECT id, date, start, time, title, org, place, blurb, flyer_key, temporary, " +
      "from_submission, created_at FROM events ORDER BY date, start"
    ),
    db.prepare("SELECT event_id, tag FROM event_tags"),
    /* Only the custom ones. The fixed chips are the filter bar's own vocabulary
       from js/data.js, mirrored into this table so the server can tell a tag
       picked off a list from one somebody invented — they are not a decision
       anybody reviews, and offering to un-approve "Workshop" would be offering
       to break the filter bar. */
    db.prepare("SELECT name, approved FROM tags WHERE kind = 'custom' ORDER BY name"),
    db.prepare("SELECT tag, COUNT(*) AS uses FROM event_tags GROUP BY tag"),
    /* The repeat rule of every submission that actually produced events. A
       series whose events have all been removed is not in this list, and there
       is nothing left for it to describe. */
    db.prepare(
      "SELECT id, repeat_rule, repeat_until FROM submissions " +
      "WHERE id IN (SELECT from_submission FROM events WHERE from_submission IS NOT NULL)"
    )
  ]);

  var tagsByEvent = {};
  results[1].results.forEach(function (row) {
    (tagsByEvent[row.event_id] = tagsByEvent[row.event_id] || []).push(row.tag);
  });

  var uses = {};
  results[3].results.forEach(function (row) { uses[row.tag] = row.uses; });

  var events = results[0].results.map(function (row) {
    return {
      id: row.id,
      date: row.date,
      start: row.start,
      time: row.time,
      title: row.title,
      org: row.org,
      place: row.place,
      blurb: row.blurb,
      flyer: row.flyer_key,
      temporary: !!row.temporary,
      series: row.from_submission,
      publishedAt: row.created_at,
      tags: tagsByEvent[row.id] || []
    };
  });

  var series = {};
  results[4].results.forEach(function (row) {
    series[row.id] = { repeat: row.repeat_rule || "", repeatUntil: row.repeat_until };
  });

  var tags = results[2].results.map(function (row) {
    return { name: row.name, approved: !!row.approved, uses: uses[row.name] || 0 };
  });

  return json(
    { events: events, series: series, tags: tags },
    { headers: { "Cache-Control": "no-store" } }
  );
}
