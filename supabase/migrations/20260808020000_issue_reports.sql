-- "Report an issue" -- the AI Coach was improvising reassuring-sounding
-- promises to relay feedback with nothing actually behind them. This
-- table is the durable source of truth for a submitted report; the app
-- also opens a pre-filled email to Katie on submit (same pattern as the
-- existing invite-email flow) so a report is seen promptly without any
-- new email-service infrastructure.
create table if not exists issue_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  message         text not null,
  app_version     text,
  runtime_version text,
  platform        text,
  created_at      timestamptz not null default now()
);

alter table issue_reports enable row level security;

create policy "users_insert_own_reports" on issue_reports
  for insert with check (user_id = auth.uid());
-- No SELECT policy for regular users -- reports are private once
-- submitted, readable only via the service-role admin function.
