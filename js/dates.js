/* Calendar date helpers. Everything works in local time on whole days, so an
   event date is always the plain "YYYY-MM-DD" the organiser typed — never a
   UTC instant that can slide a day either way. */
window.CalDates = (function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
  var MSHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /* Weeks run Monday-first here, so day-of-week indexes are (getDay() + 6) % 7. */
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function fromIso(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function toIso(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function mondayOf(d) {
    return addDays(d, -((d.getDay() + 6) % 7));
  }

  function dowIndex(d) {
    return (d.getDay() + 6) % 7;
  }

  /* "Monday, April 27" — the long form used above the stage and in the modal. */
  function longDayLabel(iso) {
    var d = fromIso(iso);
    return DOW_LONG[dowIndex(d)] + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
  }

  /* "Thu Sep 3" — the compact form the review queue prints. */
  function shortDayLabel(iso) {
    var d = fromIso(iso);
    return DOW[dowIndex(d)] + " " + MSHORT[d.getMonth()] + " " + d.getDate();
  }

  /* ----------------------------------------------------------------------
     Clock times

     Event times are prose ("11:00 am – 2:00 pm") because that is what goes on
     a poster, but the calendar file and the sort order need numbers. `start`
     on an event is the authoritative start hour as a decimal; the end is read
     back out of the prose, which is the only place it is recorded.
     ---------------------------------------------------------------------- */

  /* "6:00 pm" / "6 pm" / "18:30" -> 18.5. Null when it is not a clock time.
     `fallbackMeridiem` covers the left half of "4:00 – 6:00 pm", which leaves
     its am/pm to be inferred from the right. */
  function parseClock(text, fallbackMeridiem) {
    var m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text || ""));
    if (!m) return null;

    var hour = Number(m[1]);
    var mins = Number(m[2] || 0);
    var meridiem = (m[3] || fallbackMeridiem || "").toLowerCase();

    if (hour > 23 || mins > 59) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return hour + mins / 60;
  }

  /* The meridiem written on the right-hand half, which the left may borrow. */
  function trailingMeridiem(text) {
    var m = /(am|pm)\s*$/i.exec(String(text || "").trim());
    return m ? m[1].toLowerCase() : null;
  }

  /* An event's span in decimal hours. `ev.start` wins for the start; the end
     comes out of the prose, and defaults to an hour later when the prose has
     no second half to read. */
  function spanOf(ev) {
    var halves = String(ev.time || "").split(/[–—-]/);
    var meridiem = trailingMeridiem(halves[halves.length - 1]);
    var start = typeof ev.start === "number"
      ? ev.start
      : parseClock(halves[0], meridiem);
    if (start === null || start === undefined) start = 12;

    var end = halves.length > 1 ? parseClock(halves[1], meridiem) : null;
    if (end === null || end <= start) end = Math.min(start + 1, 23.99);
    return { start: start, end: end };
  }

  /* 18.5 -> "6:30 pm". `withMeridiem: false` drops the am/pm, which is how the
     left half of a span is set when both halves share one. */
  function clockLabel(hours, withMeridiem) {
    var whole = Math.floor(hours);
    var mins = Math.round((hours - whole) * 60);
    if (mins === 60) { whole += 1; mins = 0; }
    var meridiem = whole >= 12 ? "pm" : "am";
    var display = whole % 12 === 0 ? 12 : whole % 12;
    return display + ":" + String(mins).padStart(2, "0") +
      (withMeridiem === false ? "" : " " + meridiem);
  }

  /* The house style for a span: "4:00 – 6:00 pm" when both halves share a
     meridiem, "11:00 am – 2:00 pm" when they do not. */
  function spanLabel(start, end) {
    var sameHalf = (start >= 12) === (end >= 12);
    return clockLabel(start, !sameHalf) + " – " + clockLabel(end, true);
  }

  return {
    MONTHS: MONTHS,
    MSHORT: MSHORT,
    DOW: DOW,
    DOW_LONG: DOW_LONG,
    fromIso: fromIso,
    toIso: toIso,
    addDays: addDays,
    mondayOf: mondayOf,
    dowIndex: dowIndex,
    longDayLabel: longDayLabel,
    shortDayLabel: shortDayLabel,
    parseClock: parseClock,
    spanOf: spanOf,
    clockLabel: clockLabel,
    spanLabel: spanLabel
  };
})();
