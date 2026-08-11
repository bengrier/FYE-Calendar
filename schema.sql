-- First-Year Engineering Calendar — D1 schema.
--
-- Apply with:
--   npx wrangler d1 execute fye-calendar --local  --file=schema.sql
--   npx wrangler d1 execute fye-calendar --remote --file=schema.sql
--
-- Dates are ISO yyyy-mm-dd strings and compared as text, which sorts correctly
-- and keeps a whole day a whole day — the same choice the client makes, and for
-- the same reason: an event must never slide a day across a time zone.
-- Timestamps are epoch milliseconds.

DROP TABLE IF EXISTS submission_attempts;
DROP TABLE IF EXISTS submission_tags;
DROP TABLE IF EXISTS event_tags;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS tags;

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,
  start           REAL NOT NULL,          -- start hour as a decimal; 17.5 = 5:30 pm
  time            TEXT NOT NULL,          -- the prose span students read
  title           TEXT NOT NULL,
  org             TEXT NOT NULL,
  place           TEXT NOT NULL,
  blurb           TEXT NOT NULL,
  flyer_key       TEXT,                   -- R2 object key, or a seeded key like "peru"
  temporary       INTEGER NOT NULL DEFAULT 0,
  from_submission TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX events_by_date ON events (date);

CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | declined
  title        TEXT NOT NULL,
  org          TEXT NOT NULL,
  place        TEXT NOT NULL,
  date         TEXT NOT NULL,
  start        REAL NOT NULL,
  time         TEXT NOT NULL,
  blurb        TEXT NOT NULL,
  repeat_rule  TEXT NOT NULL DEFAULT '',
  repeat_until TEXT,
  by_name      TEXT NOT NULL,
  by_email     TEXT NOT NULL,
  flyer_key    TEXT,
  awaiting     INTEGER NOT NULL DEFAULT 0,        -- changes requested, waiting on the submitter
  submitted_at INTEGER NOT NULL,
  decided_at   INTEGER,
  decided_by   TEXT                               -- the Access identity that decided it
);

CREATE INDEX submissions_by_status ON submissions (status, submitted_at);

-- Every tag the calendar knows about.
--
--   kind = 'fixed'   the filter bar's own chips (Mechanical, Workshop, …) and
--                    "All disciplines". They live in GROUPS in js/data.js and
--                    are mirrored here so the server can tell a tag someone
--                    picked from a list apart from one they invented.
--   kind = 'custom'  written by a submitter. Filterable for everyone once a
--                    reviewer keeps it, which is what `approved` records.
--
-- Only 'custom' rows are sent to the filter bar as custom tags; the fixed ones
-- are already in GROUPS and would appear twice.
CREATE TABLE tags (
  name     TEXT PRIMARY KEY,
  kind     TEXT NOT NULL DEFAULT 'custom',
  approved INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE event_tags (
  event_id TEXT NOT NULL,
  tag      TEXT NOT NULL,
  PRIMARY KEY (event_id, tag)
);

CREATE TABLE submission_tags (
  submission_id TEXT NOT NULL,
  tag           TEXT NOT NULL,
  is_new        INTEGER NOT NULL DEFAULT 0,   -- proposed by the submitter, not yet approved
  PRIMARY KEY (submission_id, tag)
);

-- One row per submission actually accepted, used to rate limit the one public
-- write endpoint. Rows older than the window are deleted on the way past, so
-- this stays a handful of rows rather than a log — it is a counter that happens
-- to be made of rows, and nothing reads it but the limiter.
--
-- This lives in the database because a Cloudflare rate limiting rule is a zone
-- feature and this deployment has no zone. See functions/api/submissions.js.
CREATE TABLE submission_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX submission_attempts_by_ip ON submission_attempts (ip, at);
