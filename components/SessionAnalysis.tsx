import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { PumpSession } from "../types";
import { COLORS, SERIF, MIN_MEANINGFUL_SESSION_SEC } from "../lib/constants";
import { formatUnit } from "../lib/units";

interface SessionAnalysisProps {
  sessions: PumpSession[];
  unit: "oz" | "ml";
  /** Number of babies being pumped for — scales the output-quality baseline
   *  so a twin/multiples mom isn't judged against a singleton's expected
   *  volume. Defaults to 1 (today's behavior, unchanged) when not passed. */
  babyCount?: number;
}

const RATE_OZ_PER_HOUR = 1.25; // per baby — Katie's (IBCLC) clinical baseline

// Average gap between consecutive sessions (hours) — the "how long since
// last pump" signal the expected-output baseline scales with. Falls back to
// a typical 3h gap when there's only one session to work with.
function avgGapHours(sortedAsc: PumpSession[]): number {
  if (sortedAsc.length < 2) return 3;
  const gaps: number[] = [];
  for (let i = 1; i < sortedAsc.length; i++) {
    const gapMs = new Date(sortedAsc[i].started_at).getTime() - new Date(sortedAsc[i - 1].started_at).getTime();
    if (gapMs > 0) gaps.push(gapMs / 3_600_000);
  }
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 3;
}

