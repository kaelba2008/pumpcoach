/**
 * Insight Generation Service — Session 5 Part 3
 * Client-side wrapper around the generate-insight edge function.
 * Handles caching (read + write) via insight_cache table.
 */

import { supabase } from "./supabase";
import type { DetectedPattern } from "./patternDetection";

export interface GeneratedInsight {
  text: string;
  pattern_name: string;
  context_variant: string;
  source: "ai" | "fallback" | "cache";
  cached_at: string;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function readCache(
  userId: string,
  patternName: string,
  contextVariant: string,
): Promise<GeneratedInsight | null> {
  const { data } = await supabase
    .from("insight_cache")
    .select("generated_text, generated_at")
    .eq("user_id", userId)
    .eq("pattern_name", patternName)
    .eq("context_variant", contextVariant)
    .eq("dismissed", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;

  return {
    text: data.generated_text,
    pattern_name: patternName,
    context_variant: contextVariant,
    source: "cache",
    cached_at: data.generated_at,
  };
}

async function writeCache(
  userId: string,
  patternName: string,
  contextVariant: string,
  text: string,
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await supabase
    .from("insight_cache")
    .upsert(
      {
        user_id:        userId,
        pattern_name:   patternName,
        context_variant: contextVariant,
        generated_text: text,
        dismissed:      false,
        generated_at:   new Date().toISOString(),
        expires_at:     expiresAt.toISOString(),
      },
      { onConflict: "user_id,pattern_name,context_variant" },
    );
}

/** Mark an insight as dismissed so a fresh one can generate next time */
export async function dismissInsight(
  userId: string,
  patternName: string,
  contextVariant: string,
): Promise<void> {
  await supabase
    .from("insight_cache")
    .update({ dismissed: true })
    .eq("user_id", userId)
    .eq("pattern_name", patternName)
    .eq("context_variant", contextVariant);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fetches or generates the AI insight for the detected pattern.
 *
 * Flow:
 *   1. Check insight_cache — return cached text if fresh & not dismissed.
 *   2. Call generate-insight edge function.
 *   3. Write result to cache.
 *   4. Return text.
 *
 * Never throws — returns null on unrecoverable failure so callers can
 * fall back to static/hardcoded copy.
 */
export async function getOrGenerateInsight(
  userId: string,
  pattern: DetectedPattern,
  /** Force fresh generation even if cache is valid */
  forceRefresh = false,
): Promise<GeneratedInsight | null> {
  const { pattern_name, context_variant, context_data } = pattern;

  // 1. Cache read
  if (!forceRefresh) {
    const cached = await readCache(userId, pattern_name, context_variant);
    if (cached) return cached;
  }

  // 2. Call edge function (requires auth session)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await supabase.functions.invoke("generate-insight", {
      body: { pattern_name, context_variant, context_data },
    });

    if (res.error) {
      console.error("generate-insight invoke error:", res.error);
      return null;
    }

    const { text, source } = res.data as { text: string; source: "ai" | "fallback" };
    if (!text) return null;

    // 3. Cache write
    await writeCache(userId, pattern_name, context_variant, text);

    return {
      text,
      pattern_name,
      context_variant,
      source: source ?? "ai",
      cached_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("getOrGenerateInsight error:", err);
    return null;
  }
}
