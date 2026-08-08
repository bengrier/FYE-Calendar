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
    longDayLabel: longDayLabel
  };
})();
