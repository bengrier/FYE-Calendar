/* Validating a submission, and expanding its repeat rule.

   Both of these also exist on the client — the checks in `validateDraft` in
   js/app.js, the expansion in `occurrences` in js/store.js. That duplication is
   deliberate and not a smell: the client copy exists to tell someone what is
   wrong while they type, and it runs in a browser the submitter controls, so it
   proves nothing. This copy is the one that decides.

   The two must agree on the *rules*, or the form will accept something the
   server rejects. If you change one, change the other. */

var MAX = {
  title: 140,
  org: 140,
  place: 140,
  blurb: 600,
  by: 120,
  email: 160,
  tag: 60,
  tags: 12
};

var REPEATS = ["", "weekly", "biweekly", "monthly"];

/* The office replies to this address, so anything else is a submission nobody
   can follow up. Subdomains count — students are on rams.colostate.edu. */
var CSU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*colostate\.edu$/i;

var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v) {
  return typeof v === "string" ? v.trim() : "";
}

/* Returns { ok: true, value } or { ok: false, message, field }. */
export function validateSubmission(body, todayIso) {
  if (!body) return bad("That submission could not be read.");

  var title = text(body.title);
  var org = text(body.org);
  var place = text(body.place);
  var blurb = text(body.blurb);
  var by = text(body.by);
  var email = text(body.email);
  var date = text(body.date);
  var time = text(body.time);
  var repeat = text(body.repeat);
  var repeatUntil = text(body.repeatUntil);

  if (!title) return bad("Give the event a name.", "title");
  if (title.length > MAX.title) return bad("That title is too long.", "title");
  if (!org) return bad("Say who is hosting it.", "org");
  if (org.length > MAX.org) return bad("That organisation name is too long.", "org");
  if (!place) return bad("Say where it is.", "place");
  if (place.length > MAX.place) return bad("That location is too long.", "place");
  if (!blurb) return bad("Say what happens there.", "blurb");
  if (blurb.length > MAX.blurb) {
    return bad("Keep it under " + MAX.blurb + " characters.", "blurb");
  }

  if (!ISO_DATE.test(date)) return bad("Pick a date.", "date");
  if (todayIso && date < todayIso) return bad("That date has already passed.", "date");

  var start = Number(body.start);
  if (!isFinite(start) || start < 0 || start > 23.99) {
    return bad("Pick a start time.", "startTime");
  }
  if (!time) return bad("Pick a start and end time.", "startTime");

  if (REPEATS.indexOf(repeat) === -1) return bad("That repeat rule is not one we offer.", "repeat");
  if (repeat) {
    if (!ISO_DATE.test(repeatUntil)) return bad("Say when the series stops.", "repeatUntil");
    if (repeatUntil < date) return bad("That is before the first date.", "repeatUntil");
  }

  if (!by) return bad("We need a name to reply to.", "by");
  if (by.length > MAX.by) return bad("That name is too long.", "by");
  if (!email) return bad("We need an address to reply to.", "email");
  if (email.length > MAX.email || !CSU_EMAIL.test(email)) {
    return bad("Use your colostate.edu address.", "email");
  }

  var tags = Array.isArray(body.tags) ? body.tags : [];
  var newTags = Array.isArray(body.newTags) ? body.newTags : [];
  if (tags.length > MAX.tags || newTags.length > MAX.tags) {
    return bad("That is more tags than an event needs.", "tags");
  }
  var clean = function (list) {
    return list
      .map(text)
      .filter(Boolean)
      .filter(function (t) { return t.length <= MAX.tag; })
      .filter(function (t, i, a) { return a.indexOf(t) === i; });
  };

  return {
    ok: true,
    value: {
      title: title, org: org, place: place, blurb: blurb,
      date: date, start: start, time: time,
      repeat: repeat, repeatUntil: repeat ? repeatUntil : null,
      by: by, email: email,
      tags: clean(tags), newTags: clean(newTags)
    }
  };
}

function bad(message, field) {
  return { ok: false, message: message, field: field || null };
}

/* ------------------------------------------------------------------------
   Repeat expansion.

   Ported from `occurrences` in js/store.js and must stay identical to it: the
   review screen tells the reviewer how many events approving will create, and
   it would be a poor surprise if the server then made a different number.

   Dates are handled as y/m/d parts in UTC rather than as local instants, so a
   daylight-saving change cannot shift an occurrence by a day.
   ------------------------------------------------------------------------ */

var CAP = 60;

function toUtc(iso) {
  var p = iso.split("-");
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(ms, days) {
  return ms + days * 86400000;
}

function dowIndex(ms) {
  /* Monday-first, matching the calendar. */
  return (new Date(ms).getUTCDay() + 6) % 7;
}

function sameWeekdayNextMonth(ms) {
  var d = new Date(ms);
  var nth = Math.floor((d.getUTCDate() - 1) / 7);
  var first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  var offset = (dowIndex(ms) - dowIndex(first) + 7) % 7;
  var target = addDays(first, offset + nth * 7);
  /* A 5th Tuesday does not exist every month; fall back to the 4th. */
  return new Date(target).getUTCMonth() === new Date(first).getUTCMonth()
    ? target
    : addDays(target, -7);
}

export function occurrences(sub) {
  var dates = [sub.date];
  if (!sub.repeat || !sub.repeatUntil) return dates;

  var step = sub.repeat === "weekly" ? 7 : sub.repeat === "biweekly" ? 14 : 0;
  var cursor = toUtc(sub.date);
  var last = toUtc(sub.repeatUntil);

  for (var i = 0; i < CAP; i++) {
    cursor = step ? addDays(cursor, step) : sameWeekdayNextMonth(cursor);
    if (cursor > last) break;
    dates.push(toIso(cursor));
  }
  return dates;
}
