/* Shared response helpers.

   Directories under /functions whose name begins with an underscore are not
   routed, so nothing in here is reachable as a URL. */

export function json(data, init) {
  init = init || {};
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        /* Nothing here is served to another origin — the API and the page share
           one — so there is no CORS header to hand out, deliberately. */
        "X-Content-Type-Options": "nosniff"
      },
      init.headers || {}
    )
  });
}

/* A refusal the client can show to a person. `field` lets the submit form put
   the message against the input it belongs to, the same way the client-side
   checks do. */
export function fail(status, message, field) {
  return json({ error: message, field: field || null }, { status: status });
}

export function methodNotAllowed(allowed) {
  return json(
    { error: "Method not allowed." },
    { status: 405, headers: { Allow: allowed } }
  );
}

export async function readJson(request) {
  try {
    var body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch (e) {
    return null;
  }
}

export function uid(prefix) {
  return (
    prefix + "-" + Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 8)
  );
}
