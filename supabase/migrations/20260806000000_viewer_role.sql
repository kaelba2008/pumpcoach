-- Adds a partner-vs-IBCLC distinction to the viewer-sharing feature. Every
-- viewer currently sees the exact same full clinical detail regardless of
-- who they are; going forward a mom picks a role when she invites someone,
-- and the app renders a slim summary for "partner" vs. the full detail
-- view (plus IBCLC-only explainer copy) for "ibclc".
--
-- The defaults below are deliberately asymmetric: every viewer_accounts
-- row that already exists was granted under the old single-tier model, so
-- defaulting existing rows to 'ibclc' preserves exactly what they can see
-- today. New invitations default to 'partner' (the more common case) but
-- the invite UI always asks explicitly -- this default only matters if a
-- row is ever inserted without one specified.

alter table invitations add column if not exists viewer_role text not null default 'partner'
  check (viewer_role in ('partner', 'ibclc'));

alter table viewer_accounts add column if not exists viewer_role text not null default 'ibclc'
  check (viewer_role in ('partner', 'ibclc'));

-- ── get_invitation_preview: surface viewer_role so acceptInvite() can
--    propagate it from the invitation onto the new viewer_accounts row ────
-- Return type is changing (new column), which create-or-replace can't do.
drop function if exists get_invitation_preview(text);

create function get_invitation_preview(p_token text)
returns table (
  id uuid,
  owner_id uuid,
  status text,
  expires_at timestamptz,
  owner_display_name text,
  viewer_role text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.owner_id, i.status, i.expires_at, p.display_name, i.viewer_role
  from invitations i
  join profiles p on p.id = i.owner_id
  where i.token = p_token
    and i.status <> 'revoked';
$$;

grant execute on function get_invitation_preview(text) to anon, authenticated;
