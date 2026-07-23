import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, Pressable, RefreshControl, Dimensions, ActionSheetIOS, Alert, Modal, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { format, startOfDay, subDays, differenceInDays } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { useSessionStore } from "../../store/sessionStore";
import { SparkLine } from "../../components/ui/SparkLine";
import { CoachCard } from "../../components/CoachCard";
import { DailyTip } from "../../components/DailyTip";
import { ConsultRecommendation } from "../../components/ConsultRecommendation";
import { PremiumTeaser } from "../../components/ui/PremiumTeaser";
import { NursingEntryModal } from "../../components/NursingEntryModal";
import { SessionAnalysis } from "../../components/SessionAnalysis";
import { fmtOz, babyAgeLabel } from "../../lib/formatters";
import { useUnit } from "../../hooks/useUnit";
import { formatUnit, ozToMl, mlToOz } from "../../lib/units";
import { COLORS, DAYS_SHORT, SERIF, GRADIENTS } from "../../lib/constants";
import { PumpSession, StashEntry, NursingSession } from "../../types";
import { checkAndFireMilestones } from "../../lib/encouragementScheduler";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { OzInput } from "../../components/ui/OzInput";
import { PainLevelPicker } from "../../components/ui/PainLevelPicker";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

const NURSING_LOG_KEY = "show_nursing_log";

function shouldShowNursingLog(context: string | null | undefined, override: string | null): boolean {
  if (override === "true")  return true;
  if (override === "false") return false;
  // Default: hide only for exclusive pumpers
  return context !== "exclusive_pumping";
}

const SCREEN_W = Dimensions.get("window").width;

// Build a 7-element array of daily oz totals (Sun=index0 ... oldest→newest)
function buildSparkData(sessions: PumpSession[]): { data: number[]; labels: string[] } {
  const data: number[]   = [];
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const day   = startOfDay(subDays(new Date(), i));
    const next  = startOfDay(subDays(new Date(), i - 1));
    const dayOz = sessions
      .filter((s) => s.started_at >= day.toISOString() && s.started_at < next.toISOString())
      .reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    data.push(dayOz);
    labels.push(DAYS_SHORT[day.getDay()]);
  }
  return { data, labels };
}

// Return the hour of day (0-23) with the highest average oz across all sessions
function bestOutputHour(sessions: PumpSession[]): string | null {
  if (sessions.length === 0) return null;
  const buckets: Record<number, number[]> = {};
  sessions.forEach((s) => {
    const h = new Date(s.started_at).getHours();
    if (!buckets[h]) buckets[h] = [];
    buckets[h].push(s.total_oz ?? 0);
  });
  let bestH = -1, bestAvg = -1;
  Object.entries(buckets).forEach(([h, vals]) => {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > bestAvg) { bestAvg = avg; bestH = Number(h); }
  });
  if (bestH < 0) return null;
  const suffix = bestH < 12 ? "am" : "pm";
  const h12    = bestH === 0 ? 12 : bestH > 12 ? bestH - 12 : bestH;
  return `${h12}${suffix}`;
}

function minutesSince(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
}

// ── EditSessionModal ─────────────────────────────────────────────────────────

interface EditSessionModalProps {
  session: PumpSession | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditSessionModal({ session, visible, onClose, onSaved }: EditSessionModalProps) {
  const { unit } = useUnit();
  const [startedAt,  setStartedAt]  = useState<Date>(new Date());
  const [leftOz,     setLeftOz]     = useState("");   // always stored in oz internally
  const [rightOz,    setRightOz]    = useState("");
  const [painLevel,  setPainLevel]  = useState<number | null>(null);
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);

  const toDisplay = (oz: string) => {
    if (unit === "ml") { const n = parseFloat(oz) || 0; return n > 0 ? String(Math.round(ozToMl(n))) : ""; }
    return oz;
  };
  const fromDisplay = (val: string) => {
    if (unit === "ml") { const ml = parseFloat(val) || 0; return ml > 0 ? String(Math.round(mlToOz(ml) * 100) / 100) : ""; }
    return val;
  };

