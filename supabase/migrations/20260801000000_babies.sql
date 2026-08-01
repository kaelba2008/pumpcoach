-- Babies: support multiple babies per account (twins/multiples, mixed-age
-- siblings). Modeled directly on user_pumps (20260623000000_user_pumps.sql).

create table babies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  dob         date,
  created_at  timestamptz default now() not null
);

create index idx_babies_user_created on babies (user_id, created_at asc);

alter table babies enable row level security;

-- Owner: full manage access (mirrors "Users manage own pumps")
create policy "Users manage own babies"
  on babies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Viewer: read-only, mirrors viewer_read_owner_profile on profiles so
-- app/(viewer)/dashboard.tsx keeps showing baby name/age to IBCLC viewers.
create policy "viewer_read_owner_babies" on babies
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from viewer_accounts
      where owner_id = babies.user_id
        and viewer_id = auth.uid()
    )
  );

-- Denormalized attribution on session rows — same convention as pump_name:
-- store the chosen baby's NAME, not a FK, so deleting a baby never corrupts
-- historical session data.
alter table pump_sessions add column if not exists baby_name text;

-- One-time backfill: copy any existing profiles.baby_name/baby_dob into a
-- babies row so beta/test accounts don't silently lose already-entered
-- data. Confirmed via prod query: 40 profiles total, 25 with baby_name set,
-- 23 with baby_dob set — this is real data, not hypothetical.
insert into babies (user_id, name, dob, created_at)
select id,
       coalesce(nullif(trim(baby_name), ''), 'Baby'),
       baby_dob,
       coalesce(onboarded_at, created_at, now())
from profiles
where baby_name is not null or baby_dob is not null;
