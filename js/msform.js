/* The bridge to the office's Microsoft Form.

   Microsoft Forms has no public submission API — the endpoint its own front end
   posts to is CORS-blocked and token-gated — so this page cannot file a
   response on a submitter's behalf, and anything built on that private endpoint
   would break the first time Microsoft changed it. What this page can do is
   hand off: the form on this site collects and validates everything, then opens
   the real Form with every answer already filled in, and the submitter presses
   Submit there. The response lands in the office's SharePoint with no server
   here, no credentials in this code, and nothing public to abuse.

   Setup is one paste — see README.md. Answer each question in the Form with the
   sentinel word listed below, take "Get pre-filled URL", and drop the result
   into CONFIG.submitForm.prefillUrl. Pairing by sentinel rather than by
   question id means nobody has to read Microsoft's opaque `r1a2b3c…=`
   parameters and match them up by hand. */
window.CalMsForm = (function () {
  "use strict";

  /* Capitals and underscores are unreserved, so a sentinel survives Microsoft's
     URL-encoding unchanged and reaches the pasted link looking exactly like
     this. Anything with a space or punctuation in it would not. */
  var SENTINELS = {
    title: "FYE_TITLE",
    org: "FYE_ORG",
    date: "FYE_DATE",
    time: "FYE_TIME",
    repeat: "FYE_REPEAT",
    place: "FYE_PLACE",
    blurb: "FYE_BLURB",
    tags: "FYE_TAGS",
    by: "FYE_NAME",
    email: "FYE_EMAIL"
  };

  /* The reading order of the questions in the Form, used to name what is
     missing in the order someone would find it on screen. */
  var ORDER = ["title", "org", "date", "time", "repeat", "place", "blurb",
               "tags", "by", "email"];

  /* Human names for the setup message, so a misconfigured link says "the Date
     question" rather than quoting a sentinel nobody recognises. */
  var LABELS = {
    title: "Event title", org: "Hosting club or organization", date: "Date",
    time: "Time", repeat: "Repeats", place: "Location",
    blurb: "What happens there", tags: "Tags", by: "Your name",
    email: "CSU email"
  };

  var BY_SENTINEL = {};
  ORDER.forEach(function (key) { BY_SENTINEL[SENTINELS[key]] = key; });

  /* One alternation over every sentinel, so the substitution is a single pass.
     Replacing them one at a time would let an earlier field's text be re-read
     as a later field's sentinel. */
  var PATTERN = new RegExp(ORDER.map(function (k) { return SENTINELS[k]; }).join("|"), "g");

  function template() {
    var cfg = (window.CalData.CONFIG || {}).submitForm || {};
    return String(cfg.prefillUrl || "").trim();
  }

  /* Which questions the pasted link does not carry. Named precisely, because
     this is a setup mistake somebody makes once and should not have to
     diagnose by pressing Send and watching a field quietly go missing. */
  function missing() {
    var url = template();
    if (!url) return ORDER.slice();
    return ORDER.filter(function (key) {
      return url.indexOf(SENTINELS[key]) === -1;
    });
  }

  function missingLabels() {
    return missing().map(function (key) { return LABELS[key]; });
  }

  function linked() {
    return !!template();
  }

  function configured() {
    return linked() && missing().length === 0;
  }

  /* `answers` is keyed by the names in SENTINELS. A field left out arrives as
     an empty answer rather than as the literal sentinel. */
  function urlFor(answers) {
    var url = template();
    if (!url) return null;

    return url.replace(PATTERN, function (hit) {
      var value = answers[BY_SENTINEL[hit]];
      return encodeURIComponent(
        value === null || value === undefined ? "" : String(value)
      );
    });
  }

  return {
    SENTINELS: SENTINELS,
    ORDER: ORDER,
    LABELS: LABELS,
    linked: linked,
    configured: configured,
    missing: missing,
    missingLabels: missingLabels,
    urlFor: urlFor
  };
})();
