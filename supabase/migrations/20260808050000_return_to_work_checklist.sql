-- Which Return to Work Planner checklist items a mom has checked off.
-- Items themselves are static app-defined content (lib/returnToWorkChecklist.ts),
-- not user data, so a single array of completed keys is enough -- no new
-- table/RLS needed, mirrors the existing schedule_away_days precedent.
alter table profiles add column if not exists return_to_work_checklist_done text[] not null default '{}';
