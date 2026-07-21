-- ============================================================
-- Beta Fix Migration — 2026-05-17
-- Fixes: pain_level constraint, pump_types, flange sizes, pumped_after_nursing
-- ============================================================

-- Fix 1: Allow pain_level = 0 (no pain is a valid, saveable value)
ALTER TABLE pump_sessions
  DROP CONSTRAINT IF EXISTS pump_sessions_pain_level_check;

ALTER TABLE pump_sessions
  ADD CONSTRAINT pump_sessions_pain_level_check
  CHECK (pain_level BETWEEN 0 AND 10);

-- Fix 10: Add pump_types array for multi-pump-type sessions
ALTER TABLE pump_sessions
  ADD COLUMN IF NOT EXISTS pump_types TEXT[] DEFAULT NULL;

-- Fix 11: Add right-side flange size to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS flange_size_right_mm INTEGER DEFAULT NULL;

-- Rename existing flange_size_mm to flange_size_left_mm for clarity
-- (We add the new column and keep the old one as left for backward compat)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS flange_size_left_mm INTEGER DEFAULT NULL;

-- Backfill: copy existing flange_size_mm into flange_size_left_mm
UPDATE profiles
  SET flange_size_left_mm = flange_size_mm
  WHERE flange_size_mm IS NOT NULL AND flange_size_left_mm IS NULL;

-- Fix 12: Add pumped_after_nursing context field
ALTER TABLE pump_sessions
  ADD COLUMN IF NOT EXISTS pumped_after_nursing TEXT DEFAULT NULL
  CHECK (pumped_after_nursing IN ('yes', 'no', 'na'));

