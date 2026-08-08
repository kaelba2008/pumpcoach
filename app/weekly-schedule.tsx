import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { COLORS, SERIF } from "../lib/constants";
import { DatePickerField } from "../components/ui/DatePickerField";

// ── Constants ──────────────────────────────────────────────────────────────
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const ALL_DAYS   = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS   = [1, 2, 3, 4, 5];
const WEEKENDS   = [0, 6];

const PRESET_DAY_GROUPS: { label: string; days: number[] }[] = [
  { label: "Weekdays", days: WEEKDAYS },
  { label: "Weekends", days: WEEKENDS },
];

export default function WeeklyScheduleScreen() {
  const router = useRouter();
  const { effectiveDate: effectiveDateParam } = useLocalSearchParams<{ effectiveDate?: string }>();
  const { user, profile, loadProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const uid = user?.id ?? profile?.id ?? "";
  const scheduleEnabled = profile?.schedule_enabled ?? false;
  const awayDays = profile?.schedule_away_days ?? [];
  const effectiveDate = profile?.schedule_effective_date
    ? new Date(`${profile.schedule_effective_date}T12:00:00`)
    : effectiveDateParam
      ? new Date(`${effectiveDateParam}T12:00:00`)
      : null;

  const save = async (updates: Record<string, unknown>) => {
    if (!uid) {
      Alert.alert("Could not save", "Not signed in. Please restart the app.");
      return;
    }
    setSaving(true);
    await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", uid)
      .select();
    setSaving(false);
    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }
    if (!data?.length) {
      Alert.alert("Could not save", "Your session may have expired. Please sign out and sign back in.");
      return;
    }
    await loadProfile();
  };

  const toggleEnabled = (val: boolean) => save({ schedule_enabled: val });

  const toggleDay = (day: number) => {
    const next = awayDays.includes(day)
      ? awayDays.filter((d) => d !== day)
      : [...awayDays, day];
    save({ schedule_away_days: [...next].sort((a, b) => a - b) });
  };

  const applyPreset = (days: number[]) => save({ schedule_away_days: [...days].sort((a, b) => a - b) });

  const setEffectiveDate = (date: Date | null) =>
    save({ schedule_effective_date: date ? format(date, "yyyy-MM-dd") : null });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      {/* Header */}
      <LinearGradient
        colors={["#2E3F40", "#4A5E60"]}
        style={{ paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            ‹ Back
          </Text>
        </Pressable>
        <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Weekly Schedule</Text>
        <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3, lineHeight: 18 }}>
          Tell us which days you're typically away from baby — pumping at
          work, traveling, etc. We'll use this to understand your patterns,
          not to hold you to a plan. Change it anytime.
        </Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
        <View style={{
          backgroundColor: "#fff", borderRadius: 20, padding: 18,
          shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: COLORS.ink, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                Use a weekly schedule
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2, lineHeight: 15 }}>
                Off by default — turn on when your week has a real pattern
              </Text>
            </View>
            <Switch
              value={scheduleEnabled}
              onValueChange={toggleEnabled}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {scheduleEnabled && (
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 18, gap: 14,
            shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
              Which days are you away from baby?
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {PRESET_DAY_GROUPS.map(({ label: pl, days }) => {
                const sorted = [...days].sort((a, b) => a - b);
                const active = JSON.stringify(sorted) === JSON.stringify([...awayDays].sort((a, b) => a - b));
                return (
                  <Pressable
                    key={pl}
                    onPress={() => applyPreset(days)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: active ? COLORS.primary : COLORS.border,
                      backgroundColor: active ? "rgba(124,92,252,0.08)" : "#fff",
                    }}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontFamily: active ? "Nunito_700Bold" : "Nunito_400Regular",
                      fontWeight: active ? "700" : "400",
                      color: active ? COLORS.primary : COLORS.ink2,
                    }}>
                      {pl}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 6 }}>
              {ALL_DAYS.map((day) => {
                const sel = awayDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => toggleDay(day)}
                    style={{
                      flex: 1, aspectRatio: 1, borderRadius: 10,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1.5,
                      borderColor: sel ? COLORS.primary : COLORS.border,
                      backgroundColor: sel ? COLORS.primary : "#fff",
                    }}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontFamily: "Nunito_700Bold",
                      fontWeight: "700",
                      color: sel ? "#fff" : COLORS.ink3,
                    }}>
                      {DAY_LABELS[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ fontSize: 11, color: COLORS.ink3, lineHeight: 15 }}>
              {awayDays.length === 0
                ? "No away days selected yet — tap the days above."
                : "Every other day is treated as a home day. If a day doesn't go as planned, that's fine — your actual logged sessions always come first."}
            </Text>

            <DatePickerField
              label="Starts on (optional)"
              value={effectiveDate}
              onChange={setEffectiveDate}
              mode="date"
              optional
              minimumDate={new Date()}
            />
            <Text style={{ fontSize: 11, color: COLORS.ink3, lineHeight: 15 }}>
              Leave blank to start today. Set a future date to get this ready
              ahead of time without affecting your tracking yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
