-- Invite a friend: who brought each player in, and the one-time reward for both.
ALTER TABLE users ADD COLUMN referred_by INTEGER;
CREATE INDEX users_referred_by ON users(referred_by);

CREATE TABLE referral_rewards (
  invitee_id  INTEGER PRIMARY KEY,
  inviter_id  INTEGER NOT NULL,
  points      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX referral_rewards_inviter ON referral_rewards(inviter_id);

-- Daily puzzle reminders by push notification (guests can sign up too).
CREATE TABLE push_subs (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_id     INTEGER,
  tz          TEXT NOT NULL DEFAULT 'UTC',
  hour        INTEGER NOT NULL DEFAULT 9,
  sent_day    TEXT,
  created_at  INTEGER NOT NULL,
  failures    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_subs_user ON push_subs(user_id);
