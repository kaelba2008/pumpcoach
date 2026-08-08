/**
 * issue-reports — Supabase Edge Function
 *
 * Internal admin tool only, never called from the app. Lists submitted
 * "Report an issue" rows, newest first -- a backstop for reading reports
 * even if the accompanying email (opened on the reporter's own device via
 * MailComposer) never actually got sent.
 *
 * Auth: the same ADMIN_REPORT_KEY secret used by affiliate-report,
 * checked via the x-admin-key header. Deliberately NOT a user JWT check --
 * this has no caller other than an operator running it directly, and it
 * returns other users' data, so it must never be reachable by a normal
 * app session. Deploy with --no-verify-jwt.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_REPORT_KEY = Deno.env.get("ADMIN_REPORT_KEY") ?? "";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ADMIN_REPORT_KEY || req.headers.get("x-admin-key") !== ADMIN_REPORT_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: reports, error } = await admin
      .from("issue_reports")
      .select("id, user_id, message, app_version, runtime_version, platform, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return json({ error: error.message }, 500);

    const userIds = (reports ?? []).map(r => r.user_id);
    const { data: profileRows } = userIds.length
      ? await admin.from("profiles").select("id, email, display_name").in("id", userIds)
      : { data: [] as { id: string; email: string | null; display_name: string | null }[] };
    const profileById = new Map((profileRows ?? []).map(p => [p.id, p]));

    const rows = (reports ?? []).map(r => {
      const profile = profileById.get(r.user_id);
      return {
        submitted_at:    r.created_at,
        email:           profile?.email ?? null,
        display_name:    profile?.display_name ?? null,
        message:         r.message,
        platform:        r.platform,
        app_version:     r.app_version,
        runtime_version: r.runtime_version,
      };
    });

    return json({ total: rows.length, rows });
  } catch (e) {
    console.error("issue-reports error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
