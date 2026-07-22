-- Dual pump phases support: massage and expression with separate settings
-- Plus time to letdown tracking

ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS massage_suction_level INTEGER;
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS massage_cycle_speed INTEGER;
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS massage_duration_sec INTEGER;

ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS expression_suction_level INTEGER;
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS expression_cycle_speed INTEGER;
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS expression_duration_sec INTEGER;

ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS time_to_letdown_sec INTEGER;
