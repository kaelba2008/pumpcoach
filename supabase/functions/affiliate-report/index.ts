/**
 * affiliate-report — Supabase Edge Function
 *
 * Internal admin tool only, never called from the app. Given a promo code
 * (e.g. "TWINMOMGUIDE"), returns everyone who's redeemed it and whether
 * they've since become a real paying subscriber (as opposed to still
 * being on the promotional grant) -- for crediting affiliates.
 *
 * Auth: a dedicated ADMIN_REPORT_KEY secret, checked via the x-admin-key
 * header. Deliberately NOT a user JWT check -- this has no caller other
 * than an operator running it directly, and it returns other users'
 * subscription status, so it must never be reachable by a normal app
 * session. Deploy with --no-verify-jwt (no ordinary Supabase auth token
 * is involved at all).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RC_SECRET_KEY     = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";
const RC_ENTITLEMENT    = Deno.env.get("RC_PREMIUM_ENTITLEMENT_ID") ?? "premium";
const ADMIN_REPORT_KEY  = Deno.env.get("ADMIN_REPORT_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RcSubscription {
  store: string;
  expires_date: string | null;
  purchase_date: string;
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date: string | null; product_identifier: string }>;
    subscriptions?: Record<string, RcSubscription>;
  };
}

async function checkConversion(appUserId: string): Promise<{
  hasEverPaid: boolean;
  currentlyPaying: boolean;
  activeEntitlement: boolean;
}> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { "Authorization": `Bearer ${RC_SECRET_KEY}` } }
  );
  if (!res.ok) {
    // No RevenueCat record at all (e.g. never opened the paywall) -- not
    // an error, just means no conversion data exists yet.
    return { hasEverPaid: false, currentlyPaying: false, activeEntitlement: false };
  }
  const data = await res.json() as RcSubscriberResponse;
  const subs = data.subscriber?.subscriptions ?? {};
  const now = Date.now();

  let hasEverPaid = false;
  let currentlyPaying = false;
  for (const sub of Object.values(subs)) {
    if (sub.store === "promotional") continue;
    hasEverPaid = true;
    const expiresMs = sub.expires_date ? new Date(sub.expires_date).getTime() : null;
    if (expiresMs === null || expiresMs > now) currentlyPaying = true;
  }

  const entitlement = data.subscriber?.entitlements?.[RC_ENTITLEMENT];
  const activeEntitlement = !!entitlement &&
    (entitlement.expires_date === null || new Date(entitlement.expires_date).getTime() > now);

  return { hasEverPaid, currentlyPaying, activeEntitlement };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ADMIN_REPORT_KEY || req.headers.get("x-admin-key") !== ADMIN_REPORT_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { code } = await req.json() as { code?: string };
    if (!code || typeof code !== "string") return json({ error: "code is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // promo_uses.used_by references auth.users, not profiles, so
    // PostgREST can't auto-join -- fetch profiles separately.
    const { data: uses, error } = await admin
      .from("promo_uses")
      .select("used_by, redeemed_at")
      .eq("code", code.trim().toUpperCase())
      .order("redeemed_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);

    const userIds = (uses ?? []).map(u => u.used_by);
    const { data: profileRows } = userIds.length
      ? await admin.from("profiles").select("id, email, display_name").in("id", userIds)
      : { data: [] as { id: string; email: string | null; display_name: string | null }[] };
    const profileById = new Map((profileRows ?? []).map(p => [p.id, p]));

    const rows = await Promise.all((uses ?? []).map(async (u) => {
      const conversion = await checkConversion(u.used_by);
      const profile = profileById.get(u.used_by);
      return {
        email:            profile?.email ?? null,
        display_name:     profile?.display_name ?? null,
        redeemed_at:      u.redeemed_at,
        currently_paying: conversion.currentlyPaying,
        has_ever_paid:    conversion.hasEverPaid,
        active_entitlement: conversion.activeEntitlement,
      };
    }));

    return json({
      code: code.trim().toUpperCase(),
      total_redemptions: rows.length,
      converted_count: rows.filter(r => r.currently_paying).length,
      rows,
    });
  } catch (e) {
    console.error("affiliate-report error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
