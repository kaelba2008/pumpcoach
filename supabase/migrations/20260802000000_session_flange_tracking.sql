-- Per-session flange snapshot, same denormalization pattern as pump_name/
-- baby_name — lets moms testing different flanges log what they used for
-- THIS session without changing their profile default, and lets us later
-- detect a flange change and compare output before/after.
alter table pump_sessions add column if not exists flange_size_mm numeric;
alter table pump_sessions add column if not exists flange_shape text;
alter table pump_sessions add column if not exists flange_material text;
