-- Lets a mom set up her weekly schedule ahead of her actual return-to-work
-- date without it affecting insights/pattern-detection until that date
-- arrives. Nullable, no default: null means "effective immediately," same
-- convention lib/schedule.ts already uses for "no opinion."
alter table profiles add column if not exists schedule_effective_date date;
