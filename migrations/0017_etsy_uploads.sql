-- Etsy prep: pictures the admin uploads straight into Etsy prep (posters,
-- blueprints… anything that isn't a puzzle). Their listing details live in
-- etsy_items under the negative id (-1 for upload 1), next to the puzzles.
CREATE TABLE etsy_uploads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  original_key  TEXT NOT NULL,                -- the file as uploaded
  image_key     TEXT NOT NULL,                -- a ~2000 px JPEG for previews and the AI writer
  thumb_key     TEXT NOT NULL,                -- a small JPEG for the grid
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

-- How a picture goes into the frame shapes: 1 = show the whole picture (a
-- matching border where the shape differs), 0 = fill the frame (crop the
-- edges). Empty = the default: whole picture for uploads, fill for puzzles.
ALTER TABLE etsy_items ADD COLUMN fit INTEGER;
