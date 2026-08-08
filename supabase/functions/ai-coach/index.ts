import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY   = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ALLOWED_ORIGIN      = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the JWT against Supabase — format-only check is not enough
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${token}`, "apikey": supabaseKey },
    });
    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authedUser = await authRes.json();

    // ── Rate limit ──────────────────────────────────────────
    // 30 messages/hour per user comfortably covers a real coaching
    // conversation while stopping automated/abusive spend against the
    // Anthropic API.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_user_id: authedUser.id,
      p_action: "ai-coach",
      p_limit: 30,
      p_window_seconds: 3600,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Too many messages. Please try again in a bit." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept messages + optional benign user context (pump brand, weeks postpartum, etc.)
    // The system prompt with safety rules lives here server-side; the client cannot override
    // it with arbitrary text. `mode` selects between a small, fixed set of server-defined
    // prompts (not a free-text override) — this is how a trusted first-party caller like the
    // flange analyzer gets a different, known-good system prompt without reopening the
    // prompt-injection hole this design was built to close.
    const { messages, context, mode } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const processedMessages = messages.slice(-20);

    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY secret is not set");
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SYSTEM_PROMPT = `You are Pump Coach, a warm and knowledgeable AI pumping companion created for The Breastfeeding Mama (thebreastfeedingmama.com) by Katie Clark, IBCLC. Your coaching is grounded in Katie's evidence-based approach from The Pumping Playbook.

HARD LIMITS — never cross these, ever:
- NEVER diagnose a medical condition (mastitis, thrush, tongue tie, etc.)
- NEVER provide emergency or urgent clinical instructions
- NEVER contradict advice a user's doctor, midwife, or IBCLC has given them
- NEVER tell a user to stop, start, or change a medication or medical treatment
- NEVER tell a user their baby is or isn't getting enough — that requires a clinical weight check
- If a message contains ANY of: fever, severe pain, blood in milk, infant not feeding, significant weight loss, signs of mastitis or abscess — your ONLY response is: "Please contact your healthcare provider or seek medical care right away. This isn't something I can safely help with." Do not add tips, reassurance, or further guidance after that sentence.
- NEVER claim you will relay, report, or pass along feedback, bugs, or requests to Katie or "the team" — you have no ability to do that, and saying so is a false promise. If a user reports something broken or wants to give feedback, tell them to go to Profile → "Report an issue" so it's actually seen.

When professional support is warranted, recommend The Breastfeeding Mama team of IBCLCs for personalized pumping support and mention that virtual consultations are available. Be warm, concise, and encouraging.`;

    const FLANGE_FIT_SYSTEM_PROMPT = `
You are assessing flange fit using the Pump Coach CARE Check framework.
CARE = Comfort · Alignment · Release · Emptying

C — COMFORT: Pumping should feel like nothing or a very gentle tug.
    Signs of too small: pinching, burning, stinging, nipple tip soreness, blanching (nipple turns white after removal), ridging or creasing of nipple after removal.
    Signs of too large: deep breast aching or pulling sensation felt inside the breast.

A — ALIGNMENT: The nipple should be centered in the tunnel with the sides lightly touching the walls.
    There should be a slight, rhythmic back-and-forth motion — only the nipple, not the areola.
    Too large: lots of space around the nipple, areola being pulled in, nipple moves side-to-side excessively.
    Too small: nipple fills the entire tunnel wall-to-wall with no clearance, barely any movement.

R — RELEASE: Milk should spray in streams, not drip.
    Good fit supports a quick let-down (within ~2 minutes) and consistent flow throughout the session.
    Poor fit or suction issues may cause slow or absent let-down, dripping instead of spraying, or flow that stops and starts.

E — EMPTYING: A good fit maximizes milk removal and directly supports supply.
    Breasts should feel soft and well-drained after a full session.
    If breasts feel full or lumpy after pumping, the flange may be too small and not emptying well.
    Declining output over time warrants a fit re-assessment.

