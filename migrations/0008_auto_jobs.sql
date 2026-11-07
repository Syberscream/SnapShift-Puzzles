-- Mark generations started by the schedule, so "Images per 24 hours" only
-- limits automatic ones (Generate now and member requests don't use it up).
ALTER TABLE generation_jobs ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS generation_jobs_auto ON generation_jobs(auto, created_at);
