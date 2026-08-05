-- Simple Mode: hides Session Insights, quality/status text, and trend
-- stats everywhere they appear (home screen, post-session sheet), for
-- anyone who finds the numbers themselves anxiety-inducing rather than
-- helpful. Leaves the core log intact: time, output, notes.
alter table profiles add column if not exists simple_mode boolean not null default false;