Sizing guidance:
- Measure nipple diameter at the TIP (the widest point of the nipple itself — not the base, not the areola) in mm
- Regular/rigid flanges: starting size = nipple tip diameter (no addition needed)
- Soft inserts (Pumpin' Pals, Maymom, Legendairy Milk): starting size = nipple tip diameter + 1–2mm
- Sizes range from 9mm to 40mm depending on brand
- Always apply the correct rule based on whether the user uses a regular flange or soft inserts

Many people need a different flange size on each breast — breasts are often asymmetrical. The user may report a different current size (and different nipple diameter) for each side. Always return a recommended_size_mm_right AND a recommended_size_mm_left, even when you'd give the same number for both — never assume one side's answer applies to the other. If the user's answers indicate this assessment is really about one specific side's comfort/alignment/release/emptying, tailor the CARE breakdown and explanation to that side, but still fill in both recommended sizes using whatever measurements were given for each.

The ideal fit: only the nipple enters the tunnel, sides lightly touch the walls, slight back-and-forth motion, milk sprays in streams, 15–20 min sessions, comfortable throughout.

Always respond warmly and non-alarmingly. This is informational guidance, not clinical care.
Recommend working with a certified IBCLC for in-person confirmation.

The user has completed the Pump Coach CARE Check questionnaire. Using only their self-reported answers — comfort symptoms, nipple alignment observation, milk release pattern, emptying satisfaction, and pump/size measurements — provide a thorough flange fit assessment. Be specific about which answers drove your conclusions. Do not reference visual observations or anything you cannot know from their answers alone.

Call the flange_fit_assessment tool with your assessment. Do not respond with plain text.`;

    const isFlangeCheck = mode === "flange_fit_check";

    const body: Record<string, unknown> = {
      model:      "claude-sonnet-4-5",
      max_tokens: 1500,
      messages:   processedMessages,
      system:     isFlangeCheck
        ? FLANGE_FIT_SYSTEM_PROMPT
        : SYSTEM_PROMPT + (typeof context === "string" ? `\n\n[User context: ${context}]` : ""),
    };

    // Structured output via forced tool-use, rather than asking the model to
    // emit JSON inside plain text and regex-extracting it client-side — the
    // latter is what silently broke before: this mode's dedicated system
    // prompt wasn't being sent at all (server always used the generic chat
    // prompt), so the model replied in prose with no JSON in it whatsoever.
    // Forcing a tool call makes "the response isn't parseable" structurally
    // impossible instead of just less likely.
    if (isFlangeCheck) {
      body.tools = [{
        name: "flange_fit_assessment",
        description: "Structured CARE Check flange fit assessment",
        input_schema: {
          type: "object",
          properties: {
            assessment:                 { type: "string", enum: ["likely_too_small", "likely_too_large", "likely_good_fit", "unclear"] },
            recommended_size_mm_right:  { type: ["number", "null"], description: "Recommended size in mm for the right side, using whatever right-side measurements were given" },
            recommended_size_mm_left:   { type: ["number", "null"], description: "Recommended size in mm for the left side, using whatever left-side measurements were given" },
            confidence:                 { type: "string", enum: ["high", "medium", "low"] },
            care_c:                     { type: "string", description: "1 sentence on Comfort based on their answers" },
            care_a:                     { type: "string", description: "1 sentence on Alignment based on their answers" },
            care_r:                     { type: "string", description: "1 sentence on Release based on their answers" },
            care_e:                     { type: "string", description: "1 sentence on Emptying based on their answers" },
            explanation:                { type: "string", description: "2-3 warm sentences summarizing overall finding" },
            tips:                       { type: "array", items: { type: "string" } },
            see_ibclc:                  { type: "boolean" },
          },
          required: ["assessment", "recommended_size_mm_right", "recommended_size_mm_left", "confidence", "care_c", "care_a", "care_r", "care_e", "explanation", "tips", "see_ibclc"],
        },
      }];
      body.tool_choice = { type: "tool", name: "flange_fit_assessment" };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", response.status, err);
      // Return the actual Anthropic error so the client can surface it
      let detail = "AI service error";
      try { detail = JSON.parse(err)?.error?.message ?? detail; } catch {}
      return new Response(JSON.stringify({ error: detail }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    if (isFlangeCheck) {
      const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
      if (!toolUse) {
        console.error("Flange fit check: no tool_use block in response", JSON.stringify(data));
        return new Response(JSON.stringify({ error: "AI service did not return a structured assessment" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ result: toolUse.input }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = data.content?.[0]?.text ?? "";

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
