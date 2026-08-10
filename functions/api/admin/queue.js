/* GET /api/admin/queue — what is waiting on the office.

   Behind Access; see _middleware.js. Returns submitter names and addresses,
   which is why it is behind Access and why it is never cached. */

import { json, methodNotAllowed } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") return methodNotAllowed("GET");

  var db = context.env.DB;

  var results = await db.batch([
    db.prepare(
      "SELECT id, title, org, place, date, start, time, blurb, repeat_rule, repeat_until, " +
      "by_name, by_email, flyer_key, awaiting, submitted_at " +
      "FROM submissions WHERE status = 'pending' ORDER BY submitted_at"
    ),
    db.prepare(
      "SELECT st.submission_id, st.tag, st.is_new FROM submission_tags st " +
      "JOIN submissions s ON s.id = st.submission_id WHERE s.status = 'pending'"
    )
  ]);

  var tags = {};
  var newTags = {};
  results[1].results.forEach(function (row) {
    var bucket = row.is_new ? newTags : tags;
    (bucket[row.submission_id] = bucket[row.submission_id] || []).push(row.tag);
  });

  var queue = results[0].results.map(function (row) {
    return {
      id: row.id,
      title: row.title,
      org: row.org,
      place: row.place,
      date: row.date,
      start: row.start,
      time: row.time,
      blurb: row.blurb,
      repeat: row.repeat_rule || "",
      repeatUntil: row.repeat_until,
      by: row.by_name,
      email: row.by_email,
      flyer: row.flyer_key,
      awaiting: !!row.awaiting,
      submittedAt: row.submitted_at
    };
  });

  return json(
    { queue: queue, tags: tags, newTags: newTags },
    { headers: { "Cache-Control": "no-store" } }
  );
}
