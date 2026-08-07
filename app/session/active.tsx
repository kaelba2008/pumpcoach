import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, AppState, KeyboardAvoidingView, Platform, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { subDays } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { useSessionStore } from "../../store/sessionStore";
import { useAuthStore } from "../../store/authStore";
import { OzInput } from "../../components/ui/OzInput";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { PainLevelPicker } from "../../components/ui/PainLevelPicker";
import { PhaseSettings } from "../../components/PhaseSettings";
import { FlangePicker } from "../../components/FlangePicker";
import { SessionInsightSheet } from "../../components/SessionInsightSheet";
import { fmtMs, babyAgeWeeks } from "../../lib/formatters";
import { LETDOWN_OPTIONS, COLORS, SERIF } from "../../lib/constants";
import { PumpSession, UserPump, FlangeShape, FlangeMaterial } from "../../types";
import { maybeRequestRatingForStreak } from "../../lib/ratingPrompt";
import { useUnit } from "../../hooks/useUnit";
import { ozToMl, mlToOz, formatUnit } from "../../lib/units";

const LOG_BY_TOTAL_KEY    = "log_by_total";
const LAST_PUMP_KEY       = "last_used_pump_name";
const LAST_BABY_KEY       = "last_used_baby_name";
const LAST_FLANGE_SHAPE_KEY    = "last_used_flange_shape";
const LAST_FLANGE_MATERIAL_KEY = "last_used_flange_material";

interface SavedSession {
  totalOz: number;
  durationSec: number;
  leftOz: number;
  rightOz: number;
  painLevel: number | null;
  startedAt: string;
  prevSessionEndedAt?: string;
}

