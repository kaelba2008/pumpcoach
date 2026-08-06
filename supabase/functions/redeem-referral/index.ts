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

// RevenueCat's "duration" enum technically has a "lifetime" value, but its
// current behavior is inconsistently documented (possibly deprecated). Safer
// to reuse the same end_time_ms mechanism we know works and just set it far
// enough out (100 years) that it's functionally permanent.
const LIFETIME_DAYS = 100 * 365;

async function ensureSubscriberExists(rcUserId: string): Promise<void> {
  // The promotional-grant endpoint 404s ("subscriber was not found") for any
  // app_user_id RevenueCat hasn't seen before — which normally only happens
  // once the client SDK calls Purchases.logIn() at least once. A code
  // redemption shouldn't depend on that having already happened (e.g. the
  // client SDK failing to configure, like the Android key bug that caused
  // this). A plain GET on the subscriber record creates it as a side effect
  // if it doesn't exist yet, per RevenueCat's API — call this first so the
  // grant below always has a subscriber to attach to.
  await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`,
    { headers: { "Authorization": `Bearer ${RC_SECRET_KEY}` } }
  );
}

async function grantPromoDays(rcUserId: string, days: number): Promise<void> {
  await ensureSubscriberExists(rcUserId);

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

    // ── Rate limit ──────────────────────────────────────────
    // Promo codes are short, human-readable strings (e.g. "TBMCLIENT") --
    // without a limit, a single account could brute-force guess codes.
    // 10 attempts/hour is generous for typos, tight enough to make
    // guessing impractical.
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_user_id: newUserId,
      p_action: "redeem-referral",
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (allowed === false) {
      return json({ error: "Too many attempts. Please try again in a bit." }, 429);
    }

    const normalizedCode = code.trim().toUpperCase();

    // ── Path 1: admin promo codes (no referrer) ───────────────────────────────
    const { data: promoRow } = await admin
      .from("promo_codes")
      .select("code, reward_days, max_uses, use_count, expires_at, is_lifetime")
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

      // Grant FIRST — the RevenueCat call is the part that actually gives
      // the user anything. Recording the code as "used" before confirming
      // this succeeds would permanently burn the code on a failed grant,
      // with no way to retry and no visible error (this is exactly what
      // happened to real accounts before this fix).
      const isLifetime = promoRow.is_lifetime === true;
      const days = isLifetime ? LIFETIME_DAYS : (promoRow.reward_days as number) ?? 30;
      try {
        await grantPromoDays(newUserId, days);
      } catch (e) {
        console.error(`RC promotional grant failed for ${newUserId} (code ${normalizedCode}):`, e);
        return json({ error: "Could not activate access right now. Please try again in a moment." }, 502);
      }

      // Record use — only after the grant actually succeeded
      const { error: promoInsertErr } = await admin
        .from("promo_uses")
        .insert({ code: normalizedCode, used_by: newUserId });
      if (promoInsertErr) console.error("promo_uses insert failed after successful RC grant:", promoInsertErr);

      // Increment use_count
      await admin.from("promo_codes").update({ use_count: promoRow.use_count + 1 }).eq("code", normalizedCode);

      return json({ success: true, trial_days: days, lifetime: isLifetime });
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

    // Grant the redeeming user FIRST, same reasoning as the promo path above —
    // recording the use before confirming the grant succeeded would burn the
    // user's one-time referral redemption with nothing to show for it.
    const referrerId = codeRow.user_id as string;
    const rewardDays = (codeRow.reward_days as number) ?? 7;
    try {
      await grantPromoDays(newUserId, rewardDays);
    } catch (e) {
      console.error(`RC promotional grant failed for ${newUserId} (referral ${normalizedCode}):`, e);
      return json({ error: "Could not activate access right now. Please try again in a moment." }, 502);
    }

    // Record the use — only after the redeeming user's grant succeeded
    const { error: insertErr } = await admin
      .from("referral_uses")
      .insert({ code_id: codeRow.id, used_by: newUserId });
    if (insertErr) console.error("referral_uses insert failed after successful RC grant:", insertErr);

    // Referrer's reward is a bonus on top of an already-successful redemption —
    // don't fail the caller's response over it, but log so it doesn't go unnoticed.
    await grantPromoDays(referrerId, rewardDays).catch((e) =>
      console.error(`RC promotional grant failed for referrer ${referrerId}:`, e)
    );

    // Mark rewarded_at
    await admin
      .from("referral_uses")
      .update({ rewarded_at: new Date().toISOString() })
      .eq("code_id", codeRow.id)
      .eq("used_by", newUserId);

    return json({ success: true, trial_days: rewardDays });
  } catch (e) {
    console.error("redeem-referral error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
