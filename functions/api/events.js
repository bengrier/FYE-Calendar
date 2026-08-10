/* GET /api/events — the calendar itself. Public, and the only thing most
   visitors ever call.

   Everything the client needs to render arrives in one response: the events,
   the tags each one answers to, and the approved custom tags for the filter
   bar. Three round trips to paint a calendar would be three chances to show
   half of one. */

import { json, methodNotAllowed } from "../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed("GET");

  var db = context.env.DB;

  var results = await db.batch([
    db.prepare(
      "SELECT id, date, start, time, title, org, place, blurb, flyer_key, temporary " +
      "FROM events ORDER BY date, start"
    ),
    db.prepare("SELECT event_id, tag FROM event_tags"),
    db.prepare("SELECT name FROM tags WHERE approved = 1 AND kind = 'custom' ORDER BY name")
  ]);

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
