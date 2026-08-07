import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { format } from "date-fns";
import { PumpSession, NursingSession } from "../types";
import { COLORS, SERIF } from "../lib/constants";
import { formatUnit } from "../lib/units";
import { removalRateTrendLabel } from "../lib/formatters";
import { computeDailyTotalTrend } from "../lib/patternDetection";

interface PartnerSummaryViewProps {
  sessions: PumpSession[];
  nursingSessions?: NursingSession[];
  personInitials: string;
  unit: "oz" | "ml";
}

// Intentionally slim compared to ViewerDataDisplay (the IBCLC view) — a
// partner doesn't need per-session detail or clinical numbers, just a
// gentle "how's it going" read. See the IBCLC dashboard plan for why this
// is a separate component rather than a stripped-down prop on the same one.
export function PartnerSummaryView({ sessions, nursingSessions = [], personInitials, unit }: PartnerSummaryViewProps) {
  const summary = useMemo(() => {
    if (sessions.length === 0 && nursingSessions.length === 0) return null;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todaySessions = sessions.filter((s) => format(new Date(s.started_at), "yyyy-MM-dd") === todayStr);
    const todayTotalOz = todaySessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);

    // Same reliability gate as the IBCLC view's Removal Rate — only surface
    // a trend once there's enough recent activity for it to mean anything.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessions24h = sessions.filter((s) => new Date(s.started_at) >= since24h);
    const nursing24hCount = nursingSessions.filter((n) => new Date(n.nursed_at) >= since24h).length;
    const totalRemovals24h = sessions24h.length + nursing24hCount;
    const trend = totalRemovals24h >= 5 ? removalRateTrendLabel(computeDailyTotalTrend(sessions)) : null;

    let encouragement: string;
    if (!trend) {
      encouragement = "Still gathering enough data for a trend.";
    } else if (trend.arrow === "↗") {
      encouragement = "She's had a strong few days.";
    } else if (trend.arrow === "↘") {
      encouragement = "Her output has eased off the last few days — that happens and is often temporary.";
    } else {
      encouragement = "She's on track with her usual rhythm this week.";
    }

    return {
      todayTotalOz,
      todaySessionCount: todaySessions.length,
      trend,
      encouragement,
    };
  }, [sessions, nursingSessions]);

  if (!summary) {
    return (
      <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: COLORS.ink2 }}>No session data available</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", fontWeight: "600", letterSpacing: 0.5, marginBottom: 8 }}>
          Viewing
        </Text>
        <Text style={{ fontSize: 18, fontFamily: SERIF, fontWeight: "600", color: COLORS.ink }}>
          {personInitials}
        </Text>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 16,
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4, fontWeight: "600" }}>
          Today
        </Text>
        <Text style={{ fontSize: 24, fontWeight: "700", color: COLORS.primary, marginBottom: 4 }}>
          {formatUnit(summary.todayTotalOz, unit)}
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.ink2 }}>
          {summary.todaySessionCount} session{summary.todaySessionCount !== 1 ? "s" : ""} so far today
        </Text>

        {summary.trend && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <Text style={{ fontSize: 16 }}>{summary.trend.arrow}</Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2 }}>{summary.trend.text}</Text>
          </View>
        )}
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 40,
          backgroundColor: COLORS.primaryMist,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <Text style={{ fontSize: 14, color: COLORS.ink, lineHeight: 20 }}>
          {summary.encouragement}
        </Text>
      </View>
    </View>
  );
}
