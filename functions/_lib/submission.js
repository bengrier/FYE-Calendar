/* Validating a submission, and expanding its repeat rule.

   Both of these also exist on the client — the checks in `validateDraft` in
   js/app.js, the expansion in `occurrences` in js/store.js. That duplication is
   deliberate and not a smell: the client copy exists to tell someone what is
   wrong while they type, and it runs in a browser the submitter controls, so it
   proves nothing. This copy is the one that decides.

   The two must agree on the *rules*, or the form will accept something the
   server rejects. If you change one, change the other.

   A submission is validated in two halves, and the split is not tidiness. The
   inner half — `validateEventFields` — is the part of a submission that becomes
   an event and stays editable for as long as that event is on the calendar: a
   reviewer rewriting a title in the "On the calendar" tab is answering the same
   question the submitter answered, months later, and the two must not be
   allowed to disagree about what a title is allowed to be. The outer half is
   everything that is only ever true of a queued submission — the dates it
   expands to, and who to reply to about it — and nothing edits those after the
   fact. See functions/api/admin/edit.js. */

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

/* The half of a submission that becomes an event, and goes on being editable
   once it is one. Returns { ok: true, value } or { ok: false, message, field }.

   `tags` is the finished list either way: what the submitter picked plus what
   they invented on the way in, and whatever the reviewer left on the row on the
   way past. Which of those the calendar will let anyone filter by is decided
   elsewhere — by approve.js on the way in, and by the `tags` catalogue after —
   because that is a question about the word, not about this event. */
export function validateEventFields(body) {
  if (!body) return bad("That could not be read.");

  var title = text(body.title);
  var org = text(body.org);
  var place = text(body.place);
  var blurb = text(body.blurb);
  var time = text(body.time);

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

  var start = Number(body.start);
  if (!isFinite(start) || start < 0 || start > 23.99) {
    return bad("Pick a start time.", "startTime");
  }
  if (!time) return bad("Pick a start and end time.", "startTime");

  var tags = Array.isArray(body.tags) ? body.tags : [];
  if (tags.length > MAX.tags) return bad("That is more tags than an event needs.", "tags");

  return {
    ok: true,
    value: {
      title: title, org: org, place: place, blurb: blurb,
      start: start, time: time,
      tags: cleanTags(tags)
    }
  };
}

/* Returns { ok: true, value } or { ok: false, message, field }. */
export function validateSubmission(body, todayIso) {
  var core = validateEventFields(body);
  if (!core.ok) return core;
  var event = core.value;

  var by = text(body.by);
  var email = text(body.email);
  var date = text(body.date);
  var repeat = text(body.repeat);
  var repeatUntil = text(body.repeatUntil);

  if (!ISO_DATE.test(date)) return bad("Pick a date.", "date");
  if (todayIso && date < todayIso) return bad("That date has already passed.", "date");

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

  var newTags = Array.isArray(body.newTags) ? body.newTags : [];
  if (newTags.length > MAX.tags) {
    return bad("That is more tags than an event needs.", "tags");
  }

  return {
    ok: true,
    value: {
      title: event.title, org: event.org, place: event.place, blurb: event.blurb,
      date: date, start: event.start, time: event.time,
      repeat: repeat, repeatUntil: repeat ? repeatUntil : null,
      by: by, email: email,
      tags: event.tags, newTags: cleanTags(newTags)
    }
  };
}

/* Trimmed, emptied of blanks, capped in length and deduplicated — in that
   order, because "  Robotics " and "Robotics" are one tag and the calendar
   should not carry both. */
export function cleanTags(list) {
  return list
    .map(text)
    .filter(Boolean)
    .filter(function (t) { return t.length <= MAX.tag; })
    .filter(function (t, i, a) { return a.indexOf(t) === i; });
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
