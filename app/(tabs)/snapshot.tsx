import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Alert, Linking, Modal, TextInput, KeyboardAvoidingView, Platform, Share,
} from "react-native";
import * as MailComposer from "expo-mail-composer";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format, subDays, differenceInDays, differenceInHours, startOfDay } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF, GRADIENTS } from "../../lib/constants";
import { fmtOz } from "../../lib/formatters";
import { primaryBaby } from "../../lib/babies";
import { PumpSession, StashEntry, ViewerAccount, NursingSession } from "../../types";
import { PremiumTeaser } from "../../components/ui/PremiumTeaser";
import { computeSupplyTrend, computeValueTrend } from "../../lib/patternDetection";

// ─── Types ────────────────────────────────────────────────────────────────────

type SupplyStatus = "improving" | "stable" | "slight_dip" | "inconsistent";
type GuidanceLevel = "stay_the_course" | "monitor" | "consider_adjustments";

interface PostpartumStage {
  days: number;
  label: string;
  normalRange: string;
  context: string;
  reassurance: string;
}

interface SupplyIntelligence {
  todayOz: number;
  rolling24hOz: number;
  avg7dayPerDay: number;
  avg7dayPerSession: number;
  // Combo feeders pump less on days they also nurse — blending those
  // sessions into pump-only days' sessions produces one number that
  // under-represents both. Only set (non-null) when there is real data on
  // both sides of the split in the 7-day window; null means "not enough
  // data to split honestly," and callers should fall back to
  // avg7dayPerSession.
  avg7daySessionPumpOnly: number | null;
  avg7daySessionNursingDay: number | null;
  // Total oz pumped in the last 24h, divided by 24 — a stable rate (fixed
  // denominator, unlike a per-session extrapolation) useful for confirming
  // output holds steady through a session-count change. Null below the
  // reliability threshold. Nursing sessions count toward that threshold
  // (a combo feeder removing milk 6x/day via nursing+pumping has a
  // trustworthy number even with few pump sessions) but are not, and
  // cannot be, added into the oz numerator — nursing volume isn't
  // quantified.
  hourlyRate: number | null;
  hourlyRateNursingCount: number;
  sessionCountToday: number;
  sessionCount7day: number;
  sessionsPerDay7day: number;
  consistencyScore: number;   // 0–100
  consistencyLabel: string;
  trend: "improving" | "stable" | "declining";
  supplyStatus: SupplyStatus;
  guidanceLevel: GuidanceLevel;
  painSessions: number;
  /** Visible trend, not just the old >40%-of-sessions hidden threshold —
   *  "improving" means comfort is getting better (pain level trending down). */
  painTrend: "improving" | "stable" | "worsening" | null;
  stashOz: number;
  goalOz: number | null;
  stage: PostpartumStage | null;
  flangeChange: FlangeChangeInsight | null;
}

interface FlangeChangeInsight {
  fromSizeMm: number;
  toSizeMm: number;
  changedAt: Date;
  avgOzBefore: number;
  avgOzAfter: number;
  pctChange: number;
}

// ─── Flange change → output correlation ────────────────────────────────────────
// Only meaningful going forward from when per-session flange tracking shipped —
// there's no historical record of what flange was used before that, so this
// can only detect changes made after a mom starts logging it (via the profile
// default or the in-session FlangePicker override).
function detectFlangeChange(sessions: { started_at: string; total_oz: number | null; flange_size_mm: number | null }[]): FlangeChangeInsight | null {
  const withFlange = sessions
    .filter((s) => s.flange_size_mm != null)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  if (withFlange.length < 6) return null;

  // Group into contiguous runs of the same flange size
  const runs: { sizeMm: number; sessions: typeof withFlange }[] = [];
  for (const s of withFlange) {
    const last = runs[runs.length - 1];
    if (last && last.sizeMm === s.flange_size_mm) {
      last.sessions.push(s);
    } else {
      runs.push({ sizeMm: s.flange_size_mm as number, sessions: [s] });
    }
  }
  if (runs.length < 2) return null; // no change ever recorded

  const afterRun = runs[runs.length - 1];
  const beforeRun = runs[runs.length - 2];
  // Enough sample on both sides that this isn't reacting to normal noise
  if (afterRun.sessions.length < 3 || beforeRun.sessions.length < 3) return null;

  const avg = (arr: typeof withFlange) => arr.reduce((s, x) => s + (x.total_oz ?? 0), 0) / arr.length;
  const avgOzBefore = avg(beforeRun.sessions);
  const avgOzAfter = avg(afterRun.sessions);
  const pctChange = avgOzBefore > 0 ? ((avgOzAfter - avgOzBefore) / avgOzBefore) * 100 : 0;

  return {
    fromSizeMm: beforeRun.sizeMm,
    toSizeMm: afterRun.sizeMm,
    changedAt: new Date(afterRun.sessions[0].started_at),
    avgOzBefore, avgOzAfter, pctChange,
  };
}

// ─── Postpartum stage logic ───────────────────────────────────────────────────

