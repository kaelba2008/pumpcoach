-- Private per-day viewer scratchpad -- deliberately a new table, not a
-- resurrection of viewer_notes (dropped earlier today for looking too
-- much like clinical charting shared with the mom). Two things make this
-- different: one row per day instead of a single blob, and NO policy at
-- all grants the owner (mom) access -- this is private to the viewer who
-- wrote it, structurally, not just by UI convention.
create table if not exists viewer_private_notes (
  id         uuid primary key default gen_random_uuid(),
  viewer_id  uuid not null references profiles(id) on delete cascade,
  owner_id   uuid not null references profiles(id) on delete cascade,
  note_date  date not null,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (viewer_id, owner_id, note_date)
);

alter table viewer_private_notes enable row level security;

create policy "viewer_manage_own_private_notes" on viewer_private_notes
  for all using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());
