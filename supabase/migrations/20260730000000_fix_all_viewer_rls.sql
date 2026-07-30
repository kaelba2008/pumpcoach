-- Comprehensive viewer RLS repair.
-- The 20260725000001 migration referenced a non-existent table ("viewer_access"
-- instead of "viewer_accounts"), so its policies never applied. This script is
-- idempotent: it drops every viewer-related read policy that may or may not
-- exist and recreates them all against the correct viewer_accounts table.

-- ── pump_sessions ────────────────────────────────────────────────────────────
drop policy if exists "viewers_can_read_sessions"  on pump_sessions;
drop policy if exists "viewer_read_pump_sessions"  on pump_sessions;

create policy "viewer_read_pump_sessions" on pump_sessions
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from viewer_accounts
      where owner_id = pump_sessions.user_id
        and viewer_id = auth.uid()
    )
  );

-- ── nursing_sessions ─────────────────────────────────────────────────────────
drop policy if exists "viewers_can_read_nursing" on nursing_sessions;

create policy "viewers_can_read_nursing" on nursing_sessions
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from viewer_accounts
      where owner_id = nursing_sessions.user_id
        and viewer_id = auth.uid()
    )
  );

-- ── stash_entries ────────────────────────────────────────────────────────────
drop policy if exists "viewer_read_stash_entries" on stash_entries;

create policy "viewer_read_stash_entries" on stash_entries
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from viewer_accounts
      where owner_id = stash_entries.user_id
        and viewer_id = auth.uid()
    )
  );

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "viewers_can_read_profiles"   on profiles;
drop policy if exists "viewer_read_owner_profile"   on profiles;

create policy "viewer_read_owner_profile" on profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from viewer_accounts
      where owner_id = profiles.id
        and viewer_id = auth.uid()
    )
  );
