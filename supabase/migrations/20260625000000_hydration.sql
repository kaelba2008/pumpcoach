-- opt-in flag on the profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS track_hydration boolean DEFAULT false NOT NULL;

-- one row per user per day for water intake
CREATE TABLE IF NOT EXISTS daily_hydration (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date       date  NOT NULL,
  glasses    int   NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, date)
);

ALTER TABLE daily_hydration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own hydration" ON daily_hydration
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
