-- Allow notification_id to be null for milestone-triggered rows
-- which reference a milestone_key instead of a notifications_content row.
ALTER TABLE user_notification_history
  ALTER COLUMN notification_id DROP NOT NULL;
