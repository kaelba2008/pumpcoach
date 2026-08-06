/**
 * Pattern Detection Engine — Session 5 Part 2
 * Client-side only. Reads session data already present in memory.
 * No network calls. Returns the best-matching template key(s) to
 * pass to the insight generation service.
 *
 * Pattern priority (highest first):
 *   needs_attention > mild > celebratory > informational
 */

import { dayTypeForDate, dayTypeForISO, DayType } from "./schedule";

// ── Types ────────────────────────────────────────────────────────────────────

export type PumpingContext =
  | "exclusive_pumping"
  | "equal_pumping_nursing"
  | "work_pumping"
  | "mostly_nursing"
  | "mostly_pumping"
  | "supply_building"
  | "triple_feeding"
  | "weaning"
  | "unspecified";

export interface SessionRecord {
  id: string;
  started_at: string;   // ISO timestamp
  duration_minutes: number;
  total_oz: number;
  pain_level?: number;
  notes?: string;
}

/** Lightweight nursing event — just the timestamp, used for gap calculation */
export interface NursingRecord {
  nursed_at: string; // ISO timestamp
}

export interface DetectedPattern {
  pattern_name: string;
  context_variant: string;    // matches the DB context_variant column
  /** Key numbers the AI should substitute into the output */
  context_data: Record<string, string | number>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function hourOf(iso: string): number {
  return new Date(iso).getHours();
}

function dateKey(iso: string): string {
  // Use LOCAL calendar date, not UTC date, to avoid timezone-shift false positives
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayOf(iso: string): number {
  return new Date(iso).getDay(); // 0=Sun, 6=Sat
}

function isWeekend(iso: string): boolean {
  const d = weekdayOf(iso);
  return d === 0 || d === 6;
}

/** Rolling daily totals keyed by YYYY-MM-DD */
function dailyTotals(sessions: SessionRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const k = dateKey(s.started_at);
    map.set(k, (map.get(k) ?? 0) + s.total_oz);
  }
  return map;
}

/** Count sessions per day */
function dailySessionCounts(sessions: SessionRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const k = dateKey(s.started_at);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sevenDayAvg(sessions: SessionRecord[], endDate: Date): number {
  const cutoff = new Date(endDate);
  cutoff.setDate(cutoff.getDate() - 7);
  const window = sessions.filter(s => new Date(s.started_at) >= cutoff && new Date(s.started_at) < endDate);
  const totals = dailyTotals(window);
  const vals = Array.from(totals.values());
  return average(vals);
}

// ── Shared supply trend ─────────────────────────────────────────────────────
// Single source of truth for "is supply trending up, down, or stable" — used
// by both this pattern engine (declining/improving insights) and the Supply
// page's guidance system. Before this existed, the two screens ran two
// independently-built trend algorithms with different windows AND different
// thresholds (a 3-5-day vs prior-5-day percentage comparison here, a flat
// 7-day-half-split ±0.3oz absolute comparison on the Supply page), which
// could — and did — disagree and show a mom contradictory messages at the
// same time. Percentage-based rather than a flat ounce threshold because a
// fixed oz difference isn't fair across very different baseline supply
// levels: 0.3oz is a huge relative swing for a 2oz/session mom and nearly
// nothing for a 10oz/session mom.
export interface SupplyTrendResult {
  trend: "improving" | "stable" | "declining";
  /** Positive = improving, negative = declining */
  changePct: number;
  /** Not enough session history yet to compute a meaningful trend */
  insufficientData: boolean;
}

// Generic version: same window (last 3-5 days vs the prior 5-day window)
// and same ±10% threshold, but works over any numeric value extracted from
// each item — not just total_oz. "trend: improving" always means the VALUE
// went up; for a metric where lower is better (e.g. pain level), the caller
// is responsible for flipping that interpretation, not this function.
export function computeValueTrend<T extends { started_at: string }>(
  items: T[],
  getValue: (item: T) => number,
): SupplyTrendResult {
  const now = new Date();
  const todayKey = dateKey(now.toISOString());
  const sorted = [...items].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  const last5 = sorted.filter(s => {
    if (now.getHours() < 18 && dateKey(s.started_at) === todayKey) return false;
    const d = now.getTime() - new Date(s.started_at).getTime();
    return d >= 0 && d <= 5 * 24 * 60 * 60 * 1000;
  });
  const prior5Start = new Date(now);
  prior5Start.setDate(prior5Start.getDate() - 10);
  const prior5End = new Date(now);
  prior5End.setDate(prior5End.getDate() - 5);
  const prior5 = sorted.filter(s => {
    const t = new Date(s.started_at);
    return t >= prior5Start && t < prior5End;
  });

  if (last5.length < 3 || prior5.length < 3) {
    return { trend: "stable", changePct: 0, insufficientData: true };
  }

  const recentAvg = average(last5.map(getValue));
  const priorAvg  = average(prior5.map(getValue));
  const changePct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;

  if (changePct <= -10) return { trend: "declining", changePct, insufficientData: false };
  if (changePct >= 10)  return { trend: "improving", changePct, insufficientData: false };
  return { trend: "stable", changePct, insufficientData: false };
}

export function computeSupplyTrend(
  sessions: { started_at: string; total_oz: number | null }[],
): SupplyTrendResult {
  return computeValueTrend(sessions, s => s.total_oz ?? 0);
}

// Trend for a metric that's naturally a DAILY total (e.g. removal rate,
// which is total pumped oz per rolling 24h) rather than a per-session
// value. Averaging per-session total_oz (what computeValueTrend does)
// would answer "are individual sessions getting bigger or smaller," a
// different question from "is the total removed per day holding up" —
// this answers the latter. Same last-5-days-vs-prior-5-days window and
// ±10% threshold as computeValueTrend, for consistency, but averages
// per-DAY totals instead of per-session ones. Dividing by a fixed
// constant (24, for removal rate) doesn't change a percentage trend, so
// this works directly on raw pumped oz without needing the /24 applied.
export function computeDailyTotalTrend(
  sessions: { started_at: string; total_oz: number | null }[],
): SupplyTrendResult {
  const now = new Date();
  const last5Start = new Date(now);
  last5Start.setDate(last5Start.getDate() - 5);
  const prior5Start = new Date(now);
  prior5Start.setDate(prior5Start.getDate() - 10);
  const prior5End = new Date(now);
  prior5End.setDate(prior5End.getDate() - 5);

  const dailyTotal = (items: typeof sessions) => {
    const map = new Map<string, number>();
    for (const s of items) {
      const k = dateKey(s.started_at);
      map.set(k, (map.get(k) ?? 0) + (s.total_oz ?? 0));
    }
    return Array.from(map.values());
  };

  const last5Totals = dailyTotal(sessions.filter(s => new Date(s.started_at) >= last5Start));
  const prior5Totals = dailyTotal(sessions.filter(s => {
    const t = new Date(s.started_at);
    return t >= prior5Start && t < prior5End;
  }));

  if (last5Totals.length < 3 || prior5Totals.length < 3) {
    return { trend: "stable", changePct: 0, insufficientData: true };
  }

  const recentAvg = average(last5Totals);
  const priorAvg = average(prior5Totals);
  const changePct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;

  if (changePct <= -10) return { trend: "declining", changePct, insufficientData: false };
  if (changePct >= 10)  return { trend: "improving", changePct, insufficientData: false };
  return { trend: "stable", changePct, insufficientData: false };
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectPatterns(
  sessions: SessionRecord[],
  pumpingContext: PumpingContext,
  babyAgeWeeks: number,
  accountCreatedAt: string,
  /** ISO strings of patterns already shown and within cooldown */
  suppressedPatterns: Set<string>,
  /** Nursing sessions — used as milk-removal events in gap detection */
  nursingSessions: NursingRecord[] = [],
  /** User opted in to "skip gap alerts" (I nurse and pump) */
  skipGapAlerts = false,
  /** Weekly Schedule opt-in — declared away/home days, advisory only */
  scheduleEnabled = false,
  scheduleAwayDays: number[] = [],
): DetectedPattern[] {
  const detected: DetectedPattern[] = [];
  const now = new Date();

  const isEarlyStage = babyAgeWeeks < 12;
  const stage = isEarlyStage ? "early" : "established";

  // Sort sessions oldest-first for gap analysis
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  // Convenience: last-7-days sessions
  const cutoff7 = new Date(now);
  cutoff7.setDate(cutoff7.getDate() - 7);
  const last7 = sorted.filter(s => new Date(s.started_at) >= cutoff7);

  // ── Pattern 7: First week encouragement (check first — highest priority for new users)
  if (!suppressedPatterns.has("first_week_encouragement") && babyAgeWeeks <= 1 && sessions.length >= 1) {
    const primaryContexts: PumpingContext[] = [
      "exclusive_pumping", "equal_pumping_nursing", "supply_building", "triple_feeding", "mostly_pumping",
    ];
    const variant = primaryContexts.includes(pumpingContext)
      ? "primary_pumping"
      : "occasional_pumping";

    detected.push({
      pattern_name: "first_week_encouragement",
      context_variant: variant,
      context_data: { baby_age_days: Math.round(babyAgeWeeks * 7) },
    });
  }

  // ── Pattern 11: New user encouragement
  if (
    !suppressedPatterns.has("new_user_first_session_encouragement") &&
    sessions.length <= 2 &&
    daysBetween(new Date(accountCreatedAt), now) >= 3
  ) {
    detected.push({
      pattern_name: "new_user_first_session_encouragement",
      context_variant: "general",
      context_data: {},
    });
  }

  // ── Pattern 10: Declining output trend (needs_attention — check early)
  // Pattern 4: Output trending up (celebratory)
  // Both driven by the shared computeSupplyTrend() — same window, same
  // thresholds the Supply page uses, so the two screens never disagree.
  const skipForDecline: PumpingContext[] = ["mostly_nursing", "weaning", "equal_pumping_nursing"];
  if (sessions.length >= 14) {
    const supplyTrend = computeSupplyTrend(sessions);

    if (
      !suppressedPatterns.has("declining_output_trend") &&
      !skipForDecline.includes(pumpingContext) &&
      supplyTrend.trend === "declining"
    ) {
      const variant =
        pumpingContext === "exclusive_pumping"    ? `exclusive_pumping_${stage}` :
        pumpingContext === "equal_pumping_nursing" ? "equal_pumping_nursing_any" :
        pumpingContext === "work_pumping"          ? "work_pumping_any" :
        pumpingContext === "supply_building"       ? "supply_building_any" :
        pumpingContext === "triple_feeding"        ? "triple_feeding_any" :
        `exclusive_pumping_${stage}`;

      detected.push({
        pattern_name: "declining_output_trend",
        context_variant: variant,
        context_data: { drop_pct: Math.round(Math.abs(supplyTrend.changePct)) },
      });
    }

    if (
      !suppressedPatterns.has("output_trending_up") &&
      supplyTrend.trend === "improving"
    ) {
      detected.push({
        pattern_name: "output_trending_up",
        context_variant: "general",
        context_data: { gain_pct: Math.round(supplyTrend.changePct) },
      });
    }
  }

  // ── Pattern 12: Approaching milestone
  if (!suppressedPatterns.has("approaching_milestone")) {
    const totalOz = sessions.reduce((sum, s) => sum + s.total_oz, 0);
    const milestones = [100, 500, 1000, 2000, 5000];
    const withinPct = 0.05; // 5%

    let nearMilestone = 0;
    for (const m of milestones) {
      if (totalOz < m && totalOz >= m * (1 - withinPct)) {
        nearMilestone = m;
        break;
      }
    }

    // Also check time milestones (1 month, 3 months, 6 months, 1 year)
    const timeMilestones = [4, 12, 24, 52]; // weeks
    let nearTimeMilestone = 0;
    for (const wk of timeMilestones) {
      if (babyAgeWeeks >= wk - 1 && babyAgeWeeks < wk) {
        nearTimeMilestone = wk;
        break;
      }
    }

    if (nearMilestone > 0) {
      detected.push({
        pattern_name: "approaching_milestone",
        context_variant: "general",
        context_data: { milestone_oz: nearMilestone, current_oz: Math.round(totalOz) },
      });
    } else if (nearTimeMilestone > 0) {
      const labelMap: Record<number, string> = {
        4: "one month", 12: "three months", 24: "six months", 52: "one year",
      };
      detected.push({
        pattern_name: "approaching_milestone",
        context_variant: "general",
        context_data: { milestone_label: labelMap[nearTimeMilestone] ?? `${nearTimeMilestone} weeks` },
      });
    }
  }

  // ── Pattern 8: Approaching drop window
  if (!suppressedPatterns.has("approaching_drop_window")) {
    const skipCtx: PumpingContext[] = ["mostly_nursing", "weaning", "triple_feeding"];
    if (!skipCtx.includes(pumpingContext)) {
      const dropWindows = [
        { weeksLow: 7, weeksHigh: 9 },
        { weeksLow: 11, weeksHigh: 13 },
        { weeksLow: 23, weeksHigh: 25 },
      ];
      for (const w of dropWindows) {
        if (babyAgeWeeks >= w.weeksLow && babyAgeWeeks <= w.weeksHigh && last7.length >= 5) {
          const variant =
            pumpingContext === "work_pumping" && babyAgeWeeks >= 11 && babyAgeWeeks <= 13
              ? "work_pumping_12week"
              : "general";
          detected.push({
            pattern_name: "approaching_drop_window",
            context_variant: variant,
            context_data: { baby_age_months: Math.floor(babyAgeWeeks / 4.33) },
          });
          break;
        }
      }
    }
  }

  // ── Pattern 1: Long gap between sessions
  // skipGapAlerts = user opted in to "I nurse and pump — skip gap alerts"
  // A declared home day is the same idea, schedule-driven instead of
  // manually toggled — nursing-covered gaps there are expected, not a nag.
  const todayDayTypeForGap = dayTypeForDate(scheduleEnabled, scheduleAwayDays, now);
  if (!suppressedPatterns.has("long_gap_between_sessions") && !skipGapAlerts && todayDayTypeForGap !== "home") {
    const skipCtx: PumpingContext[] = ["mostly_nursing", "weaning", "equal_pumping_nursing"];
    if (!skipCtx.includes(pumpingContext) && last7.length >= 5) {
      // Merge pump sessions + nursing sessions into one sorted list of removal events
      const nursingLast7 = nursingSessions.filter(
        n => new Date(n.nursed_at) >= cutoff7
      );
      const allRemovalEvents = [
        ...last7.map(s => s.started_at),
        ...nursingLast7.map(n => n.nursed_at),
      ].sort();

      // Find gaps between consecutive removal events.
      // work_pumping: only measure gaps during work hours on weekdays (Mon–Fri, 8am–5pm).
      // All others: waking hours 7am–9pm. Cap at 21 so an evening session doesn't pair
      // with the next morning and create a false overnight gap.
      const daytimeEvents = allRemovalEvents.filter(iso => {
        const h = hourOf(iso);
        if (pumpingContext === "work_pumping") {
          const d = weekdayOf(iso); // 0=Sun, 6=Sat
          return d >= 1 && d <= 5 && h >= 8 && h <= 17;
        }
        return h >= 7 && h <= 21;
      });

      let maxGapHours = 0;
      for (let i = 1; i < daytimeEvents.length; i++) {
        const prev = new Date(daytimeEvents[i - 1]);
        const curr = new Date(daytimeEvents[i]);
        // Only count gaps within the same LOCAL calendar day
        if (dateKey(daytimeEvents[i - 1]) === dateKey(daytimeEvents[i])) {
          const gapH = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60);
          if (gapH > maxGapHours) maxGapHours = gapH;
        }
      }

      if (maxGapHours >= 5) {
        const variant =
          pumpingContext === "exclusive_pumping"    ? `exclusive_pumping_${stage}` :
          pumpingContext === "equal_pumping_nursing" ? "equal_pumping_nursing_any" :
          pumpingContext === "work_pumping"          ? "work_pumping_any" :
          pumpingContext === "supply_building"       ? "supply_building_any" :
          pumpingContext === "triple_feeding"        ? "triple_feeding_any" :
          `exclusive_pumping_${stage}`;

        // Triple feeding: only fire after 7 days in pattern
        const accountAge = daysBetween(new Date(accountCreatedAt), now);
        if (pumpingContext === "triple_feeding" && accountAge < 7) {
          // skip
        } else {
          detected.push({
            pattern_name: "long_gap_between_sessions",
            context_variant: variant,
            context_data: { gap_hours: Math.round(maxGapHours) },
          });
        }
      }
    }
  }

  // ── Pattern 17: Sudden sharp output drop — check pump parts first
  // Distinct from declining_output_trend, which catches a gradual ~10%+
  // drift over a rolling 5-day window. This catches a much more SEVERE
  // drop concentrated in just the last two days against the mom's own
  // recent baseline. Clinically, a drop this sharp is far more often a
  // worn or clogged pump part (a perished membrane, a blocked valve) than
  // a gradual supply change — a real client's output cratered, she swapped
  // parts, and it recovered within a session or two. This leads directly
  // with "check your parts" rather than burying it as one of several
  // possible causes the way declining_output_trend's copy does.
  const skipForSuddenDrop: PumpingContext[] = ["mostly_nursing", "weaning"];
  if (
    !suppressedPatterns.has("sudden_output_drop") &&
    !skipForSuddenDrop.includes(pumpingContext) &&
    sessions.length >= 10
  ) {
    const recentCutoff = new Date(now);
    recentCutoff.setDate(recentCutoff.getDate() - 2);

    const recentSessions = sorted.filter(s => new Date(s.started_at) >= recentCutoff);

    // If the last 2 days are all one declared schedule day-type (all away
    // or all home), compare against a same-type-only, widened baseline
    // instead of the raw prior week — otherwise a home day's naturally
    // lighter output reads as a "sudden drop" against an away-day-heavy
    // baseline. dayTypeForISO returns null when the schedule is off, so
    // recentTypes collapses to {null} and uniformType is null — exactly
    // today's behavior, unchanged.
    const recentTypes = new Set(recentSessions.map(s => dayTypeForISO(scheduleEnabled, scheduleAwayDays, s.started_at)));
    const uniformType: DayType = recentTypes.size === 1 ? [...recentTypes][0] : null;

    const baselineWindowDays = uniformType ? 14 : 7;
    const baselineStart = new Date(now);
    baselineStart.setDate(baselineStart.getDate() - (2 + baselineWindowDays));
    let baselineSessions = sorted.filter(s => {
      const t = new Date(s.started_at);
      return t >= baselineStart && t < recentCutoff;
    });
    if (uniformType) {
      baselineSessions = baselineSessions.filter(
        s => dayTypeForISO(scheduleEnabled, scheduleAwayDays, s.started_at) === uniformType
      );
    }

    // Require enough data in both windows so a couple of sparse days
    // doesn't read as a "drop" — this is about a real sudden change, not
    // noise from a light logging day. Same-type comparisons need less
    // baseline data since they're already apples-to-apples.
    const minBaseline = uniformType ? 3 : 5;
    if (recentSessions.length >= 2 && baselineSessions.length >= minBaseline) {
      const recentAvg   = average(recentSessions.map(s => s.total_oz));
      const baselineAvg = average(baselineSessions.map(s => s.total_oz));
      const dropPct = baselineAvg > 0 ? ((baselineAvg - recentAvg) / baselineAvg) * 100 : 0;

      // Much higher bar than declining_output_trend's 10% — this should
      // only fire for a drop severe enough to be alarming, not routine
      // day-to-day variation.
      if (dropPct >= 30) {
        detected.push({
          pattern_name: "sudden_output_drop",
          context_variant: "general",
          context_data: { drop_pct: Math.round(dropPct) },
        });
      }
    }
  }

  // ── Pattern 13: Pump parts replacement reminder
  if (!suppressedPatterns.has("pump_parts_replacement_reminder")) {
    const skipCtx: PumpingContext[] = ["mostly_nursing", "weaning"];
    if (!skipCtx.includes(pumpingContext)) {
      const accountAgeDays = daysBetween(new Date(accountCreatedAt), now);
      if (accountAgeDays >= 60 && accountAgeDays <= 90) {
        detected.push({
          pattern_name: "pump_parts_replacement_reminder",
          context_variant: "general",
          context_data: { days_logging: Math.round(accountAgeDays) },
        });
      }
    }
  }

  // ── Pattern 2: Morning higher than evening
  if (!suppressedPatterns.has("morning_output_higher_than_evening") && sessions.length >= 14) {
    const skipCtx: PumpingContext[] = ["mostly_nursing"];
    if (!skipCtx.includes(pumpingContext)) {
      const mornings = sessions.filter(s => {
        const h = hourOf(s.started_at);
        return h >= 5 && h < 11;
      });
      const evenings = sessions.filter(s => {
        const h = hourOf(s.started_at);
        return h >= 17 && h < 23;
      });

      if (mornings.length >= 5 && evenings.length >= 5) {
        const avgMorn = average(mornings.map(s => s.total_oz));
        const avgEve  = average(evenings.map(s => s.total_oz));
        if (avgEve > 0 && avgMorn / avgEve >= 1.25) {
          const pct = Math.round(((avgMorn - avgEve) / avgEve) * 100);
          detected.push({
            pattern_name: "morning_output_higher_than_evening",
            context_variant: "general",
            context_data: { morning_pct_higher: pct },
          });
        }
      }
    }
  }

  // ── Pattern 3: Sessions too long
  if (!suppressedPatterns.has("sessions_too_long_for_output_curve") && sessions.length >= 7) {
    const skipCtx: PumpingContext[] = ["mostly_nursing", "weaning"];
    if (!skipCtx.includes(pumpingContext)) {
      const avgDuration = average(sessions.map(s => s.duration_minutes));
      if (avgDuration >= 25) {
        const variant = isEarlyStage ? "early_postpartum" : "established";
        detected.push({
          pattern_name: "sessions_too_long_for_output_curve",
          context_variant: variant,
          context_data: { avg_duration_minutes: Math.round(avgDuration) },
        });
      }
    }
  }

  // ── Pattern 5: Plateau
  if (!suppressedPatterns.has("stable_output_plateau") && sessions.length >= 21) {
    const skipCtx: PumpingContext[] = ["mostly_nursing", "weaning", "triple_feeding"];
    if (!skipCtx.includes(pumpingContext)) {
      // Check 3 consecutive 7-day windows
      const windows: number[] = [];
      for (let i = 0; i < 3; i++) {
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        windows.push(sevenDayAvg(sessions, end));
      }

      if (windows[0] > 0 && windows[1] > 0 && windows[2] > 0) {
        const change01 = Math.abs((windows[0] - windows[1]) / windows[1]) * 100;
        const change12 = Math.abs((windows[1] - windows[2]) / windows[2]) * 100;
        if (change01 < 5 && change12 < 5) {
          const variant =
            pumpingContext === "exclusive_pumping"    ? `exclusive_pumping_${stage}` :
            pumpingContext === "equal_pumping_nursing" ? "equal_pumping_nursing_any" :
            pumpingContext === "work_pumping"          ? "work_pumping_any" :
            pumpingContext === "supply_building"       ? "supply_building_any" :
            `exclusive_pumping_${stage}`;

          detected.push({
            pattern_name: "stable_output_plateau",
            context_variant: variant,
            context_data: {
              current_avg_oz: parseFloat(windows[0].toFixed(1)),
              weeks_stable: 3,
            },
          });
        }
      }
    }
  }

  // ── Pattern 6: Weekend dip
  if (!suppressedPatterns.has("weekend_output_dip") && sessions.length >= 21) {
    const skipCtx: PumpingContext[] = [
      "equal_pumping_nursing", "mostly_nursing", "weaning", "triple_feeding",
    ];
    // This pattern's copy assumes literal Saturday/Sunday. If the mom has
    // a declared schedule whose away days AREN'T the weekend, suppress
    // rather than relabel — the AI-generated copy would otherwise say
    // "your weekend" for e.g. a Tue/Wed/Thu schedule.
    const scheduleConflictsWithWeekend =
      scheduleEnabled &&
      scheduleAwayDays.length > 0 &&
      !scheduleAwayDays.every(d => d === 0 || d === 6);
    if (!skipCtx.includes(pumpingContext) && !scheduleConflictsWithWeekend) {
      const weekday = sessions.filter(s => !isWeekend(s.started_at));
      const weekend = sessions.filter(s =>  isWeekend(s.started_at));

      if (weekday.length >= 10 && weekend.length >= 5) {
        // Compare per-day averages
        const wdDays = dailyTotals(weekday);
        const weDays = dailyTotals(weekend);
        const avgWd = average(Array.from(wdDays.values()));
        const avgWe = average(Array.from(weDays.values()));

        if (avgWd > 0 && (avgWd - avgWe) / avgWd >= 0.15) {
          const dipPct = Math.round(((avgWd - avgWe) / avgWd) * 100);
          const variant =
            pumpingContext === "exclusive_pumping" ? "exclusive_pumping" :
            pumpingContext === "work_pumping"      ? "work_pumping" :
            "supply_building";

          detected.push({
            pattern_name: "weekend_output_dip",
            context_variant: variant,
            context_data: { dip_pct: dipPct },
          });
        }
      }
    }
  }

  // ── Pattern 9: High schedule variability
  if (!suppressedPatterns.has("high_schedule_variability") && sessions.length >= 14) {
    const skipCtx: PumpingContext[] = [
      "equal_pumping_nursing", "work_pumping", "mostly_nursing", "weaning",
    ];
    // A declared schedule explains session-count variance on its own terms
    // (already suppressed for work_pumping context above for the same
    // reason) — a mom who set one up shouldn't be told her routine is
    // "inconsistent" for doing exactly what she planned.
    const hasActiveSchedule = scheduleEnabled && scheduleAwayDays.length > 0;
    if (!skipCtx.includes(pumpingContext) && !hasActiveSchedule) {
      const counts = dailySessionCounts(last7);
      const vals = Array.from(counts.values());
      const maxCount = Math.max(...vals);
      const minCount = Math.min(...vals);

      if (vals.length >= 5 && maxCount - minCount >= 2) {
        const variant =
          pumpingContext === "exclusive_pumping" ? `exclusive_pumping_${stage}` :
          pumpingContext === "supply_building"   ? "supply_building_any" :
          pumpingContext === "triple_feeding"    ? "triple_feeding_any" :
          `exclusive_pumping_${stage}`;

        detected.push({
          pattern_name: "high_schedule_variability",
          context_variant: variant,
          context_data: { min_sessions: minCount, max_sessions: maxCount },
        });
      }
    }
  }

  // ── Return top priority pattern (single insight per render cycle)
  // Priority: needs_attention > mild > celebratory > informational
  const priorityOrder: Record<string, number> = {
    sudden_output_drop:                  6,
    declining_output_trend:              5,
    long_gap_between_sessions:           4,
    high_schedule_variability:           4,
    first_week_encouragement:            3,
    output_trending_up:                  3,
    approaching_milestone:               3,
    approaching_drop_window:             2,
    stable_output_plateau:               2,
    weekend_output_dip:                  2,
    sessions_too_long_for_output_curve:  2,
    morning_output_higher_than_evening:  1,
    pump_parts_replacement_reminder:     1,
    new_user_first_session_encouragement: 1,
  };

  detected.sort((a, b) =>
    (priorityOrder[b.pattern_name] ?? 0) - (priorityOrder[a.pattern_name] ?? 0)
  );

  // Return top result only — UI shows one insight at a time
  return detected.slice(0, 1);
}
