-- RLS policies to allow viewers to read data from people they have access to

-- Viewers can read pump_sessions of people they have access to
create policy "viewers_can_read_sessions"
  on pump_sessions
  for select
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select viewer_id from viewer_access where owner_id = user_id
    )
  );

-- Viewers can read nursing_sessions of people they have access to
create policy "viewers_can_read_nursing"
  on nursing_sessions
  for select
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select viewer_id from viewer_access where owner_id = user_id
    )
  );

-- Viewers can read profiles of people they have access to (but not sensitive fields)
create policy "viewers_can_read_profiles"
  on profiles
  for select
  using (
    auth.uid() = id
    or auth.uid() in (
      select viewer_id from viewer_access where owner_id = id
    )
  );
