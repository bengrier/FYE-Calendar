/* POST /api/admin/feedback — the submission stays in the queue, flagged as
   waiting on the submitter.

   This does not send anything. The reviewer's own mail client composes and
   sends the reply; all this records is that it happened, so the queue can show
   which cards are waiting on somebody else rather than on the office. Saying
   the server emailed people when it does not is the mistake this whole project
   has made twice already. */

import { json, fail, methodNotAllowed, readJson } from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed("POST");

  var body = await readJson(context.request);
  var id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return fail(400, "Which submission?");

  var claim = await context.env.DB
    .prepare("UPDATE submissions SET awaiting = 1 WHERE id = ? AND status = 'pending'")
    .bind(id)
    .run();

  if (!claim.meta.changes) {
    return fail(409, "That submission is no longer in the queue.");
  }

  return json({ ok: true });
}
