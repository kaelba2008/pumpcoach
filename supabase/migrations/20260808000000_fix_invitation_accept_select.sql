-- Fixes a real, live-breaking regression from 20260805020000's security fix:
-- that migration correctly removed the world-readable SELECT policy on
-- invitations (which let anyone dump every pending invite), but never
-- replaced it with a properly scoped one for the actual invitee. The
-- viewer_accounts INSERT policy's WITH CHECK does
-- `EXISTS (SELECT 1 FROM invitations WHERE ...)` to verify a real invite
-- exists -- with no SELECT policy granting the invitee visibility into
-- that row at all, this EXISTS always evaluated false and every invite
-- acceptance (as an authenticated user, i.e. the actual "accept" step, not
-- the pre-auth token preview) has been failing with a row-level-security
-- error since Aug 5. Confirmed by direct reproduction: simulating an
-- authenticated user's own request could not SELECT their own pending
-- invitation at all.
--
-- Scoped identically to the existing viewer_accept_own_invitation UPDATE
-- policy (email match against the authenticated JWT) -- this does not
-- reopen the original vulnerability, since it's still scoped to "your own
-- invitation by matching email," not every row.
create policy "viewer_read_own_invitation" on invitations
  for select using (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );
