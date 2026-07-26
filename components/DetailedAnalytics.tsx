import React, { useMemo } from "react";
import { View, Text, ScrollView } from "react-native";
import { PumpSession } from "../types";
import { COLORS, SERIF } from "../lib/constants";
import { formatUnit } from "../lib/units";
import { subDays, startOfDay, differenceInDays, format } from "date-fns";

interface DetailedAnalyticsProps {
  sessions: PumpSession[];
  unit: "oz" | "ml";
}

export function DetailedAnalytics({ sessions, unit }: DetailedAnalyticsProps) {
  const analysis = useMemo(() => {
    if (sessions.length === 0) return null;

    const now = new Date();
    const last7Days = subDays(now, 7);
    const last30Days = subDays(now, 30);

    const sessionsLast7 = sessions.filter((s) => new Date(s.started_at) >= last7Days);
    const sessionsLast30 = sessions.filter((s) => new Date(s.started_at) >= last30Days);

    // Check if there's enough data (at least 7 days of sessions)
    const oldestSession = sessions.length > 0 ? new Date(sessions[sessions.length - 1].started_at) : now;
    const daysSinceStart = Math.floor((now.getTime() - oldestSession.getTime()) / (1000 * 60 * 60 * 24));
    const hasEnoughData = daysSinceStart >= 7;

    // ── Supply Trends ────────────────────────────────────────────────────
    const dailyOutputLast7: { date: string; oz: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(now, i));
      const dayStr = format(day, "M/d");
      const daySessions = sessionsLast7.filter((s) => startOfDay(new Date(s.started_at)).getTime() === day.getTime());
      const totalOz = daySessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
      dailyOutputLast7.push({ date: dayStr, oz: totalOz, count: daySessions.length });
    }

    const avgDaily7 = dailyOutputLast7.reduce((sum, d) => sum + d.oz, 0) / 7;
    const maxDaily7 = Math.max(...dailyOutputLast7.map((d) => d.oz), 0);
    const minDaily7 = Math.min(...dailyOutputLast7.filter((d) => d.oz > 0).map((d) => d.oz), 0) || 0;

    // ── Frequency Analysis ────────────────────────────────────────────────
    const sessionsPerDay7 = sessionsLast7.length / 7;
    const sessionsPerDay30 = sessionsLast30.length / 30;

    // Best day
    const bestDay = dailyOutputLast7.reduce((best, d) => (d.oz > best.oz ? d : best), dailyOutputLast7[0]);

    // ── Efficiency Deep Dive ──────────────────────────────────────────────
    const efficiencies = sessions
      .filter((s) => s.duration_sec && s.duration_sec > 0)
      .map((s) => ({
        efficiency: ((s.total_oz ?? 0) / ((s.duration_sec ?? 0) / 60)),
        oz: s.total_oz ?? 0,
        duration: s.duration_sec ?? 0,
        hour: new Date(s.started_at).getHours(),
        mode: s.pump_mode,
        suction: s.suction_level,
        speed: s.cycle_speed,
      }));

    const avgEfficiency = efficiencies.length > 0
      ? efficiencies.reduce((sum, e) => sum + e.efficiency, 0) / efficiencies.length
      : 0;

    // Best settings
    const bestSettings = efficiencies.sort((a, b) => b.efficiency - a.efficiency)[0];

    // Best time of day
    const hourlyStats: { [hour: number]: { oz: number; count: number; efficiency: number[] } } = {};
    sessions.forEach((s) => {
      const hour = new Date(s.started_at).getHours();
      if (!hourlyStats[hour]) hourlyStats[hour] = { oz: 0, count: 0, efficiency: [] };
      hourlyStats[hour].oz += s.total_oz ?? 0;
      hourlyStats[hour].count += 1;
      if (s.duration_sec) {
        hourlyStats[hour].efficiency.push((s.total_oz ?? 0) / (s.duration_sec / 60));
      }
    });

    const bestHourStats = Object.entries(hourlyStats).reduce((best, [hour, stats]) => {
      const bestEff = best.efficiency ?? 0;
      const thisEff = stats.efficiency.length > 0 ? stats.efficiency.reduce((a, b) => a + b) / stats.efficiency.length : 0;
      return thisEff > bestEff ? { hour: parseInt(hour), ...stats, efficiency: thisEff } : best;
    }, { hour: 0, oz: 0, count: 0, efficiency: 0 });

    // ── Pain & Letdown Correlation ────────────────────────────────────────
    const painSessions = sessions.filter((s) => (s.pain_level ?? 0) > 0);
    const painAvg = painSessions.length > 0 ? painSessions.reduce((sum, s) => sum + (s.pain_level ?? 0), 0) / painSessions.length : 0;

    const slowLetdown = sessions.filter((s) => s.letdown_quality === "slow" || s.letdown_quality === "none");
    const slowLetdownPct = (slowLetdown.length / sessions.length) * 100;

    const painByMode: { [key: string]: number[] } = {};
    painSessions.forEach((s) => {
      const mode = s.pump_mode || "unknown";
      if (!painByMode[mode]) painByMode[mode] = [];
      painByMode[mode].push(s.pain_level ?? 0);
    });

    const modePainAvg = Object.entries(painByMode).map(([mode, levels]) => ({
      mode,
      avg: levels.reduce((a, b) => a + b) / levels.length,
    }));

    // ── Productivity Scoring ──────────────────────────────────────────────
    const lastWeek = dailyOutputLast7.slice(-7);
    const prevWeek = dailyOutputLast7.slice(-14, -7);

    const thisWeekTotal = lastWeek.reduce((sum, d) => sum + d.oz, 0);
    const prevWeekTotal = prevWeek.length > 0 ? prevWeek.reduce((sum, d) => sum + d.oz, 0) : 0;
    const weekChange = prevWeekTotal > 0 ? ((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100 : 0;

    const consistency = lastWeek.length > 0
      ? 100 - (Math.sqrt(lastWeek.map((d) => Math.abs(d.oz - avgDaily7)).reduce((a, b) => a + b) / lastWeek.length) / avgDaily7) * 100
      : 0;

    // ── Recommendations ──────────────────────────────────────────────────
    const recommendations: string[] = [];

    if (!hasEnoughData) {
      recommendations.push("Keep logging to build your data history — patterns will appear after 7+ days");
    } else {
      if (sessionsPerDay7 < 8) {
        recommendations.push("Increase frequency to 8+ sessions daily to maintain supply");
      }
      if (avgEfficiency < 0.4) {
        recommendations.push("Session efficiency is low — consider adjusting suction or duration");
      }
      if (painAvg > 4) {
        recommendations.push("High pain levels detected — check flange size and pressure settings");
      }
      if (slowLetdownPct > 40) {
        recommendations.push("Frequent slow letdowns — try massage mode or warm compress beforehand");
      }
      if (weekChange < -15) {
        recommendations.push("Output is declining — ensure adequate hydration, rest, and nutrition");
      }
      if (consistency < 70) {
        recommendations.push("Highly variable output — aim for more consistent session timing");
      }
      if (bestSettings && bestSettings.suction && bestSettings.speed) {
        recommendations.push(`Your best settings: Suction ${bestSettings.suction}, Speed ${bestSettings.speed}`);
      }
    }

    return {
      dailyOutputLast7,
      avgDaily7,
      maxDaily7,
      minDaily7,
      sessionsPerDay7,
      sessionsPerDay30,
      bestDay,
      avgEfficiency,
      bestSettings,
      bestHourStats,
      painAvg,
      slowLetdownPct,
      modePainAvg,
      thisWeekTotal,
      prevWeekTotal,
      weekChange,
      consistency,
      recommendations,
      hasEnoughData,
    };
  }, [sessions]);

  if (!analysis) return null;

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Supply Trends */}
      <Section title="Supply Trends (Last 7 Days)">
        <Row label="Daily average" value={`${formatUnit(analysis.avgDaily7, unit)}`} />
        <Row label="Peak day" value={`${formatUnit(analysis.maxDaily7, unit)} (${analysis.bestDay.date})`} />
        <Row label="Lowest day" value={`${formatUnit(analysis.minDaily7, unit)}`} />

        {/* Daily breakdown */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink2, marginTop: 12, marginBottom: 8 }}>
          Daily Output
        </Text>
        <View style={{ gap: 6 }}>
          {analysis.dailyOutputLast7.map((day) => (
            <DayBar
              key={day.date}
              label={day.date}
              oz={day.oz}
              maxOz={analysis.maxDaily7}
              sessions={day.count}
            />
          ))}
        </View>
      </Section>

      {/* Frequency Analysis */}
      <Section title="Frequency">
        <Row label="Sessions/day (7d avg)" value={analysis.sessionsPerDay7.toFixed(1)} />
        <Row label="Sessions/day (30d avg)" value={analysis.sessionsPerDay30.toFixed(1)} />
      </Section>

      {/* Efficiency */}
      <Section title="Efficiency">
        <Row label="Avg oz/minute" value={analysis.avgEfficiency.toFixed(2)} />
        {analysis.bestSettings && (
          <>
            <Row
              label="Best efficiency"
              value={`${analysis.bestSettings.efficiency.toFixed(2)} oz/min`}
            />
            <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 6 }}>
              Settings: Mode {analysis.bestSettings.mode || "N/A"}, Suction {analysis.bestSettings.suction}, Speed {analysis.bestSettings.speed}
            </Text>
          </>
        )}
      </Section>

      {/* Best Time */}
      <Section title="Best Time of Day">
        <Row
          label={formatHour(analysis.bestHourStats.hour)}
          value={`${analysis.bestHourStats.efficiency.toFixed(2)} oz/min`}
        />
        <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 6 }}>
          Avg output: {formatUnit(analysis.bestHourStats.oz / analysis.bestHourStats.count, unit)} per session ({analysis.bestHourStats.count} sessions)
        </Text>
      </Section>

      {/* Pain & Letdown */}
      <Section title="Pain & Letdown Patterns">
        <Row label="Avg pain level" value={`${analysis.painAvg.toFixed(1)}/10`} />
        <Row label="Slow letdown %" value={`${analysis.slowLetdownPct.toFixed(0)}%`} />

        {analysis.modePainAvg.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink2, marginTop: 12 }}>
              Pain by Mode
            </Text>
            {analysis.modePainAvg.map((m) => (
              <Row key={m.mode} label={m.mode} value={`${m.avg.toFixed(1)}/10`} />
            ))}
          </>
        )}
      </Section>

      {/* Productivity */}
      <Section title="Productivity Score">
        {!analysis.hasEnoughData ? (
          <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 18 }}>
            Keep logging to see consistency and trend analysis. You'll unlock these insights once you have 7+ days of data.
          </Text>
        ) : (
          <>
            <Row
              label="This week"
              value={formatUnit(analysis.thisWeekTotal, unit)}
              valueColor={analysis.weekChange > 0 ? "#16A34A" : analysis.weekChange < -10 ? "#EA580C" : COLORS.primary}
            />
            {analysis.prevWeekTotal > 0 && (
              <Row label="vs last week" value={`${analysis.weekChange > 0 ? "+" : ""}${analysis.weekChange.toFixed(0)}%`} />
            )}
            <Row label="Consistency" value={`${analysis.consistency.toFixed(0)}%`} />
          </>
        )}
      </Section>

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <Section title="💡 Recommendations">
          {analysis.recommendations.map((rec, i) => (
            <Text key={i} style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 8, lineHeight: 18 }}>
              • {rec}
            </Text>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24, backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <Text style={{ fontSize: 16, fontWeight: "700", fontFamily: SERIF, color: COLORS.ink, marginBottom: 12 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Text style={{ fontSize: 14, color: COLORS.ink2 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: valueColor || COLORS.primary }}>{value}</Text>
    </View>
  );
}

function DayBar({ label, oz, maxOz, sessions }: { label: string; oz: number; maxOz: number; sessions: number }) {
  const width = maxOz > 0 ? (oz / maxOz) * 100 : 0;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: COLORS.ink3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink }}>
          {oz.toFixed(0)} oz ({sessions}x)
        </Text>
      </View>
      <View style={{ height: 8, backgroundColor: COLORS.muted, borderRadius: 4, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            width: `${width}%`,
            backgroundColor: width < 50 ? "#EA580C" : width < 75 ? "#F59E0B" : "#16A34A",
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}
