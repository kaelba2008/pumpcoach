-- Add priority ordering to stash goals
ALTER TABLE stash_goals ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0 NOT NULL;

-- Set sort_order for existing goals based on creation order per user
UPDATE stash_goals
SET sort_order = sub.row_num
FROM (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1)::int AS row_num
  FROM stash_goals
) sub
WHERE stash_goals.id = sub.id;
