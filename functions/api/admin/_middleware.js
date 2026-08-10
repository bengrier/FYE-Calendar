/* Everything under /api/admin is behind this.

   Cloudflare Access is the real gate: it sits at the edge, refuses anyone who
   is not on the allow-list, and a request that fails it never reaches here.
   This middleware verifies the JWT Access attaches, so that a request arriving
   by some other route — a misconfigured Access application, a rule deleted by
   accident, someone hitting the *.pages.dev origin directly — is still refused.

   It fails closed. If ACCESS_TEAM_DOMAIN and ACCESS_AUD are not configured,
   every admin request is rejected; an unconfigured deployment is a locked one,
   never an open one. The single exception is DEV_UNSAFE_NO_AUTH, which can only
   come from a local .dev.vars file that wrangler does not upload. */

import { json } from "../../_lib/http.js";

var JWKS_TTL_MS = 60 * 60 * 1000;
var jwksCache = { url: null, keys: null, at: 0 };

export async function onRequest(context) {
  var env = context.env;

  if (env.DEV_UNSAFE_NO_AUTH === "1") {
    context.data.identity = "local-development";
    return context.next();
  }

  var team = String(env.ACCESS_TEAM_DOMAIN || "").trim();
  var aud = String(env.ACCESS_AUD || "").trim();

  if (!team || !aud) {
    return json(
      { error: "This deployment has no Access configuration, so the review API is closed." },
      { status: 503 }
    );
  }

  var token =
    context.request.headers.get("Cf-Access-Jwt-Assertion") ||
    cookie(context.request, "CF_Authorization");

  if (!token) return json({ error: "Not signed in." }, { status: 401 });

  var claims = await verify(token, team, aud);
  if (!claims) return json({ error: "That sign-in is not valid." }, { status: 403 });

  /* Recorded against every decision, so the queue can say who approved what. */
  context.data.identity = claims.email || claims.sub || "unknown";
  return context.next();
}

function cookie(request, name) {
  var raw = request.headers.get("Cookie") || "";
  var hit = raw.split(/;\s*/).filter(function (p) {
    return p.slice(0, name.length + 1) === name + "=";
  })[0];
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

async function jwks(team) {
  var url = "https://" + team + "/cdn-cgi/access/certs";
  var fresh = jwksCache.url === url && Date.now() - jwksCache.at < JWKS_TTL_MS;
  if (fresh && jwksCache.keys) return jwksCache.keys;

  var res = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!res.ok) return null;
  var body = await res.json();
  jwksCache = { url: url, keys: body.keys || [], at: Date.now() };
  return jwksCache.keys;
}

function b64urlToBytes(part) {
  var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

/* Returns the claims, or null. Every failure is a null — a caller must not be
   able to tell a malformed token from a wrong signature from an expired one. */
async function verify(token, team, aud) {
  try {
    var parts = String(token).split(".");
    if (parts.length !== 3) return null;

    var header = b64urlToJson(parts[0]);
    var claims = b64urlToJson(parts[1]);
    if (header.alg !== "RS256") return null;

    var keys = await jwks(team);
    if (!keys || !keys.length) return null;

    var jwk = keys.filter(function (k) { return k.kid === header.kid; })[0];
    if (!jwk) return null;

    var key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    var signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    var ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed
    );
    if (!ok) return null;

    /* A valid signature over the wrong audience is somebody else's token: the
       aud claim is what ties it to this application. */
    var auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (auds.indexOf(aud) === -1) return null;

    if (claims.iss !== "https://" + team) return null;

    var now = Math.floor(Date.now() / 1000);
    if (claims.exp && now >= claims.exp) return null;
    if (claims.nbf && now < claims.nbf) return null;

    return claims;
  } catch (e) {
    return null;
  }
}
