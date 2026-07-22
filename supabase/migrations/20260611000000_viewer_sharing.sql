-- Viewer sharing feature
-- Allows a mom to invite someone (partner, LC, family) to view her data read-only.

-- ── invitations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their own invitations
CREATE POLICY "owner_manage_invitations" ON invitations
  FOR ALL USING (owner_id = auth.uid());

-- Anyone can read an invitation by token (needed to accept it)
CREATE POLICY "read_invitation_by_token" ON invitations
  FOR SELECT USING (true);

-- ── viewer_accounts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viewer_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, viewer_id)
);

ALTER TABLE viewer_accounts ENABLE ROW LEVEL SECURITY;

-- Owner can see and delete viewer relationships
CREATE POLICY "owner_manage_viewers" ON viewer_accounts
  FOR ALL USING (owner_id = auth.uid());

-- Viewer can see their own viewer relationships
CREATE POLICY "viewer_see_own_access" ON viewer_accounts
  FOR SELECT USING (viewer_id = auth.uid());

-- Viewer can create their own viewer relationship (when accepting invitation)
CREATE POLICY "viewer_insert_own_access" ON viewer_accounts
  FOR INSERT WITH CHECK (viewer_id = auth.uid());

-- Viewer can update their own viewer relationship (idempotent accepts)
CREATE POLICY "viewer_update_own_access" ON viewer_accounts
  FOR UPDATE USING (viewer_id = auth.uid());

-- ── RLS: let viewers read owner data ─────────────────────────────────────────

-- pump_sessions: viewers can SELECT
CREATE POLICY "viewer_read_pump_sessions" ON pump_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM viewer_accounts
      WHERE owner_id = pump_sessions.user_id
        AND viewer_id = auth.uid()
    )
  );

-- stash_entries: viewers can SELECT
CREATE POLICY "viewer_read_stash_entries" ON stash_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM viewer_accounts
      WHERE owner_id = stash_entries.user_id
        AND viewer_id = auth.uid()
    )
  );

-- profiles: viewers can SELECT owner profile (for display name, baby name, etc.)
CREATE POLICY "viewer_read_owner_profile" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM viewer_accounts
      WHERE owner_id = profiles.id
        AND viewer_id = auth.uid()
    )
  );