export default function ActiveSessionScreen() {
  const router   = useRouter();
  const { user, profile, babies, isPremium } = useAuthStore();
  const store    = useSessionStore();
  const { unit, changeUnit } = useUnit();

  // Helpers: convert between unit and internal oz storage
  const toDisplay = (oz: string) => {
    if (unit === "ml") {
      const n = parseFloat(oz) || 0;
      return n > 0 ? String(Math.round(ozToMl(n))) : "";
    }
    return oz;
  };
  const fromDisplay = (val: string, side: "left" | "right") => {
    if (unit === "ml") {
      const ml = parseFloat(val) || 0;
      store.updateOz(side, ml > 0 ? String(Math.round(mlToOz(ml) * 100) / 100) : "");
    } else {
      store.updateOz(side, val);
    }
  };

  const [elapsed,              setElapsed]              = useState(0);
  const [saving,               setSaving]               = useState(false);
  const [insightData,          setInsightData]          = useState<SavedSession | null>(null);
  const [insightAvgOz,         setInsightAvgOz]         = useState(0);
  const [sessionCount,         setSessionCount]         = useState(1);
  const [typicalDailyCount,    setTypicalDailyCount]    = useState(0);
  const [showInsight,          setShowInsight]          = useState(false);
  const [recentSessions,       setRecentSessions]       = useState<import("../../lib/patternDetection").SessionRecord[]>([]);
  const [logByTotal,           setLogByTotal]           = useState(false);
  const [totalOzValue,         setTotalOzValue]         = useState("");
  const [pumpedAfterNursing,   setPumpedAfterNursing]   = useState<"yes" | "no" | "na" | null>(null);
  const [userPumps,            setUserPumps]            = useState<UserPump[]>([]);
  const [selectedPumpName,     setSelectedPumpName]     = useState<string | null>(null);
  const [selectedBabyName,     setSelectedBabyName]     = useState<string | null>(null);
  const [flangeSizeMmRight,    setFlangeSizeMmRight]    = useState<number | null>(null);
  const [flangeSizeMmLeft,     setFlangeSizeMmLeft]     = useState<number | null>(null);
  const [flangeShape,          setFlangeShape]          = useState<FlangeShape | null>(null);
  const [flangeMaterial,       setFlangeMaterial]       = useState<FlangeMaterial | null>(null);
  const [massageDuration,       setMassageDuration]       = useState("");
  const [massageSuction,        setMassageSuction]        = useState<number | null>(null);
  const [massageCycle,          setMassageCycle]          = useState<number | null>(null);
  const [expressionDuration,    setExpressionDuration]    = useState("");
  const [expressionSuction,     setExpressionSuction]     = useState<number | null>(null);
  const [expressionCycle,       setExpressionCycle]       = useState<number | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load log-by-total preference
  useEffect(() => {
    AsyncStorage.getItem(LOG_BY_TOTAL_KEY).then((val) => {
      if (val === "true") setLogByTotal(true);
    });
  }, []);

  // Load user's pumps and pre-select last used
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_pumps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const pumps = (data ?? []) as UserPump[];
        setUserPumps(pumps);
        if (pumps.length > 0) {
          AsyncStorage.getItem(LAST_PUMP_KEY).then((last) => {
            const match = pumps.find((p) => p.name === last);
            setSelectedPumpName(match ? match.name : pumps[0].name);
          });
        }
      });
  }, [user]);

  // Persist log-by-total preference whenever it changes
  useEffect(() => {
    AsyncStorage.setItem(LOG_BY_TOTAL_KEY, logByTotal ? "true" : "false");
  }, [logByTotal]);

  // Pre-select the last-used baby (already loaded in the store — no fresh query needed)
  useEffect(() => {
    if (babies.length === 0) return;
    AsyncStorage.getItem(LAST_BABY_KEY).then((last) => {
      const match = babies.find((b) => b.name === last);
      setSelectedBabyName(match ? match.name : babies[0].name);
    });
  }, [babies]);

  // Flange defaults: size from the profile default, shape/material from
  // whatever was last picked (no profile equivalent for those exists).
  useEffect(() => {
    if (profile?.flange_size_mm_right) setFlangeSizeMmRight(profile.flange_size_mm_right);
    if (profile?.flange_size_mm_left) setFlangeSizeMmLeft(profile.flange_size_mm_left);
    AsyncStorage.getItem(LAST_FLANGE_SHAPE_KEY).then((v) => { if (v) setFlangeShape(v as FlangeShape); });
    AsyncStorage.getItem(LAST_FLANGE_MATERIAL_KEY).then((v) => { if (v) setFlangeMaterial(v as FlangeMaterial); });
  }, [profile?.flange_size_mm_right, profile?.flange_size_mm_left]);

  // Start session if not already running
  useEffect(() => {
    if (!store.active) store.startSession();
  }, []);

  // Ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsed(store.getElapsedMs());
    }, 500);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [store.active?.isPaused]);

  const togglePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (store.active?.isPaused) store.resumeSession();
    else store.pauseSession();
  };

  const handleFinish = async () => {
    const { active } = store;
    if (!active || !user) return;

    // Validate date — prevent future dates or sessions from >30 days ago
    const startedAt = new Date(active.startedAt);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (startedAt > now) {
      Alert.alert("Invalid session", "Session cannot start in the future");
      return;
    }
    if (startedAt < thirtyDaysAgo) {
      Alert.alert("Invalid session", "Session is too old to save (>30 days)");
      return;
    }

    let leftOz: number | null;
    let rightOz: number | null;

    if (logByTotal) {
      const total = parseFloat(totalOzValue) || 0;
      leftOz  = total > 0 ? total / 2 : null;
      rightOz = total > 0 ? total / 2 : null;
    } else {
      leftOz  = parseFloat(active.left_oz)  || null;
      rightOz = parseFloat(active.right_oz) || null;
    }

    if (!leftOz && !rightOz) {
      Alert.alert(
        "No output entered",
        "Did you want to save this session without any ounces?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save anyway", onPress: () => doSave(leftOz, rightOz) },
        ]
      );
      return;
    }
    doSave(leftOz, rightOz);
  };

  const doSave = async (leftOz: number | null, rightOz: number | null) => {
    const { active } = store;
    if (!active || !user) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const endedAt    = new Date();
      const durationMs = store.getElapsedMs();
      const durationSec = Math.round(durationMs / 1000);
      const resolvedLeft  = leftOz  ?? 0;
      const resolvedRight = rightOz ?? 0;
      const totalOz = resolvedLeft + resolvedRight;

      const { error } = await supabase.from("pump_sessions").insert({
        user_id:              user.id,
        started_at:           new Date(active.startedAt).toISOString(),
        ended_at:             endedAt.toISOString(),
        duration_sec:         durationSec,
        left_oz:              leftOz,
        right_oz:             rightOz,
        notes:                active.notes.trim() || null,
        pain_level:           active.pain_level,
        letdown_quality:      active.letdown_quality,
        session_type:         active.session_type,
        pumped_after_nursing: pumpedAfterNursing,
        pump_name:            selectedPumpName,
        baby_name:            selectedBabyName,
        flange_size_mm_right: flangeSizeMmRight,
        flange_size_mm_left:  flangeSizeMmLeft,
        flange_shape:         flangeShape,
        flange_material:      flangeMaterial,
        massage_suction_level:    massageSuction,
        massage_cycle_speed:      massageCycle,
        massage_duration_sec:     massageDuration ? parseInt(massageDuration, 10) * 60 : null,
        expression_suction_level: expressionSuction,
        expression_cycle_speed:   expressionCycle,
        expression_duration_sec:  expressionDuration ? parseInt(expressionDuration, 10) * 60 : null,
        // Legacy columns: mirror expression phase so older analytics keep working
        suction_level:        expressionSuction ?? massageSuction,
        cycle_speed:          expressionCycle ?? massageCycle,
        pump_mode:            massageSuction && expressionSuction ? "combo"
                              : massageSuction ? "massage"
                              : expressionSuction ? "expression" : null,
      });

      if (error) {
        Alert.alert("Error saving session", error.message);
        return;
      }

      if (selectedPumpName) {
        AsyncStorage.setItem(LAST_PUMP_KEY, selectedPumpName).catch(() => {});
      }
      if (selectedBabyName) {
        AsyncStorage.setItem(LAST_BABY_KEY, selectedBabyName).catch(() => {});
      }
      if (flangeShape) {
        AsyncStorage.setItem(LAST_FLANGE_SHAPE_KEY, flangeShape).catch(() => {});
      }
      if (flangeMaterial) {
        AsyncStorage.setItem(LAST_FLANGE_MATERIAL_KEY, flangeMaterial).catch(() => {});
      }

      // Fetch recent sessions for avg, session count, and pattern detection
      const since = subDays(new Date(), 7).toISOString();
      const { data: recent } = await supabase
        .from("pump_sessions")
        .select("id, total_oz, started_at, duration_sec, pain_level")
        .eq("user_id", user!.id)
        .gte("started_at", since)
        .order("started_at", { ascending: false });

      const pastSessions = (recent ?? []) as Pick<PumpSession, "id" | "total_oz" | "started_at" | "duration_sec" | "pain_level">[];
      const avgOz = pastSessions.length > 0
        ? pastSessions.reduce((s, r) => s + (r.total_oz ?? 0), 0) / pastSessions.length
        : 0;
      const todayStr = new Date().toDateString();
      const todayCount = pastSessions.filter((s) => new Date(s.started_at).toDateString() === todayStr).length;

      // Compute typical daily session count from last 7 days (exclude today — it's incomplete)
      const dailyMap = new Map<string, number>();
      for (const s of pastSessions) {
        const k = new Date(s.started_at).toDateString();
        dailyMap.set(k, (dailyMap.get(k) ?? 0) + 1);
      }
      const baselineCounts = [...dailyMap.entries()]
        .filter(([k]) => k !== todayStr)
        .map(([, v]) => v);
      const typicalDaily = baselineCounts.length > 0
        ? baselineCounts.reduce((a, b) => a + b, 0) / baselineCounts.length
        : 0;

      // pastSessions[0] is the session we just saved; [1] is the one before it
      const prevSession = pastSessions[1];
      const prevSessionEndedAt = prevSession
        ? new Date(new Date(prevSession.started_at).getTime() + (prevSession.duration_sec ?? 0) * 1000).toISOString()
        : undefined;

      store.clearSession();
      setInsightData({
        totalOz, durationSec, leftOz: resolvedLeft, rightOz: resolvedRight, painLevel: active.pain_level,
        startedAt: new Date(active.startedAt).toISOString(),
        prevSessionEndedAt,
      });
      setInsightAvgOz(avgOz);
      setSessionCount(todayCount);
      setTypicalDailyCount(typicalDaily);
      setRecentSessions(pastSessions.map(s => ({
        id: s.id,
        started_at: s.started_at,
        duration_minutes: (s.duration_sec ?? 0) / 60,
        total_oz: s.total_oz ?? 0,
        pain_level: s.pain_level ?? undefined,
      })));
      setShowInsight(true);

      // Check for 7-day logging streak and maybe request a rating
      try {
        const { data: allDays } = await supabase
          .from("pump_sessions")
          .select("started_at")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(30);
        if (allDays && allDays.length >= 7) {
          const uniqueDays = [...new Set(
            allDays.map((s: { started_at: string }) => s.started_at.slice(0, 10))
          )] as string[];
          maybeRequestRatingForStreak(uniqueDays).catch(() => {});
        }
      } catch {
        // Non-critical — swallow silently
      }
    } catch (err) {
      console.error("Session save error:", err);
      Alert.alert("Error saving session", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      "Discard session?",
      "This session won't be saved.",
      [
        { text: "Keep going", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => { store.clearSession(); router.back(); },
        },
      ]
    );
  };

  const handleInsightClose = () => {
    setShowInsight(false);
    setInsightData(null);
    router.back();
  };

  const { active } = store;

  if (showInsight && insightData) {
    return (
      <SessionInsightSheet
        visible={showInsight}
        onClose={handleInsightClose}
        session={insightData}
        avgOz={insightAvgOz}
        sessionCountToday={sessionCount}
        typicalDailySessionCount={typicalDailyCount}
        isPremium={isPremium}
        pumpedAfterNursing={pumpedAfterNursing}
        sessions={recentSessions}
        pumpingContext={(profile?.pumping_context ?? "unspecified") as any}
        userId={profile?.id ?? ""}
        accountCreatedAt={profile?.created_at ?? new Date().toISOString()}
        babyAgeWeeks={
          babyAgeWeeks(babies.find((b) => b.name === selectedBabyName)?.dob ?? null)
        }
      />
    );
  }

  if (!active) return null;

  const leftOz  = parseFloat(active.left_oz)  || 0;
  const rightOz = parseFloat(active.right_oz) || 0;
  const displayTotal = logByTotal
    ? (parseFloat(totalOzValue) || 0)
    : leftOz + rightOz;

  const showNursingToggle = profile?.pumping_context !== "exclusive_pumping";

  return (
    <>
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 }}>
            <Pressable onPress={handleDiscard}>
              <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3 }}>Discard</Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Pumping Session</Text>
            <View style={{ width: 56 }} />
          </View>

          {/* Timer */}
          <View className="items-center py-8">
            <View
              style={{
                width: 192, height: 192, borderRadius: 96,
                alignItems: "center", justifyContent: "center", marginBottom: 8,
                backgroundColor: active.isPaused ? COLORS.muted : COLORS.primaryMist,
                borderWidth: 4,
                borderColor: active.isPaused ? COLORS.border : COLORS.primary,
              }}
            >
              <Text style={{
                fontSize: 48, fontFamily: "Nunito_700Bold", fontWeight: "700",
                color: COLORS.ink, letterSpacing: -1,
                lineHeight: 58, includeFontPadding: false,
              }}>
                {fmtMs(elapsed)}
              </Text>
              {active.isPaused && (
                <Text className="text-xs text-ink-3 mt-1 font-sans-semi uppercase tracking-wider">
                  Paused
                </Text>
              )}
            </View>

            <Pressable
              onPress={togglePause}
              className="px-8 py-3 rounded-full mt-2"
              style={{ backgroundColor: active.isPaused ? COLORS.sage : COLORS.border }}
              accessibilityRole="button"
              accessibilityLabel={active.isPaused ? "Resume session" : "Pause session"}
              accessibilityState={{ selected: active.isPaused }}
            >
              <Text className="text-sm font-sans-semi text-white">
                {active.isPaused ? "▶  Resume" : "⏸  Pause"}
              </Text>
            </Pressable>

            {/* Fix 9: Manual log link */}
            <Pressable
              onPress={() => router.replace("/session/log" as any)}
              style={{ marginTop: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Log manually instead"
            >
              <Text style={{ fontSize: 12, color: COLORS.ink3, textDecorationLine: "underline", textAlign: "center" }}>
                Log manually instead
              </Text>
            </Pressable>
          </View>

          {/* Oz inputs */}
          <View className="px-6 mb-6">
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
                      marginLeft: 6,
                      borderWidth: 1,
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
                  onPress={() => setLogByTotal(false)}
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
                    const sum = (parseFloat(active.left_oz) || 0) + (parseFloat(active.right_oz) || 0);
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
                <View className="items-center">
                  <OzInput label="Total" value={toDisplay(totalOzValue)} onChange={(v) => {
                    if (unit === "ml") {
                      const ml = parseFloat(v) || 0;
                      setTotalOzValue(ml > 0 ? String(Math.round(mlToOz(ml) * 100) / 100) : "");
                    } else {
                      setTotalOzValue(v);
                    }
                  }} unit={unit} />
                </View>
              ) : (
                <View className="flex-row justify-around mb-4">
                  <OzInput label="Left" value={toDisplay(active.left_oz)}  onChange={(v) => fromDisplay(v, "left")}  unit={unit} />
                  <View className="w-px bg-border" />
                  <OzInput label="Right" value={toDisplay(active.right_oz)} onChange={(v) => fromDisplay(v, "right")} unit={unit} />
                </View>
              )}

              {displayTotal > 0 && (
                <View className="items-center pt-3 border-t border-border mt-4">
                  <Text className="text-xs text-ink-3 uppercase tracking-wider font-sans-semi mb-0.5">Total</Text>
                  <Text className="text-2xl font-sans-bold text-primary">
                    {formatUnit(displayTotal, unit)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Letdown quality */}
          <View className="px-6 mb-4">
            <Text className="text-sm font-sans-semi text-ink-2 mb-2">How was letdown?</Text>
            <View className="flex-row gap-2">
              {LETDOWN_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() =>
                    store.updateLetdown(active.letdown_quality === opt.value ? null : opt.value)
                  }
                  className={`flex-1 items-center py-2 rounded-xl border ${
                    active.letdown_quality === opt.value
                      ? "bg-primary border-primary"
                      : "bg-muted border-border"
                  }`}
                >
                  <Text style={{ fontSize: 18 }}>{opt.emoji}</Text>
                  <Text className={`text-xs mt-0.5 font-sans ${active.letdown_quality === opt.value ? "text-white" : "text-ink-2"}`}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Baby picker — not gated by isPremium, since attribution matters
              for insight quality for every user, not just a premium
              comparison feature like the pump picker below. Single-baby
              households (the overwhelming majority) see no picker at all —
              they're auto-selected silently by the effect above. */}
          {babies.length === 0 && (
            <View className="px-6 mb-4">
              <Pressable
                onPress={() => router.push("/(tabs)/profile" as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Which baby is this for?</Text>
                <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Add a baby →
                </Text>
              </Pressable>
            </View>
          )}
          {babies.length > 1 && (
            <View className="px-6 mb-4">
              <Text className="text-sm font-sans-semi text-ink-2 mb-2">Which baby?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {babies.map((baby) => {
                  const selected = selectedBabyName === baby.name;
                  return (
                    <Pressable
                      key={baby.id}
                      onPress={() => setSelectedBabyName(baby.name)}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                        borderWidth: 1.5,
                        backgroundColor: selected ? COLORS.primary : COLORS.muted,
                        borderColor: selected ? COLORS.primary : COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: selected ? "#fff" : COLORS.ink2 }}>
                        {baby.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Pump picker — premium only */}
          {isPremium && userPumps.length === 0 && (
            <View className="px-6 mb-4">
              <Pressable
                onPress={() => router.push("/(tabs)/profile" as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Which pump are you using?</Text>
                <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Add a pump →
                </Text>
              </Pressable>
            </View>
          )}
          {isPremium && userPumps.length > 0 && (
            <View className="px-6 mb-4">
              <Text className="text-sm font-sans-semi text-ink-2 mb-2">Which pump?</Text>
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

          <View className="px-6">
            <FlangePicker
              sizeMmRight={flangeSizeMmRight}
              sizeMmLeft={flangeSizeMmLeft}
              shape={flangeShape}
              material={flangeMaterial}
              onSizeRightChange={setFlangeSizeMmRight}
              onSizeLeftChange={setFlangeSizeMmLeft}
              onShapeChange={setFlangeShape}
              onMaterialChange={setFlangeMaterial}
            />
          </View>

          {/* Phase Settings — Massage and Expression */}
          <View className="px-6 mb-4 gap-4">
            <PhaseSettings
              phase="massage"
              duration={massageDuration}
              suctionLevel={massageSuction}
              cycleSpeed={massageCycle}
              onDurationChange={setMassageDuration}
              onSuctionChange={setMassageSuction}
              onCycleSpeedChange={setMassageCycle}
            />
            <PhaseSettings
              phase="expression"
              duration={expressionDuration}
              suctionLevel={expressionSuction}
              cycleSpeed={expressionCycle}
              onDurationChange={setExpressionDuration}
              onSuctionChange={setExpressionSuction}
              onCycleSpeedChange={setExpressionCycle}
            />
          </View>

          {/* Pumped after nursing toggle */}
          {showNursingToggle && (
            <View className="px-6 mb-4">
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

          {/* Pain level */}
          <View className="px-6 mb-4">
            <PainLevelPicker
              value={active.pain_level}
              onChange={store.updatePainLevel}
            />
          </View>

          {/* Notes */}
          <View className="px-6 mb-8">
            <Input
              label="Notes (optional)"
              value={active.notes}
              onChangeText={store.updateNotes}
              placeholder="How did this session feel?"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 72 }}
              autoCapitalize="sentences"
            />
          </View>

          {/* Save */}
          <View className="px-6 pb-8">
            <Button
              label="Finish & Save"
              onPress={handleFinish}
              loading={saving}
              fullWidth
              size="lg"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </>
  );
}
