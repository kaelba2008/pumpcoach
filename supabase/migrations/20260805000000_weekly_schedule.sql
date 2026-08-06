-- Weekly Schedule: lets a mom declare which days she's typically away from
-- baby (work, travel, etc.) so the app's expectations adapt without
-- enforcing a rigid plan. Advisory only -- actual logged behavior always
-- wins; this just tells the insight/pattern-detection system not to compare
-- an away day's naturally different pace against a home-day baseline (and
-- vice versa). Days not in schedule_away_days are implicitly "home" days
-- when the schedule is enabled.
alter table profiles add column if not exists schedule_enabled boolean not null default false;
alter table profiles add column if not exists schedule_away_days smallint[] not null default '{}';