export function SessionAnalysis({ sessions, unit, babyCount = 1 }: SessionAnalysisProps) {
  const analysis = useMemo(() => {
    if (sessions.length === 0) return null;

    // Efficiency: oz per minute
    const totalOz = sessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const totalMinutes = sessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    // Efficiency must pair oz with ITS OWN session's duration — a session
    // logged without a duration (duration_sec: 0), or with an unrealistically
    // short one (a mis-tap or quick test log), still counts its oz above but
    // would contribute almost no time here, inflating the ratio wildly (a
    // real case: a 24-second test session extrapolated to 226 oz/hr).
    // Exclude anything under MIN_MEANINGFUL_SESSION_SEC from both sides.
    const timedSessions = sessions.filter((s) => (s.duration_sec ?? 0) >= MIN_MEANINGFUL_SESSION_SEC);
    const timedOz      = timedSessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const timedMinutes = timedSessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    const efficiency = timedMinutes > 0 ? timedOz / timedMinutes : 0;

    // What a typical session actually looked like — literal average oz and
    // average length together, no extrapolation or scaling to a fixed unit
    // (an hourly rate or a "per 20 min" projection both assume a constant
    // flow rate, which isn't fair to a 10 or 15-minute pumper). Uses the
    // same cleanly-filtered timed sessions as efficiency above.
    const typicalSessionOz  = timedSessions.length > 0 ? timedOz / timedSessions.length : null;
    const typicalSessionMin = timedSessions.length > 0 ? timedMinutes / timedSessions.length : null;

    const avgOz = totalOz / sessions.length;
    const avgDuration = totalMinutes / sessions.length;

    // Output vs. what's expected for the actual gap since last session and
    // baby count — a signal that feeds the qualitative status/tips below,
    // not a blended score. Rate-based (oz/hr), not a flat per-session
    // number: a 4-hour gap should expect more output than a 2-hour gap,
    // and pumping for multiple babies should expect proportionally more.
    const sortedAsc = [...sessions].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    const expectedOzPerSession = RATE_OZ_PER_HOUR * avgGapHours(sortedAsc) * Math.max(1, babyCount);
    // 30% below expected — enough margin that normal session-to-session
    // variation doesn't trip this on its own.
    const outputBelowExpected = typicalSessionOz != null && typicalSessionOz < expectedOzPerSession * 0.7;

    // Trend: compare last 3 sessions to previous 3
    const recentThree = sessions.slice(0, 3);
    const priorThree = sessions.slice(3, 6);
    const recentAvg = recentThree.reduce((sum, s) => sum + (s.total_oz ?? 0), 0) / Math.max(1, recentThree.length);
    const priorAvg = priorThree.reduce((sum, s) => sum + (s.total_oz ?? 0), 0) / Math.max(1, priorThree.length);
    const trendPct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;

    // Best output hour (if started_at times available)
    const hourCounts: { [hour: number]: number } = {};
    const hourTotals: { [hour: number]: number } = {};
    sessions.forEach((s) => {
      const hour = new Date(s.started_at).getHours();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
      hourTotals[hour] = (hourTotals[hour] ?? 0) + (s.total_oz ?? 0);
    });
    const bestHour = Object.entries(hourTotals).reduce((best, [hour, total]) => {
      const count = hourCounts[parseInt(hour)] ?? 1;
      const avg = total / count;
      return avg > (hourTotals[best] ?? 0) / (hourCounts[best] ?? 1) ? parseInt(hour) : best;
    }, 0);

    // Pain pattern
    const painSessions = sessions.filter((s) => s.pain_level ?? 0 > 0);
    const hasPainIssue = painSessions.length / sessions.length > 0.4; // if >40% have pain

    // Letdown pattern
    const slowLetdown = sessions.filter((s) => s.letdown_quality === "slow" || s.letdown_quality === "none").length;
    const hasLetdownIssue = slowLetdown / sessions.length > 0.3; // if >30% slow/none

    return {
      efficiency: Math.round(efficiency * 100) / 100,
      typicalSessionOz:  typicalSessionOz  != null ? Math.round(typicalSessionOz * 100) / 100 : null,
      typicalSessionMin: typicalSessionMin != null ? Math.round(typicalSessionMin) : null,
      trendPct: Math.round(trendPct),
      bestHour,
      hasPainIssue,
      hasLetdownIssue,
      outputBelowExpected,
      avgOz: Math.round(avgOz * 100) / 100,
      avgDuration: Math.round(avgDuration),
    };
  }, [sessions, babyCount]);

  if (!analysis) return null;

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  const getTrendLabel = () => {
    if (analysis.trendPct > 10) return "↑ increasing";
    if (analysis.trendPct > 0) return "↗ slightly up";
    if (analysis.trendPct < -10) return "↓ decreasing";
    if (analysis.trendPct < 0) return "↘ slightly down";
    return "→ stable";
  };

  const recommendations = [];
  if (analysis.hasPainIssue) {
    recommendations.push("Ensure proper flange fit — wrong size reduces efficiency and causes pain");
  }
  if (analysis.hasLetdownIssue) {
    recommendations.push("Warm compress before pumping improves letdown");
  }
  if (analysis.efficiency < 0.35) {
    recommendations.push("Try Pump Pause Pump: pump until milk stops, take 5 min break, pump again");
  }
  if (analysis.efficiency < 0.45 && analysis.efficiency >= 0.35) {
    recommendations.push("Try hand expression between suction cycles to stimulate additional letdowns");
  }
  if (analysis.trendPct < -10) {
    recommendations.push("Ensure adequate hydration, rest, and nutrition — these directly affect supply");
  }
  if (analysis.outputBelowExpected) {
    recommendations.push("Output was a bit lower than expected for the time since your last session — dehydration, stress, or a longer stretch than usual can all play a role. One session doesn't define your supply.");
  }
  // Computed before the default message is added, so this reflects
  // whether anything above actually needs attention — not a hidden score.
  const hasConcerns = recommendations.length > 0;
  if (!hasConcerns) {
    recommendations.push("Your sessions are consistent and efficient — keep up the great work!");
  }

  return (
    <View className="bg-surface rounded-3xl p-6" style={{ shadowColor: "#1A1A2E", shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>
      <Text className="text-base font-serif text-ink mb-4">Session Insights</Text>

      {/* How things are going — qualitative, not a score */}
      <View className="mb-5 pb-5 border-b border-border">
        <Text className={`text-base font-sans-bold ${hasConcerns ? "text-orange-600" : "text-green-600"}`}>
          {hasConcerns ? "A couple things worth a look" : "Sessions are going well"}
        </Text>
        <Text className="text-xs text-ink-3 mt-1">
          {hasConcerns ? "See the tips below for what might help." : "Keep up what you're doing."}
        </Text>
      </View>

      {/* Efficiency & Trend */}
      <View style={{ flexDirection: "row", gap: 3, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Typical Session</Text>
          <Text className="text-lg font-sans-bold text-ink">
            {analysis.typicalSessionOz != null ? formatUnit(analysis.typicalSessionOz, unit) : "—"}
          </Text>
          {analysis.typicalSessionMin != null && (
            <Text className="text-xs text-ink-3 mt-0.5">in ~{analysis.typicalSessionMin} min</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Trend (vs prior)</Text>
          <Text className={`text-lg font-sans-bold ${analysis.trendPct > 0 ? "text-green-600" : analysis.trendPct < 0 ? "text-orange-600" : "text-ink"}`}>
            {getTrendLabel()}
          </Text>
          <Text className="text-xs text-ink-3">{analysis.trendPct > 0 ? "+" : ""}{analysis.trendPct}%</Text>
        </View>
      </View>

      {/* Patterns */}
      <View style={{ flexDirection: "row", gap: 3, marginBottom: 5 }}>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Best Time</Text>
          <Text className="text-sm font-sans-bold text-ink">{formatHour(analysis.bestHour)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Avg Output</Text>
          <Text className="text-sm font-sans-bold text-ink">{formatUnit(analysis.avgOz, unit)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Avg Duration</Text>
          <Text className="text-sm font-sans-bold text-ink">{analysis.avgDuration}m</Text>
        </View>
      </View>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <View className="mt-4 pt-4 border-t border-border">
          <Text className="text-xs text-ink-3 font-sans-semi mb-2">💡 Tips</Text>
          {recommendations.map((rec, i) => (
            <Text key={i} className="text-xs text-ink-2 mb-1.5 leading-4">
              • {rec}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
