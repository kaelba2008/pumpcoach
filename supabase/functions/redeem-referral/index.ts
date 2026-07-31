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

async function grantPromoDays(rcUserId: string, days: number): Promise<void> {
  // Use an explicit end_time_ms rather than the "duration" enum so each code
  // can grant an exact number of days (e.g. 14, 60) instead of only the
  // fixed weekly/monthly/etc. buckets. Note: repeated grants REPLACE the
  // expiration rather than stacking it, per RevenueCat's API.
  const endTimeMs = Date.now() + days * 24 * 60 * 60 * 1000;
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}/entitlements/${RC_ENTITLEMENT}/promotional`,
    {
      method:  "POST",
      headers: {
        "Authorization":  `Bearer ${RC_SECRET_KEY}`,
        "Content-Type":   "application/json",
        "X-Platform":     "ios",
      },
      body: JSON.stringify({ end_time_ms: endTimeMs }),
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

    const normalizedCode = code.trim().toUpperCase();

    // ── Path 1: admin promo codes (no referrer) ───────────────────────────────
    const { data: promoRow } = await admin
      .from("promo_codes")
      .select("code, reward_days, max_uses, use_count, expires_at")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (promoRow) {
      // Check expiry
      if (promoRow.expires_at && new Date(promoRow.expires_at) < new Date()) {
        return json({ error: "This code has expired" }, 400);
      }
      // Check max uses
      if (promoRow.max_uses !== null && promoRow.use_count >= promoRow.max_uses) {
        return json({ error: "This code has reached its usage limit" }, 400);
      }
      // Check if user already redeemed this promo
      const { data: existingPromo } = await admin
        .from("promo_uses")
        .select("id")
        .eq("code", normalizedCode)
        .eq("used_by", newUserId)
        .maybeSingle();
      if (existingPromo) return json({ error: "You have already redeemed this code" }, 400);

      // Record use
      const { error: promoInsertErr } = await admin
        .from("promo_uses")
        .insert({ code: normalizedCode, used_by: newUserId });
      if (promoInsertErr) return json({ error: "Failed to record redemption" }, 500);

      // Increment use_count
      await admin.from("promo_codes").update({ use_count: promoRow.use_count + 1 }).eq("code", normalizedCode);

      // Grant trial days
      const days = (promoRow.reward_days as number) ?? 30;
      const errors: string[] = [];
      await grantPromoDays(newUserId, days).catch((e) => errors.push(e.message));
      return json({ success: true, trial_days: days, rcErrors: errors.length ? errors : undefined });
    }

    // ── Path 2: user referral codes ───────────────────────────────────────────
    const { data: codeRow, error: codeErr } = await admin
      .from("referral_codes")
      .select("id, user_id, reward_days")
      .eq("code", normalizedCode)
      .single();

    if (codeErr || !codeRow) return json({ error: "Code not found" }, 404);
    if (codeRow.user_id === newUserId) return json({ error: "You cannot use your own referral code" }, 400);

    // Check the caller hasn't already redeemed a referral code
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

    // Grant premium to both users — don't fail the whole request if RC is down
    const referrerId = codeRow.user_id as string;
    const rewardDays = (codeRow.reward_days as number) ?? 7;
    const errors: string[] = [];

    await grantPromoDays(newUserId, rewardDays).catch((e) => errors.push(e.message));
    await grantPromoDays(referrerId, rewardDays).catch((e) => errors.push(e.message));

    // Mark rewarded_at
    await admin
      .from("referral_uses")
      .update({ rewarded_at: new Date().toISOString() })
      .eq("code_id", codeRow.id)
      .eq("used_by", newUserId);

    return json({ success: true, trial_days: rewardDays, rcErrors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("redeem-referral error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
