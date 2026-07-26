-- Viewer notes: allow viewers (partners, IBCLCs) to leave notes for the person they're viewing
create table viewer_notes (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewing_user_id uuid not null references auth.users(id) on delete cascade,
  note_content text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(viewer_id, viewing_user_id)
);

create index idx_viewer_notes_viewing_user on viewer_notes(viewing_user_id);
create index idx_viewer_notes_viewer on viewer_notes(viewer_id);

-- RLS: viewers can see notes they wrote, and the person being viewed can see all notes about them
alter table viewer_notes enable row level security;

create policy "viewers_see_own_notes"
  on viewer_notes
  for select
  using (viewer_id = auth.uid());

create policy "viewing_user_sees_all_notes"
  on viewer_notes
  for select
  using (viewing_user_id = auth.uid());

create policy "viewers_insert_notes"
  on viewer_notes
  for insert
  with check (viewer_id = auth.uid());

create policy "viewers_update_own_notes"
  on viewer_notes
  for update
  using (viewer_id = auth.uid());