function getPostpartumStage(babyDob: string | null): PostpartumStage | null {
  if (!babyDob) return null;
  const days = differenceInDays(new Date(), new Date(babyDob));
  if (days < 0) return null;

  if (days <= 5) return {
    days, label: `Day ${days} postpartum`,
    normalRange: "colostrum transitioning to mature milk",
    context: "Your body is producing colostrum. Small amounts are completely normal and exactly what your baby needs right now. Milk typically comes in between days 3–5. Frequent pumping signals your body to build supply.",
    reassurance: "Output in these early days is measured in milliliters, not ounces. Every drop counts.",
  };

  if (days <= 14) return {
    days, label: `Day ${days} postpartum`,
    normalRange: "building toward 25–35 oz/day",
    context: "Milk is coming in and volume is rising quickly. This is the most important window for establishing long-term supply. Pumping 8–12 times per day, including overnight, sends the strongest supply signals.",
    reassurance: "Supply often feels unpredictable in week 2. This is normal, and your body is still calibrating.",
  };

  if (days <= 42) return {
    days, label: `${Math.floor(days / 7)} weeks postpartum`,
    normalRange: "typically 25–35 oz/day for full supply",
    context: "Supply is actively building. Consistency matters more than volume right now. Each session tells your body what to produce tomorrow. Missing sessions or long gaps can signal your body to produce less.",
    reassurance: "Day-to-day variation of 20–30% is completely normal at this stage. One low day is not a trend.",
  };

  if (days <= 90) return {
    days, label: `${Math.floor(days / 7)} weeks postpartum`,
    normalRange: "typically 24–32 oz/day, often stabilizing",
    context: "Supply is beginning to regulate. This is when many moms notice output becomes more predictable. Your body is transitioning from hormonal to demand-driven supply. Session frequency still drives volume.",
    reassurance: "A slight dip around 6–8 weeks is common as prolactin levels naturally shift. It usually resolves with consistent pumping.",
  };

  if (days <= 180) return {
    days, label: `${Math.floor(days / 30)} months postpartum`,
    normalRange: "20–30 oz/day is typical for established supply",
    context: "Supply is established and demand-driven. Your body has learned your pumping schedule. Consistency, hydration, and rest have the most influence at this stage. Small daily dips are almost always temporary.",
    reassurance: "Output naturally varies 15–25% day to day, even with an established supply. Context matters more than any single number.",
  };

  return {
    days, label: `${Math.floor(days / 30)} months postpartum`,
    normalRange: "output varies widely based on baby's needs and feeding schedule",
    context: "At this stage, supply is fully demand-driven and reflects your baby's intake. If your baby has started solids or feeds less frequently, a gradual reduction in output is expected and healthy.",
    reassurance: "Long-term pumping success is less about daily ounces and more about meeting your baby's needs consistently.",
  };
}

// ─── Supply intelligence computations ────────────────────────────────────────

function gapsBetween(sorted: PumpSession[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const hrs = differenceInHours(new Date(sorted[i].started_at), new Date(sorted[i - 1].started_at));
    if (hrs > 0 && hrs < 24) gaps.push(hrs);
  }
  return gaps;
}

function dailyCountsArray(sessions: PumpSession[]): number[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const k = s.started_at.slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.values());
}

function computeConsistency(
  sessions7: PumpSession[],
  sessions14: PumpSession[],
  accountCreatedAt: string,
): { score: number; label: string } {
  const pool = sessions14.length >= 3 ? sessions14 : sessions7;
  if (pool.length < 3) return { score: 0, label: "Not enough data" };

  const sorted7  = [...sessions7].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  const sorted14 = [...sessions14].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const accountAgeDays = (Date.now() - new Date(accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const hasPersonalHistory = accountAgeDays >= 7 && sessions14.length >= 7;

  const scoreLabel = (score: number) => ({
    score,
    label: score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Irregular",
  });

  if (hasPersonalHistory) {
    // ── Personal benchmarking (7+ days of history) ──────────────────────────
    // Establish baseline from 14-day window
    const gaps14 = gapsBetween(sorted14);
    if (gaps14.length < 2) return { score: 50, label: "Limited data" };

    const personalAvgGap = gaps14.reduce((s, g) => s + g, 0) / gaps14.length;
    const dailyCounts14 = dailyCountsArray(sessions14);
    const personalAvgSessions = dailyCounts14.reduce((s, v) => s + v, 0) / dailyCounts14.length;

    // Last 7-day performance vs personal baseline
    const gaps7 = gapsBetween(sorted7);
    if (gaps7.length < 2) return { score: 50, label: "Limited data" };

    const mean7 = gaps7.reduce((s, g) => s + g, 0) / gaps7.length;
    const variance7 = gaps7.reduce((s, g) => s + Math.pow(g - mean7, 2), 0) / gaps7.length;
    const cv7 = mean7 > 0 ? Math.sqrt(variance7) / mean7 : 0;

    const dailyCounts7 = dailyCountsArray(sessions7);
    const recentAvgSessions = dailyCounts7.reduce((s, v) => s + v, 0) / dailyCounts7.length;

    // Deviation from personal baseline (gap timing + session count)
    const gapDeviation = personalAvgGap > 0 ? Math.abs(mean7 - personalAvgGap) / personalAvgGap : 0;
    const sessionDeviation = personalAvgSessions > 0
      ? Math.abs(recentAvgSessions - personalAvgSessions) / personalAvgSessions
      : 0;
    const maxDeviation = Math.max(gapDeviation, sessionDeviation);

    // Score: penalize within-week variability; hard-cap if >25% off personal baseline
    let score = Math.round(Math.max(0, Math.min(100, 100 - cv7 * 70)));
    if (maxDeviation > 0.25) score = Math.min(score, 59);
    return scoreLabel(score);
  }

  // ── New user (<7 days): generic CV-based approach ──────────────────────────
  const gaps = gapsBetween(sorted14.length >= 3 ? sorted14 : sorted7);
  if (gaps.length < 2) return { score: 50, label: "Limited data" };

  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + Math.pow(g - mean, 2), 0) / gaps.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  return scoreLabel(Math.round(Math.max(0, Math.min(100, 100 - cv * 80))));
}


function computeSupplyStatus(
  rolling24h: number,
  avg7day: number,
  trend: "improving" | "stable" | "declining",
  consistencyScore: number,
): SupplyStatus {
  const ratio = avg7day > 0 ? rolling24h / avg7day : 1;

  if (trend === "improving" && consistencyScore >= 60) return "improving";
  if (consistencyScore < 40) return "inconsistent";
  if (ratio < 0.75 || trend === "declining") return "slight_dip";
  return "stable";
}

function computeGuidance(status: SupplyStatus, painSessions: number): GuidanceLevel {
  if (status === "improving" || status === "stable") {
    return painSessions > 2 ? "monitor" : "stay_the_course";
  }
  if (status === "inconsistent") return "monitor";
  return "consider_adjustments";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_CFG = {
  improving:    { color: COLORS.sage,   bg: "#F0FAF0", border: "#C8E6CB", icon: "↑", label: "Improving" },
  stable:       { color: COLORS.mauve,  bg: "#F9F0F4", border: "#C8D9DE", icon: "→", label: "Stable" },
  slight_dip:   { color: COLORS.amber,  bg: "#FDF5EE", border: "#F0DECA", icon: "↓", label: "Slight Dip" },
  inconsistent: { color: "#7A754B",     bg: "#FDF8EE", border: "#EFE0BB", icon: "≈", label: "Inconsistent" },
};

const GUIDANCE_CFG = {
  stay_the_course:      { label: "Stay the course", icon: "✓", color: COLORS.sage },
  monitor:              { label: "Monitor closely",  icon: "👁", color: COLORS.amber },
  consider_adjustments: { label: "Consider adjustments", icon: "⚠", color: COLORS.error },
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{
      fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.mauve,
      textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
    }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: "#fff", borderRadius: 20, padding: 18,
      borderWidth: 1, borderColor: COLORS.border,
      shadowColor: COLORS.ink, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    }, style]}>
      {children}
    </View>
  );
}

