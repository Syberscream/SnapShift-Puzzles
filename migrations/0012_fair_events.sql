-- Fair events: every event sets its difficulty and mode, everyone gets the
-- same shuffle per puzzle, helpers are off, and only event games count.
ALTER TABLE events ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE events ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic';
-- Points for 1st, 2nd and 3rd on the leaderboard, paid once the event ends.
ALTER TABLE events ADD COLUMN prizes TEXT NOT NULL DEFAULT '[500,300,150]';
ALTER TABLE events ADD COLUMN prizes_paid_at INTEGER;
-- Shown as "Coming soon" on the home page this many days before it starts.
ALTER TABLE events ADD COLUMN teaser_days INTEGER NOT NULL DEFAULT 3;

ALTER TABLE plays ADD COLUMN event_id TEXT;
CREATE INDEX plays_event ON plays(user_id, event_id, puzzle_id);

CREATE TABLE event_prizes (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place      INTEGER NOT NULL,
  points     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
