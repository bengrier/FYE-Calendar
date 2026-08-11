/* GET /review — a real path that exists only so Cloudflare Access has
   something to challenge on.

   The review screen is `#review`, a fragment, and a fragment never leaves the
   browser. An Access application configured on it would never fire, so a
   reviewer would reach the screen unauthenticated, its first call to
   /api/admin/* would be answered with a redirect to a login page, and a
   background fetch cannot perform an interactive login. They would see a
   failure with no way to sign in.

   So the flow goes through here instead. Access challenges this request,
   authenticates the reviewer, sets its cookie for the host, and only then does
   this hand them to the screen — where every /api/admin/* call now carries the
   cookie the middleware is looking for.

   The site answers on two hostnames and Access only covers one of them, since
   an Access application needs a zone on the Cloudflare account and the custom
   domain's DNS lives elsewhere. On the uncovered hostname there is no sign-in
   to be had, so this sends the reviewer to the one where there is, rather than
   letting them arrive at a queue that will answer 401 and offer no way out.

   REVIEW_HOST names that hostname. Unset, this still works — it just lands
   people on whichever host they asked for, which is right for a deployment
   where Access covers everything. */

export function onRequestGet(context) {
  var url = new URL(context.request.url);
  var host = String(context.env.REVIEW_HOST || "").trim();

  if (host && url.hostname !== host) {
    return Response.redirect("https://" + host + "/review", 302);
  }

  return Response.redirect(url.origin + "/#review", 302);
}
