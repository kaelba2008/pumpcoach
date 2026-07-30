-- Repair RLS on viewer_accounts itself + ensure viewer_notes exists.
-- The viewer data was readable (policies on pump_sessions reference
-- viewer_accounts as definer, bypassing its RLS) but the app's direct
-- query "which owners can I view" returned nothing, hiding the
-- "View client data" button. Idempotent.

-- ── viewer_accounts ──────────────────────────────────────────────────────────
alter table viewer_accounts enable row level security;

drop policy if exists "owner_manage_viewers"      on viewer_accounts;
drop policy if exists "viewer_see_own_access"     on viewer_accounts;
drop policy if exists "viewer_insert_own_access"  on viewer_accounts;
drop policy if exists "viewer_update_own_access"  on viewer_accounts;

create policy "owner_manage_viewers" on viewer_accounts
  for all using (owner_id = auth.uid());

create policy "viewer_see_own_access" on viewer_accounts
  for select using (viewer_id = auth.uid());

create policy "viewer_insert_own_access" on viewer_accounts
  for insert with check (viewer_id = auth.uid());

create policy "viewer_update_own_access" on viewer_accounts
  for update using (viewer_id = auth.uid());

-- ── viewer_notes (create if the earlier migration never ran) ─────────────────
create table if not exists viewer_notes (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewing_user_id uuid not null references auth.users(id) on delete cascade,
  note_content text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(viewer_id, viewing_user_id)
);

alter table viewer_notes enable row level security;

drop policy if exists "viewers_see_own_notes"       on viewer_notes;
drop policy if exists "viewing_user_sees_all_notes" on viewer_notes;
drop policy if exists "viewers_insert_notes"        on viewer_notes;
drop policy if exists "viewers_update_own_notes"    on viewer_notes;

create policy "viewers_see_own_notes" on viewer_notes
  for select using (viewer_id = auth.uid());

create policy "viewing_user_sees_all_notes" on viewer_notes
  for select using (viewing_user_id = auth.uid());

create policy "viewers_insert_notes" on viewer_notes
  for insert with check (viewer_id = auth.uid());

create policy "viewers_update_own_notes" on viewer_notes
  for update using (viewer_id = auth.uid());