  useEffect(() => {
    if (session) {
      setStartedAt(new Date(session.started_at));
      setLeftOz(session.left_oz  != null ? String(session.left_oz)  : "");
      setRightOz(session.right_oz != null ? String(session.right_oz) : "");
      setPainLevel(session.pain_level);
      setNotes(session.notes ?? "");
    }
  }, [session]);

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase
      .from("pump_sessions")
      .update({
        started_at: startedAt.toISOString(),
        left_oz:    parseFloat(leftOz)  || null,
        right_oz:   parseFloat(rightOz) || null,
        notes:      notes.trim() || null,
        pain_level: painLevel,
      })
      .eq("id", session.id);
    setSaving(false);
    if (error) { Alert.alert("Error saving", error.message); return; }
    onSaved();
    onClose();
  };

  if (!session) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Edit Session</Text>
          <Pressable onPress={handleSave} hitSlop={12} disabled={saving}>
            <Text style={{ fontSize: 15, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20 }}>
          {/* When */}
          <DatePickerField
            label="When"
            value={startedAt}
            onChange={(d) => d && setStartedAt(d)}
            mode="datetime"
            maximumDate={new Date()}
          />

          {/* Oz inputs */}
          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 8 }}>
              <OzInput label="Left"  value={toDisplay(leftOz)}  onChange={(v) => setLeftOz(fromDisplay(v))}  unit={unit} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <OzInput label="Right" value={toDisplay(rightOz)} onChange={(v) => setRightOz(fromDisplay(v))} unit={unit} />
            </View>
          </View>

          {/* Pain level */}
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

          <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth size="lg" />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── DashboardScreen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router         = useRouter();
  const { profile, isPremium, trialEndsAt } = useAuthStore();
  const { active }     = useSessionStore();
  const { unit }       = useUnit();

  const [sessions,           setSessions]           = useState<PumpSession[]>([]);
  const [stashOz,            setStashOz]            = useState<number>(0);
  const [nursingSessions,    setNursingSessions]    = useState<NursingSession[]>([]);
  const [nursingOverride,    setNursingOverride]    = useState<string | null>(null);
  const [nursingModal,       setNursingModal]       = useState(false);
  const [editingNursing,     setEditingNursing]     = useState<NursingSession | null>(null);
  const [refreshing,         setRefreshing]         = useState(false);
  const [skipGapAlerts,      setSkipGapAlerts]      = useState(false);
  const [hydrationGlasses,   setHydrationGlasses]   = useState(0);
  const [weeklyHydration,    setWeeklyHydration]    = useState<number[]>([]);

  // Fix 4: expanded session id for notes
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Fix 5: edit past session state
  const [editingSession, setEditingSession] = useState<PumpSession | null>(null);
  const [showEditModal,  setShowEditModal]  = useState(false);

  const showNursingLog = shouldShowNursingLog(profile?.pumping_context, nursingOverride);

  // Load AsyncStorage preferences once
  useEffect(() => {
    AsyncStorage.getItem(NURSING_LOG_KEY).then(setNursingOverride);
    AsyncStorage.getItem("skip_gap_alerts_pref").then(val => {
      if (val !== null) setSkipGapAlerts(val === "true");
    });
  }, []);

  const loadData = useCallback(async () => {
    const since     = subDays(new Date(), 7).toISOString();
    const todayISO  = startOfDay(new Date()).toISOString();
    const todayDate = format(new Date(), "yyyy-MM-dd");

    const [sessionRes, stashRes, nursingRes, lifetimeRes] = await Promise.all([
      supabase
        .from("pump_sessions")
        .select("*")
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      supabase
        .from("stash_entries")
        .select("oz"),
      supabase
        .from("nursing_sessions")
        .select("*")
        .gte("nursed_at", todayISO)
        .order("nursed_at", { ascending: false }),
      supabase
        .from("pump_sessions")
        .select("total_oz"),
    ]);
    if (sessionRes.data) setSessions(sessionRes.data as PumpSession[]);
    if (stashRes.data)   setStashOz((stashRes.data as StashEntry[]).reduce((s, e) => s + (e.oz ?? 0), 0));
    if (nursingRes.data) setNursingSessions(nursingRes.data as NursingSession[]);

    // Milestone checks — fire async, don't block UI
    const { profile: p } = useAuthStore.getState();
    if (p?.id && lifetimeRes.data) {
      const lifetimeOz = (lifetimeRes.data as Pick<PumpSession, "total_oz">[])
        .reduce((s, r) => s + (r.total_oz ?? 0), 0);
      checkAndFireMilestones(p.id, lifetimeOz, p.created_at).catch(() => {});
    }

    // Hydration — only if the user has opted in
    if (p?.track_hydration) {
      const sinceDateStr = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const { data: hydRows } = await supabase
        .from("daily_hydration")
        .select("date, glasses")
        .gte("date", sinceDateStr)
        .order("date", { ascending: true });

      if (hydRows) {
        // Today's count
        const todayRow = hydRows.find((r) => r.date === todayDate);
        setHydrationGlasses(todayRow?.glasses ?? 0);

        // 7-day array (oldest → newest), 0-filled for missing days
        const weekly: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = format(subDays(new Date(), i), "yyyy-MM-dd");
          const row = hydRows.find((r) => r.date === d);
          weekly.push(row?.glasses ?? 0);
        }
        setWeeklyHydration(weekly);
      }
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Refresh whenever the tab/screen comes back into focus (e.g. after saving a session)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Derived stats
  const todayStart     = startOfDay(new Date()).toISOString();
  const todaySessions  = sessions.filter((s) => s.started_at >= todayStart);
  const todayOz        = todaySessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
  const weekOz         = sessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
  const weekDailyAvg   = weekOz / 7;                                         // per day
  const perSessionAvg  = sessions.length > 0 ? weekOz / sessions.length : 0; // per session

  const goalOz         = profile?.daily_goal_oz ?? null;
  const goalPct        = goalOz && goalOz > 0 ? Math.min(1, todayOz / goalOz) : null;
  const { data: sparkData, labels: sparkLabels } = buildSparkData(sessions);
  const bestHour       = bestOutputHour(sessions);
  const lastSession    = sessions[0] ?? null;
  const lastSessionAgo = lastSession ? minutesSince(lastSession.started_at) : null;

  const babyAgeWeeks   = profile?.baby_dob
    ? Math.floor((Date.now() - new Date(profile.baby_dob).getTime()) / (7 * 24 * 3600 * 1000))
    : null;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName  = profile?.display_name?.split(" ")[0] ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero header ─────────────────────────────── */}
        <View style={{ overflow: "hidden", borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }}>
        <LinearGradient
          colors={GRADIENTS.plumRich}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 20, paddingBottom: 44, paddingHorizontal: 24, position: "relative" }}
        >
          {/* Decorative circle */}
          <View style={{
            position: "absolute", top: -50, right: -50,
            width: 200, height: 200, borderRadius: 100,
            backgroundColor: "rgba(255,255,255,0.04)",
          }} />

          {/* Greeting row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.3 }}>
                {greeting()}{firstName ? `, ${firstName}` : ""}
              </Text>
              {profile?.baby_name && (
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2 }}>
                  {profile.baby_name} · {babyAgeLabel(profile.baby_dob)}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => router.push("/tools/flange")}
              style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
            >
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Flange Fit Check</Text>
            </Pressable>
          </View>

          {/* Today's hero stat */}
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, textAlign: "center" }}>
              Today's output
            </Text>
            {/* Oz number row with bell to the left */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
              <Pressable
                onPress={() => router.push("/reminders" as any)}
                style={{ padding: 8, marginRight: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Set pump reminders"
              >
                <Text style={{ fontSize: 22 }}>🔔</Text>
              </Pressable>
              <Text style={{ fontFamily: SERIF, color: "#fff", fontSize: 60, fontWeight: "400", letterSpacing: -1 }}>
                {formatUnit(todayOz, unit)}
              </Text>
              {/* Spacer to keep number visually centered */}
              <View style={{ width: 38, marginLeft: 8 }} />
            </View>
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4, textAlign: "center" }}>
              {todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""}
              {weekDailyAvg > 0 ? `  ·  avg ${formatUnit(weekDailyAvg, unit)}/day` : ""}
            </Text>
          </View>

          {/* Goal progress bar */}
          {goalOz && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Daily goal
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>
                  {formatUnit(todayOz, unit)} / {formatUnit(goalOz, unit)}
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
                <View
                  style={{
                    height: "100%",
                    width: `${(goalPct ?? 0) * 100}%`,
                    backgroundColor: goalPct != null && goalPct >= 1 ? "#4CAF82" : "#fff",
                    borderRadius: 3,
                  }}
                />
              </View>
              {goalPct != null && goalPct >= 1 && (
                <Text style={{ color: "#4CAF82", fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", marginTop: 6, textAlign: "center" }}>
                  Goal reached today
                </Text>
              )}
            </View>
          )}
        </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -16 }}>

          {/* ── Session Analysis ────────────────────────── */}
          {todaySessions.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <SessionAnalysis sessions={todaySessions} unit={unit} />
            </View>
          )}

          {/* ── Trial ending banner ─────────────────────── */}
          {isPremium && trialEndsAt && differenceInDays(trialEndsAt, new Date()) <= 2 && (
            <Pressable
              onPress={() => router.push("/paywall" as any)}
              style={{ marginBottom: 12 }}
            >
              <View style={{
                backgroundColor: COLORS.amber,
                borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
                flexDirection: "row", alignItems: "center", gap: 10,
              }}>
                <Text style={{ fontSize: 16 }}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: "#fff", fontSize: 13,
                    fontFamily: "Nunito_700Bold", fontWeight: "700",
                  }}>
                    {differenceInDays(trialEndsAt, new Date()) <= 0
                      ? "Your free trial ends today"
                      : differenceInDays(trialEndsAt, new Date()) === 1
                      ? "Your free trial ends tomorrow"
                      : `Your free trial ends in ${differenceInDays(trialEndsAt, new Date())} days`}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 1 }}>
                    Tap to subscribe and keep your access
                  </Text>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 16 }}>→</Text>
              </View>
            </Pressable>
          )}

          {/* ── Active session banner ───────────────────── */}
          {active && (
            <Pressable
              onPress={() => router.push("/session/active")}
              style={{ marginBottom: 12 }}
            >
              <View style={{
                backgroundColor: COLORS.mauveDark ?? "#5A7274",
                borderRadius: 14, padding: 14,
                flexDirection: "row", alignItems: "center", gap: 10,
              }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" }} />
                <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", flex: 1 }}>
                  Session in progress — tap to return
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 18 }}>→</Text>
              </View>
            </Pressable>
          )}

          {/* ── Session CTAs ────────────────────────────── */}
          <View style={{ marginBottom: 16 }}>
            <Pressable onPress={() => router.push("/session/active")}>
              <View style={{
                backgroundColor: COLORS.primary,
                borderRadius: 20, paddingVertical: 20, paddingHorizontal: 24,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
              }}>
                <View>
                  <Text style={{ fontFamily: SERIF, color: "#fff", fontSize: 22, fontWeight: "400" }}>
                    Begin a session
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 3 }}>
                    Tap to start your pump timer
                  </Text>
                </View>
                <Text style={{ fontSize: 40 }}>🍼</Text>
              </View>
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, paddingTop: 4 }}>
              <Pressable
                onPress={() => router.push("/session/log" as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 14 }}>📋</Text>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                  Log manually
                </Text>
              </Pressable>

              {showNursingLog && (
                <Pressable
                  onPress={() => { setEditingNursing(null); setNursingModal(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14 }}>🤱</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                    Log nursing
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* ── DELETED reminders banner — bell is now in hero ── */}
          {false && (
            <View style={{
              backgroundColor: "#fff", borderRadius: 16, padding: 14,
              flexDirection: "row", alignItems: "center", gap: 12,
              borderWidth: 1, borderColor: COLORS.border,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                  Set pump reminders
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                  Never miss a session — schedule your alarms
                </Text>
              </View>
            </View>
          )}

          {/* ── Coach card (premium) / teaser (free) ──── */}
          <View style={{ marginBottom: 16 }}>
            {isPremium ? (
              <CoachCard
                todayOz={todayOz}
                avgOz={weekDailyAvg}
                sessionCount={todaySessions.length}
                lastSessionAgo={lastSessionAgo}
                goalOz={goalOz}
                babyAgeWeeks={babyAgeWeeks}
                sessions={sessions as any}
                pumpingContext={(profile?.pumping_context ?? "unspecified") as any}
                userId={profile?.id ?? ""}
                accountCreatedAt={profile?.created_at ?? new Date().toISOString()}
                skipGapAlerts={skipGapAlerts}
              />
            ) : (
              <PremiumTeaser
                compact
                headline="Personalized supply insights"
                description="Unlock trend interpretation, session guidance, and a coach that reads your data."
                unlocks={[]}
              />
            )}
          </View>

          {/* ── Daily tip ──────────────────────────────── */}
          <View style={{ marginBottom: 16 }}>
            <DailyTip />
          </View>

          {/* ── 7-day trend ─────────────────────────────── */}
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 16,
            shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
                7-day trend
              </Text>
              {bestHour && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: COLORS.ink3 }}>Peak output</Text>
                  <View style={{ backgroundColor: "#E4DBFF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                      {bestHour}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <SparkLine
              data={sparkData}
              labels={sparkLabels}
              width={SCREEN_W - 76}
              height={88}
              color={COLORS.primary}
              fillColor="rgba(124,92,252,0.08)"
              secondaryData={profile?.track_hydration && weeklyHydration.length === 7 ? weeklyHydration : undefined}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 18, height: 3, backgroundColor: COLORS.primary, borderRadius: 2 }} />
                <Text style={{ fontSize: 10, color: COLORS.ink3 }}>Output</Text>
              </View>
              {profile?.track_hydration && weeklyHydration.some((v) => v > 0) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 18, height: 0, borderTopWidth: 1.5, borderTopColor: "#E8854A", borderStyle: "dashed" }} />
                  <Text style={{ fontSize: 10, color: COLORS.ink3 }}>💧 Hydration</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Stats row ───────────────────────────────── */}
          <View style={{
            flexDirection: "row", marginBottom: 16,
            backgroundColor: "#fff", borderRadius: 20,
            shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
            overflow: "hidden",
          }}>
            {[
              { label: "Per session avg", value: formatUnit(perSessionAvg, unit), sub: "last 7 days" },
              { label: "Stash total", value: formatUnit(stashOz, unit), sub: "in storage" },
            ].map(({ label, value, sub }, idx) => (
              <React.Fragment key={label}>
                {idx > 0 && <View style={{ width: 1, backgroundColor: COLORS.border, marginVertical: 16 }} />}
                <View style={{ flex: 1, padding: 16 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                    {label}
                  </Text>
                  <Text style={{ fontSize: 24, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>{value}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>{sub}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* ── Hydration tracker (opt-in) ───────────────── */}
          {profile?.track_hydration && (
            <View style={{
              backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 16,
              shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
                  💧 Water today
                </Text>
                <Text style={{ fontSize: 28, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>
                  {hydrationGlasses}
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_400Regular", color: COLORS.ink3 }}> / 8 glasses</Text>
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={async () => {
                    const next = Math.max(0, hydrationGlasses - 1);
                    setHydrationGlasses(next);
                    const d = format(new Date(), "yyyy-MM-dd");
                    await supabase.from("daily_hydration").upsert(
                      { user_id: profile!.id, date: d, glasses: next },
                      { onConflict: "user_id,date" }
                    );
                    setWeeklyHydration((prev) => { const a = [...prev]; a[6] = next; return a; });
                  }}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.muted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ fontSize: 18, color: COLORS.ink2, lineHeight: 22 }}>−</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const next = hydrationGlasses + 1;
                    setHydrationGlasses(next);
                    const d = format(new Date(), "yyyy-MM-dd");
                    await supabase.from("daily_hydration").upsert(
                      { user_id: profile!.id, date: d, glasses: next },
                      { onConflict: "user_id,date" }
                    );
                    setWeeklyHydration((prev) => { const a = [...prev]; a[6] = next; return a; });
                  }}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E8854A", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 18, color: "#fff", lineHeight: 22 }}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Quick log ───────────────────────────────── */}
          <View style={{ marginBottom: 20 }}>
            <Pressable
              onPress={() => router.push("/session/log")}
              style={{
                backgroundColor: "#fff", borderRadius: 16,
                paddingVertical: 14, paddingHorizontal: 16,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>+ Log past pump</Text>
              <Text style={{ color: COLORS.ink3, fontSize: 16 }}>›</Text>
            </Pressable>
          </View>

          {/* ── Today's nursing sessions ─────────────────── */}
          {showNursingLog && nursingSessions.length > 0 && (
            <>
              <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Today's nursing
              </Text>
              <View style={{ backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 }}>
                {nursingSessions.map((n, idx) => {
                  const feelEmoji = n.feel === "went_well" ? "😊" : n.feel === "struggled" ? "😔" : "🤔";
                  const feelLabel = n.feel === "went_well" ? "Went well" : n.feel === "struggled" ? "Struggled" : "Not sure";
                  return (
                    <React.Fragment key={n.id}>
                      {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 52 }} />}
                      <Pressable
                        onLongPress={() => {
                          const doEdit   = () => { setEditingNursing(n); setNursingModal(true); };
                          const doDelete = () => Alert.alert("Delete session?", "This cannot be undone.", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: async () => { await supabase.from("nursing_sessions").delete().eq("id", n.id); loadData(); } },
                          ]);
                          if (Platform.OS === "ios") {
                            ActionSheetIOS.showActionSheetWithOptions(
                              { options: ["Edit", "Delete", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
                              (i) => { if (i === 0) doEdit(); if (i === 1) doDelete(); }
                            );
                          } else {
                            Alert.alert("Session options", undefined, [
                              { text: "Edit", onPress: doEdit },
                              { text: "Delete", style: "destructive", onPress: doDelete },
                              { text: "Cancel", style: "cancel" },
                            ]);
                          }
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row", alignItems: "center", gap: 12,
                          paddingVertical: 12, paddingHorizontal: 16,
                          backgroundColor: pressed ? COLORS.muted : "transparent",
                        })}
                      >
                        <Text style={{ fontSize: 22, width: 28, textAlign: "center" }}>{feelEmoji}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                              {feelLabel}
                            </Text>
                            {n.side && (
                              <View style={{ backgroundColor: COLORS.muted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 11, color: COLORS.ink2, textTransform: "capitalize" }}>{n.side}</Text>
                              </View>
                            )}
                            {n.duration_min && (
                              <Text style={{ fontSize: 12, color: COLORS.ink3 }}>{n.duration_min} min</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                            {format(new Date(n.nursed_at), "h:mm a")}
                            {n.notes ? `  ·  ${n.notes}` : ""}
                          </Text>
                        </View>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Recent sessions ─────────────────────────── */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
              Recent sessions
            </Text>
            <Pressable onPress={() => router.push("/pump-history" as any)} hitSlop={8}>
              <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
                View all
              </Text>
            </Pressable>
          </View>

          {sessions.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 28, alignItems: "center" }}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>🍼</Text>
              <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 4 }}>
                No sessions yet
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, textAlign: "center" }}>
                Tap Start Pumping to log your first session and start seeing insights.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, paddingVertical: 4 }}>
              {sessions.slice(0, 6).map((s, idx) => {
                const durationMin = s.duration_sec ? Math.round(s.duration_sec / 60) : null;
                const doEdit   = () => { setEditingSession(s); setShowEditModal(true); };
                const doDelete = () => Alert.alert("Delete session?", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: async () => { await supabase.from("pump_sessions").delete().eq("id", s.id); loadData(); } },
                ]);
                return (
                  <React.Fragment key={s.id}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 16 }} />}
                    <Pressable
                      onPress={doEdit}
                      onLongPress={() => {
                        if (Platform.OS === "ios") {
                          ActionSheetIOS.showActionSheetWithOptions(
                            { options: ["Edit", "Delete", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
                            (i) => { if (i === 0) doEdit(); if (i === 1) doDelete(); }
                          );
                        } else {
                          Alert.alert("Session options", undefined, [
                            { text: "Edit", onPress: doEdit },
                            { text: "Delete", style: "destructive", onPress: doDelete },
                            { text: "Cancel", style: "cancel" },
                          ]);
                        }
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center",
                        paddingVertical: 13, paddingHorizontal: 16,
                        backgroundColor: pressed ? COLORS.muted : "transparent",
                      })}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <Text style={{ fontSize: 17, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>
                            {formatUnit(s.total_oz, unit)}
                          </Text>
                          {!!durationMin && (
                            <Text style={{ fontSize: 12, color: COLORS.ink3 }}>{`${durationMin} min`}</Text>
                          )}
                          {s.notes != null && (
                            <Text style={{ fontSize: 12 }}>📝</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                          {format(new Date(s.started_at), "EEE, MMM d · h:mm a")}
                        </Text>
                      </View>
                      {s.pain_level != null && s.pain_level >= 6 && (
                        <View style={{ backgroundColor: "#FFF0F5", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.error }}>pain noted</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 16, color: COLORS.ink3, marginLeft: 8 }}>›</Text>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* ── Consult recommendation ──────────────────── */}
          <View style={{ marginTop: 16, marginBottom: 4 }}>
            <ConsultRecommendation hasLactationConsultant={profile?.has_lactation_consultant ?? null} />
          </View>

          {/* ── Stash link ──────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/(tabs)/stash")}
            style={{ marginTop: 16, marginBottom: 8 }}
          >
            <View style={{
              backgroundColor: "#fff", borderRadius: 20, padding: 16,
              flexDirection: "row", alignItems: "center", gap: 12,
              shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
            }}>
              <Text style={{ fontSize: 28 }}>🧊</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>Stash Manager</Text>
                <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 2 }}>
                  {stashOz > 0 ? `${formatUnit(stashOz, unit)} stored · tap to manage` : "Track your frozen & refrigerated milk"}
                </Text>
              </View>
              <Text style={{ color: COLORS.ink3, fontSize: 18 }}>›</Text>
            </View>
          </Pressable>

        </View>
      </ScrollView>

      <NursingEntryModal
        visible={nursingModal}
        session={editingNursing}
        onClose={() => { setNursingModal(false); setEditingNursing(null); }}
        onSaved={loadData}
      />

      {/* Fix 5: Edit session modal */}
      <EditSessionModal
        session={editingSession}
        visible={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingSession(null); }}
        onSaved={loadData}
      />
    </SafeAreaView>
  );
}
