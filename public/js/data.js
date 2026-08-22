/* Configuration and the fixed vocabulary of the calendar.

   The content itself — events, submissions, approved custom tags — used to live
   here and now lives in the database, reached through js/store.js. What is left
   is the part that is a decision rather than data: how the page behaves, what
   the filter bar offers, and which artwork ships with the repo. */
window.CalData = (function () {
  "use strict";

  var CONFIG = {
    /* Seconds each flyer holds on the stage before the reel advances. */
    slideSeconds: 9,
    /* "week" or "month" — which grid the page opens on. */
    defaultView: "week",
    /* The day the calendar treats as today. */
    today: window.CalDates.toIso(new Date()),

    /* The office, for the reply a reviewer sends when asking for changes. That
       reply is composed here and sent from their own mail client — nothing on
       this site sends mail, and nothing claims to. */
    office: {
      name: "Common First-Year office",
      email: ""
    }
  };

  /* Artwork committed to the repo, served as static files from public/flyers.
     `image` is what the calendar renders; `page` is where clicking the flyer on
     the stage goes — the original PDF where there is one.

     Flyers uploaded through the submit form are not in here: they live in R2
     and are served from /uploads, which `flyer()` in js/store.js resolves. */
  var FLYERS = {
    ispe:   { image: "flyers/ispe.png",   page: "flyers/ispe.pdf" },
    cookie: { image: "flyers/cookie.png", page: "flyers/cookie.png" },
    aiaa:   { image: "flyers/aiaa.png",   page: "flyers/aiaa.png" },
    major:  { image: "flyers/major.png",  page: "flyers/major.pdf" },
    peru:   { image: "flyers/peru.png",   page: "flyers/peru.pdf" }
  };

  /* The filter bar, in the order it reads. `openToAll` means an event tagged
     "All disciplines" answers any choice in that group.

     These chips are mirrored into the `tags` table as kind 'fixed', so the
     server can tell a tag someone picked off a list from one they invented.
     Change them here and re-run seed.sql, or the two will disagree about what
     counts as a new tag. The custom group is filled from the database at
     runtime and is empty here on purpose.

     A group carrying `matches` is the exception to all of that: its chips are
     not tags, it is not mirrored into the `tags` table, and it answers a filter
     by looking at the event rather than by the event carrying a word. */
  var GROUPS = [
    { key: "discipline", any: "Any discipline", openToAll: true, chips: ["Mechanical", "Electrical", "Civil", "Software", "Chemical"] },
    { key: "type", any: "Any event type", chips: ["Club", "Industry night", "Workshop", "Social"] },
    { key: "perks", any: "Any perks", chips: ["Free food"] },
    { key: "time", any: "Any time of day", chips: ["Morning", "Afternoon", "Evening"] },

    /* Whether the event stands on its own or is one date of several — the
       weekly club meeting a student wants to settle into, or the one-off
       industry night they have to catch.

       Nobody writes this on an event and nobody should have to. Approving a
       repeating submission writes one row per occurrence, so the calendar
       already knows which dates have siblings; /api/events sends that back as
       `repeats`. A tag would be the same fact written a second time by hand,
       and the two would drift the first time a reviewer trimmed a series. */
    {
      key: "repeats",
      any: "One-off and repeating",
      chips: ["Repeating", "One-off"],
      matches: function (ev, chosen) {
        return chosen === "Repeating" ? !!ev.repeats : !ev.repeats;
      }
    },

    { key: "custom", any: "Custom tags", chips: [] }
  ];

  var REPEAT_OPTIONS = [
    { value: "", label: "Does not repeat" },
    { value: "weekly", label: "Every week" },
    { value: "biweekly", label: "Every other week" },
    { value: "monthly", label: "Monthly, same weekday" }
  ];

  function timeOfDay(ev) {
    return ev.start < 12 ? "Morning" : ev.start < 17 ? "Afternoon" : "Evening";
  }

  /* "Every other week until Dec 16, 2026" — the reviewer's reading of a
     machine-readable repeat rule. */
  function repeatLabel(rule, until) {
    var match = REPEAT_OPTIONS.filter(function (o) { return o.value === (rule || ""); })[0];
    var label = match ? match.label : "Does not repeat";
    if (!rule || !until) return label;
    var d = window.CalDates.fromIso(until);
    return label + " until " + window.CalDates.MSHORT[d.getMonth()] + " " +
      d.getDate() + ", " + d.getFullYear();
  }

  return {
    CONFIG: CONFIG,
    FLYERS: FLYERS,
    GROUPS: GROUPS,
    REPEAT_OPTIONS: REPEAT_OPTIONS,
    timeOfDay: timeOfDay,
    repeatLabel: repeatLabel
  };
})();
