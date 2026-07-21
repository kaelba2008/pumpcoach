/**
 * generate-insight — Supabase Edge Function
 * Session 5 Part 3
 *
 * Receives a pattern_name + context_variant + context_data from the client,
 * fetches the matching template from insight_templates (service role),
 * calls the Claude API with a constrained prompt, validates the output
 * against forbidden phrases, and returns the generated text.
 *
 * The client is responsible for caching the result in insight_cache.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY  = Deno.env.get("ANTHROPIC_API_KEY")  ?? "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")        ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN      = Deno.env.get("ALLOWED_ORIGIN")      ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// No-guilt principle — appended to every system prompt
const NO_GUILT_INSTRUCTION = `
This app should never make a mom feel guilty, judged, or like she is failing.
When surfacing a pattern that could be interpreted as negative, always acknowledge
that life happens, that one gap or one low session does not define her supply,
and that consistency over time matters more than perfection in any single session.
The goal is to inform and encourage, never to alarm or shame.`.trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth check ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not set");
      return json({ error: "AI service not configured" }, 500);
    }

    // ── Parse request ────────────────────────────────────────
    const { pattern_name, context_variant, context_data } = await req.json() as {
      pattern_name: string;
      context_variant: string;
      context_data: Record<string, string | number>;
    };

    if (!pattern_name || !context_variant) {
      return json({ error: "pattern_name and context_variant required" }, 400);
    }

    // ── Fetch template (service role bypasses RLS) ───────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: template, error: dbErr } = await admin
      .from("insight_templates")
      .select("*")
      .eq("pattern_name", pattern_name)
      .eq("context_variant", context_variant)
      .eq("is_active", true)
      .single();

    if (dbErr || !template) {
      console.error("Template not found:", pattern_name, context_variant, dbErr);
      return json({ error: "Template not found", fallback: true }, 404);
    }

    // ── Build context_data substitution string ───────────────
    const dataLines = Object.entries(context_data)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");

    // ── System prompt ────────────────────────────────────────
    const systemPrompt = `You are a warm, knowledgeable IBCLC (International Board Certified Lactation Consultant) named Katie Clark, writing a personalized insight for a breastfeeding or pumping mother inside the Pump Coach app.

CLINICAL CONTEXT:
${template.clinical_context}

TONE: ${template.tone}
SEVERITY: ${template.severity}
PROFESSIONAL DEFERENCE LEVEL: ${template.professional_deference}

WHAT YOU MAY SUGGEST:
${(template.acceptable_actions as string[]).map((a: string) => `- ${a}`).join("\n")}

FORBIDDEN — never say or imply these things:
${(template.forbidden_phrases as string[]).map((p: string) => `- "${p}"`).join("\n")}

EXAMPLE OUTPUT (your gold standard — match this tone, length, and style exactly):
"""
${template.example_output}
"""

ADDITIONAL RULES:
- Write in plain prose. No markdown, no asterisks, no bullet points, no headers, no em dashes.
- No exclamation points unless the pattern severity is celebratory.
- Never start with a compliment, greeting, or filler phrase like "Certainly" or "Great question."
- Write 3-5 sentences maximum. Match the length of the example output above.
- Personalize with the specific numbers from the user's data (provided below).
- End with a professional deference note if the severity is "needs_attention" or deference is "strong" or "moderate."
- ${NO_GUILT_INSTRUCTION}`;

    // ── User message ─────────────────────────────────────────
    const userMessage = `Here is this mom's pumping data relevant to this pattern:
${dataLines || "  (no additional data)"}

Write a personalized insight for her now, based on her data and the example output above. Use her specific numbers where applicable.`;

    // ── Call Claude ──────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-5",
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Anthropic error:", claudeRes.status, err);
      // Fall back to example output
      return json({
        text: template.example_output,
        source: "fallback",
      }, 200);
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text ?? "";

    // ── Validation: forbidden phrases ────────────────────────
    const forbidden = template.forbidden_phrases as string[];
    const lower = rawText.toLowerCase();
    const violation = forbidden.find(p => lower.includes(p.toLowerCase()));

    if (violation || rawText.trim().length < 30) {
      console.warn("Forbidden phrase detected or output too short. Falling back.", violation);
      return json({
        text: template.example_output,
        source: "fallback",
      }, 200);
    }

    // ── Strip any accidental markdown ────────────────────────
    const cleaned = rawText
      .replace(/[*#_~`]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return json({ text: cleaned, source: "ai" }, 200);

  } catch (e) {
    console.error("generate-insight error:", e);
    return json({ error: "Internal error" }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
