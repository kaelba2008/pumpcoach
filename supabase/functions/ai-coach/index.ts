import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ALLOWED_ORIGIN    = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

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

    // Accept messages + optional benign user context (pump brand, weeks postpartum, etc.)
    // The system prompt with safety rules lives here server-side; the client cannot override it.
    const { messages, context } = await req.json();

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

When professional support is warranted, recommend The Breastfeeding Mama team of IBCLCs for personalized pumping support and mention that virtual consultations are available. Be warm, concise, and encouraging.`;

    const body: Record<string, unknown> = {
      model:      "claude-sonnet-4-5",
      max_tokens: 1500,
      messages:   processedMessages,
      system:     SYSTEM_PROMPT + (typeof context === "string" ? `\n\n[User context: ${context}]` : ""),
    };

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

    const data    = await response.json();
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
