import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")             ?? "";
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RC_SECRET_KEY       = Deno.env.get("REVENUECAT_SECRET_KEY")     ?? "";
const RC_ENTITLEMENT      = Deno.env.get("RC_PREMIUM_ENTITLEMENT_ID") ?? "premium";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function grantPromoWeek(rcUserId: string): Promise<void> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}/entitlements/${RC_ENTITLEMENT}/promotional`,
    {
      method:  "POST",
      headers: {
        "Authorization":  `Bearer ${RC_SECRET_KEY}`,
        "Content-Type":   "application/json",
        "X-Platform":     "ios",
      },
      body: JSON.stringify({ duration: "weekly" }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RC promotional grant failed for ${rcUserId}: ${txt}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Authenticate the caller
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ error: "Invalid token" }, 401);

    const newUserId = user.id;

    const { code } = await req.json() as { code?: string };
    if (!code || typeof code !== "string") return json({ error: "code is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up the referral code
    const { data: codeRow, error: codeErr } = await admin
      .from("referral_codes")
      .select("id, user_id")
      .eq("code", code.trim().toUpperCase())
      .single();

    if (codeErr || !codeRow) return json({ error: "Code not found" }, 404);
    if (codeRow.user_id === newUserId) return json({ error: "You cannot use your own referral code" }, 400);

    // Check the caller hasn't already redeemed a code
    const { data: existing } = await admin
      .from("referral_uses")
      .select("id")
      .eq("used_by", newUserId)
      .maybeSingle();

    if (existing) return json({ error: "You have already used a referral code" }, 400);

    // Record the use
    const { error: insertErr } = await admin
      .from("referral_uses")
      .insert({ code_id: codeRow.id, used_by: newUserId });

    if (insertErr) return json({ error: "Failed to record referral" }, 500);

    // Grant 7 days premium to both users — don't fail the whole request if RC is down
    const referrerId = codeRow.user_id as string;
    const errors: string[] = [];

    await grantPromoWeek(newUserId).catch((e) => errors.push(e.message));
    await grantPromoWeek(referrerId).catch((e) => errors.push(e.message));

    // Mark rewarded_at
    await admin
      .from("referral_uses")
      .update({ rewarded_at: new Date().toISOString() })
      .eq("code_id", codeRow.id)
      .eq("used_by", newUserId);

    return json({ success: true, rcErrors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("redeem-referral error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
