-- ============================================================
-- Session 5 Part 6: user_notification_history
-- Tracks which encouraging notifications have been shown so we
-- can avoid repeating within 14 days and detect milestone fires.
-- ============================================================

CREATE TABLE user_notification_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id  uuid NOT NULL REFERENCES notifications_content(id) ON DELETE CASCADE,
  -- milestone rows use a string key instead of notifications_content row
  milestone_key    text,           -- e.g. "oz_100", "month_1"
  sent_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_history_user ON user_notification_history (user_id, sent_at DESC);

ALTER TABLE user_notification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_select_own" ON user_notification_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "history_insert_own" ON user_notification_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
