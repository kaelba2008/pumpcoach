/**
 * SessionInsightSheet — Session 5 Part 5
 * Post-session analysis modal. Premium users see:
 *   - Stats ("What happened")
 *   - Comparison to your own average ("What it means")
 *   - AI-generated next-step guidance ("What to do next") — template-driven
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { StashGoal } from "../types";
import { supabase } from "../lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { ConsultRecommendation } from "./ConsultRecommendation";
import { PremiumTeaser } from "./ui/PremiumTeaser";
import { fmtDuration } from "../lib/formatters";
import { formatUnit } from "../lib/units";
import { useUnit } from "../hooks/useUnit";
import { COLORS } from "../lib/constants";
import { useAuthStore } from "../store/authStore";
import { detectPatterns, SessionRecord, PumpingContext } from "../lib/patternDetection";
import { getOrGenerateInsight } from "../lib/insightGeneration";

// ── Props ─────────────────────────────────────────────────────────────────────

interface SessionInsightProps {
  visible: boolean;
  onClose: () => void;
  session: {
    totalOz: number;
    durationSec: number;
    leftOz: number;
    rightOz: number;
    painLevel: number | null;
    startedAt: string;
    prevSessionEndedAt?: string;
  };
  avgOz: number;
  sessionCountToday: number;
  /** Mom's typical daily session count (from last 7 days) — used for 75% threshold check */
  typicalDailySessionCount?: number;
  isPremium?: boolean;
  pumpedAfterNursing?: "yes" | "no" | "na" | null;
  // AI insight props
  sessions: SessionRecord[];
  pumpingContext: PumpingContext;
  userId: string;
  accountCreatedAt: string;
  babyAgeWeeks?: number | null;
}

// ── Static helpers ────────────────────────────────────────────────────────────


function getDeltaLabel(
  oz: number,
  avg: number,
  unit: "oz" | "ml",
  pumpedAfterNursing?: "yes" | "no" | "na" | null,
  sessionCountToday?: number,
  typicalDailySessionCount?: number,
): { label: string; color: string; blurb: string } {
  const nursingFirst = pumpedAfterNursing === "yes";

  if (avg === 0) return { label: "—", color: COLORS.ink3, blurb: "Keep logging to see how this compares to your average." };
  const diff = oz - avg;
  const pct  = Math.abs(diff / avg) * 100;
  const diffLabel = unit === "ml"
    ? `${Math.round(Math.abs(diff) * 29.57)} ml`
    : `${Math.abs(diff).toFixed(1)} oz`;

  // Time-of-day guard: suppress below-average alerts early in the day.
  // Before noon OR before 75% of her typical session count — show neutral instead.
  const nowHour = new Date().getHours();
  const hasEnoughSessionsToday = typicalDailySessionCount && typicalDailySessionCount > 0
    ? (sessionCountToday ?? 0) >= typicalDailySessionCount * 0.75
    : false;
  const tooEarlyForBelowAvg = nowHour < 18 && !hasEnoughSessionsToday && nowHour < 12;

  if (Math.abs(diff) < 0.3)
    return { label: "Right at your average", color: COLORS.sage, blurb: "Consistency is the foundation of a reliable supply. This is exactly what you want to see." };

  if (diff > 0)
    return {
      label: `+${diffLabel} above average`,
      color: COLORS.sage,
      blurb: pct > 30
        ? "A noticeably higher session! This can happen when you are well-rested, hydrated, or it is your peak output window."
        : "A little above your average — great session.",
    };

  if (nursingFirst)
    return {
      label: `${diffLabel} below average`,
      color: COLORS.sage,
      blurb: "This is completely expected after a nursing session. Getting 0.25–2 oz is very normal when baby has already fed — your body did its job twice. This does not affect your supply.",
    };

  // Early in the day and daily output is still building — show neutral
  if (tooEarlyForBelowAvg)
    return {
      label: "Day still in progress",
      color: COLORS.ink3,
      blurb: "Your daily output is still building. Individual sessions vary by time of day — morning sessions often run lower than afternoon. Check back later for your full picture.",
    };

  if (pct < 20)
    return { label: `${diffLabel} below average`, color: COLORS.amber, blurb: "A slight dip is completely normal and happens to everyone. If you have been nursing more lately, that is likely the reason — milk going to baby first is a good thing. One lower session will not affect your overall supply." };

  return {
    label: `${diffLabel} below average`,
    color: COLORS.amber,
    blurb: "Sessions vary with sleep, hydration, stress, time of day, clogs, and how much your baby has nursed recently. If you have been nursing more, it is expected to pump less — your body is meeting demand another way. One session does not define your supply.",
  };
}

