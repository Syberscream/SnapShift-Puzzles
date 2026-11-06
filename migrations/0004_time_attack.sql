-- Time Attack: 3-minute runs of small puzzles, weekly leaderboard.
CREATE TABLE time_attack_runs (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,                  -- site-timezone day the run started (daily points cap)
  week        TEXT NOT NULL,                  -- Monday (YYYY-MM-DD) of the week, site timezone
  seed        INTEGER NOT NULL,
  puzzles     TEXT NOT NULL,                  -- JSON [{id, seed}] in play order
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  solved      INTEGER,
  moves       INTEGER,
  score       INTEGER,
  points      INTEGER
);
CREATE INDEX time_attack_week ON time_attack_runs(week, score DESC);
CREATE INDEX time_attack_user ON time_attack_runs(user_id, day);
