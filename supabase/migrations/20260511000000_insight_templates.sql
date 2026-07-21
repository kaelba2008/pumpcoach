-- ============================================================
-- Session 5 Part 1: AI Insight Templates Infrastructure
-- ============================================================

-- ── 1. ENUMS ──────────────────────────────────────────────

CREATE TYPE insight_severity AS ENUM ('informational', 'mild', 'needs_attention', 'celebratory');
CREATE TYPE insight_deference AS ENUM ('none', 'light', 'moderate', 'strong');
CREATE TYPE postpartum_stage_enum AS ENUM ('early', 'established', 'any');

-- ── 2. insight_templates ──────────────────────────────────
-- IBCLC-authored templates; rows are read-only at runtime.
-- Service-role only (no client access).

CREATE TABLE insight_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name        text NOT NULL,
  context_variant     text NOT NULL,       -- e.g. "exclusive_pumping_early"
  clinical_context    text NOT NULL,       -- background the AI needs
  acceptable_actions  text[] NOT NULL DEFAULT '{}',
  forbidden_phrases   text[] NOT NULL DEFAULT '{}',
  tone                text NOT NULL,
  severity            insight_severity NOT NULL,
  professional_deference insight_deference NOT NULL DEFAULT 'none',
  example_output      text NOT NULL,       -- Katie's gold-standard copy
  postpartum_stage    postpartum_stage_enum NOT NULL DEFAULT 'any',
  applicable_contexts text[] NOT NULL DEFAULT '{}',
  skip_for_contexts   text[] NOT NULL DEFAULT '{}',
  trigger_notes       text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_name, context_variant)
);

-- Unique index so the edge function can fetch exactly one row
CREATE INDEX idx_templates_pattern ON insight_templates (pattern_name, context_variant, is_active);

-- RLS: no client access — service role only
ALTER TABLE insight_templates ENABLE ROW LEVEL SECURITY;
-- (No policies = blocked for all JWT roles; service key bypasses RLS)

-- ── 3. insight_cache ─────────────────────────────────────
-- One cached generation per (user, pattern, context_variant) per day.

CREATE TABLE insight_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_name    text NOT NULL,
  context_variant text NOT NULL,
  generated_text  text NOT NULL,
  dismissed       boolean NOT NULL DEFAULT false,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id, pattern_name, context_variant)
);

CREATE INDEX idx_cache_user_active ON insight_cache (user_id, expires_at, dismissed);

-- RLS: users can only see / update their own cache rows
ALTER TABLE insight_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cache_select_own" ON insight_cache
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cache_insert_own" ON insight_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cache_update_own" ON insight_cache
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "cache_delete_own" ON insight_cache
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. notifications_content ─────────────────────────────
-- Encouraging push-notification copy. Read by the scheduler.
-- Service-role only (same as templates).

CREATE TABLE notifications_content (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL CHECK (category IN ('affirmation', 'milestone', 'check_in')),
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_category ON notifications_content (category, is_active);

ALTER TABLE notifications_content ENABLE ROW LEVEL SECURITY;
-- No policies = service role only

-- ── 5. Auto-update updated_at ────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON insight_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
