-- Game modes and engine versions.
-- mode:   classic | zen | rotation
-- engine: 1 = launch rules (existing games), 2 = per-difficulty rules and modes.
ALTER TABLE plays ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE plays ADD COLUMN engine INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS plays_user_puzzle;
CREATE INDEX plays_user_puzzle ON plays(user_id, puzzle_id, difficulty, mode, completed_at);
