import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { PumpSession } from "../types";
import { COLORS, SERIF } from "../lib/constants";
import { formatUnit } from "../lib/units";

interface SessionAnalysisProps {
  sessions: PumpSession[];
  unit: "oz" | "ml";
}

export function SessionAnalysis({ sessions, unit }: SessionAnalysisProps) {
  const analysis = useMemo(() => {
    if (sessions.length === 0) return null;

    // Efficiency: oz per minute
    const totalOz = sessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const totalMinutes = sessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    // Efficiency must pair oz with ITS OWN session's duration — a session
    // logged without a duration (duration_sec: 0) still counts its oz above
    // but would contribute no time here, inflating the ratio for everyone
    // else. Exclude undurated sessions from both sides of this one ratio.
    const timedSessions = sessions.filter((s) => (s.duration_sec ?? 0) > 0);
    const timedOz      = timedSessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const timedMinutes = timedSessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    const efficiency = timedMinutes > 0 ? timedOz / timedMinutes : 0;

    // Output per hour: production rate over the last 24h (matches the
    // "typical ~1 oz/hr" guideline, which is daily output ÷ 24).
    const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    const last24Oz = sessions
      .filter((s) => new Date(s.started_at).getTime() >= dayAgoMs)
      .reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const ozPerHour = last24Oz > 0 ? last24Oz / 24 : null;

    // Session quality score (0-100)
    const avgOz = totalOz / sessions.length;
    const avgDuration = totalMinutes / sessions.length;
    const avgPain = sessions.reduce((sum, s) => sum + (s.pain_level ?? 0), 0) / sessions.length;
    const goodLetdown = sessions.filter((s) => s.letdown_quality === "strong" || s.letdown_quality === "normal").length;
    const letdownQuality = (goodLetdown / sessions.length) * 100;

    // Quality score: 40% output, 25% duration, 20% letdown, 15% pain (inverted)
    const outputScore = Math.min(100, (avgOz / 4) * 100); // baseline ~4oz
    const durationScore = Math.min(100, (avgDuration / 20) * 100); // baseline ~20min
    const painScore = Math.max(0, 100 - (avgPain * 20)); // lower pain = higher score
    const qualityScore = Math.round(
      outputScore * 0.4 + durationScore * 0.25 + letdownQuality * 0.2 + painScore * 0.15
    );

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
      ozPerHour: ozPerHour ? Math.round(ozPerHour * 100) / 100 : null,
      qualityScore,
      trendPct: Math.round(trendPct),
      bestHour,
      hasPainIssue,
      hasLetdownIssue,
      avgOz: Math.round(avgOz * 100) / 100,
      avgDuration: Math.round(avgDuration),
    };
  }, [sessions]);

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

  const getQualityLabel = () => {
    if (analysis.qualityScore >= 80) return "Great";
    if (analysis.qualityScore >= 60) return "Good";
    if (analysis.qualityScore >= 40) return "Fair";
    return "Low";
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
  if (recommendations.length === 0) {
    recommendations.push("Your sessions are consistent and efficient — keep up the great work!");
  }

  return (
    <View className="bg-surface rounded-3xl p-6" style={{ shadowColor: "#1A1A2E", shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>
      <Text className="text-base font-serif text-ink mb-4">Session Insights</Text>

      {/* Quality Score */}
      <View className="mb-5 pb-5 border-b border-border">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text className="text-sm text-ink-2">Session Quality</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text className="text-2xl font-sans-bold text-primary">{analysis.qualityScore}</Text>
            <Text className="text-xs text-ink-2">/100 {getQualityLabel()}</Text>
          </View>
        </View>
      </View>

      {/* Efficiency & Trend */}
      <View style={{ flexDirection: "row", gap: 3, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text className="text-xs text-ink-3 font-sans-semi mb-1">Output per Hour</Text>
          <Text className="text-lg font-sans-bold text-ink">
            {analysis.ozPerHour ? `${formatUnit(analysis.ozPerHour, unit)}/hr` : "—"}
          </Text>
          <Text className="text-xs text-ink-3 mt-0.5">typical: ~1 oz/hr</Text>
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
