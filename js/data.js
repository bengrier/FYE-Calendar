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

    /* Where submissions actually go. The form on this site collects and checks
       everything, then hands off to the office's Microsoft Form with the
       answers filled in, so responses land in SharePoint without this page
       needing a server or a secret.

       `prefillUrl` is the "Get pre-filled URL" link from that Form, taken with
       each question answered with its sentinel word — README.md, "Connecting
       the Microsoft Form", lists the ten questions and their sentinels. Until
       it is set the submit form says so plainly instead of pretending to send.

       `flyerNote` is what the form tells submitters about artwork; a file
       cannot be pre-filled, so the flyer is attached on the Form itself. */
    submitForm: {
      prefillUrl: "",
      flyerNote: "You will attach the flyer on the next step, on the CSU form."
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

  /* `start` is the start hour as a decimal (17.5 = 5:30 pm) and is used only
     for ordering within a day and for the morning/afternoon/evening tag. */
  var EVENTS = [
    { id: "shop", date: "2026-08-03", start: 16, time: "4:00 – 6:00 pm", title: "Machine Shop Safety Certification", org: "Engineering Manufacturing Lab", place: "Manufacturing Lab 12", flyer: null,
      blurb: "The certification you need before you touch a mill or lathe. One session, one sign-off, good for the rest of your degree.", tags: ["All disciplines", "Workshop"] },
    { id: "boeing", date: "2026-08-06", start: 17.5, time: "5:30 – 7:00 pm", title: "Boeing Information Session", org: "Career Services", place: "Scott 229", flyer: null,
      blurb: "Recruiters from Boeing's Colorado sites on internships, the application timeline, and what a first-year résumé should look like.", tags: ["All disciplines", "Industry night", "Free food"] },
    { id: "aero-11", date: "2026-08-11", start: 14, time: "2:00 – 4:00 pm", title: "Design-Build-Fly Weekly Build", org: "AIAA · Ram Aero", place: "Magellan Room", flyer: "aiaa",
      blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.", tags: ["Mechanical", "Club"] },
    { id: "cookie-14", date: "2026-08-14", start: 11, time: "11:00 am – 2:00 pm", title: "Free Cookie Friday", org: "Engineering Community", place: "AV Kitchen", flyer: "cookie",
      blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.", tags: ["All disciplines", "Social", "Free food"] },
    { id: "aero-18", date: "2026-08-18", start: 14, time: "2:00 – 4:00 pm", title: "Design-Build-Fly Weekly Build", org: "AIAA · Ram Aero", place: "Magellan Room", flyer: "aiaa",
      blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.", tags: ["Mechanical", "Club"] },
    { id: "fairprep", date: "2026-08-19", start: 15, time: "3:00 – 5:00 pm", title: "Career Fair Prep Drop-In", org: "Career Services", place: "Lory Student Center 224", flyer: null,
      blurb: "Practice the ninety-second introduction, get a headshot taken, and leave with a printed résumé.", tags: ["All disciplines", "Workshop"] },
    { id: "cookie-21", date: "2026-08-21", start: 11, time: "11:00 am – 2:00 pm", title: "Free Cookie Friday", org: "Engineering Community", place: "AV Kitchen", flyer: "cookie",
      blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.", tags: ["All disciplines", "Social", "Free food"] },

    { id: "swe", date: "2026-08-24", start: 16, time: "4:00 – 5:30 pm", title: "Résumé Lab for First Years", org: "Society of Women Engineers", place: "Engineering B203", flyer: null,
      blurb: "Bring a draft and leave with a reviewed one. Upper-year mentors and two co-op recruiters read résumés line by line; laptops available.", tags: ["All disciplines", "Workshop"] },
    { id: "aiaa", date: "2026-08-25", start: 14, time: "2:00 – 4:00 pm", title: "Design-Build-Fly Weekly Build", org: "AIAA · Ram Aero", place: "Magellan Room", flyer: "aiaa",
      blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.", tags: ["Mechanical", "Club"] },
    { id: "peru", date: "2026-08-26", start: 12, time: "12:00 – 1:00 pm", title: "Grand Challenges in Peru: Info Session", org: "International Programs", place: "Scott 108", flyer: "peru",
      blurb: "A winter-break community service project in Lima and Lobitos investigating sustainable engineering on the coast. Fall application deadline September 15.", tags: ["Civil", "Workshop"] },
    { id: "git", date: "2026-08-26", start: 18, time: "6:00 – 7:30 pm", title: "Git Night: Stop Emailing Yourself Zips", org: "Computer Science Club", place: "Computer Science 130", flyer: null,
      blurb: "Branches, merges and the three commands that get you out of trouble. Pizza at 6, laptops required.", tags: ["Software", "Workshop", "Free food"] },
    { id: "ispe", date: "2026-08-27", start: 17, time: "5:00 – 6:00 pm", title: "Corden Pharma Industry Night", org: "ISPE Student Chapter", place: "Scott 229", flyer: "ispe",
      blurb: "Brooklyn Smith, project engineer at Corden Pharma and former Pfizer plant engineer, on industry experience and the ins and outs of professional engineering.", tags: ["Chemical", "Industry night", "Free food"] },
    { id: "solder", date: "2026-08-27", start: 17.5, time: "5:30 – 7:00 pm", title: "Soldering 101", org: "IEEE Student Branch", place: "Engineering E101 Lab", flyer: null,
      blurb: "Twenty irons, twenty seats. Build a blinking badge and keep it. Sign up on the door sheet — first years get priority.", tags: ["Electrical", "Workshop"] },
    { id: "cookie", date: "2026-08-28", start: 11, time: "11:00 am – 2:00 pm", title: "Free Cookie Friday", org: "Engineering Community", place: "AV Kitchen", flyer: "cookie",
      blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.", tags: ["All disciplines", "Social", "Free food"] },
    { id: "ewb", date: "2026-08-28", start: 15, time: "3:00 – 4:00 pm", title: "Engineers Without Borders: General Meeting", org: "EWB–CSU", place: "Scott 214", flyer: null,
      blurb: "Project updates from the Rwanda water team, then a vote on next year's travel cohort. Open to anyone considering joining.", tags: ["Civil", "Club"] },
    { id: "racing", date: "2026-08-29", start: 10, time: "10:00 am – 2:00 pm", title: "Ram Racing Open Garage", org: "Formula SAE", place: "Powerhouse Bay 3", flyer: null,
      blurb: "The car is on the stands before competition. Come look at it, ask what everything does, and sign up for a shift.", tags: ["Mechanical", "Club"] },
    { id: "studyhall", date: "2026-08-30", start: 18, time: "6:00 – 9:00 pm", title: "First-Year Study Hall", org: "Common First Year", place: "Morgan Library, 2nd floor", flyer: null,
      blurb: "Calculus and statics tutors on the floor, coffee at the door. No sign-up; drop in for ten minutes or three hours.", tags: ["All disciplines", "Social", "Free food"] },

    { id: "major", date: "2026-08-31", start: 17, time: "5:00 – 7:00 pm", title: "Major Declaration Ceremony", org: "Engineering Common First Year", place: "LSC Theatre", flyer: "major",
      blurb: "Celebrate everything you built, coded, sailed and survived during your first year. Free food and drinks, lawn games, and custom pins for your declared major.", tags: ["All disciplines", "Social", "Free food"] },
    { id: "canoe", date: "2026-09-02", start: 12, time: "12:00 – 1:00 pm", title: "Concrete Canoe Send-Off", org: "ASCE Student Chapter", place: "Engineering Quad", flyer: null,
      blurb: "The canoe floats — come see it before it goes to regionals, and sign up to help with the trailer load.", tags: ["Civil", "Club", "Free food"] },
    { id: "cookie-04", date: "2026-09-04", start: 11, time: "11:00 am – 2:00 pm", title: "Free Cookie Friday", org: "Engineering Community", place: "AV Kitchen", flyer: "cookie",
      blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.", tags: ["All disciplines", "Social", "Free food"] },
    { id: "aero-08", date: "2026-09-08", start: 14, time: "2:00 – 4:00 pm", title: "Design-Build-Fly Weekly Build", org: "AIAA · Ram Aero", place: "Magellan Room", flyer: "aiaa",
      blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.", tags: ["Mechanical", "Club"] },
    { id: "showcase", date: "2026-09-10", start: 13, time: "1:00 – 4:00 pm", title: "Summer Research Showcase", org: "Undergraduate Research Office", place: "Engineering Atrium", flyer: null,
      blurb: "Posters from students who spent last summer in a lab, plus the faculty who took them on. Ask how they got the position.", tags: ["All disciplines", "Social"] },
    { id: "cookie-11", date: "2026-09-11", start: 11, time: "11:00 am – 2:00 pm", title: "Last Cookie Friday of the Year", org: "Engineering Community", place: "AV Kitchen", flyer: "cookie",
      blurb: "Same cookies, more of them. Bring anyone you met this year.", tags: ["All disciplines", "Social", "Free food"] }
  ];

  /* Every event above is placeholder content, written to build and demonstrate
     the calendar against — none of it is a real event and the dates, rooms and
     prose are invented. Flagging the whole array in one pass rather than adding
     a field to each literal means real events can simply be added without the
     flag, and the page will say so precisely: while any of these are still
     here a notice sits above the grid, and it disappears on its own once the
     last one goes. To strip them, empty EVENTS and delete this loop. */
  EVENTS.forEach(function (ev) { ev.temporary = true; });

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
