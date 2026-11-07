-- Public profile pages (on by default: names already show on leaderboards).
ALTER TABLE users ADD COLUMN profile_public INTEGER NOT NULL DEFAULT 1;
-- A smaller copy of each puzzle picture for phones.
ALTER TABLE puzzles ADD COLUMN small_key TEXT;
