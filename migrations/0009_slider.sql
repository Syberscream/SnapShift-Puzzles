-- Slider Puzzle: one empty square, slide tiles to rebuild the picture.
CREATE TABLE slider_daily (
  day        TEXT PRIMARY KEY,
  puzzle_id  INTEGER NOT NULL REFERENCES puzzles(id),
  seed       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Games by signed-in players (guests play on their own device).
CREATE TABLE slider_games (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id   INTEGER NOT NULL REFERENCES puzzles(id),
  size        INTEGER NOT NULL,
  seed        INTEGER NOT NULL,
  daily_day   TEXT,
  local_day   TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  elapsed_ms  INTEGER,
  moves       INTEGER,
  medal       TEXT,
  points      INTEGER
);
CREATE INDEX slider_games_user ON slider_games(user_id, local_day);
CREATE INDEX slider_games_best ON slider_games(user_id, puzzle_id, size, finished_at);

-- Best result per player on each day's shared slider.
CREATE TABLE slider_results (
  day        TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  moves      INTEGER NOT NULL,
  medal      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX slider_results_rank ON slider_results(day, elapsed_ms, moves);
