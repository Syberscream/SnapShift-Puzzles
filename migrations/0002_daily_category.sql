-- Separate pool for the daily challenge ("Puzzles of the Day").
-- Puzzles in this category are only played as dailies (and from the daily archive);
-- they don't appear in the normal category pages.
INSERT OR IGNORE INTO categories (id, name, description, tile_url, sort, generate, prompt_hint) VALUES
  ('daily', 'Puzzles of the Day', 'The daily challenge pool. Each picture is used once as a daily.',
   '/img/categories/puzzles_of_the_day.png', 0, 1, '');
