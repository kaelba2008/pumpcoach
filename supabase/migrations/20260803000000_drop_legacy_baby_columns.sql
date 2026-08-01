-- Run only after confirming the multi-baby OTA update (babies table
-- cutover) has reached all active app sessions — Expo OTA applies on next
-- cold start, not instantly, so give this ~24-48h after that update ships.
-- profiles.baby_name/baby_dob are fully superseded by the babies table.
-- DO NOT apply this migration at the same time as 20260801000000_babies.sql.
alter table profiles drop column if exists baby_name;
alter table profiles drop column if exists baby_dob;