function getStaticNextTip(durationSec: number): string {
  const h = new Date().getHours();
  const min = durationSec / 60;

  if (min > 30)
    return "Sessions over 30 minutes can sometimes indicate incomplete letdown or a fit issue worth checking. Consider the Flange Fit Analyzer.";
  if (min < 10)
    return "This was a short session. Aim for 15-20 minutes for optimal milk removal.";
  if (h >= 4 && h < 9)
    return "Morning sessions tend to yield the most milk due to overnight prolactin buildup. Great timing.";
  if (h >= 19)
    return "Evening and overnight sessions are important for maintaining prolactin levels. This session counts.";
  if (h >= 12 && h < 15)
    return "Afternoon output can vary. Staying hydrated through lunch helps keep things consistent.";
  return "Aim for 15-20 minutes per session for consistent milk removal. You are doing great.";
}

// ── AI insight hook ───────────────────────────────────────────────────────────

function usePostSessionInsight(
  sessions: SessionRecord[],
  pumpingContext: PumpingContext,
  userId: string,
  accountCreatedAt: string,
  enabled: boolean,
  babyAgeWeeks: number,
) {
  const [aiText,   setAiText]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !userId || sessions.length < 5) return;
    setLoading(true);
    try {
      const detected = detectPatterns(
        sessions,
        pumpingContext,
        babyAgeWeeks,
        accountCreatedAt,
        new Set(), // no suppressed patterns for post-session context
      );
      if (!detected.length) return;
      const result = await getOrGenerateInsight(userId, detected[0]);
      if (result) setAiText(result.text);
    } catch (err) {
      console.warn("PostSessionInsight error:", err);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId, sessions, pumpingContext, accountCreatedAt]);

  useEffect(() => { if (enabled) load(); }, [load, enabled]);

  return { aiText, loading };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionInsightSheet({
  visible, onClose, session, avgOz, sessionCountToday, typicalDailySessionCount,
  isPremium = false, pumpedAfterNursing, sessions, pumpingContext, userId, accountCreatedAt,
  babyAgeWeeks,
}: SessionInsightProps) {
  const { profile } = useAuthStore();
  const simpleMode = profile?.simple_mode ?? false;
  const { unit } = useUnit();
  const delta = getDeltaLabel(
    session.totalOz, avgOz, unit, pumpedAfterNursing,
    sessionCountToday, typicalDailySessionCount,
  );
  const ozMin = session.durationSec >= 30 ? session.totalOz / (session.durationSec / 60) : 0;
  const rateLabel = unit === "ml" ? "ml/min" : "oz/min";
  const rateValue = ozMin > 0
    ? unit === "ml" ? String(Math.round(ozMin * 29.57)) : ozMin.toFixed(2)
    : "—";

  const { aiText, loading: aiLoading } = usePostSessionInsight(
    sessions,
    pumpingContext,
    userId,
    accountCreatedAt,
    isPremium && visible && !simpleMode,
    babyAgeWeeks ?? 0,
  );

  const [stashOz,       setStashOz]       = useState(unit === "ml" ? String(Math.round(session.totalOz * 29.5735)) : String(session.totalOz));
  const [stashLocation, setStashLocation] = useState("freezer");
  const [stashSaving,   setStashSaving]   = useState(false);
  const [stashSaved,    setStashSaved]    = useState(false);
  const [stashGoals,    setStashGoals]    = useState<StashGoal[]>([]);
  const [stashGoalId,   setStashGoalId]   = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    supabase
      .from("stash_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_completed", false)
      .order("sort_order")
      .then(({ data }) => { if (data) setStashGoals(data as StashGoal[]); });
  }, [visible, userId]);

  const saveToStash = async () => {
    const raw = parseFloat(stashOz);
    if (!userId || !raw || raw <= 0) return;
    const oz = unit === "ml" ? raw / 29.5735 : raw;
    const goalLabel = stashGoalId ? stashGoals.find(g => g.id === stashGoalId)?.goal_name ?? null : null;
    setStashSaving(true);
    const { error } = await supabase.from("stash_entries").insert({
      user_id:      userId,
      expressed_at: new Date().toISOString(),
      oz,
      location:     stashLocation,
      label:        goalLabel,
    });
    setStashSaving(false);
    if (!error) setStashSaved(true);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        {/* Header */}
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 56, paddingBottom: 32, paddingHorizontal: 24 }}
        >
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", marginBottom: 4 }}>
            Session complete
          </Text>
          <Text style={{ color: "#fff", fontSize: 40, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", letterSpacing: -1 }}>
            {formatUnit(session.totalOz, unit)}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>
            {fmtDuration(session.durationSec)} · session {sessionCountToday} today
          </Text>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}>

          {/* ── Nursing note ──────────────────────────── */}
          {pumpedAfterNursing === "yes" && (
            <View style={{ backgroundColor: "#F0F7F4", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#C8E6C9" }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.sage, marginBottom: 4 }}>
                Pumped after nursing
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
                Getting 0.25–2 oz after a nursing session is completely normal — baby already removed a lot of milk. This session does not reflect your full supply.
              </Text>
            </View>
          )}

          {/* ── What happened ─────────────────────────── */}
          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              What happened
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              {[
                { label: "Left",     value: formatUnit(session.leftOz, unit) },
                { label: "Right",    value: formatUnit(session.rightOz, unit) },
                { label: "Duration", value: fmtDuration(session.durationSec) },
                { label: rateLabel,  value: rateValue },
              ].map(({ label, value }) => (
                <View key={label} style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>{value}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Premium analysis — hidden in Simple Mode ── */}
          {!simpleMode && (isPremium ? (
            <>
              {/* What it means */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                  What it means
                </Text>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: delta.color, marginBottom: 4 }}>
                    {delta.label}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>{delta.blurb}</Text>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
                    {getStaticNextTip(session.durationSec)}
                  </Text>
                </View>
              </View>

              {/* What to do next — AI-powered */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
                    What to do next
                  </Text>
                  {aiText && (
                    <View style={{ backgroundColor: "rgba(74,94,96,0.1)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, letterSpacing: 0.5 }}>
                        PERSONALIZED
                      </Text>
                    </View>
                  )}
                </View>

                {aiLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <ActivityIndicator size="small" color={COLORS.ink3} />
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19, marginBottom: aiText ? 4 : 0 }}>
                    {aiText ?? getStaticNextTip(session.durationSec)}
                  </Text>
                )}

                {!aiLoading && aiText && (
                  <Text style={{ fontSize: 10, color: "rgba(74,94,96,0.5)", marginTop: 10, fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.3 }}>
                    Katie Clark, IBCLC · Pump Coach
                  </Text>
                )}
              </View>
            </>
          ) : (
            <PremiumTeaser
              compact
              headline="After-session analysis"
              description="See how this session compares to your average, duration tips, and personalized next-step guidance."
              unlocks={[]}
            />
          ))}

          {/* ── Pain callout — always shown, never gated by Simple Mode or
               Premium. This is a safety signal, not a comparative stat. ── */}
          {session.painLevel !== null && session.painLevel >= 6 && (
            <View style={{ gap: 10 }}>
              <View style={{ backgroundColor: "#FFF0F5", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FFD6E7" }}>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.error, marginBottom: 4 }}>
                  Pain noted this session
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.ink2, lineHeight: 18 }}>
                  Pain during pumping is almost always fixable. It usually signals a flange fit or suction issue. You should not have to push through it.
                </Text>
              </View>
              <ConsultRecommendation hasLactationConsultant={profile?.has_lactation_consultant ?? null} />
            </View>
          )}

          {/* ── Save to stash ─────────────────────────── */}
          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 18, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Save to stash
            </Text>
            {stashSaved ? (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ fontSize: 22, marginBottom: 4 }}>✓</Text>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.sage }}>Saved to your stash!</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, color: COLORS.ink2 }}>Amount ({unit === "ml" ? "ml" : "oz"})</Text>
                  <TextInput
                    value={stashOz}
                    onChangeText={setStashOz}
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 8,
                      fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink,
                      textAlign: "right",
                    }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: stashGoals.length > 0 ? 12 : 14 }}>
                  {[
                    { id: "freezer", label: "Freezer" },
                    { id: "fridge",  label: "Fridge" },
                    { id: "other",   label: "Counter" },
                  ].map(({ id, label }) => (
                    <Pressable
                      key={id}
                      onPress={() => setStashLocation(id)}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                        backgroundColor: stashLocation === id ? COLORS.primary : COLORS.muted,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: stashLocation === id ? "#fff" : COLORS.ink2 }}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {stashGoals.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 8 }}>Save toward a goal (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {stashGoals.map((g) => {
                        const sel = stashGoalId === g.id;
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => setStashGoalId(sel ? null : g.id)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                              borderWidth: 1.5,
                              backgroundColor: sel ? COLORS.sage : COLORS.muted,
                              borderColor: sel ? COLORS.sage : COLORS.border,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: sel ? "#fff" : COLORS.ink2 }}>
                              {g.goal_name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
                <Pressable
                  onPress={saveToStash}
                  disabled={stashSaving}
                  style={{ backgroundColor: COLORS.sage, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>
                    {stashSaving ? "Saving…" : "Save to Stash"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <Pressable
            onPress={onClose}
            style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Done</Text>
          </Pressable>

        </ScrollView>
      </View>
    </Modal>
  );
}
