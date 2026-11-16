-- Etsy prep: the mockups chosen for each picture (JSON array of mockup ids, in
-- order). Empty means "use the default mockups".
ALTER TABLE etsy_items ADD COLUMN mockups TEXT;
