/**
 * CoachCard — Session 5 Part 4
 *
 * Premium users get IBCLC-authored, AI-personalized insights driven by
 * the template + pattern detection system. The card:
 *   1. Fetches any fresh cached insight on mount.
 *   2. Falls back to pattern detection + edge function generation.
 *   3. Falls back to static copy if generation fails.
 *
 * Controls:
 *   • Dismiss — marks insight as read; next render shows next pattern.
 *   • Refresh — force-regenerates (premium only; rate-limited by cache).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import {
  detectPatterns,
  DetectedPattern,
  PumpingContext,
  SessionRecord,
} from "../lib/patternDetection";
import { dayTypeForDate } from "../lib/schedule";
import {
  getOrGenerateInsight,
  dismissInsight,
  GeneratedInsight,
} from "../lib/insightGeneration";
import { COLORS, SERIF } from "../lib/constants";
import { maybeRequestRatingAfterInsight } from "../lib/ratingPrompt";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CoachCardProps {
  // Legacy props (used for static fallback + context)
  todayOz: number;
  avgOz: number;
  sessionCount: number;
  lastSessionAgo: number | null;
  goalOz: number | null;
  babyAgeWeeks: number | null;
  // New props for AI insights
  sessions: SessionRecord[];
  pumpingContext: PumpingContext;
  userId: string;
  accountCreatedAt: string;
  /** User opted in to "I nurse and pump — skip gap alerts" */
  skipGapAlerts?: boolean;
  /** Weekly Schedule opt-in — declared away/home days, advisory only */
  scheduleEnabled?: boolean;
  scheduleAwayDays?: number[];
}

// ── Static fallback (legacy logic) ───────────────────────────────────────────

interface StaticInsight {
  emoji: string;
  headline: string;
  body: string;
  action?: string;
  actionRoute?: string;
}

