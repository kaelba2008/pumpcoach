import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { format, startOfDay, subDays } from "date-fns";
import { PumpSession } from "../types";
import { COLORS, SERIF } from "../lib/constants";
import { formatUnit } from "../lib/units";
import { SparkLine } from "./ui/SparkLine";

interface ViewerDataDisplayProps {
  sessions: PumpSession[];
  personInitials: string;
  unit: "oz" | "ml";
}

interface DayData {
  date: string;
  dateObj: Date;
  sessions: PumpSession[];
  totalOz: number;
  avgOz: number;
  count: number;
}

export function ViewerDataDisplay({ sessions, personInitials, unit }: ViewerDataDisplayProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (sessions.length === 0) return null;

    // Group sessions by date
    const byDate = new Map<string, PumpSession[]>();
    sessions.forEach((s) => {
      const dateStr = format(new Date(s.started_at), "yyyy-MM-dd");
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr)!.push(s);
    });

    // Calculate daily totals
    const dailyData: DayData[] = [];
    byDate.forEach((sessionList, dateStr) => {
      const totalOz = sessionList.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
      const avgOz = totalOz / sessionList.length;
      dailyData.push({
        date: dateStr,
        dateObj: new Date(dateStr),
        sessions: sessionList,
        totalOz,
        avgOz,
        count: sessionList.length,
      });
    });

    // Sort by date descending (newest first)
    dailyData.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // Calculate overall metrics
    const totalOz = sessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    const totalMinutes = sessions.reduce((sum, s) => sum + ((s.duration_sec ?? 0) / 60), 0);
    const totalHours = totalMinutes / 60;
    const efficiencyPerHour = totalHours > 0 ? totalOz / totalHours : 0;
    const avgPerDay = dailyData.length > 0 ? totalOz / dailyData.length : 0;

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
      efficiencyPerHour: Math.round(efficiencyPerHour * 100) / 100,
      avgPerDay: Math.round(avgPerDay * 100) / 100,
      sparkData,
      sparkLabels,
      sparkDates,
      dayTotals,
    };
  }, [sessions]);

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
              Efficiency
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.primary }}>
              {analysis.efficiencyPerHour} oz/hr
            </Text>
          </View>
        </View>
      </View>

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
                    {day.count} session{day.count !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sessions for this date */}
            <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
              {day.sessions.map((s, idx) => (
                <View key={s.id}>
                  {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border }} />}
                  <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.ink }}>
                        {format(new Date(s.started_at), "h:mm a")}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.primary }}>
                        {formatUnit(s.total_oz ?? 0, unit)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.ink3 }}>
                      {Math.round((s.duration_sec ?? 0) / 60)} min · {s.pump_mode || "—"} mode
                    </Text>
                    {s.notes ? (
                      <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 4 }} numberOfLines={2}>
                        {s.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
