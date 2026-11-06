-- SnapShift Plus membership.
-- users.supporter_until is the membership expiry (ms). Lifetime members get a far-future date.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN lifetime INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN frame TEXT NOT NULL DEFAULT '';
CREATE INDEX users_stripe_customer ON users(stripe_customer_id);

-- Categories only members can play.
ALTER TABLE categories ADD COLUMN members_only INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO categories (id, name, description, tile_url, sort, generate, prompt_hint, members_only)
VALUES ('members', 'Members'' Gallery', 'New pictures every week, just for SnapShift Plus members.', '/img/categories/members.png', 5, 1, '', 1);

-- Days a member's streak freeze covered.
CREATE TABLE streak_freezes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Members' puzzle ideas. Each one becomes a generation job; the admin approves the picture.
CREATE TABLE puzzle_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,                 -- YYYY-MM (site timezone), for the monthly limit
  idea        TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  job_id      TEXT REFERENCES generation_jobs(id),
  created_at  INTEGER NOT NULL
);
CREATE INDEX puzzle_requests_user ON puzzle_requests(user_id, month);
CREATE INDEX puzzle_requests_job ON puzzle_requests(job_id);

-- Stripe webhook events already handled (Stripe can send an event more than once).
CREATE TABLE stripe_events (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