function getStaticInsight(props: CoachCardProps, todayDayType: ReturnType<typeof dayTypeForDate>): StaticInsight {
  const { todayOz, avgOz, sessionCount, lastSessionAgo, goalOz, babyAgeWeeks } = props;
  const hour = new Date().getHours();
  const pct  = avgOz > 0 ? todayOz / avgOz : 0;

  // On a declared home day, a long gap is expected (nursing instead of
  // pumping) — don't nag about supply.
  if (lastSessionAgo !== null && lastSessionAgo > 180 && todayDayType !== "home") {
    return {
      emoji: "⏰",
      headline: "It's been a while",
      body: `It has been about ${Math.round(lastSessionAgo / 60)} hours since your last session. Longer gaps can signal to your body to make less milk. A session now will help keep supply steady.`,
      action: "Start a session",
      actionRoute: "/session/active",
    };
  }
  if (sessionCount === 0 && hour < 10) {
    return {
      emoji: "🌅",
      headline: "Morning is your power window",
      body: "Prolactin levels peak overnight, making morning sessions your most productive. Starting your day with a pump sets your supply up for success.",
      action: "Start pumping",
      actionRoute: "/session/active",
    };
  }
  if (pct >= 0.9 && todayOz > 0) {
    const ahead = todayOz > (avgOz ?? 0);
    return {
      emoji: ahead ? "🌟" : "✅",
      headline: ahead ? "Ahead of your average!" : "Right on track",
      body: ahead
        ? `You are at ${todayOz.toFixed(1)} oz today — above your usual daily average. Your body is doing great. Keep the momentum going.`
        : `You are tracking right at your typical daily output. Consistency like this is exactly what builds a reliable supply.`,
    };
  }
  if (pct < 0.7 && avgOz > 0 && sessionCount > 0) {
    const diff = (avgOz - todayOz).toFixed(1);
    return {
      emoji: "💛",
      headline: "Normal variation",
      body: `You are ${diff} oz below your usual today. This is very common and can reflect more nursing sessions, time of day, sleep, hydration, or stress. It does not mean your supply is dropping — patterns over several days matter far more than any single day.`,
      action: "Ask the coach",
      actionRoute: "/(tabs)/coach",
    };
  }
  if (hour >= 12 && hour < 15) {
    return {
      emoji: "💧",
      headline: "Midday tip",
      body: "Hydration has a direct effect on milk volume. Aim for a full glass of water before your next session — it makes a noticeable difference for many pumping parents.",
    };
  }
  if (hour >= 19) {
    return {
      emoji: "🌙",
      headline: "Evening sessions matter",
      body: "Evening and overnight sessions maintain prolactin levels while you rest. Even a shorter session before bed protects your supply for tomorrow morning.",
    };
  }
  if (goalOz && todayOz > 0) {
    const remaining = goalOz - todayOz;
    return {
      emoji: "🎯",
      headline: `${remaining.toFixed(1)} oz to your goal`,
      body: `You have made great progress today. Spread your remaining sessions evenly through the evening to reach ${goalOz} oz without stressing your body.`,
    };
  }
  if (babyAgeWeeks !== null && babyAgeWeeks < 8) {
    return {
      emoji: "🌱",
      headline: "You're in the building phase",
      body: "In the first 8 weeks, frequent pumping establishes your long-term supply. Every session — even shorter ones — sends important supply signals. You are doing the right things.",
    };
  }
  return {
    emoji: "💬",
    headline: "Your coach is watching your trends",
    body: "Log a few sessions and I will start giving you personalized insights based on your patterns — your best windows, efficiency scores, and what to adjust.",
    action: "Ask anything",
    actionRoute: "/(tabs)/coach",
  };
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function InsightSkeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ opacity }}>
      <View style={{ height: 14, backgroundColor: "rgba(74,94,96,0.15)", borderRadius: 6, width: "60%", marginBottom: 10 }} />
      <View style={{ height: 12, backgroundColor: "rgba(74,94,96,0.1)", borderRadius: 6, width: "100%", marginBottom: 6 }} />
      <View style={{ height: 12, backgroundColor: "rgba(74,94,96,0.1)", borderRadius: 6, width: "85%", marginBottom: 6 }} />
      <View style={{ height: 12, backgroundColor: "rgba(74,94,96,0.1)", borderRadius: 6, width: "70%" }} />
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CoachCard(props: CoachCardProps) {
  const router = useRouter();
  const {
    userId, sessions, pumpingContext, babyAgeWeeks, accountCreatedAt, skipGapAlerts,
    scheduleEnabled, scheduleAwayDays,
  } = props;

  const todayDayType = useMemo(
    () => dayTypeForDate(scheduleEnabled, scheduleAwayDays, new Date()),
    [scheduleEnabled, scheduleAwayDays]
  );

  const [insight,    setInsight]    = useState<GeneratedInsight | null>(null);
  const [pattern,    setPattern]    = useState<DetectedPattern | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useStatic,  setUseStatic]  = useState(false);

  // Load suppressed patterns (dismissed cache rows within last 3 days)
  const loadSuppressed = useCallback(async (): Promise<Set<string>> => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const { data } = await supabase
      .from("insight_cache")
      .select("pattern_name")
      .eq("user_id", userId)
      .eq("dismissed", true)
      .gt("generated_at", cutoff.toISOString());
    const suppressed = new Set<string>();
    (data ?? []).forEach((row: { pattern_name: string }) => suppressed.add(row.pattern_name));
    return suppressed;
  }, [userId]);

  const loadInsight = useCallback(async (forceRefresh = false) => {
    if (!userId || sessions.length === 0) {
      setUseStatic(true);
      setLoading(false);
      return;
    }

    try {
      const suppressed = await loadSuppressed();
      const detected   = detectPatterns(
        sessions,
        pumpingContext,
        babyAgeWeeks ?? 0,
        accountCreatedAt,
        suppressed,
        [],
        skipGapAlerts ?? false,
        scheduleEnabled ?? false,
        scheduleAwayDays ?? [],
      );

      if (!detected.length) {
        setUseStatic(true);
        setLoading(false);
        return;
      }

      const top = detected[0];
      setPattern(top);

      const result = await getOrGenerateInsight(userId, top, forceRefresh);
      if (result) {
        setInsight(result);
        setUseStatic(false);
        // Trigger rating prompt for positive milestone/improvement insights
        maybeRequestRatingAfterInsight(top.pattern_name).catch(() => {});
      } else {
        setUseStatic(true);
      }
    } catch (err) {
      console.error("CoachCard loadInsight error:", err);
      setUseStatic(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, sessions, pumpingContext, babyAgeWeeks, accountCreatedAt, loadSuppressed, scheduleEnabled, scheduleAwayDays]);

  useEffect(() => { loadInsight(); }, [loadInsight]);

  const handleDismiss = async () => {
    if (!pattern || !userId) return;
    await dismissInsight(userId, pattern.pattern_name, pattern.context_variant);
    setInsight(null);
    setPattern(null);
    setLoading(true);
    loadInsight(false);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    loadInsight(true);
  };

  // ── Render ──────────────────────────────────────────────

  const staticInsight = getStaticInsight(props, todayDayType);

  return (
    <LinearGradient
      colors={["#CEC5CC", "#FDF6EE"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(176,128,144,0.2)" }}
    >
      <View style={{ padding: 18 }}>

        {/* ── Loading skeleton ── */}
        {loading && !useStatic && (
          <InsightSkeleton />
        )}

        {/* ── AI Insight ── */}
        {!loading && !useStatic && insight && (
          <>
            {/* Header row */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={{
                backgroundColor: "rgba(74,94,96,0.1)",
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, letterSpacing: 0.5 }}>
                  PERSONALIZED INSIGHT
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                {/* Refresh */}
                <Pressable onPress={handleRefresh} hitSlop={8}>
                  {refreshing
                    ? <ActivityIndicator size="small" color={COLORS.ink3} />
                    : <Text style={{ fontSize: 11, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                        Refresh
                      </Text>
                  }
                </Pressable>
                {/* Dismiss */}
                <Pressable onPress={handleDismiss} hitSlop={8}>
                  <Text style={{ fontSize: 16, color: COLORS.ink3 }}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Insight body */}
            <Text style={{ fontSize: 13, color: "#7A5C44", lineHeight: 21, letterSpacing: 0.1 }}>
              {insight.text}
            </Text>
          </>
        )}

        {/* ── Static fallback ── */}
        {(!loading && useStatic) && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 22 }}>{staticInsight.emoji}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#4A5E60", flex: 1 }}>
                {staticInsight.headline}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: "#7A5C44", lineHeight: 20 }}>
              {staticInsight.body}
            </Text>
            {staticInsight.action && staticInsight.actionRoute && (
              <Pressable
                onPress={() => router.push(staticInsight.actionRoute as any)}
                style={{ marginTop: 12, alignSelf: "flex-start" }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#4A5E60" }}>
                  {staticInsight.action} →
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* ── Attribution ── */}
        <Text style={{
          fontSize: 10, color: "rgba(74,94,96,0.5)", marginTop: 14,
          fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.3,
        }}>
          Katie Clark, IBCLC · Pump Coach
        </Text>
      </View>
    </LinearGradient>
  );
}
