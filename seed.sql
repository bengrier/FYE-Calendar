-- First-Year Engineering Calendar — seed data.
--
-- Generated from the content the static site shipped with, so a fresh database
-- looks exactly like the old calendar on day one. Every event here is
-- placeholder content and carries temporary = 1; deleting those rows is how the
-- sample content goes away.
--
-- Apply after schema.sql:
--   npx wrangler d1 execute fye-calendar --local  --file=seed.sql
--   npx wrangler d1 execute fye-calendar --remote --file=seed.sql

DELETE FROM submission_tags;
DELETE FROM event_tags;
DELETE FROM submissions;
DELETE FROM events;
DELETE FROM tags;


-- The filter bar's fixed chips (mirrors GROUPS in js/data.js).
--
-- Not every chip in GROUPS belongs here. "Repeating" and "One-off" are a
-- question the calendar answers by counting the rows a series was published
-- as, not words anybody writes on an event -- their group carries `matches`
-- in js/data.js and stops there. A row for one of them would make the server
-- treat it as a tag a submitter could pick.
INSERT INTO tags (name, kind, approved) VALUES ('All disciplines', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Mechanical', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Electrical', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Civil', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Software', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Chemical', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Club', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Industry night', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Workshop', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Social', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Free food', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Morning', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Afternoon', 'fixed', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Evening', 'fixed', 1);

-- Approved custom tags, filterable for everyone.
INSERT INTO tags (name, kind, approved) VALUES ('No experience needed', 'custom', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Hands-on build', 'custom', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Design-Build-Fly', 'custom', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Registration required', 'custom', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Study abroad', 'custom', 1);
INSERT INTO tags (name, kind, approved) VALUES ('Career fair prep', 'custom', 1);

-- Placeholder events.
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('shop', '2026-08-03', 16, '4:00 – 6:00 pm', 'Machine Shop Safety Certification', 'Engineering Manufacturing Lab', 'Manufacturing Lab 12', 'The certification you need before you touch a mill or lathe. One session, one sign-off, good for the rest of your degree.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('shop', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('shop', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('shop', 'Hands-on build');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('shop', 'Registration required');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('boeing', '2026-08-06', 17.5, '5:30 – 7:00 pm', 'Boeing Information Session', 'Career Services', 'Scott 229', 'Recruiters from Boeing''s Colorado sites on internships, the application timeline, and what a first-year résumé should look like.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('boeing', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('boeing', 'Industry night');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('boeing', 'Free food');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('boeing', 'Career fair prep');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('aero-11', '2026-08-11', 14, '2:00 – 4:00 pm', 'Design-Build-Fly Weekly Build', 'AIAA · Ram Aero', 'Magellan Room', 'Ram Aero''s open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.', 'aiaa', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-11', 'Mechanical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-11', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-11', 'Design-Build-Fly');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-11', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('cookie-14', '2026-08-14', 11, '11:00 am – 2:00 pm', 'Free Cookie Friday', 'Engineering Community', 'AV Kitchen', 'Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.', 'cookie', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-14', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-14', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-14', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('aero-18', '2026-08-18', 14, '2:00 – 4:00 pm', 'Design-Build-Fly Weekly Build', 'AIAA · Ram Aero', 'Magellan Room', 'Ram Aero''s open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.', 'aiaa', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-18', 'Mechanical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-18', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-18', 'Design-Build-Fly');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-18', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('fairprep', '2026-08-19', 15, '3:00 – 5:00 pm', 'Career Fair Prep Drop-In', 'Career Services', 'Lory Student Center 224', 'Practice the ninety-second introduction, get a headshot taken, and leave with a printed résumé.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('fairprep', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('fairprep', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('fairprep', 'Career fair prep');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('cookie-21', '2026-08-21', 11, '11:00 am – 2:00 pm', 'Free Cookie Friday', 'Engineering Community', 'AV Kitchen', 'Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.', 'cookie', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-21', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-21', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-21', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('swe', '2026-08-24', 16, '4:00 – 5:30 pm', 'Résumé Lab for First Years', 'Society of Women Engineers', 'Engineering B203', 'Bring a draft and leave with a reviewed one. Upper-year mentors and two co-op recruiters read résumés line by line; laptops available.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('swe', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('swe', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('swe', 'Career fair prep');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('aiaa', '2026-08-25', 14, '2:00 – 4:00 pm', 'Design-Build-Fly Weekly Build', 'AIAA · Ram Aero', 'Magellan Room', 'Ram Aero''s open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.', 'aiaa', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aiaa', 'Mechanical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aiaa', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aiaa', 'Design-Build-Fly');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aiaa', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('peru', '2026-08-26', 12, '12:00 – 1:00 pm', 'Grand Challenges in Peru: Info Session', 'International Programs', 'Scott 108', 'A winter-break community service project in Lima and Lobitos investigating sustainable engineering on the coast. Fall application deadline September 15.', 'peru', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('peru', 'Civil');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('peru', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('peru', 'Study abroad');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('peru', 'Registration required');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('git', '2026-08-26', 18, '6:00 – 7:30 pm', 'Git Night: Stop Emailing Yourself Zips', 'Computer Science Club', 'Computer Science 130', 'Branches, merges and the three commands that get you out of trouble. Pizza at 6, laptops required.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('git', 'Software');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('git', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('git', 'Free food');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('git', 'No experience needed');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('git', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('ispe', '2026-08-27', 17, '5:00 – 6:00 pm', 'Corden Pharma Industry Night', 'ISPE Student Chapter', 'Scott 229', 'Brooklyn Smith, project engineer at Corden Pharma and former Pfizer plant engineer, on industry experience and the ins and outs of professional engineering.', 'ispe', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('ispe', 'Chemical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('ispe', 'Industry night');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('ispe', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('solder', '2026-08-27', 17.5, '5:30 – 7:00 pm', 'Soldering 101', 'IEEE Student Branch', 'Engineering E101 Lab', 'Twenty irons, twenty seats. Build a blinking badge and keep it. Sign up on the door sheet — first years get priority.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('solder', 'Electrical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('solder', 'Workshop');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('solder', 'No experience needed');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('solder', 'Hands-on build');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('solder', 'Registration required');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('cookie', '2026-08-28', 11, '11:00 am – 2:00 pm', 'Free Cookie Friday', 'Engineering Community', 'AV Kitchen', 'Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.', 'cookie', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('ewb', '2026-08-28', 15, '3:00 – 4:00 pm', 'Engineers Without Borders: General Meeting', 'EWB–CSU', 'Scott 214', 'Project updates from the Rwanda water team, then a vote on next year''s travel cohort. Open to anyone considering joining.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('ewb', 'Civil');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('ewb', 'Club');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('racing', '2026-08-29', 10, '10:00 am – 2:00 pm', 'Ram Racing Open Garage', 'Formula SAE', 'Powerhouse Bay 3', 'The car is on the stands before competition. Come look at it, ask what everything does, and sign up for a shift.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('racing', 'Mechanical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('racing', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('racing', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('studyhall', '2026-08-30', 18, '6:00 – 9:00 pm', 'First-Year Study Hall', 'Common First Year', 'Morgan Library, 2nd floor', 'Calculus and statics tutors on the floor, coffee at the door. No sign-up; drop in for ten minutes or three hours.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('studyhall', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('studyhall', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('studyhall', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('major', '2026-08-31', 17, '5:00 – 7:00 pm', 'Major Declaration Ceremony', 'Engineering Common First Year', 'LSC Theatre', 'Celebrate everything you built, coded, sailed and survived during your first year. Free food and drinks, lawn games, and custom pins for your declared major.', 'major', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('major', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('major', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('major', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('canoe', '2026-09-02', 12, '12:00 – 1:00 pm', 'Concrete Canoe Send-Off', 'ASCE Student Chapter', 'Engineering Quad', 'The canoe floats — come see it before it goes to regionals, and sign up to help with the trailer load.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('canoe', 'Civil');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('canoe', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('canoe', 'Free food');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('canoe', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('cookie-04', '2026-09-04', 11, '11:00 am – 2:00 pm', 'Free Cookie Friday', 'Engineering Community', 'AV Kitchen', 'Cookies, and the people who show up for cookies. The easiest way to meet a club without committing to one.', 'cookie', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-04', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-04', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-04', 'Free food');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('aero-08', '2026-09-08', 14, '2:00 – 4:00 pm', 'Design-Build-Fly Weekly Build', 'AIAA · Ram Aero', 'Magellan Room', 'Ram Aero''s open build session for the AIAA Design-Build-Fly competition aircraft. First years welcome with no experience — you will be handed a task.', 'aiaa', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-08', 'Mechanical');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-08', 'Club');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-08', 'Design-Build-Fly');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('aero-08', 'Hands-on build');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('showcase', '2026-09-10', 13, '1:00 – 4:00 pm', 'Summer Research Showcase', 'Undergraduate Research Office', 'Engineering Atrium', 'Posters from students who spent last summer in a lab, plus the faculty who took them on. Ask how they got the position.', NULL, 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('showcase', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('showcase', 'Social');
INSERT INTO events (id, date, start, time, title, org, place, blurb, flyer_key, temporary, from_submission, created_at)
  VALUES ('cookie-11', '2026-09-11', 11, '11:00 am – 2:00 pm', 'Last Cookie Friday of the Year', 'Engineering Community', 'AV Kitchen', 'Same cookies, more of them. Bring anyone you met this year.', 'cookie', 1, NULL, 1786396491313);
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-11', 'All disciplines');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-11', 'Social');
INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES ('cookie-11', 'Free food');

-- Sample submissions, so the review queue has something in it.
INSERT INTO submissions (id, status, title, org, place, date, start, time, blurb, repeat_rule, repeat_until, by_name, by_email, flyer_key, awaiting, submitted_at)
  VALUES ('p1', 'pending', 'Robotics Club: Line-Follower Sprint', 'RamBotics', 'Engineering E205', '2026-09-03', 18, '6:00 – 9:00 pm', 'Build a line-following robot from a kit in one evening, then race it on the taped course. Kits, soldering irons and mentors provided; nothing to bring but yourself.', '', NULL, 'Priya Raman', 'praman@rams.colostate.edu', NULL, 0, 1786223691313);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p1', 'Electrical', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p1', 'Club', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p1', 'Free food', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p1', 'Beginner kits provided', 1);
INSERT INTO submissions (id, status, title, org, place, date, start, time, blurb, repeat_rule, repeat_until, by_name, by_email, flyer_key, awaiting, submitted_at)
  VALUES ('p2', 'pending', 'Women in Computing Coffee Hour', 'ACM-W', 'Computer Science Atrium', '2026-09-02', 9.5, '9:30 – 10:30 am', 'Coffee, pastries and an open table. Upper-year students and two faculty are there to answer whatever you have been meaning to ask about the major.', 'biweekly', '2026-12-16', 'Dana Whitfield', 'dwhitfield@colostate.edu', NULL, 0, 1786310091313);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p2', 'Software', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p2', 'Club', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p2', 'Free food', 0);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p2', 'First years welcome', 1);
INSERT OR IGNORE INTO submission_tags (submission_id, tag, is_new) VALUES ('p2', 'Recurring drop-in', 1);
