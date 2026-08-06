-- Fixes a real, exploitable gap: "viewer_insert_own_access" let ANY
-- authenticated user insert a viewer_accounts row naming themselves as a
-- viewer for ANY owner_id, with no check that a real invitation exists.
-- Combined with "read_invitation_by_token" being world-readable, anyone
-- could harvest an owner_id and grant themselves standing read access to
-- that mom's pumping/nursing/pain data with no invite, no consent.
--
-- Also fixes: viewers had no DELETE policy on viewer_accounts (so "remove
-- my access" silently failed under RLS), and invite acceptance never
-- checked that the accepting email matched the invited email.

-- ── viewer_accounts: denormalize the invited email for revocation lookups ────
alter table viewer_accounts add column if not exists viewer_email text;

-- ── viewer_accounts: require a real, matching, non-revoked invitation ───────
drop policy if exists "viewer_insert_own_access" on viewer_accounts;
create policy "viewer_insert_own_access" on viewer_accounts
  for insert with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from invitations
      where invitations.owner_id = viewer_accounts.owner_id
        and lower(invitations.email) = lower(coalesce(auth.jwt()->>'email', ''))
        and invitations.status <> 'revoked'
        and (invitations.status = 'accepted' or invitations.expires_at > now())
    )
  );

-- ── viewer_accounts: viewer can remove their own access ─────────────────────
drop policy if exists "viewer_delete_own_access" on viewer_accounts;
create policy "viewer_delete_own_access" on viewer_accounts
  for delete using (viewer_id = auth.uid());

-- ── invitations: viewer can mark their own invitation accepted ──────────────
-- (this was silently missing — acceptInvite()'s status update had no
-- policy allowing it, so invitations never actually flipped to 'accepted'
-- in the database at all)
drop policy if exists "viewer_accept_own_invitation" on invitations;
create policy "viewer_accept_own_invitation" on invitations
  for update using (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  )
  with check (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

-- ── invitations: remove the world-readable SELECT policy ────────────────────
-- Anyone (including anon, no login required) could previously run
-- `select * from invitations` and dump every pending invite (owner_id,
-- email, token, status) app-wide. Pre-auth invite preview now goes through
-- get_invitation_preview() below instead, which only ever returns a row
-- when given the exact correct token.
drop policy if exists "read_invitation_by_token" on invitations;

-- ── SECURITY DEFINER RPC: safe pre-auth invite preview by exact token ───────
create or replace function get_invitation_preview(p_token text)
returns table (
  id uuid,
  owner_id uuid,
  status text,
  expires_at timestamptz,
  owner_display_name text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.owner_id, i.status, i.expires_at, p.display_name
  from invitations i
  join profiles p on p.id = i.owner_id
  where i.token = p_token
    and i.status <> 'revoked';
$$;

grant execute on function get_invitation_preview(text) to anon, authenticated;
