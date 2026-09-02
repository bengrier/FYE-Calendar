/* GET /api/events — the calendar itself. Public, and the only thing most
   visitors ever call.

   Everything the client needs to render arrives in one response: the events,
   the tags each one answers to, and the approved custom tags for the filter
   bar. Three round trips to paint a calendar would be three chances to show
   half of one. */

import { json, methodNotAllowed } from "../_lib/http.js";
import { record } from "../_lib/metrics.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed("GET");

  /* Reaching here means the edge cache did not answer, so this counts cache
     misses and not visits — the response below is cached for a minute, and a
     busy minute is many people and one of these. It is recorded anyway, and
     named for what it is, because it is the only count of this site nothing
     can block: the page's own `page` metric and the Cloudflare beacon are both
     browser-side and both stop at an ad blocker. A `page` figure well under
     this one is the blockers, not a quiet week. */
  record(context, "events_api_miss", { surface: "server" });

  var db = context.env.DB;

  var results = await db.batch([
    db.prepare(
      "SELECT id, date, start, time, title, org, place, blurb, flyer_key, temporary, " +
      "from_submission FROM events ORDER BY date, start"
    ),
    /* Through the `approved` flag, not around it. A custom tag the office has
       turned off in the review screen stops appearing on the event as well as
       in the filter bar — half of that would leave a chip on a card that
       filters nothing. The LEFT JOIN keeps a tag with no catalogue row rather
       than silently dropping it: nothing writes one today, and an event losing
       a tag because a row is missing is the wrong way to find that out. */
    db.prepare(
      "SELECT et.event_id, et.tag FROM event_tags et " +
      "LEFT JOIN tags t ON t.name = et.tag " +
      "WHERE t.name IS NULL OR t.approved = 1"
    ),
    db.prepare("SELECT name FROM tags WHERE approved = 1 AND kind = 'custom' ORDER BY name"),
    /* Which events are one date of several. One approval writes one row per
       occurrence and ties them together with `from_submission`, so a series is
       a group of rows and nothing else — there is no column on an event saying
       it repeats, and this is the question that answers instead.

       Counted rather than read off the submission's repeat rule, because the
       rule is what was approved and the rows are what is on the calendar. A
       reviewer who trims a weekly series back to its first date leaves one
       event behind, and one event does not repeat however it was published.

       Only the id list comes back, not a flag per event: the submission id is
       the thread through somebody's submission, and the calendar only needs to
       know that a date has siblings, not which submission it came from. */
    db.prepare(
      "SELECT from_submission FROM events WHERE from_submission IS NOT NULL " +
      "GROUP BY from_submission HAVING COUNT(*) > 1"
    )
  ]);

  var repeating = {};
  results[3].results.forEach(function (row) { repeating[row.from_submission] = true; });

  var tagsByEvent = {};
  results[1].results.forEach(function (row) {
    (tagsByEvent[row.event_id] = tagsByEvent[row.event_id] || []).push(row.tag);
  });

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
      repeats: !!repeating[row.from_submission],
      tags: tagsByEvent[row.id] || []
    };
  });

  return json(
    {
      events: events,
      customTags: results[2].results.map(function (r) { return r.name; })
    },
    {
      /* A minute of edge caching turns the common case into no database read at
         all, and an approval that lands mid-minute shows up on the next one —
         which is well inside how quickly anybody notices. */
      headers: { "Cache-Control": "public, max-age=60" }
    }
  );
}
