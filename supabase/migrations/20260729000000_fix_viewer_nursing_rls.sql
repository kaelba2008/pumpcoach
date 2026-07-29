-- Fix viewer access for nursing_sessions using the correct table name (viewer_accounts).
-- The prior migration (20260725000001_viewer_access_rls.sql) referenced a non-existent
-- table "viewer_access" and failed to apply; this replaces it with the correct name.

create policy "viewers_can_read_nursing"
  on nursing_sessions
  for select
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select viewer_id from viewer_accounts where owner_id = user_id
    )
  );