function StatPill({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{
        fontFamily: SERIF, fontSize: 26, color: accent ? COLORS.primary : COLORS.ink,
        lineHeight: 30, marginBottom: 2,
      }}>
        {value}
      </Text>
      <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </Text>
      {sub && <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 1 }}>{sub}</Text>}
    </View>
  );
}

// ─── PDF report (for Share My Snapshot) ──────────────────────────────────────

function buildReportHTML(d: SupplyIntelligence, parentName: string | null, babyName: string | null): string {
  const trendIcon  = d.trend === "improving" ? "↑" : d.trend === "declining" ? "↓" : "→";
  const trendColor = d.trend === "improving" ? "#7A754B" : d.trend === "declining" ? "#C0544A" : "#A5818E";
  const statusCfg  = STATUS_CFG[d.supplyStatus];
  const dateRange  = `${format(subDays(new Date(), 7), "MMM d")} – ${format(new Date(), "MMM d, yyyy")}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Supply Snapshot · ${dateRange}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  body { font-family:-apple-system,Helvetica,Arial,sans-serif; background-color:#FDF6EE; color:#442E1D; }
  .header { background-color:#2E3F40 !important; padding:48px 40px 40px; }
  .brand { font-size:10px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#A8CDD0; margin-bottom:20px; }
  .title { font-size:34px; font-weight:700; color:#FFFFFF !important; line-height:1.2; margin-bottom:6px; }
  .subtitle { font-size:13px; color:#A8CDD0; }
  .meta { margin-top:20px; font-size:12px; color:#A8CDD0; }
  .meta strong { color:#D6EAEC; }
  .body { padding:32px 40px; max-width:660px; }
  .section { margin-bottom:28px; }
  .section-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:#A5818E; margin-bottom:14px; }
  .status-card { border-radius:16px; padding:20px; border:1px solid; margin-bottom:20px; }
  .stats-row { display:table; width:100%; border-collapse:separate; border-spacing:10px; margin:-10px; }
  .stat-card { display:table-cell; background-color:#FFFFFF; border-radius:14px; padding:18px 14px; border:1px solid #E8DDD4; text-align:center; width:33%; }
  .stat-value { font-size:26px; font-weight:700; color:#442E1D; margin-bottom:4px; }
  .stat-label { font-size:10px; color:#B09880; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; }
  .row-card { background-color:#FFFFFF; border-radius:14px; padding:16px 18px; border:1px solid #E8DDD4; margin-bottom:8px; overflow:hidden; }
  .row-key { font-size:13px; color:#7A5C44; float:left; }
  .row-val { font-size:14px; font-weight:700; color:#442E1D; float:right; }
  .row-card:after { content:""; display:block; clear:both; }
  .stage-card { background-color:#FFFDF8; border:1px solid #DFDBA9; border-radius:14px; padding:18px; margin-bottom:20px; }
  .stage-label { font-size:11px; font-weight:700; color:#7A754B; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .stage-text { font-size:13px; color:#7A5C44; line-height:1.7; }
  .disclaimer { background-color:#F3ECE4; border-radius:12px; padding:14px 16px; margin-top:20px; font-size:11px; color:#7A5C44; line-height:1.7; border:1px solid #E8DDD4; }
  .footer { margin-top:32px; padding:20px 40px; border-top:1px solid #E8DDD4; font-size:11px; color:#B09880; line-height:1.8; }
</style>
</head>
<body>

<div class="header" style="background-color:#2E3F40 !important;color:#ffffff">
  <div class="brand">Pump Coach · The Breastfeeding Mama</div>
  <h1 class="title" style="color:#ffffff !important">Supply Snapshot</h1>
  <div class="subtitle">${dateRange}</div>
  <div class="meta" style="margin-top:16px">
    ${parentName ? `Parent: <strong>${parentName}</strong> &nbsp;` : ""}
    ${babyName   ? `Baby: <strong>${babyName}</strong> &nbsp;`     : ""}
    ${d.stage    ? `Stage: <strong>${d.stage.label}</strong>`       : ""}
  </div>
</div>

<div class="body">

  <!-- Supply status -->
  <div class="section">
    <div class="section-label">Supply Status</div>
    <div class="status-card" style="background:${statusCfg.bg};border-color:${statusCfg.border}">
      <div style="font-size:22px;font-weight:800;color:${statusCfg.color};margin-bottom:6px">
        ${statusCfg.icon} ${statusCfg.label}
      </div>
      <div style="font-size:13px;color:#7A5C44;line-height:1.6">
        ${d.supplyStatus === "improving"
          ? "Output is trending upward and sessions are consistent. Your effort is paying off."
          : d.supplyStatus === "stable"
          ? "Supply is holding steady, a sign of reliable habits and consistent demand."
          : d.supplyStatus === "slight_dip"
          ? "A dip has been detected. Common causes include hydration, sleep, stress, missed sessions, or pump part wear."
          : "Session timing has been irregular. Consistent spacing helps your body predict and maintain production."}
      </div>
    </div>
  </div>

  <!-- Output stats -->
  <div class="section">
    <div class="section-label">Output Overview</div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${fmtOz(d.todayOz)}</div>
        <div class="stat-label">Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtOz(d.rolling24hOz)}</div>
        <div class="stat-label">Rolling 24h</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtOz(d.avg7dayPerDay)}</div>
        <div class="stat-label">7-day avg/day</div>
      </div>
      ${d.hourlyRate !== null ? `
      <div class="stat-card">
        <div class="stat-value">${fmtOz(d.hourlyRate)}/hr</div>
        <div class="stat-label">Removal rate</div>
      </div>` : ""}
    </div>
  </div>

  <!-- Sessions -->
  <div class="section">
    <div class="section-label">Session Patterns</div>
    <div class="row-card">
      <span class="row-key">Sessions (7 days)</span>
      <span class="row-val">${d.sessionCount7day} (${d.sessionsPerDay7day.toFixed(1)}/day)</span>
    </div>
    ${d.avg7daySessionPumpOnly !== null && d.avg7daySessionNursingDay !== null ? `
    <div class="row-card">
      <span class="row-key">Avg per session (pump-only days)</span>
      <span class="row-val">${fmtOz(d.avg7daySessionPumpOnly)}</span>
    </div>
    <div class="row-card">
      <span class="row-key">Avg per session (nursing days)</span>
      <span class="row-val">${fmtOz(d.avg7daySessionNursingDay)}</span>
    </div>` : `
    <div class="row-card">
      <span class="row-key">Avg per session</span>
      <span class="row-val">${fmtOz(d.avg7dayPerSession)}</span>
    </div>`}
    <div class="row-card">
      <span class="row-key">Consistency score</span>
      <span class="row-val">${d.consistencyLabel} (${d.consistencyScore}/100)</span>
    </div>
    <div class="row-card">
      <span class="row-key">Trend</span>
      <span class="row-val" style="color:${trendColor}">${trendIcon} ${d.trend.charAt(0).toUpperCase() + d.trend.slice(1)}</span>
    </div>
  </div>

  <!-- Postpartum stage -->
  ${d.stage ? `
  <div class="section">
    <div class="section-label">Postpartum Stage</div>
    <div class="stage-card">
      <div class="stage-label">${d.stage.label} · ${d.stage.normalRange}</div>
      <div class="stage-text">${d.stage.context}</div>
      <div class="stage-text" style="margin-top:10px;font-style:italic">${d.stage.reassurance}</div>
    </div>
  </div>` : ""}

  <!-- Pain -->
  ${d.painSessions > 0 ? `
  <div class="section">
    <div class="section-label">Pain & Comfort</div>
    <div style="background:#FFF5F0;border:1px solid #F2D5CC;border-radius:14px;padding:16px 18px">
      <div style="font-size:13px;font-weight:700;color:#C0544A;margin-bottom:6px">
        ⚠ Pain noted in ${d.painSessions} session${d.painSessions !== 1 ? "s" : ""}
      </div>
      <div style="font-size:12px;color:#7A5C44;line-height:1.6">
        Pain during pumping almost always indicates a flange fit or suction issue, both of which are correctable.
        An IBCLC assessment is strongly recommended.
      </div>
    </div>
  </div>` : ""}

  <div class="disclaimer">
    This report is generated by Pump Coach, created by Katie Clark, IBCLC (thebreastfeedingmama.com).
    It is based on self-reported data and is for informational purposes only. It is not a clinical assessment
    and does not replace the advice of a licensed healthcare provider. Always work with a qualified IBCLC
    for clinical concerns.
  </div>
</div>

<div class="footer">
  Pump Coach · The Breastfeeding Mama · thebreastfeedingmama.com<br>
  Katie Clark, IBCLC · Evidence-informed pumping support
</div>

</body>
</html>`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SnapshotScreen() {
  const router = useRouter();
  const { profile, babies, user, isPremium } = useAuthStore();
  const [data,            setData]            = useState<SupplyIntelligence | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [exporting,       setExporting]       = useState(false);
  const [pumpCount,       setPumpCount]       = useState(0);
  const [viewers,         setViewers]         = useState<ViewerAccount[]>([]);
  const [viewerNames,     setViewerNames]     = useState<Record<string, string>>({});
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [inviteEmail,     setInviteEmail]     = useState("");
  const [inviteBusy,      setInviteBusy]      = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const since7  = subDays(new Date(), 7).toISOString();
      const since14 = subDays(new Date(), 14).toISOString();
      const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const todayStart = startOfDay(new Date()).toISOString();

      // Flange-change detection needs more history than the 14-day window
      // used for everything else — a mom might not have switched flanges
      // recently, so this looks back 90 days on its own.
      const since90 = subDays(new Date(), 90).toISOString();

      const [sessionRes, stashRes, pumpsRes, viewersRes, flangeSessionsRes, nursingRes] = await Promise.all([
        supabase.from("pump_sessions").select("*").gte("started_at", since14).order("started_at", { ascending: false }),
        supabase.from("stash_entries").select("oz").is("used_at", null).is("discarded_at", null),
        supabase.from("user_pumps").select("id").eq("user_id", user.id),
        supabase.from("viewer_accounts").select("*").eq("owner_id", user.id),
        supabase.from("pump_sessions").select("started_at, total_oz, flange_size_mm").gte("started_at", since90).not("flange_size_mm", "is", null),
        supabase.from("nursing_sessions").select("nursed_at").eq("user_id", user.id).gte("nursed_at", since7),
      ]);
      setPumpCount((pumpsRes.data ?? []).length);
      const viewerList = (viewersRes.data ?? []) as ViewerAccount[];
      setViewers(viewerList);
      if (viewerList.length > 0) {
        const ids = viewerList.map((v) => v.viewer_id);
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach((p: any) => { map[p.id] = p.display_name || p.email || "Viewer"; });
        setViewerNames(map);
      }

      const sessions14 = (sessionRes.data ?? []) as PumpSession[];
      const sessions7  = sessions14.filter((s) => s.started_at >= since7);
      const sessions24 = sessions14.filter((s) => s.started_at >= since24);
      const sessionsToday = sessions14.filter((s) => s.started_at >= todayStart);

      const todayOz      = sessionsToday.reduce((s, x) => s + (x.total_oz ?? 0), 0);
      const rolling24hOz = sessions24.reduce((s, x) => s + (x.total_oz ?? 0), 0);
      const total7day    = sessions7.reduce((s, x) => s + (x.total_oz ?? 0), 0);
      const avg7dayPerDay = total7day / 7;
      const avg7dayPerSession = sessions7.length ? total7day / sessions7.length : 0;
      const stashOz = ((stashRes.data ?? []) as StashEntry[]).reduce((s, e) => s + (e.oz ?? 0), 0);

      // Split per-session avg by nursing day — see field comments above.
      const nursing7 = (nursingRes.data ?? []) as Pick<NursingSession, "nursed_at">[];
      const weekNursedDates = new Set(nursing7.map((n) => format(new Date(n.nursed_at), "yyyy-MM-dd")));
      const pumpOnlyDaySessions   = sessions7.filter((s) => !weekNursedDates.has(format(new Date(s.started_at), "yyyy-MM-dd")));
      const nursingDaySessionsArr = sessions7.filter((s) => weekNursedDates.has(format(new Date(s.started_at), "yyyy-MM-dd")));
      const hasNursingSplit = pumpOnlyDaySessions.length > 0 && nursingDaySessionsArr.length > 0;
      const avg7daySessionPumpOnly = hasNursingSplit
        ? pumpOnlyDaySessions.reduce((s, x) => s + (x.total_oz ?? 0), 0) / pumpOnlyDaySessions.length
        : null;
      const avg7daySessionNursingDay = hasNursingSplit
        ? nursingDaySessionsArr.reduce((s, x) => s + (x.total_oz ?? 0), 0) / nursingDaySessionsArr.length
        : null;

      // Removal rate — total pumped oz in the last 24h / 24. Nursing
      // sessions in that same window count toward the reliability
      // threshold (real removal events, just unquantified in oz) but never
      // get added into the oz numerator itself.
      const nursing24Count = nursing7.filter((n) => n.nursed_at >= since24).length;
      const totalRemovals24h = sessions24.length + nursing24Count;
      const hourlyRate = totalRemovals24h >= 5 ? rolling24hOz / 24 : null;

      const { score: consistencyScore, label: consistencyLabel } = computeConsistency(
        sessions7,
        sessions14,
        profile?.created_at ?? new Date().toISOString(),
      );
      // Shared with the pattern-detection insight engine (lib/patternDetection.ts)
      // so this screen and the AI-generated insights never disagree about
      // whether supply is trending up, down, or holding steady.
      const { trend } = computeSupplyTrend(sessions14);
      const supplyStatus = computeSupplyStatus(rolling24hOz, avg7dayPerDay, trend, consistencyScore);
      const guidanceLevel = computeGuidance(supplyStatus, sessions7.filter((s) => (s.pain_level ?? 0) >= 6).length);
      const stage = getPostpartumStage(primaryBaby(babies)?.dob ?? null);
      const flangeChange = detectFlangeChange(flangeSessionsRes.data ?? []);

      // Pain trend — same shared window/threshold logic as the supply trend,
      // just over pain_level instead of total_oz. Only sessions with an
      // actually-logged pain level count; a missing value isn't "no pain."
      const painLoggedSessions = sessions14.filter((s) => s.pain_level != null);
      const rawPainTrend = computeValueTrend(painLoggedSessions, (s) => s.pain_level ?? 0);
      const painTrend: SupplyIntelligence["painTrend"] = rawPainTrend.insufficientData
        ? null
        : rawPainTrend.trend === "improving" ? "worsening"   // pain level went UP
        : rawPainTrend.trend === "declining" ? "improving"   // pain level went DOWN
        : "stable";

      setData({
        todayOz,
        rolling24hOz,
        avg7dayPerDay,
        avg7dayPerSession,
        avg7daySessionPumpOnly,
        avg7daySessionNursingDay,
        hourlyRate,
        hourlyRateNursingCount: nursing24Count,
        sessionCountToday: sessionsToday.length,
        sessionCount7day:  sessions7.length,
        sessionsPerDay7day: sessions7.length / 7,
        consistencyScore,
        consistencyLabel,
        trend,
        supplyStatus,
        guidanceLevel,
        painSessions: sessions7.filter((s) => (s.pain_level ?? 0) >= 6).length,
        painTrend,
        stashOz,
        goalOz: profile?.daily_goal_oz ?? null,
        stage,
        flangeChange,
      });
    } catch {
      // Silently fail — empty state handles the no-data case
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSendInvite = async () => {
    if (!user || !inviteEmail.trim()) return;
    setInviteBusy(true);
    const email = inviteEmail.trim().toLowerCase();
    await supabase.from("invitations").update({ status: "revoked" }).eq("owner_id", user.id).eq("email", email).eq("status", "pending");
    const { data: inv, error } = await supabase.from("invitations").insert({ owner_id: user.id, email }).select("token").single();
    setInviteBusy(false);
    if (error || !inv) { Alert.alert("Error", error?.message ?? "Could not send invite"); return; }
    // Code-based acceptance, not a clickable link — see
    // "Invite code flow replaces broken invite links" (no page was ever
    // built to serve pumpcoach.app/invite, so that link always 404'd).
    const ownerName = profile?.display_name ?? "Someone";
    const babyName  = primaryBaby(babies)?.name;
    const appStoreUrl = "https://apps.apple.com/app/id6765497176";
    const subject = `${ownerName} invited you to view her Pump Coach data`;
    const body = [
      `Hi!`, ``,
      `${ownerName} has invited you to view her pumping data${babyName ? ` for ${babyName}` : ""} in Pump Coach.`, ``,
      `1. Download Pump Coach (free): ${appStoreUrl}`,
      `2. Open the app and tap "Enter invite code" — it's at the bottom of the welcome screen, or if you already have an account, on the Profile tab under "Received an Invite?".`, ``,
      `3. Copy and paste this invite code:`,
      `   ${inv.token}`, ``,
      `You'll have read-only access to her sessions and data.`, ``, `— Pump Coach`,
    ].join("\n");
    const available = await MailComposer.isAvailableAsync();
    if (available) {
      await MailComposer.composeAsync({ recipients: [email], subject, body });
    } else {
      await Share.share({ message: body });
    }
    setInviteEmail("");
    setShowShareModal(false);
    loadData();
  };

  const handleRevokeViewer = (v: ViewerAccount) => {
    const name = viewerNames[v.viewer_id] ?? "this viewer";
    Alert.alert("Remove access", `Remove ${name}'s access to your data?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await supabase.from("viewer_accounts").delete().eq("id", v.id);
        loadData();
      }},
    ]);
  };

  const handleExportPDF = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const html = buildReportHTML(data, profile?.display_name ?? null, primaryBaby(babies)?.name ?? null);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share your Supply Snapshot" });
      }
    } catch {
      Alert.alert("Export failed", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleEmailLC = () => {
    if (!data) return;
    const subject = encodeURIComponent("My Pumping Supply Snapshot: Pump Coach");
    const stageNote = data.stage ? `\n• Stage: ${data.stage.label}` : "";
    const body = encodeURIComponent(
      `Hi,\n\nHere is my 7-day supply snapshot from Pump Coach.\n\n` +
      `Summary:\n` +
      `• Today's output: ${fmtOz(data.todayOz)}\n` +
      `• 24-hour rolling: ${fmtOz(data.rolling24hOz)}\n` +
      `• 7-day daily avg: ${fmtOz(data.avg7dayPerDay)}\n` +
      (data.hourlyRate !== null ? `• Removal rate: ${fmtOz(data.hourlyRate)}/hr\n` : "") +
      (data.avg7daySessionPumpOnly !== null && data.avg7daySessionNursingDay !== null
        ? `• Avg per session: ${fmtOz(data.avg7daySessionPumpOnly)} pump-only days, ${fmtOz(data.avg7daySessionNursingDay)} nursing days\n`
        : "") +
      `• Sessions/day: ${data.sessionsPerDay7day.toFixed(1)}\n` +
      `• Consistency: ${data.consistencyLabel} (${data.consistencyScore}/100)\n` +
      `• Trend: ${data.trend}\n` +
      `• Supply status: ${STATUS_CFG[data.supplyStatus].label}` +
      stageNote +
      `\n• Pain sessions: ${data.painSessions}\n` +
      `• Stash: ${fmtOz(data.stashOz)}\n\n` +
      `Generated ${format(new Date(), "MMM d, yyyy")} via Pump Coach by Katie Clark, IBCLC.`
    );
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const statusCfg  = data ? STATUS_CFG[data.supplyStatus] : null;
  const guidanceCfg = data ? GUIDANCE_CFG[data.guidanceLevel] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 56 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
        <LinearGradient
          colors={GRADIENTS.plumRich}
          style={{ paddingTop: 24, paddingBottom: 40, paddingHorizontal: 24 }}
        >
          <View style={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.04)" }} />
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10 }}>
            Milk Supply Intelligence
          </Text>
          <Text style={{ fontFamily: SERIF, color: "#fff", fontSize: 30, lineHeight: 38, marginBottom: 6 }}>
            Supply Snapshot
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 20 }}>
            Your real supply picture, not just ounces logged.
          </Text>
          {data?.stage && (
            <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  {data.stage.label}
                </Text>
              </View>
            </View>
          )}
        </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -16, gap: 14 }}>

          {loading && (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.ink2, fontSize: 14, marginTop: 12 }}>Reading your supply data…</Text>
            </View>
          )}

          {!loading && !data && (
            <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 36, marginBottom: 16 }}>📊</Text>
              <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, textAlign: "center", marginBottom: 8 }}>
                No data yet
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 22 }}>
                Log your first pumping session to see your supply snapshot here.
              </Text>
            </View>
          )}

          {!loading && data && (
            <>
              {/* ── Today at a glance — FREE ── */}
              <Card>
                <SectionLabel>Today at a glance</SectionLabel>
                <View style={{ flexDirection: "row", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <StatPill label="Today's oz" value={fmtOz(data.todayOz)} accent />
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <StatPill label="Sessions" value={String(data.sessionCountToday)} />
                </View>
                <View style={{ flexDirection: "row", paddingTop: 14 }}>
                  <StatPill label="Rolling 24h" value={fmtOz(data.rolling24hOz)} />
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <StatPill label="7-day avg/day" value={fmtOz(data.avg7dayPerDay)} />
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <StatPill label="Sessions/day" value={data.sessionsPerDay7day.toFixed(1)} />
                </View>
              </Card>

              {/* ── Removal rate — FREE, only shown once reliable ── */}
              {data.hourlyRate !== null && (
                <Card>
                  <SectionLabel>Removal rate</SectionLabel>
                  <Text style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.ink, marginTop: 4 }}>
                    {fmtOz(data.hourlyRate)}/hr
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 6, lineHeight: 17 }}>
                    Pumped output over the last 24 hours, divided evenly across the day
                    {data.hourlyRateNursingCount > 0
                      ? ` (plus ${data.hourlyRateNursingCount} nursing session${data.hourlyRateNursingCount === 1 ? "" : "s"} in that window)`
                      : ""}
                    . Useful for confirming this holds steady if session count changes — a real drop here matters more than fewer sessions on their own.
                  </Text>
                </Card>
              )}

              {/* ── Stash summary — FREE ── */}
              {data.stashOz > 0 && (
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View>
                      <SectionLabel>Stash total</SectionLabel>
                      <Text style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.ink }}>{fmtOz(data.stashOz)}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                        {data.stashOz >= 30
                          ? "30+ oz: a solid buffer for most families"
                          : data.stashOz >= 15
                          ? "Building toward a comfortable buffer"
                          : "Small stash: focus on daily needs first"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 36 }}>🧊</Text>
                  </View>
                </Card>
              )}

              {/* ── PREMIUM intelligence layer ── */}
              {isPremium ? (
                <>
                  {/* ── Supply status hero ── */}
                  <View style={{
                    borderRadius: 22, padding: 22,
                    backgroundColor: statusCfg!.bg,
                    borderWidth: 1.5, borderColor: statusCfg!.border,
                  }}>
                    <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: statusCfg!.color, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                      Supply Status
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 24, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: statusCfg!.color }}>{statusCfg!.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, marginBottom: 2 }}>
                          {statusCfg!.label}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.ink2 }}>
                          Based on 7 days of sessions
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                      {data.supplyStatus === "improving"
                        ? "Output is trending upward and sessions are consistent. Your effort is paying off. Keep going."
                        : data.supplyStatus === "stable"
                        ? "Supply is holding steady. Consistency is the foundation of reliable production. You're doing it."
                        : data.supplyStatus === "slight_dip"
                        ? "A dip has been detected. Common causes: hydration, sleep, stress, a missed session or two, or pump parts needing replacement."
                        : "Session timing has been irregular. Your body responds to consistent demand, and spacing sessions evenly makes a meaningful difference."}
                    </Text>
                  </View>

                  {!profile?.track_hydration && (
                    <Pressable
                      onPress={async () => {
                        if (!user) return;
                        await supabase.from("profiles").update({ track_hydration: true }).eq("id", user.id);
                        loadData();
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        backgroundColor: COLORS.primaryMist, borderRadius: 16, padding: 16,
                        borderWidth: 1, borderColor: "#CBDBE0",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Text style={{ fontSize: 22 }}>💧</Text>
                        <View>
                          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                            Track your hydration
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                            See how water intake tracks with your output
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 16, color: COLORS.primary }}>→</Text>
                    </Pressable>
                  )}

                  {/* ── Trend + consistency ── */}
                  <Card>
                    <SectionLabel>7-day patterns</SectionLabel>
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Output trend</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: data.trend === "improving" ? COLORS.sage : data.trend === "declining" ? COLORS.error : COLORS.mauve }}>
                          {data.trend === "improving" ? "↑ Improving" : data.trend === "declining" ? "↓ Declining" : "→ Stable"}
                        </Text>
                      </View>

                      {data.painTrend && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Comfort trend</Text>
                          <Pressable
                            onPress={() => data.painTrend === "worsening" && router.push("/tools/flange")}
                            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                          >
                            <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: data.painTrend === "improving" ? COLORS.sage : data.painTrend === "worsening" ? COLORS.error : COLORS.mauve }}>
                              {data.painTrend === "improving" ? "↑ Improving" : data.painTrend === "worsening" ? "↓ Worsening" : "→ Stable"}
                            </Text>
                            {data.painTrend === "worsening" && (
                              <Text style={{ fontSize: 12, color: COLORS.primary }}>Check fit →</Text>
                            )}
                          </Pressable>
                        </View>
                      )}

                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Consistency</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={{ width: 80, height: 6, backgroundColor: COLORS.muted, borderRadius: 3, overflow: "hidden" }}>
                            <View style={{ width: `${data.consistencyScore}%` as any, height: "100%", backgroundColor: data.consistencyScore >= 60 ? COLORS.sage : data.consistencyScore >= 40 ? COLORS.amber : COLORS.error, borderRadius: 3 }} />
                          </View>
                          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                            {data.consistencyLabel}
                          </Text>
                        </View>
                      </View>

                      {data.avg7daySessionPumpOnly !== null && data.avg7daySessionNursingDay !== null ? (
                        <>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Avg per session (pump-only days)</Text>
                            <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                              {fmtOz(data.avg7daySessionPumpOnly)}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Avg per session (nursing days)</Text>
                            <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                              {fmtOz(data.avg7daySessionNursingDay)}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Avg per session</Text>
                          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                            {fmtOz(data.avg7dayPerSession)}
                          </Text>
                        </View>
                      )}

                      {data.goalOz && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Daily goal progress</Text>
                          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                            {fmtOz(data.avg7dayPerDay)} / {fmtOz(data.goalOz)} ({Math.round((data.avg7dayPerDay / data.goalOz) * 100)}%)
                          </Text>
                        </View>
                      )}
                    </View>
                  </Card>

                  {/* Pump comparison entry point — placed near the top so it's
                      actually seen, not buried below sharing/export options. */}
                  {pumpCount >= 2 && (
                    <Pressable
                      onPress={() => router.push("/tools/pump-compare" as any)}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        backgroundColor: COLORS.primaryMist, borderRadius: 16, padding: 16,
                        borderWidth: 1, borderColor: "#CBDBE0",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Text style={{ fontSize: 22 }}>📊</Text>
                        <View>
                          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                            Compare your pumps
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                            See which pump gives you the most output
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 16, color: COLORS.primary }}>→</Text>
                    </Pressable>
                  )}

                  {/* Flange change → output correlation — a real "we noticed
                      this changed and here's what happened" moment, not just
                      another number. Only appears once there's an actual
                      detected change with enough sample on both sides. */}
                  {data.flangeChange && (
                    <View style={{
                      borderRadius: 16, padding: 16,
                      backgroundColor: data.flangeChange.pctChange >= 0 ? "#F0FAF0" : "#FDF5EE",
                      borderWidth: 1, borderColor: data.flangeChange.pctChange >= 0 ? "#C8E6CB" : "#F0DECA",
                    }}>
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 4 }}>
                        🔬 Flange change noticed
                      </Text>
                      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
                        Since switching from {data.flangeChange.fromSizeMm}mm to {data.flangeChange.toSizeMm}mm
                        on {format(data.flangeChange.changedAt, "MMM d")}, your average output has gone from{" "}
                        {fmtOz(data.flangeChange.avgOzBefore)} to {fmtOz(data.flangeChange.avgOzAfter)}
                        {" "}({data.flangeChange.pctChange >= 0 ? "+" : ""}{Math.round(data.flangeChange.pctChange)}%).
                      </Text>
                    </View>
                  )}

                  {/* ── Guidance ── */}
                  <View style={{
                    borderRadius: 20, padding: 18, backgroundColor: "#fff", borderWidth: 1.5,
                    borderColor: guidanceCfg!.color === COLORS.sage ? "#C8E6CB" : guidanceCfg!.color === COLORS.amber ? "#F0DECA" : "#F2D5CC",
                  }}>
                    <SectionLabel>Guidance</SectionLabel>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryMist, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 16 }}>{guidanceCfg!.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6 }}>
                          {guidanceCfg!.label}
                        </Text>
                        <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                          {data.guidanceLevel === "stay_the_course"
                            ? "What you're doing is working. Protect your schedule, stay hydrated, and keep sessions consistent. No changes needed."
                            : data.guidanceLevel === "monitor"
                            ? "Nothing alarming, but worth paying attention to. Prioritize sleep, water, and regular sessions over the next 2–3 days and see if things stabilize."
                            : "Consider reviewing your pumping schedule, pump parts, and flange fit. If you've recently changed routines or missed sessions, that's likely the cause. An IBCLC can help identify what to adjust."}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* ── Postpartum stage context ── */}
                  {data.stage && (
                    <View style={{ backgroundColor: "#FFFBF5", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#EFE0BB" }}>
                      <SectionLabel>Your postpartum stage</SectionLabel>
                      <Text style={{ fontFamily: SERIF, fontSize: 16, color: COLORS.ink, marginBottom: 6 }}>
                        {data.stage.label}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: "#7A754B", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Normal: {data.stage.normalRange}
                      </Text>
                      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 10 }}>
                        {data.stage.context}
                      </Text>
                      <View style={{ backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 12, padding: 12 }}>
                        <Text style={{ fontSize: 13, color: "#7A754B", lineHeight: 19, fontStyle: "italic" }}>
                          {data.stage.reassurance}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* ── Reassurance ── */}
                  <View style={{ backgroundColor: COLORS.primaryMist, borderRadius: 20, padding: 18 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                      A note from your coach
                    </Text>
                    <Text style={{ fontFamily: SERIF, fontSize: 16, color: COLORS.ink, marginBottom: 8 }}>
                      One low session does not mean low supply.
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                      Supply is measured in patterns, not moments. Hydration, sleep, stress, time of day, and even what you ate can shift a single session by 20–40%. Your body is not broken. It's responsive. What matters is the trend over days, not the number in front of you right now.
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.mauve, marginTop: 10, fontStyle: "italic" }}>
                      Katie Clark, IBCLC
                    </Text>
                  </View>

                  {/* ── Pain callout ── */}
                  {data.painSessions > 0 && (
                    <View style={{ backgroundColor: "#FFF5F0", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#F2D5CC" }}>
                      <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.error, marginBottom: 6 }}>
                        ⚠ Pain noted in {data.painSessions} session{data.painSessions !== 1 ? "s" : ""}
                      </Text>
                      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
                        Pain during pumping is almost always fixable, but it needs a trained eye. Flange fit and suction settings are the most common causes. An IBCLC can identify the issue in a single session.
                      </Text>
                    </View>
                  )}

                  {/* ── Share live access ── */}
                  <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 20, marginTop: 4 }}>
                    <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink, marginBottom: 4 }}>
                      Share with partner or LC
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 16, lineHeight: 19 }}>
                      Give someone read-only access to your live data — they can see your sessions, output trends, and stash.
                    </Text>

                    {viewers.length > 0 && (
                      <View style={{ backgroundColor: COLORS.muted, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
                        {viewers.map((v, idx) => (
                          <React.Fragment key={v.id}>
                            {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 44 }} />}
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={{ fontSize: 16 }}>👁</Text>
                                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                                  {viewerNames[v.viewer_id] ?? "Viewer"}
                                </Text>
                              </View>
                              <Pressable onPress={() => handleRevokeViewer(v)} hitSlop={8}>
                                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>Remove</Text>
                              </Pressable>
                            </View>
                          </React.Fragment>
                        ))}
                      </View>
                    )}

                    <Pressable onPress={() => setShowShareModal(true)}>
                      <View style={{
                        backgroundColor: "#fff", borderRadius: 16,
                        paddingVertical: 16, paddingHorizontal: 20,
                        flexDirection: "row", alignItems: "center", gap: 14,
                        borderWidth: 1.5, borderColor: COLORS.border,
                      }}>
                        <Text style={{ fontSize: 20 }}>🔗</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                            Invite someone
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                            Send an email invite — they get read-only access
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>

                  {/* ── Share My Snapshot ── */}
                  <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 20, marginTop: 4 }}>
                    <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink, marginBottom: 4 }}>
                      Share My Snapshot
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 16, lineHeight: 19 }}>
                      Send a clinical report to your lactation consultant or save it for your records.
                    </Text>
                    <View style={{ gap: 10 }}>
                      <Pressable onPress={handleExportPDF}>
                        <View style={{
                          backgroundColor: COLORS.primary, borderRadius: 16,
                          paddingVertical: 16, paddingHorizontal: 20,
                          flexDirection: "row", alignItems: "center", gap: 14,
                        }}>
                          {exporting
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={{ fontSize: 20 }}>📄</Text>}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Export as PDF</Text>
                            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>
                              Full clinical report, save or share
                            </Text>
                          </View>
                        </View>
                      </Pressable>

                      <Pressable onPress={handleEmailLC}>
                        <View style={{
                          backgroundColor: "#fff", borderRadius: 16,
                          paddingVertical: 16, paddingHorizontal: 20,
                          flexDirection: "row", alignItems: "center", gap: 14,
                          borderWidth: 1.5, borderColor: COLORS.border,
                        }}>
                          <Text style={{ fontSize: 20 }}>✉️</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>Email to my LC</Text>
                            <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                              Opens your email app with a pre-filled summary
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  </View>

                  <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 17 }}>
                    Pump Coach by Katie Clark, IBCLC · thebreastfeedingmama.com{"\n"}
                    For informational purposes only, not a clinical assessment.
                  </Text>
                </>
              ) : (
                <PremiumTeaser
                  headline="Understand your supply, not just your ounces"
                  description="Premium unlocks your full milk supply intelligence: trend analysis, consistency scoring, personalized guidance, postpartum stage context, and clinical-grade reports to share with your IBCLC."
                  unlocks={[
                    "Supply status: improving, stable, or needs attention",
                    "Trend analysis & consistency score",
                    "Personalized guidance for your pattern",
                    "Postpartum stage context & reassurance",
                    "Share My Snapshot: PDF + email to your LC",
                    "📊 Pump comparison — see which pump works best for you",
                  ]}
                />
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Invite modal ── */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => setShowShareModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", paddingHorizontal: 24 }} onPress={() => setShowShareModal(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderRadius: 24, padding: 24, gap: 16 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink }}>Invite someone</Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
                Enter their email address. They'll receive an invite to create a free Pump Coach account and view your data.
              </Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="Email address"
                placeholderTextColor={COLORS.ink3}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                style={{
                  borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14,
                  paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 15, color: COLORS.ink,
                }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setShowShareModal(false)}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSendInvite}
                  disabled={inviteBusy || !inviteEmail.trim()}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: "center", opacity: inviteEmail.trim() ? 1 : 0.45 }}
                >
                  {inviteBusy
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>Send invite</Text>
                  }
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
