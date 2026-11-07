-- Pictures made only for events: a hidden category, never shown in the
-- catalogue and playable only while an event that includes them is on.
INSERT OR IGNORE INTO categories (id, name, description, tile_url, sort, generate, prompt_hint, members_only)
VALUES ('events', 'Event pictures', 'Pictures made for events. Only playable while their event is on.', '/img/categories/art.png', 999, 0, '', 0);

-- Generations for an event remember it, and their pictures join it when published.
ALTER TABLE generation_jobs ADD COLUMN event_id TEXT;
ALTER TABLE puzzles ADD COLUMN event_id TEXT;
