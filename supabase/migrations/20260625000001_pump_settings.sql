ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS suction_level int;
ALTER TABLE pump_sessions ADD COLUMN IF NOT EXISTS pump_mode text
  CHECK (pump_mode IN ('massage', 'expression', 'combo'));
