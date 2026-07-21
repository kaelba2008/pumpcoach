-- Add missing columns to stash_goals table
-- Blocking: trip_days (written by app on every trip goal save)
-- Full schema: hours_away_per_day, baby_oz_while_away, baby_target_age_months,
--              breast_milk_oz_per_day, custom_target_oz

ALTER TABLE stash_goals
  ADD COLUMN IF NOT EXISTS trip_days               integer,
  ADD COLUMN IF NOT EXISTS hours_away_per_day      integer,
  ADD COLUMN IF NOT EXISTS baby_oz_while_away      numeric,
  ADD COLUMN IF NOT EXISTS baby_target_age_months  integer,
  ADD COLUMN IF NOT EXISTS breast_milk_oz_per_day  numeric,
  ADD COLUMN IF NOT EXISTS custom_target_oz        numeric;
