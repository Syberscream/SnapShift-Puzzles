-- Streak reminders, challenges, collections, events and achievements.

-- Streak reminder email (opt-in) and one-click unsubscribe.
ALTER TABLE users ADD COLUMN remind_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reminded_day TEXT;
ALTER TABLE users ADD COLUMN unsub_token TEXT;

-- Challenge a Friend: a finished game's exact board, shared by link.
CREATE TABLE challenges (
  id          TEXT PRIMARY KEY,
  puzzle_id   INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_id     TEXT NOT NULL,
  seed        INTEGER NOT NULL,
  difficulty  TEXT NOT NULL,
  mode        TEXT NOT NULL,
  engine      INTEGER NOT NULL,
  elapsed_ms  INTEGER NOT NULL,
  moves       INTEGER NOT NULL,
  medal       TEXT,
  score_pct   INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX challenges_play ON challenges(play_id);
ALTER TABLE plays ADD COLUMN challenge_id TEXT;
CREATE INDEX plays_challenge ON plays(user_id, challenge_id);
CREATE TABLE challenge_results (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_id      TEXT NOT NULL,
  elapsed_ms   INTEGER NOT NULL,
  moves        INTEGER NOT NULL,
  medal        TEXT,
  score_pct    INTEGER,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

-- Category collections: bonus paid once per category.
CREATE TABLE collection_rewards (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  points      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, category_id)
);

-- Themed events: a set of puzzles with dates and their own leaderboard.
CREATE TABLE events (
  id          TEXT PRIMARY KEY,               -- slug
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  starts      TEXT NOT NULL,                  -- YYYY-MM-DD (site timezone), first day
  ends        TEXT NOT NULL,                  -- last day
  bonus       INTEGER NOT NULL DEFAULT 0,     -- points for finishing every puzzle in it
  created_at  INTEGER NOT NULL
);
CREATE TABLE event_puzzles (
  event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  puzzle_id INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  sort      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, puzzle_id)
);
CREATE INDEX event_puzzles_puzzle ON event_puzzles(puzzle_id);
CREATE TABLE event_rewards (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

-- Achievements.
CREATE TABLE user_achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement TEXT NOT NULL,
  earned_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, achievement)
);

-- Each player's best result per event puzzle (finished while the event was on).
CREATE TABLE event_results (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id  INTEGER NOT NULL,
  score_pct  INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  medal      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id, puzzle_id)
);
