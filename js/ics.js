/* iCalendar export.

   The point of a calendar nobody can subscribe to is limited, so every event
   here can be handed to whatever the student actually keeps their life in.

   Times are written against a real VTIMEZONE rather than as floating local
   times or as UTC. Floating times drift when the phone crosses a time zone
   during winter break; UTC bakes in whichever offset was in force the day the
   file was generated, which silently moves any event on the far side of a DST
   change. A VTIMEZONE lets the receiving client resolve the offset itself. */
window.CalIcs = (function () {
  "use strict";

  var D = window.CalDates;

  var CRLF = "\r\n";
  var PRODID = "-//Walter Scott, Jr. College of Engineering//First-Year Calendar//EN";

  /* America/Denver under the post-2007 US rules: forward the second Sunday in
     March, back the first Sunday in November. */
  var VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:America/Denver",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0600",
    "TZNAME:MDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0700",
    "TZNAME:MST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  var TZID = "America/Denver";

  /* RFC 5545 §3.3.11: backslash, semicolon and comma are literals only when
     escaped, and a newline has to be written as its escape. */
  function escapeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  var encoder = window.TextEncoder ? new TextEncoder() : null;

  function byteLength(text) {
    if (encoder) return encoder.encode(text).length;
    return encodeURIComponent(text).replace(/%[0-9A-F]{2}/gi, "x").length;
  }

  /* Content lines are limited to 75 octets — not characters. The en dash in
     every one of these event times is three bytes in UTF-8, so folding on
     string length would overrun on exactly the lines this calendar is full of.

     Splitting walks code points rather than UTF-16 units so a fold can never
     land between the halves of a surrogate pair. */
  function fold(line) {
    if (byteLength(line) <= 75) return line;

    var out = [];
    var chunk = "";
    var size = 0;

    Array.from(line).forEach(function (ch) {
      var width = byteLength(ch);
      if (size + width > 75) {
        out.push(chunk);
        chunk = "";
        size = 1;      /* the leading space on a continuation line counts */
      }
      chunk += ch;
      size += width;
    });

    out.push(chunk);
    return out.join(CRLF + " ");
  }

  /* "2026-09-03" + 18.5 -> "20260903T183000", in the event's own time zone. */
  function stamp(iso, hours) {
    var whole = Math.floor(hours);
    var mins = Math.round((hours - whole) * 60);
    if (mins === 60) { whole += 1; mins = 0; }
    return iso.replace(/-/g, "") + "T" +
      String(Math.min(whole, 23)).padStart(2, "0") +
      String(mins).padStart(2, "0") + "00";
  }

  function utcStamp(date) {
    return date.getUTCFullYear() +
      String(date.getUTCMonth() + 1).padStart(2, "0") +
      String(date.getUTCDate()).padStart(2, "0") + "T" +
      String(date.getUTCHours()).padStart(2, "0") +
      String(date.getUTCMinutes()).padStart(2, "0") +
      String(date.getUTCSeconds()).padStart(2, "0") + "Z";
  }

  function vevent(ev, now) {
    var span = D.spanOf(ev);
    var description = ev.blurb || "";
    if (ev.org) description = ev.org + "\n\n" + description;

    var lines = [
      "BEGIN:VEVENT",
      "UID:" + ev.id + "@fye-calendar.engr.colostate.edu",
      "DTSTAMP:" + utcStamp(now),
      "DTSTART;TZID=" + TZID + ":" + stamp(ev.date, span.start),
      "DTEND;TZID=" + TZID + ":" + stamp(ev.date, span.end),
      "SUMMARY:" + escapeText(ev.title),
      "DESCRIPTION:" + escapeText(description),
      "LOCATION:" + escapeText(ev.place),
      "CATEGORIES:" + (ev.tags || []).map(escapeText).join(","),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    ];
    return lines;
  }

  function build(events) {
    var now = new Date();
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:" + PRODID,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:First-Year Engineering Calendar",
      "X-WR-TIMEZONE:" + TZID
    ].concat(VTIMEZONE);

    events.forEach(function (ev) { lines = lines.concat(vevent(ev, now)); });
    lines.push("END:VCALENDAR");

    return lines.map(fold).join(CRLF) + CRLF;
  }

  /* Keeps a filename readable and safe on every platform the download lands on. */
  function slug(text) {
    return String(text || "events")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "events";
  }

  function download(events, name) {
    var list = [].concat(events).filter(Boolean);
    if (!list.length) return false;

    var blob = new Blob([build(list)], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = slug(name) + ".ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    /* Revoked on the next frame — Safari has not finished with the URL by the
       time click() returns. */
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  return { build: build, download: download, slug: slug };
})();
