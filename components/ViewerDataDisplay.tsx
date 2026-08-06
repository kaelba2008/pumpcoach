import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { format, startOfDay, subDays } from "date-fns";
import { PumpSession, NursingSession } from "../types";
import { COLORS, SERIF, MIN_MEANINGFUL_SESSION_SEC } from "../lib/constants";
import { formatUnit } from "../lib/units";
import { removalRateTrendLabel } from "../lib/formatters";
import { computeDailyTotalTrend } from "../lib/patternDetection";
import { SparkLine } from "./ui/SparkLine";

interface ViewerDataDisplayProps {
  sessions: PumpSession[];
  nursingSessions?: NursingSession[];
  personInitials: string;
  unit: "oz" | "ml";
}

interface DayData {
  date: string;
  dateObj: Date;
  sessions: PumpSession[];
  nursingSessions: NursingSession[];
  totalOz: number;
  avgOz: number;
  count: number;
}

export function ViewerDataDisplay({ sessions, nursingSessions = [], personInitials, unit }: ViewerDataDisplayProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (sessions.length === 0 && nursingSessions.length === 0) return null;

    // Group pump + nursing sessions by date so a day with only nursing
    // logged (no pumping) still shows up — an IBCLC needs the full
    // feeding picture, not just pump output.
    const byDate = new Map<string, PumpSession[]>();
    sessions.forEach((s) => {
      const dateStr = format(new Date(s.started_at), "yyyy-MM-dd");
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr)!.push(s);
    });

    const nursingByDate = new Map<string, NursingSession[]>();
    nursingSessions.forEach((n) => {
      const dateStr = format(new Date(n.nursed_at), "yyyy-MM-dd");
      if (!nursingByDate.has(dateStr)) nursingByDate.set(dateStr, []);
      nursingByDate.get(dateStr)!.push(n);
    });

    const allDates = new Set([...byDate.keys(), ...nursingByDate.keys()]);

    // Calculate daily totals
    const dailyData: DayData[] = [];
    allDates.forEach((dateStr) => {
      const sessionList = byDate.get(dateStr) ?? [];
      const nursingList = nursingByDate.get(dateStr) ?? [];
      const totalOz = sessionList.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
      const avgOz = sessionList.length > 0 ? totalOz / sessionList.length : 0;
      dailyData.push({
        date: dateStr,
        // Bare "yyyy-MM-dd" strings parse as UTC midnight, which rolls
        // back a day once formatted in any timezone west of UTC. Anchor
        // to local noon instead, same fix as handleDayPress below.
        dateObj: new Date(`${dateStr}T12:00:00`),
        sessions: sessionList,
        nursingSessions: nursingList,
        totalOz,
        avgOz,
        count: sessionList.length,
      });
    });

    // Sort by date descending (newest first)
    dailyData.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // Calculate overall metrics
    const totalOz = sessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    // What a typical session actually looked like — literal average oz and
    // average length together, no extrapolation or scaling to a fixed unit
    // (an hourly rate or a "per 20 min" projection both assume a constant
    // flow rate, which isn't fair to a 10 or 15-minute pumper). Manually
    // logged sessions can have duration_sec: 0 (left blank), and a mis-tap
    // or test session (e.g. 19 seconds) has real oz but almost no time —
    // excluding anything under MIN_MEANINGFUL_SESSION_SEC keeps this honest.
    const timedSessions = sessions.filter((s) => (s.duration_sec ?? 0) >= MIN_MEANINGFUL_SESSION_SEC);
    const timedOz      = timedSessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const timedMinutes = timedSessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    const typicalSessionOz  = timedSessions.length > 0 ? timedOz / timedSessions.length : null;
    const typicalSessionMin = timedSessions.length > 0 ? timedMinutes / timedSessions.length : null;
    // Denominator is days that had a pump session, not every day in
    // dailyData — nursing-only days (added above so they're visible in
    // the list) would otherwise dilute this pump-output average.
    const avgPerDay = byDate.size > 0 ? totalOz / byDate.size : 0;

    // Split Typical Session by nursing day — same reasoning as the mom's
    // own Supply tab: a combo feeder pumps less on a day she also nursed,
    // so blending those sessions in with pump-only days understates both.
    const timedPumpOnlyDay = timedSessions.filter((s) => !nursingByDate.has(format(new Date(s.started_at), "yyyy-MM-dd")));
    const timedNursingDay  = timedSessions.filter((s) => nursingByDate.has(format(new Date(s.started_at), "yyyy-MM-dd")));
    const hasNursingSplit = timedPumpOnlyDay.length > 0 && timedNursingDay.length > 0;
    const typicalSessionOzPumpOnly = hasNursingSplit
      ? timedPumpOnlyDay.reduce((sum, s) => sum + (s.total_oz ?? 0), 0) / timedPumpOnlyDay.length
      : null;
    const typicalSessionOzNursingDay = hasNursingSplit
      ? timedNursingDay.reduce((sum, s) => sum + (s.total_oz ?? 0), 0) / timedNursingDay.length
      : null;

    // Removal rate — total pumped oz in the last 24h / 24 (a fixed
    // denominator, unlike a per-session extrapolation, so it can't be
    // distorted by a short session). Nursing sessions count toward the
    // reliability threshold — a real removal event even though its volume
    // isn't quantified — but are never added into the oz numerator.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessions24h = sessions.filter((s) => new Date(s.started_at) >= since24h);
    const nursing24hCount = nursingSessions.filter((n) => new Date(n.nursed_at) >= since24h).length;
    const rolling24hOz = sessions24h.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const totalRemovals24h = sessions24h.length + nursing24hCount;
    const hourlyRate = totalRemovals24h >= 5 ? rolling24hOz / 24 : null;
    const removalRateTrend = hourlyRate !== null
      ? removalRateTrendLabel(computeDailyTotalTrend(sessions))
      : null;

    // Build 7-day (or full range) sparkline data
    const endDate = new Date();
    const startDate = dailyData.length > 0 ? dailyData[dailyData.length - 1].dateObj : subDays(endDate, 7);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const sparkDays = Math.max(7, Math.min(daysDiff + 1, 90)); // Show 7-90 days depending on data

    const sparkData: number[] = [];
    const sparkLabels: string[] = [];
    const sparkDates: string[] = [];   // "yyyy-MM-dd", parallel to sparkData
    const dayTotals: Map<string, number> = new Map();

    dailyData.forEach((d) => {
      dayTotals.set(d.date, d.totalOz);
    });

    for (let i = sparkDays - 1; i >= 0; i--) {
      const day = startOfDay(subDays(endDate, i));
      const dateStr = format(day, "yyyy-MM-dd");
      sparkData.push(dayTotals.get(dateStr) ?? 0);
      sparkLabels.push(format(day, "M/d"));
      sparkDates.push(dateStr);
    }

    return {
      dailyData,
      totalOz,
      typicalSessionOz:  typicalSessionOz  != null ? Math.round(typicalSessionOz * 100) / 100 : null,
      typicalSessionMin: typicalSessionMin != null ? Math.round(typicalSessionMin) : null,
      typicalSessionOzPumpOnly:   typicalSessionOzPumpOnly   != null ? Math.round(typicalSessionOzPumpOnly * 100) / 100 : null,
      typicalSessionOzNursingDay: typicalSessionOzNursingDay != null ? Math.round(typicalSessionOzNursingDay * 100) / 100 : null,
      hourlyRate: hourlyRate != null ? Math.round(hourlyRate * 100) / 100 : null,
      hourlyRateNursingCount: nursing24hCount,
      removalRateTrend,
      avgPerDay: Math.round(avgPerDay * 100) / 100,
      sparkData,
      sparkLabels,
      sparkDates,
      dayTotals,
    };
  }, [sessions, nursingSessions]);

  if (!analysis || analysis.dailyData.length === 0) {
    return (
      <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: COLORS.ink2 }}>No session data available</Text>
      </View>
    );
  }

  const maxDaily = Math.max(...analysis.sparkData, 1);

  const handleDayPress = (index: number) => {
    const fullDate = analysis.sparkDates[index];
    if (!fullDate) return;
    const dateObj = new Date(`${fullDate}T12:00:00`);
    const dayData = analysis.dailyData.find((d) => d.date === fullDate);

    if (dayData && dayData.totalOz > 0) {
      Alert.alert(
        `${format(dateObj, "EEE, MMM d")}`,
        `${dayData.count} session${dayData.count !== 1 ? "s" : ""} · ${formatUnit(dayData.totalOz, unit)} total`,
        [{ text: "OK" }]
      );
    } else {
      Alert.alert(format(dateObj, "EEE, MMM d"), "No sessions logged this day", [{ text: "OK" }]);
    }
  };

  return (
    <View>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", fontWeight: "600", letterSpacing: 0.5, marginBottom: 8 }}>
          Viewing
        </Text>
        <Text style={{ fontSize: 18, fontFamily: SERIF, fontWeight: "600", color: COLORS.ink }}>
          {personInitials}
        </Text>
      </View>

      {/* Key Metrics */}
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 16,
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4, fontWeight: "600" }}>
              Avg per Day
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.primary }}>
              {formatUnit(analysis.avgPerDay, unit)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4, fontWeight: "600" }}>
              Typical Session
            </Text>
            {analysis.typicalSessionOzPumpOnly != null && analysis.typicalSessionOzNursingDay != null ? (
              <>
                <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.primary }}>
                  {formatUnit(analysis.typicalSessionOzPumpOnly, unit)}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>pump-only days</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.ink2, marginTop: 4 }}>
                  {formatUnit(analysis.typicalSessionOzNursingDay, unit)} <Text style={{ fontSize: 11, color: COLORS.ink3, fontWeight: "400" }}>on nursing days</Text>
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.primary }}>
                  {analysis.typicalSessionOz != null ? formatUnit(analysis.typicalSessionOz, unit) : "—"}
                </Text>
                {analysis.typicalSessionMin != null && (
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>
                    in ~{analysis.typicalSessionMin} min
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </View>

      {/* Removal rate — only shown once reliable */}
      {analysis.hourlyRate != null && (
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4, fontWeight: "600" }}>
            Removal Rate
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.primary }}>
              {formatUnit(analysis.hourlyRate, unit)}/hr
            </Text>
            {analysis.removalRateTrend && (
              <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                {analysis.removalRateTrend.arrow} {analysis.removalRateTrend.text}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 4, lineHeight: 15 }}>
            Pumped output over the last 24 hours, divided evenly across the day
            {analysis.hourlyRateNursingCount > 0
              ? ` (plus ${analysis.hourlyRateNursingCount} nursing session${analysis.hourlyRateNursingCount === 1 ? "" : "s"} in that window)`
              : ""}
            . Useful for confirming this holds steady through a session-count change.
          </Text>
        </View>
      )}

      {/* Sparkline Graph (clickable) */}
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 16,
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ fontSize: 11, color: COLORS.ink3, fontWeight: "600", marginBottom: 12 }}>
          {analysis.sparkLabels.length}-Day Trend (tap a day for details)
        </Text>
        <Pressable onPress={() => {}} style={{ marginBottom: 8 }}>
          <SparkLine
            data={analysis.sparkData}
            labels={analysis.sparkLabels}
            width={300}
            height={60}
            color={COLORS.primary}
            fillColor="rgba(124,92,252,0.08)"
            onPointPress={handleDayPress}
          />
        </Pressable>
      </View>

      {/* Sessions by Date */}
      <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
        <Text style={{ fontSize: 11, color: COLORS.ink3, fontWeight: "600", textTransform: "uppercase", marginBottom: 12 }}>
          Sessions by Date
        </Text>
        {analysis.dailyData.map((day) => (
          <View key={day.date} style={{ marginBottom: 16 }}>
            {/* Date header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: COLORS.ink, fontFamily: SERIF }}>
                {format(day.dateObj, "EEE, MMM d")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.primary }}>
                    {formatUnit(day.totalOz, unit)}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.ink3 }}>
                    {day.count > 0 ? `${day.count} session${day.count !== 1 ? "s" : ""}` : null}
                    {day.count > 0 && day.nursingSessions.length > 0 ? " · " : null}
                    {day.nursingSessions.length > 0 ? `${day.nursingSessions.length} nursing` : null}
                  </Text>
                </View>
              </View>
            </View>

            {/* Pump + nursing entries for this date, interleaved by time */}
            <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
              {[
                ...day.sessions.map((s) => ({ kind: "pump" as const, time: s.started_at, data: s })),
                ...day.nursingSessions.map((n) => ({ kind: "nursing" as const, time: n.nursed_at, data: n })),
              ]
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                .map((entry, idx) => (
                  <View key={`${entry.kind}-${entry.data.id}`}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border }} />}
                    {entry.kind === "pump" ? (
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.ink }}>
                            {format(new Date(entry.data.started_at), "h:mm a")}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.primary }}>
                            {formatUnit(entry.data.total_oz ?? 0, unit)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: COLORS.ink3 }}>
                          {Math.round((entry.data.duration_sec ?? 0) / 60)} min · {entry.data.pump_mode || "—"} mode
                        </Text>
                        {entry.data.notes ? (
                          <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 4 }} numberOfLines={2}>
                            {entry.data.notes}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.primaryMist }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.ink }}>
                            🤱 {format(new Date(entry.data.nursed_at), "h:mm a")}
                          </Text>
                          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>Nursed</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: COLORS.ink3 }}>
                          {[
                            entry.data.duration_min != null ? `${entry.data.duration_min} min` : null,
                            entry.data.side,
                          ].filter(Boolean).join(" · ") || "—"}
                        </Text>
                        {entry.data.notes ? (
                          <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 4 }} numberOfLines={2}>
                            {entry.data.notes}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
