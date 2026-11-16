-- Etsy prep (Admin → Etsy): listing text and status for each picture, and the
-- room mockups the admin uploads to show the art on a wall.
CREATE TABLE etsy_items (
  puzzle_id    INTEGER PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'none',   -- none | prepared | listed
  title        TEXT,
  intro        TEXT,                           -- the picture's own description; the shared parts are added on top
  tags         TEXT,                           -- JSON array
  focus        REAL,                           -- 0..1: where crops centre across the picture
  etsy_url     TEXT,
  prepared_at  INTEGER,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX etsy_items_status ON etsy_items(status);

CREATE TABLE etsy_mockups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  image_key   TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  corners     TEXT,                            -- JSON [[x,y] x4] as fractions: top-left, top-right, bottom-right, bottom-left
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
