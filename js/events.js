/* Every event on the calendar.

   This file holds nothing but the list, and the review queue regenerates it
   whole: approve a submission, press "Download events.js", and drop the result
   in here. That is the entire publishing step — there is no other file to
   touch and no syntax to get right by hand.

   `temporary: true` marks placeholder content written to build against. Those
   entries carry a Sample label on the calendar and a line above the grid says
   so; delete them and the notice removes itself. Real events do not carry the
   flag.

   `start` is the start hour as a decimal (17.5 = 5:30 pm) and is used only for
   ordering within a day and for the morning/afternoon/evening tag. `flyer` is
   a key into FLYERS in data.js, or null. */
window.CalEvents = [
  {
    id: "shop",
    date: "2026-08-03",
    start: 16,
    time: "4:00 – 6:00 pm",
    title: "Machine Shop Safety Certification",
    org: "Engineering Manufacturing Lab",
    place: "Manufacturing Lab 12",
    flyer: null,
    blurb: "The certification you need before you touch a mill or lathe. One session, one sign-off, good for the rest of your degree.",
    tags: ["All disciplines", "Workshop"],
    temporary: true
  },
  {
    id: "boeing",
    date: "2026-08-06",
    start: 17.5,
    time: "5:30 – 7:00 pm",
    title: "Boeing Information Session",
    org: "Career Services",
    place: "Scott 229",
    flyer: null,
    blurb: "Recruiters from Boeing's Colorado sites on internships, the application timeline, and what a first-year résumé should look like.",
    tags: ["All disciplines", "Industry night", "Free food"],
    temporary: true
  },
  {
    id: "aero-11",
    date: "2026-08-11",
    start: 14,
    time: "2:00 – 4:00 pm",
    title: "Design-Build-Fly Weekly Build",
    org: "AIAA · Ram Aero",
    place: "Magellan Room",
    flyer: "aiaa",
    blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.",
    tags: ["Mechanical", "Club"],
    temporary: true
  },
  {
    id: "cookie-14",
    date: "2026-08-14",
    start: 11,
    time: "11:00 am – 2:00 pm",
    title: "Free Cookie Friday",
    org: "Engineering Community",
    place: "AV Kitchen",
    flyer: "cookie",
    blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "aero-18",
    date: "2026-08-18",
    start: 14,
    time: "2:00 – 4:00 pm",
    title: "Design-Build-Fly Weekly Build",
    org: "AIAA · Ram Aero",
    place: "Magellan Room",
    flyer: "aiaa",
    blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.",
    tags: ["Mechanical", "Club"],
    temporary: true
  },
  {
    id: "fairprep",
    date: "2026-08-19",
    start: 15,
    time: "3:00 – 5:00 pm",
    title: "Career Fair Prep Drop-In",
    org: "Career Services",
    place: "Lory Student Center 224",
    flyer: null,
    blurb: "Practice the ninety-second introduction, get a headshot taken, and leave with a printed résumé.",
    tags: ["All disciplines", "Workshop"],
    temporary: true
  },
  {
    id: "cookie-21",
    date: "2026-08-21",
    start: 11,
    time: "11:00 am – 2:00 pm",
    title: "Free Cookie Friday",
    org: "Engineering Community",
    place: "AV Kitchen",
    flyer: "cookie",
    blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "swe",
    date: "2026-08-24",
    start: 16,
    time: "4:00 – 5:30 pm",
    title: "Résumé Lab for First Years",
    org: "Society of Women Engineers",
    place: "Engineering B203",
    flyer: null,
    blurb: "Bring a draft and leave with a reviewed one. Upper-year mentors and two co-op recruiters read résumés line by line; laptops available.",
    tags: ["All disciplines", "Workshop"],
    temporary: true
  },
  {
    id: "aiaa",
    date: "2026-08-25",
    start: 14,
    time: "2:00 – 4:00 pm",
    title: "Design-Build-Fly Weekly Build",
    org: "AIAA · Ram Aero",
    place: "Magellan Room",
    flyer: "aiaa",
    blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.",
    tags: ["Mechanical", "Club"],
    temporary: true
  },
  {
    id: "peru",
    date: "2026-08-26",
    start: 12,
    time: "12:00 – 1:00 pm",
    title: "Grand Challenges in Peru: Info Session",
    org: "International Programs",
    place: "Scott 108",
    flyer: "peru",
    blurb: "A winter-break community service project in Lima and Lobitos investigating sustainable engineering on the coast. Fall application deadline September 15.",
    tags: ["Civil", "Workshop"],
    temporary: true
  },
  {
    id: "git",
    date: "2026-08-26",
    start: 18,
    time: "6:00 – 7:30 pm",
    title: "Git Night: Stop Emailing Yourself Zips",
    org: "Computer Science Club",
    place: "Computer Science 130",
    flyer: null,
    blurb: "Branches, merges and the three commands that get you out of trouble. Pizza at 6, laptops required.",
    tags: ["Software", "Workshop", "Free food"],
    temporary: true
  },
  {
    id: "ispe",
    date: "2026-08-27",
    start: 17,
    time: "5:00 – 6:00 pm",
    title: "Corden Pharma Industry Night",
    org: "ISPE Student Chapter",
    place: "Scott 229",
    flyer: "ispe",
    blurb: "Brooklyn Smith, project engineer at Corden Pharma and former Pfizer plant engineer, on industry experience and the ins and outs of professional engineering.",
    tags: ["Chemical", "Industry night", "Free food"],
    temporary: true
  },
  {
    id: "solder",
    date: "2026-08-27",
    start: 17.5,
    time: "5:30 – 7:00 pm",
    title: "Soldering 101",
    org: "IEEE Student Branch",
    place: "Engineering E101 Lab",
    flyer: null,
    blurb: "Twenty irons, twenty seats. Build a blinking badge and keep it. Sign up on the door sheet — first years get priority.",
    tags: ["Electrical", "Workshop"],
    temporary: true
  },
  {
    id: "cookie",
    date: "2026-08-28",
    start: 11,
    time: "11:00 am – 2:00 pm",
    title: "Free Cookie Friday",
    org: "Engineering Community",
    place: "AV Kitchen",
    flyer: "cookie",
    blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "ewb",
    date: "2026-08-28",
    start: 15,
    time: "3:00 – 4:00 pm",
    title: "Engineers Without Borders: General Meeting",
    org: "EWB–CSU",
    place: "Scott 214",
    flyer: null,
    blurb: "Project updates from the Rwanda water team, then a vote on next year's travel cohort. Open to anyone considering joining.",
    tags: ["Civil", "Club"],
    temporary: true
  },
  {
    id: "racing",
    date: "2026-08-29",
    start: 10,
    time: "10:00 am – 2:00 pm",
    title: "Ram Racing Open Garage",
    org: "Formula SAE",
    place: "Powerhouse Bay 3",
    flyer: null,
    blurb: "The car is on the stands before competition. Come look at it, ask what everything does, and sign up for a shift.",
    tags: ["Mechanical", "Club"],
    temporary: true
  },
  {
    id: "studyhall",
    date: "2026-08-30",
    start: 18,
    time: "6:00 – 9:00 pm",
    title: "First-Year Study Hall",
    org: "Common First Year",
    place: "Morgan Library, 2nd floor",
    flyer: null,
    blurb: "Calculus and statics tutors on the floor, coffee at the door. No sign-up; drop in for ten minutes or three hours.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "major",
    date: "2026-08-31",
    start: 17,
    time: "5:00 – 7:00 pm",
    title: "Major Declaration Ceremony",
    org: "Engineering Common First Year",
    place: "LSC Theatre",
    flyer: "major",
    blurb: "Celebrate everything you built, coded, sailed and survived during your first year. Free food and drinks, lawn games, and custom pins for your declared major.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "canoe",
    date: "2026-09-02",
    start: 12,
    time: "12:00 – 1:00 pm",
    title: "Concrete Canoe Send-Off",
    org: "ASCE Student Chapter",
    place: "Engineering Quad",
    flyer: null,
    blurb: "The canoe floats — come see it before it goes to regionals, and sign up to help with the trailer load.",
    tags: ["Civil", "Club", "Free food"],
    temporary: true
  },
  {
    id: "cookie-04",
    date: "2026-09-04",
    start: 11,
    time: "11:00 am – 2:00 pm",
    title: "Free Cookie Friday",
    org: "Engineering Community",
    place: "AV Kitchen",
    flyer: "cookie",
    blurb: "Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  },
  {
    id: "aero-08",
    date: "2026-09-08",
    start: 14,
    time: "2:00 – 4:00 pm",
    title: "Design-Build-Fly Weekly Build",
    org: "AIAA · Ram Aero",
    place: "Magellan Room",
    flyer: "aiaa",
    blurb: "Ram Aero's open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.",
    tags: ["Mechanical", "Club"],
    temporary: true
  },
  {
    id: "showcase",
    date: "2026-09-10",
    start: 13,
    time: "1:00 – 4:00 pm",
    title: "Summer Research Showcase",
    org: "Undergraduate Research Office",
    place: "Engineering Atrium",
    flyer: null,
    blurb: "Posters from students who spent last summer in a lab, plus the faculty who took them on. Ask how they got the position.",
    tags: ["All disciplines", "Social"],
    temporary: true
  },
  {
    id: "cookie-11",
    date: "2026-09-11",
    start: 11,
    time: "11:00 am – 2:00 pm",
    title: "Last Cookie Friday of the Year",
    org: "Engineering Community",
    place: "AV Kitchen",
    flyer: "cookie",
    blurb: "Same cookies, more of them. Bring anyone you met this year.",
    tags: ["All disciplines", "Social", "Free food"],
    temporary: true
  }
];
