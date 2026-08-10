/* Calendar content and configuration.
   This is the seam where a real backend goes: swap the literals below for a
   fetch, keep the shapes, and nothing in app.js has to change. */
window.CalData = (function () {
  "use strict";

  var CONFIG = {
    /* Seconds each flyer holds on the stage before the reel advances. */
    slideSeconds: 9,
    /* "week" or "month" — which grid the page opens on. */
    defaultView: "week",
    /* The day the calendar treats as today. */
    today: window.CalDates.toIso(new Date()),

    /* Who submissions are sent to. A submission is encoded into a link and
       emailed here; the flyer rides along as an attachment on that same email,
       which is the one thing a link cannot carry.

       Set `email` to the office's real address before anyone uses this — until
       it is set the submit form says so plainly rather than composing mail to
       nobody. */
    office: {
      name: "Common First-Year office",
      email: ""
    }
  };

  /* Flyer artwork. `image` is what the calendar renders; `page` is what
     "Open the flyer page" links to — the original PDF where there is one. */
  var FLYERS = {
    ispe:   { image: "flyers/ispe.png",   page: "flyers/ispe.pdf" },
    cookie: { image: "flyers/cookie.png", page: "flyers/cookie.png" },
    aiaa:   { image: "flyers/aiaa.png",   page: "flyers/aiaa.png" },
    major:  { image: "flyers/major.png",  page: "flyers/major.pdf" },
    peru:   { image: "flyers/peru.png",   page: "flyers/peru.pdf" }
  };

  /* The event list lives in its own file, because that is the file the review
     queue regenerates and a colleague drops into the repo to publish. Loading
     it as a script rather than fetching JSON keeps the page working when it is
     opened straight off the filesystem. */
  var EVENTS = window.CalEvents || [];

  /* Tags submitters wrote themselves and the office has since approved — they
     are filterable for everyone and offered back in the submit form. */
  var CUSTOM_TAGS = ["First years welcome", "No experience needed", "Hands-on build",
                     "Design-Build-Fly", "Registration required", "Study abroad", "Career fair prep"];

  var CUSTOM_BY_EVENT = {
    swe: ["First years welcome", "Career fair prep"],
    fairprep: ["Career fair prep"],
    boeing: ["Career fair prep"],
    aiaa: ["Design-Build-Fly", "Hands-on build", "First years welcome"],
    "aero-11": ["Design-Build-Fly", "Hands-on build"],
    "aero-18": ["Design-Build-Fly", "Hands-on build"],
    "aero-08": ["Design-Build-Fly", "Hands-on build"],
    peru: ["Study abroad", "Registration required"],
    git: ["No experience needed", "Hands-on build"],
    solder: ["No experience needed", "Hands-on build", "Registration required"],
    racing: ["Hands-on build"],
    shop: ["Hands-on build", "Registration required"],
    cookie: ["First years welcome"],
    "cookie-14": ["First years welcome"],
    "cookie-21": ["First years welcome"],
    "cookie-04": ["First years welcome"],
    "cookie-11": ["First years welcome"],
    studyhall: ["First years welcome"],
    major: ["First years welcome"],
    canoe: ["Hands-on build"],
    showcase: ["First years welcome"],
    ewb: ["First years welcome"]
  };

  /* The filter bar, in the order it reads. `openToAll` means an event tagged
     "All disciplines" answers any choice in that group. */
  var GROUPS = [
    { key: "discipline", any: "Any discipline", openToAll: true, chips: ["Mechanical", "Electrical", "Civil", "Software", "Chemical"] },
    { key: "type", any: "Any event type", chips: ["Club", "Industry night", "Workshop", "Social"] },
    { key: "perks", any: "Any perks", chips: ["Free food"] },
    { key: "time", any: "Any time of day", chips: ["Morning", "Afternoon", "Evening"] },
    { key: "custom", any: "Custom tags", chips: CUSTOM_TAGS }
  ];

  var REPEAT_OPTIONS = [
    { value: "", label: "Does not repeat" },
    { value: "weekly", label: "Every week" },
    { value: "biweekly", label: "Every other week" },
    { value: "monthly", label: "Monthly, same weekday" }
  ];

  /* Submissions waiting on the First-Year office. Reached with Shift+R or #review.

     These carry the same shape the submit form produces, so approving one can
     build a real event from it: `date`/`start`/`time` rather than the prose
     `when` the reviewer reads, and a machine-readable `repeat`. */
  var PENDING = [
    { id: "p1", title: "Robotics Club: Line-Follower Sprint", org: "RamBotics", place: "Engineering E205",
      date: "2026-09-03", start: 18, time: "6:00 – 9:00 pm",
      submitted: "2 days ago", submittedAt: null,
      by: "Priya Raman", email: "praman@rams.colostate.edu",
      repeat: "", repeatUntil: null, flyer: "line-follower-sprint.pdf", flyerImage: null,
      blurb: "Build a line-following robot from a kit in one evening, then race it on the taped course. Kits, soldering irons and mentors provided; nothing to bring but yourself.",
      tags: ["Electrical", "Club", "Free food"], newTags: ["Beginner kits provided"] },
    { id: "p2", title: "Women in Computing Coffee Hour", org: "ACM-W", place: "Computer Science Atrium",
      date: "2026-09-02", start: 9.5, time: "9:30 – 10:30 am",
      submitted: "yesterday", submittedAt: null,
      by: "Dana Whitfield", email: "dwhitfield@colostate.edu",
      repeat: "biweekly", repeatUntil: "2026-12-16", flyer: null, flyerImage: null,
      blurb: "Coffee, pastries and an open table. Upper-year students and two faculty are there to answer whatever you have been meaning to ask about the major.",
      tags: ["Software", "Club", "Free food"], newTags: ["First years welcome", "Recurring drop-in"] }
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

  /* Every tag an event answers to: its own, its time of day, "Free" (nothing on
     this calendar costs anything), and any approved custom tags. */
  function allTags(ev) {
    return ev.tags.concat([timeOfDay(ev), "Free"], CUSTOM_BY_EVENT[ev.id] || []);
  }

  return {
    CONFIG: CONFIG,
    FLYERS: FLYERS,
    EVENTS: EVENTS,
    CUSTOM_TAGS: CUSTOM_TAGS,
    CUSTOM_BY_EVENT: CUSTOM_BY_EVENT,
    GROUPS: GROUPS,
    REPEAT_OPTIONS: REPEAT_OPTIONS,
    PENDING: PENDING,
    timeOfDay: timeOfDay,
    repeatLabel: repeatLabel,
    allTags: allTags
  };
})();
