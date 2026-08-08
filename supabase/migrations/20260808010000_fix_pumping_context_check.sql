-- Fixes a real, live-breaking bug: "mostly_pumping" was added to the
-- PumpingContext TS type and the onboarding/profile UI (see "Add 'mostly
-- pumping' feeding situation option" work) but the database's own CHECK
-- constraint was never updated to match -- so selecting it in the app
-- always failed with "violates check constraint profiles_pumping_context_check",
-- for every user who picked that option, silently (the app only surfaced
-- the raw Postgres error text, not a friendly message).
alter table profiles drop constraint if exists profiles_pumping_context_check;
alter table profiles add constraint profiles_pumping_context_check
  check (pumping_context = ANY (ARRAY[
    'exclusive_pumping'::text,
    'equal_pumping_nursing'::text,
    'work_pumping'::text,
    'mostly_nursing'::text,
    'mostly_pumping'::text,
    'supply_building'::text,
    'triple_feeding'::text,
    'weaning'::text,
    'unspecified'::text
  ]));
