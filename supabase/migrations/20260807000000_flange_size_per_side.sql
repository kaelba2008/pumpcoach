-- Splits the single flange-size default/snapshot into right/left, matching
-- what most IBCLCs actually see: many people need a different size on
-- each breast. The old single flange_size_mm columns are left in place
-- (unused going forward) rather than dropped, since nothing depended on
-- removing them and a few historical session rows only have that value.
--
-- Existing profile defaults are backfilled into both sides so nobody's
-- current default is silently lost.
alter table profiles add column if not exists flange_size_mm_right numeric;
alter table profiles add column if not exists flange_size_mm_left numeric;
update profiles set flange_size_mm_right = flange_size_mm, flange_size_mm_left = flange_size_mm
  where flange_size_mm is not null and flange_size_mm_right is null and flange_size_mm_left is null;

alter table pump_sessions add column if not exists flange_size_mm_right numeric;
alter table pump_sessions add column if not exists flange_size_mm_left numeric;
