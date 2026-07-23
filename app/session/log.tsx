import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { UserPump } from "../../types";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { OzInput } from "../../components/ui/OzInput";
import { LETDOWN_OPTIONS, COLORS, SERIF } from "../../lib/constants";
import { PainLevelPicker } from "../../components/ui/PainLevelPicker";
import { useUnit } from "../../hooks/useUnit";
import { ozToMl, mlToOz, formatUnit } from "../../lib/units";
import { PhaseSettings } from "../../components/PhaseSettings";

const DURATION_PRESETS = [10, 15, 20, 25, 30, 40];
const LOG_BY_TOTAL_KEY = "log_by_total";

export default function LogSessionScreen() {
  const router   = useRouter();
  const { user, profile, isPremium } = useAuthStore();
  const { unit, changeUnit } = useUnit();

  const toDisplay = (oz: string) => {
    if (unit === "ml") { const n = parseFloat(oz) || 0; return n > 0 ? String(Math.round(ozToMl(n))) : ""; }
    return oz;
  };
  const fromDisplayToOz = (val: string) => {
    if (unit === "ml") { const ml = parseFloat(val) || 0; return ml > 0 ? String(Math.round(mlToOz(ml) * 100) / 100) : ""; }
    return val;
  };

  const [leftOz,   setLeftOz]   = useState("");
  const [rightOz,  setRightOz]  = useState("");
  const [totalOzValue, setTotalOzValue] = useState("");
  const [duration, setDuration] = useState("20");
  const [when,     setWhen]     = useState<Date>(new Date());
  const [letdown,  setLetdown]  = useState<string | null>(null);
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [logByTotal, setLogByTotal] = useState(false);
  const [pumpedAfterNursing, setPumpedAfterNursing] = useState<"yes" | "no" | "na" | null>(null);
  const [showPumpSettings,   setShowPumpSettings]   = useState(false);
  const [suctionLevel,       setSuctionLevel]       = useState<number | null>(null);
  const [cycleSpeed,         setCycleSpeed]         = useState<number | null>(null);
  const [pumpMode,           setPumpMode]           = useState<import("../../types").PumpMode | null>(null);
  const [userPumps,          setUserPumps]          = useState<UserPump[]>([]);
  const [selectedPumpName,   setSelectedPumpName]   = useState<string | null>(null);

  // Dual-phase settings
  const [massageDuration,         setMassageDuration]         = useState<string>("");
  const [massageSuction,          setMassageSuction]          = useState<number | null>(null);
  const [massageCycleSpeed,       setMassageCycleSpeed]       = useState<number | null>(null);
  const [expressionDuration,      setExpressionDuration]      = useState<string>("");
  const [expressionSuction,       setExpressionSuction]       = useState<number | null>(null);
  const [expressionCycleSpeed,    setExpressionCycleSpeed]    = useState<number | null>(null);
  const [timeToLetdownMin,        setTimeToLetdownMin]        = useState<string>("");
  const [showMassagePhase,        setShowMassagePhase]        = useState(false);
  const [showExpressionPhase,     setShowExpressionPhase]     = useState(false);

  // Load log-by-total preference + pumps
  useEffect(() => {
    AsyncStorage.getItem(LOG_BY_TOTAL_KEY).then((val) => {
      if (val === "true") setLogByTotal(true);
    });
    if (user && isPremium) {
      supabase
        .from("user_pumps")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data) {
            setUserPumps(data as UserPump[]);
            AsyncStorage.getItem("last_used_pump_name").then((last) => {
              if (last && (data as UserPump[]).some((p) => p.name === last)) {
                setSelectedPumpName(last);
              }
            });
          }
        });
    }
  }, [user, isPremium]);

  // Persist log-by-total preference whenever it changes
  useEffect(() => {
    AsyncStorage.setItem(LOG_BY_TOTAL_KEY, logByTotal ? "true" : "false");
  }, [logByTotal]);

  const displayTotal = logByTotal
    ? (parseFloat(totalOzValue) || 0)
    : (parseFloat(leftOz) || 0) + (parseFloat(rightOz) || 0);

  const showNursingToggle = profile?.pumping_context !== "exclusive_pumping";

  const handleSave = async () => {
    if (!user) return;

    // Validate date — prevent future dates or dates from >30 days ago (likely errors)
    const startedAt = when;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (startedAt > now) {
      Alert.alert("Invalid date", "Session date cannot be in the future");
      return;
    }
    if (startedAt < thirtyDaysAgo) {
      Alert.alert("Invalid date", "Session date cannot be more than 30 days old");
      return;
    }

    const durationMin = parseInt(duration) || 0;
    const endedAt     = new Date(startedAt.getTime() + durationMin * 60 * 1000);

    let finalLeftOz: number | null;
    let finalRightOz: number | null;

    if (logByTotal) {
      const total = parseFloat(totalOzValue) || 0;
      finalLeftOz  = total > 0 ? total / 2 : null;
      finalRightOz = total > 0 ? total / 2 : null;
    } else {
      finalLeftOz  = parseFloat(leftOz)  || null;
      finalRightOz = parseFloat(rightOz) || null;
    }

    setSaving(true);

    // Dual-phase data (if provided)
    const massageDurationSec = massageDuration ? parseInt(massageDuration) * 60 : null;
    const expressionDurationSec = expressionDuration ? parseInt(expressionDuration) * 60 : null;
    const timeToLetdownSec = timeToLetdownMin ? parseInt(timeToLetdownMin) * 60 : null;

    const { error } = await supabase.from("pump_sessions").insert({
      user_id:                    user.id,
      started_at:                 startedAt.toISOString(),
      ended_at:                   endedAt.toISOString(),
      duration_sec:               durationMin * 60,
      left_oz:                    finalLeftOz,
      right_oz:                   finalRightOz,
      notes:                      notes.trim() || null,
      pain_level:                 painLevel,
      letdown_quality:            letdown,
      session_type:               "pump",
      pumped_after_nursing:       pumpedAfterNursing,
      pump_name:                  selectedPumpName,
      suction_level:              suctionLevel,
      cycle_speed:                cycleSpeed,
      pump_mode:                  pumpMode,
      massage_suction_level:      massageSuction,
      massage_cycle_speed:        massageCycleSpeed,
      massage_duration_sec:       massageDurationSec,
      expression_suction_level:   expressionSuction,
      expression_cycle_speed:     expressionCycleSpeed,
      expression_duration_sec:    expressionDurationSec,
      time_to_letdown_sec:        timeToLetdownSec,
    });
    setSaving(false);
    if (error) { Alert.alert("Error saving", error.message); return; }
    if (selectedPumpName) {
      AsyncStorage.setItem("last_used_pump_name", selectedPumpName).catch(() => {});
    }
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 }}>
            <Pressable onPress={() => router.back()}>
              <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3 }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Log Session</Text>
            <View style={{ width: 56 }} />
          </View>

          <View className="px-6 gap-6 pb-10">
            {/* Oz */}
            <View className="bg-surface rounded-3xl p-6" style={{ shadowColor: "#1A1A2E", shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>

              {/* Unit toggle */}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 }}>
                {(["oz", "ml"] as const).map((u) => (
                  <Pressable
                    key={u}
                    onPress={() => changeUnit(u)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
                      backgroundColor: unit === u ? COLORS.primary : COLORS.muted,
                      marginLeft: 6, borderWidth: 1,
                      borderColor: unit === u ? COLORS.primary : COLORS.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${u}`}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: unit === u ? "#fff" : COLORS.ink2 }}>{u}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Fix 6: Log by total toggle */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <Pressable
                  onPress={() => {
                    const total = parseFloat(totalOzValue) || 0;
                    if (total > 0 && !leftOz && !rightOz) {
                      const half = String(Math.round(total / 2 * 100) / 100);
                      setLeftOz(half);
                      setRightOz(half);
                    }
                    setLogByTotal(false);
                  }}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
                    borderWidth: 1.5,
                    backgroundColor: !logByTotal ? COLORS.primary : COLORS.muted,
                    borderColor: !logByTotal ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: !logByTotal ? "#fff" : COLORS.ink2 }}>
                    Left & Right
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const sum = (parseFloat(leftOz) || 0) + (parseFloat(rightOz) || 0);
                    if (sum > 0) setTotalOzValue(String(sum));
                    setLogByTotal(true);
                  }}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
                    borderWidth: 1.5,
                    backgroundColor: logByTotal ? COLORS.primary : COLORS.muted,
                    borderColor: logByTotal ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: logByTotal ? "#fff" : COLORS.ink2 }}>
                    Total only
                  </Text>
                </Pressable>
              </View>

              {logByTotal ? (
                <View className="items-center mb-4">
                  <OzInput label="Total" value={toDisplay(totalOzValue)} onChange={(v) => setTotalOzValue(fromDisplayToOz(v))} unit={unit} />
                </View>
              ) : (
                <View className="flex-row justify-around mb-4">
                  <OzInput label="Left"  value={toDisplay(leftOz)}  onChange={(v) => setLeftOz(fromDisplayToOz(v))}   unit={unit} />
                  <View className="w-px bg-border" />
                  <OzInput label="Right" value={toDisplay(rightOz)} onChange={(v) => setRightOz(fromDisplayToOz(v))}  unit={unit} />
                </View>
              )}

              {displayTotal > 0 && (
                <View className="items-center pt-3 border-t border-border">
                  <Text className="text-xs text-ink-3 uppercase tracking-wider font-sans-semi mb-0.5">Total</Text>
                  <Text className="text-2xl font-sans-bold text-primary">
                    {formatUnit(displayTotal, unit)}
                  </Text>
                </View>
              )}
            </View>

            {/* When */}
            <DatePickerField
              label="When did you pump?"
              value={when}
              onChange={(d) => d && setWhen(d)}
              mode="datetime"
              maximumDate={new Date()}
            />

            {/* Duration */}
            <View>
              <Text className="text-sm font-sans text-ink-2 mb-2">Duration</Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {DURATION_PRESETS.map((min) => (
                  <Pressable
                    key={min}
                    onPress={() => setDuration(String(min))}
                    className={`px-4 py-2 rounded-xl border ${
                      duration === String(min)
                        ? "bg-primary border-primary"
                        : "bg-muted border-border"
                    }`}
                  >
                    <Text className={`text-sm font-sans-semi ${duration === String(min) ? "text-white" : "text-ink"}`}>
                      {min} min
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Input
                value={duration}
                onChangeText={setDuration}
                placeholder="Custom minutes"
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </View>

            {/* Phase Selection — independent toggles */}
            <View>
              <Text className="text-sm font-sans-semi text-ink-2 mb-2">Pump phases (select both if needed)</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setShowMassagePhase(!showMassagePhase)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border ${
                    showMassagePhase ? "bg-primary border-primary" : "bg-muted border-border"
                  }`}
                >
                  <Text className={`text-xs font-sans-semi text-center ${
                    showMassagePhase ? "text-white" : "text-ink"
                  }`}>
                    Massage
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowExpressionPhase(!showExpressionPhase)}
                  className={`flex-1 py-2.5 px-3 rounded-lg border ${
                    showExpressionPhase ? "bg-primary border-primary" : "bg-muted border-border"
                  }`}
                >
                  <Text className={`text-xs font-sans-semi text-center ${
                    showExpressionPhase ? "text-white" : "text-ink"
                  }`}>
                    Expression
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Massage Phase Settings */}
            {showMassagePhase && (
              <PhaseSettings
                phase="massage"
                duration={massageDuration}
                suctionLevel={massageSuction}
                cycleSpeed={massageCycleSpeed}
                onDurationChange={setMassageDuration}
                onSuctionChange={setMassageSuction}
                onCycleSpeedChange={setMassageCycleSpeed}
              />
            )}

            {/* Expression Phase Settings */}
            {showExpressionPhase && (
              <PhaseSettings
                phase="expression"
                duration={expressionDuration}
                suctionLevel={expressionSuction}
                cycleSpeed={expressionCycleSpeed}
                onDurationChange={setExpressionDuration}
                onSuctionChange={setExpressionSuction}
                onCycleSpeedChange={setExpressionCycleSpeed}
              />
            )}

            {/* Time to Letdown */}
            <View>
              <Text className="text-sm font-sans-semi text-ink-2 mb-2">Time to letdown (minutes)</Text>
              <Input
                value={timeToLetdownMin}
                onChangeText={setTimeToLetdownMin}
                placeholder="Optional"
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>

            {/* Pump picker — premium only */}
            {isPremium && userPumps.length === 0 && (
              <Pressable
                onPress={() => router.push("/(tabs)/profile" as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Which pump are you using?</Text>
                <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Add a pump →
                </Text>
              </Pressable>
            )}
            {isPremium && userPumps.length > 0 && (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text className="text-sm font-sans-semi text-ink-2">Which pump?</Text>
                  <Pressable
                    onPress={() => router.push("/(tabs)/profile" as any)}
                    style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: COLORS.primary,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>+</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {userPumps.map((pump) => {
                    const selected = selectedPumpName === pump.name;
                    return (
                      <Pressable
                        key={pump.id}
                        onPress={() => setSelectedPumpName(selected ? null : pump.name)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                          borderWidth: 1.5,
                          backgroundColor: selected ? COLORS.primary : COLORS.muted,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: selected ? "#fff" : COLORS.ink2 }}>
                          {pump.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Letdown */}
            <View>
              <Text className="text-sm font-sans-semi text-ink-2 mb-2">Letdown quality</Text>
              <View className="flex-row gap-2">
                {LETDOWN_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setLetdown(letdown === opt.value ? null : opt.value)}
                    className={`flex-1 items-center py-2 rounded-xl border ${
                      letdown === opt.value ? "bg-primary border-primary" : "bg-muted border-border"
                    }`}
                  >
                    <Text style={{ fontSize: 18 }}>{opt.emoji}</Text>
                    <Text className={`text-xs mt-0.5 font-sans ${letdown === opt.value ? "text-white" : "text-ink-2"}`}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Fix 12: Pumped after nursing toggle */}
            {showNursingToggle && (
              <View>
                <Text className="text-sm font-sans-semi text-ink-2 mb-2">Did you nurse before this session?</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["yes", "no", "na"] as const).map((opt) => {
                    const label = opt === "yes" ? "Yes" : opt === "no" ? "No" : "Not applicable";
                    const selected = pumpedAfterNursing === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setPumpedAfterNursing(selected ? null : opt)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
                          borderWidth: 1.5,
                          backgroundColor: selected ? COLORS.primary : COLORS.muted,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: selected ? "#fff" : COLORS.ink2 }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Pump settings — collapsible */}
            <View>
              <Pressable
                onPress={() => setShowPumpSettings((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                    ⚙ Pump settings
                  </Text>
                  {(suctionLevel || cycleSpeed || pumpMode) && (
                    <View style={{ backgroundColor: COLORS.muted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.border }}>
                      <Text style={{ fontSize: 11, color: COLORS.ink3 }}>
                        {[pumpMode && (pumpMode === "massage" ? "Massage" : pumpMode === "expression" ? "Expression" : "Combo"), suctionLevel && `S${suctionLevel}`, cycleSpeed && `C${cycleSpeed}`].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>{showPumpSettings ? "▲" : "▼"}</Text>
              </Pressable>

              {showPumpSettings && (
                <View style={{ gap: 16, paddingTop: 12 }}>
                  {/* Mode */}
                  <View>
                    <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Mode
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {([
                        { value: "massage",    label: "💧 Massage"    },
                        { value: "expression", label: "🥛 Expression" },
                        { value: "combo",      label: "🔄 Combo"      },
                      ] as const).map((opt) => {
                        const selected = pumpMode === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            onPress={() => setPumpMode(selected ? null : opt.value)}
                            style={{
                              flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
                              borderWidth: 1.5,
                              backgroundColor: selected ? COLORS.primary : COLORS.muted,
                              borderColor: selected ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: selected ? "#fff" : COLORS.ink2 }}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Suction level + Cycle speed */}
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Suction
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Pressable
                          onPress={() => setSuctionLevel((v) => v && v > 1 ? v - 1 : null)}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.muted, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" }}
                        >
                          <Text style={{ fontSize: 16, color: COLORS.ink2, lineHeight: 20 }}>−</Text>
                        </Pressable>
                        <Text style={{ fontSize: 24, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink, minWidth: 36, textAlign: "center" }}>
                          {suctionLevel ?? "—"}
                        </Text>
                        <Pressable
                          onPress={() => setSuctionLevel((v) => Math.min((v ?? 0) + 1, 12))}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" }}
                        >
                          <Text style={{ fontSize: 16, color: "#fff", lineHeight: 20 }}>+</Text>
                        </Pressable>
                        {suctionLevel && (
                          <Pressable onPress={() => setSuctionLevel(null)} hitSlop={8}>
                            <Text style={{ fontSize: 11, color: COLORS.ink3 }}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Speed
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Pressable
                          onPress={() => setCycleSpeed((v) => v && v > 1 ? v - 1 : null)}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.muted, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" }}
                        >
                          <Text style={{ fontSize: 16, color: COLORS.ink2, lineHeight: 20 }}>−</Text>
                        </Pressable>
                        <Text style={{ fontSize: 24, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink, minWidth: 36, textAlign: "center" }}>
                          {cycleSpeed ?? "—"}
                        </Text>
                        <Pressable
                          onPress={() => setCycleSpeed((v) => Math.min((v ?? 0) + 1, 12))}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" }}
                        >
                          <Text style={{ fontSize: 16, color: "#fff", lineHeight: 20 }}>+</Text>
                        </Pressable>
                        {cycleSpeed && (
                          <Pressable onPress={() => setCycleSpeed(null)} hitSlop={8}>
                            <Text style={{ fontSize: 11, color: COLORS.ink3 }}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Pain */}
            <PainLevelPicker value={painLevel} onChange={setPainLevel} />

            {/* Notes */}
            <Input
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="How did this session feel?"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 72 }}
              autoCapitalize="sentences"
            />

            <Button label="Save Session" onPress={handleSave} loading={saving} fullWidth size="lg" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
