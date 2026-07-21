import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, startOfDay, subDays } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF, DAYS_SHORT } from "../../lib/constants";
import { fmtOz, fmtDateTime } from "../../lib/formatters";
import { SparkLine } from "../../components/ui/SparkLine";
import { PumpSession, StashEntry, Profile } from "../../types";

// Build 7-day spark data for the owner's sessions
function buildSparkData(sessions: PumpSession[]): { data: number[]; labels: string[] } {
  const data: number[]   = [];
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const day  = startOfDay(subDays(new Date(), i));
    const next = startOfDay(subDays(new Date(), i - 1));
    const oz = sessions
      .filter((s) => s.started_at >= day.toISOString() && s.started_at < next.toISOString())
      .reduce((sum, s) => sum + (s.total_oz ?? 0), 0);
    data.push(oz);
    labels.push(DAYS_SHORT[day.getDay()]);
  }
  return { data, labels };
}

export default function ViewerDashboard() {
  const router = useRouter();
  const { user, viewingOwnerId, setViewingMode, signOut } = useAuthStore();

  const [ownerProfile, setOwnerProfile] = useState<Profile | null>(null);
  const [sessions,     setSessions]     = useState<PumpSession[]>([]);
  const [stashOz,      setStashOz]      = useState<number>(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [viewingOwnerId])
  );

  async function loadData() {
    if (!viewingOwnerId) return;
    setLoading(true);

    const since = subDays(new Date(), 30).toISOString();

    const [profileRes, sessionsRes, stashRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", viewingOwnerId).maybeSingle(),
      supabase.from("pump_sessions")
        .select("*")
        .eq("user_id", viewingOwnerId)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      supabase.from("stash_entries")
        .select("oz")
        .eq("user_id", viewingOwnerId)
        .is("used_at", null)
        .is("discarded_at", null),
    ]);

    if (profileRes.data) setOwnerProfile(profileRes.data as Profile);
    if (sessionsRes.data) setSessions(sessionsRes.data as PumpSession[]);

    const totalStash = (stashRes.data ?? []).reduce((sum, e) => sum + (e.oz ?? 0), 0);
    setStashOz(totalStash);
    setLoading(false);
    setRefreshing(false);
  }

  async function handleLeaveAccess() {
    Alert.alert(
      "Remove access",
      "Are you sure you want to remove your access to this data? The person will need to send a new invite.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove access",
          style: "destructive",
          onPress: async () => {
            if (!user || !viewingOwnerId) return;
            await supabase.from("viewer_accounts").delete()
              .eq("owner_id", viewingOwnerId).eq("viewer_id", user.id);
            await signOut();
          },
        },
      ]
    );
  }

  // ── Derived stats ────────────────────────────────────────────────────────────
  const today = startOfDay(new Date()).toISOString();
  const todaySessions = sessions.filter((s) => s.started_at >= today);
  const todayOz = todaySessions.reduce((sum, s) => sum + (s.total_oz ?? 0), 0);

  const last7 = sessions.filter((s) => s.started_at >= subDays(new Date(), 7).toISOString());
  const avg7  = last7.length > 0
    ? last7.reduce((sum, s) => sum + (s.total_oz ?? 0), 0) / 7
    : 0;

  const spark = buildSparkData(sessions);
  const recent = sessions.slice(0, 10);

  const babyName = ownerProfile?.baby_name;
  const ownerName = ownerProfile?.display_name ?? "your person";
  const goalOz = ownerProfile?.daily_goal_oz ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Viewer banner */}
      <View style={{
        backgroundColor: COLORS.primaryMist,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingHorizontal: 20,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Text style={{ fontSize: 12, color: COLORS.ink2, flex: 1, flexShrink: 1 }}>
          Viewing <Text style={{ fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>{ownerName}</Text>'s data
        </Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable
            hitSlop={12}
            onPress={async () => {
              await AsyncStorage.setItem("viewer_mode_pref", "own");
              setViewingMode(null);
              router.replace("/(tabs)" as any);
            }}
          >
            <Text style={{ fontSize: 12, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              My Account
            </Text>
          </Pressable>
          <Pressable onPress={handleLeaveAccess} hitSlop={12}>
            <Text style={{ fontSize: 12, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              Leave
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink, marginBottom: 2 }}>
            {babyName ? `${babyName}'s Pump Data` : "Pump Dashboard"}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.ink3 }}>
            Last updated {format(new Date(), "MMM d 'at' h:mm a")}
          </Text>
        </View>

        {/* Today card */}
        <View style={{
          backgroundColor: COLORS.surface,
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowColor: COLORS.ink,
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}>
          <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Today
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 36, color: COLORS.primary }}>
              {fmtOz(todayOz)}
            </Text>
            {goalOz && (
              <Text style={{ fontSize: 13, color: COLORS.ink3, marginBottom: 6 }}>
                of {fmtOz(goalOz)} goal
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <View>
              <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 2 }}>Sessions today</Text>
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {todaySessions.length}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 2 }}>7-day avg / day</Text>
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {fmtOz(avg7)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 2 }}>In stash</Text>
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {fmtOz(stashOz)}
              </Text>
            </View>
          </View>
        </View>

        {/* 7-day chart */}
        {spark.data.some((v) => v > 0) && (
          <View style={{
            backgroundColor: COLORS.surface,
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: COLORS.border,
            shadowColor: COLORS.ink,
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}>
            <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
              Last 7 days
            </Text>
            <SparkLine data={spark.data} labels={spark.labels} height={80} />
          </View>
        )}

        {/* Recent sessions */}
        <View style={{
          backgroundColor: COLORS.surface,
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowColor: COLORS.ink,
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}>
          <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
            Recent sessions
          </Text>
          {recent.length === 0 ? (
            <Text style={{ fontSize: 14, color: COLORS.ink3, textAlign: "center", paddingVertical: 16 }}>
              No sessions in the last 30 days
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {recent.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 12 }} />}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: COLORS.ink2 }}>
                        {fmtDateTime(s.started_at)}
                      </Text>
                      {s.notes ? (
                        <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }} numberOfLines={2}>
                          {s.notes}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 17, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                      {fmtOz(s.total_oz)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Read-only notice */}
        <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 16 }}>
          You have read-only access. Data can only be edited by {ownerName}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
