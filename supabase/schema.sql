-- ============================================================
-- PumpCoach Database Schema
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT,
  display_name      TEXT,
  baby_name         TEXT,
  baby_dob          DATE,
  pump_brand        TEXT,
  pump_model        TEXT,
  flange_size_mm    INTEGER,
  daily_goal_oz     NUMERIC(5,2),
  return_to_work    DATE,
  subscription_tier TEXT DEFAULT 'free'
    CHECK (subscription_tier IN ('free','premium','vip')),
  timezone          TEXT DEFAULT 'UTC',
  onboarded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'display_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Pump Sessions ─────────────────────────────────────────────
CREATE TABLE pump_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_sec     INTEGER,
  left_oz          NUMERIC(5,2),
  right_oz         NUMERIC(5,2),
  total_oz         NUMERIC(5,2) GENERATED ALWAYS AS
                     (COALESCE(left_oz, 0) + COALESCE(right_oz, 0)) STORED,
  notes            TEXT,
  session_type     TEXT DEFAULT 'pump'
    CHECK (session_type IN ('pump','hand_express','combo')),
  pain_level       SMALLINT CHECK (pain_level BETWEEN 1 AND 10),
  letdown_quality  TEXT CHECK (letdown_quality IN ('strong','normal','slow','none')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pump_sessions_user_started ON pump_sessions (user_id, started_at DESC);

ALTER TABLE pump_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_sessions" ON pump_sessions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Stash Entries ─────────────────────────────────────────────
CREATE TABLE stash_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expressed_at   TIMESTAMPTZ NOT NULL,
  oz             NUMERIC(5,2) NOT NULL,
  location       TEXT DEFAULT 'freezer'
    CHECK (location IN ('fridge','freezer','deep_freezer','daycare','other')),
  container_type TEXT CHECK (container_type IN ('bag','bottle','tray','other')),
  label          TEXT,
  used_at        TIMESTAMPTZ,
  discarded_at   TIMESTAMPTZ,
  discard_reason TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stash_user_expressed ON stash_entries (user_id, expressed_at ASC);

ALTER TABLE stash_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_stash" ON stash_entries
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Reminders ────────────────────────────────────────────────
CREATE TABLE reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label           TEXT,
  time_of_day     TIME NOT NULL,
  days_of_week    SMALLINT[] NOT NULL,
  mode            TEXT DEFAULT 'standard'
    CHECK (mode IN ('standard','workday','overnight','travel')),
  enabled         BOOLEAN DEFAULT TRUE,
  snooze_minutes  SMALLINT DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_reminders" ON reminders
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── AI Conversations ──────────────────────────────────────────
CREATE TABLE ai_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT,
  messages         JSONB NOT NULL DEFAULT '[]',
  context_snapshot JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_convos_user ON ai_conversations (user_id, updated_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_convos" ON ai_conversations
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Red Flag Events (audit only — no clinical content) ────────
CREATE TABLE red_flag_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  flag_type    TEXT,
  escalated    BOOLEAN DEFAULT FALSE
);

ALTER TABLE red_flag_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_flags" ON red_flag_events
  USING (user_id = auth.uid());

-- ── Audit Log (security events — no PII/PHI content) ─────────
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  ip_hash         TEXT,
  user_agent_hash TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Only service role can read audit log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_audit" ON audit_log USING (FALSE);
