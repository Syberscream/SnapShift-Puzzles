-- SnapShift Puzzles v2 schema (Cloudflare D1 / SQLite)
-- Times are unix milliseconds unless the column name says otherwise.

CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'player',       -- player | admin
  email_verified  INTEGER NOT NULL DEFAULT 0,
  points          INTEGER NOT NULL DEFAULT 0,           -- current balance (ledger is the history)
  supporter_until INTEGER,                              -- ms; NULL = not a supporter
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                         -- sha256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  id          TEXT PRIMARY KEY,                         -- sha256 of the emailed token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                            -- verify | reset
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

CREATE TABLE login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL,                            -- email or ip
  ok          INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX login_attempts_key ON login_attempts(key, created_at);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,                        -- slug, e.g. "animals"
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  tile_url     TEXT NOT NULL DEFAULT '',
  sort         INTEGER NOT NULL DEFAULT 0,
  generate     INTEGER NOT NULL DEFAULT 1,              -- include in automatic generation
  prompt_hint  TEXT NOT NULL DEFAULT ''                 -- extra guidance for the generator
);

CREATE TABLE puzzles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  category_id   TEXT REFERENCES categories(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',        -- pending | published | rejected
  source        TEXT NOT NULL DEFAULT 'upload',         -- upload | elevenlabs
  original_key  TEXT NOT NULL,                          -- R2 key of the full-size image
  image_key     TEXT,                                   -- R2 key of the web-sized image (set on approval)
  thumb_key     TEXT,                                   -- R2 key of the thumbnail (set on approval)
  width         INTEGER,
  height        INTEGER,
  prompt        TEXT,
  model         TEXT,
  sort          INTEGER NOT NULL DEFAULT 0,             -- position inside its category (sets unlock cost)
  created_at    INTEGER NOT NULL,
  published_at  INTEGER
);
CREATE INDEX puzzles_cat ON puzzles(category_id, status, sort);
CREATE INDEX puzzles_status ON puzzles(status, created_at);

CREATE TABLE daily_puzzles (
  day        TEXT PRIMARY KEY,                          -- YYYY-MM-DD in the site timezone
  puzzle_id  INTEGER NOT NULL REFERENCES puzzles(id),
  seed       INTEGER NOT NULL
);

CREATE TABLE unlocks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id  INTEGER NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, puzzle_id)
);

-- One row per attempt. The server deals the scramble (seed) and replays
-- the move log to validate saves and completions.
CREATE TABLE plays (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id    INTEGER NOT NULL REFERENCES puzzles(id),
  difficulty   TEXT NOT NULL,                           -- easy | medium | hard
  hard_mode    INTEGER NOT NULL DEFAULT 0,
  daily_day    TEXT,                                    -- set for daily challenge plays
  seed         INTEGER NOT NULL,
  actions      TEXT NOT NULL DEFAULT '[]',              -- JSON move log
  elapsed_ms   INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  last_hint_at INTEGER,
  hints_paid   INTEGER NOT NULL DEFAULT 0,               -- hint/place actions the server has charged for
  places_paid  INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  moves        INTEGER,
  score        INTEGER,
  score_pct    INTEGER,
  medal        TEXT,
  points       INTEGER
);
CREATE INDEX plays_user ON plays(user_id, updated_at);
CREATE INDEX plays_user_puzzle ON plays(user_id, puzzle_id, completed_at);
CREATE INDEX plays_daily ON plays(daily_day, completed_at);

CREATE TABLE points_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,                             -- win | daily | streak | unlock | hint | place | admin
  ref        TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX points_ledger_user ON points_ledger(user_id, created_at);

CREATE TABLE daily_results (
  day        TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_id    TEXT NOT NULL,
  score_pct  INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  moves      INTEGER NOT NULL,
  medal      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX daily_results_rank ON daily_results(day, score_pct DESC, elapsed_ms ASC);

CREATE TABLE streak_rewards (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone  INTEGER NOT NULL,
  day        TEXT NOT NULL,                             -- the day the milestone was reached
  points     INTEGER NOT NULL,
  PRIMARY KEY (user_id, milestone, day)
);

CREATE TABLE generation_jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,                          -- queued | submitting | submitted | downloading | done | failed
  category_id   TEXT REFERENCES categories(id),
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  model         TEXT NOT NULL,
  options       TEXT NOT NULL DEFAULT '{}',             -- aspect_ratio, resolution, ...
  remote_id     TEXT,                                   -- ElevenLabs generation id
  error         TEXT,
  puzzle_id     INTEGER REFERENCES puzzles(id),
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX generation_jobs_status ON generation_jobs(status, updated_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                                   -- JSON
);

CREATE TABLE contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  user_id    INTEGER,
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

INSERT INTO categories (id, name, description, tile_url, sort, prompt_hint) VALUES
  ('animals',      'Animals',      'Wildlife, pets and portraits of creatures big and small.', '/img/categories/animals.png',      1,  'a wild or domestic animal in its natural setting'),
  ('landscapes',   'Landscapes',   'Mountains, lakes, coastlines and wide open views.',       '/img/categories/landscapes.png',   2,  'a sweeping natural landscape'),
  ('nature',       'Nature',       'Flowers, leaves, dew and close-up natural detail.',       '/img/categories/nature.png',       3,  'close-up natural detail such as flowers, foliage or fungi'),
  ('marine',       'Marine',       'Oceans, boats, harbours and life by the water.',          '/img/categories/marine.png',       4,  'the sea, boats, harbours or coastal scenes'),
  ('cities',       'Cities',       'Streets, canals, skylines and city life.',                '/img/categories/cities.png',       5,  'a city street, canal or skyline'),
  ('architecture', 'Architecture', 'Facades, courtyards, arches and interiors.',               '/img/categories/architecture.png', 6,  'striking architecture, facades or interiors'),
  ('food',         'Food',         'Meals, picnics, desserts and fresh ingredients.',         '/img/categories/food.png',         7,  'an appetising food spread or dish'),
  ('art',          'Art',          'Painterly portraits and fine-art scenes.',                '/img/categories/art.png',          8,  'a painterly fine-art portrait or scene'),
  ('vehicles',     'Vehicles',     'Classic cars, motorcycles and machines on the road.',     '/img/categories/vehicles.png',     9,  'a classic car, motorcycle or vehicle'),
  ('scifi',        'Sci-Fi',       'Robots, spacecraft and futuristic worlds.',               '/img/categories/scifi.png',        10, 'a science-fiction scene with robots, spacecraft or future cities'),
  ('space',        'Space',        'Planets, nebulae and cosmic light.',                      '/img/categories/space.png',        11, 'a space scene with planets, nebulae or stars'),
  ('fractals',     'Fractals',     'Patterns, spirals and mathematical art.',                 '/img/categories/fractals.png',     12, 'an intricate fractal or abstract pattern');
