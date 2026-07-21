-- User pumps: allow tracking multiple pumps and selecting one per session

CREATE TABLE user_pumps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE user_pumps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pumps"
  ON user_pumps FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Store which pump was used per session (nullable — not required)
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS pump_name text;
