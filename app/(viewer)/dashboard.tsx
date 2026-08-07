import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, startOfDay, subDays } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF } from "../../lib/constants";
import { fmtOz, getInitials } from "../../lib/formatters";
import { ViewerDataDisplay } from "../../components/ViewerDataDisplay";
import { PartnerSummaryView } from "../../components/PartnerSummaryView";
import { ViewerAccountMenuLink } from "../../components/ViewerAccountMenuLink";
import { useUnit } from "../../hooks/useUnit";
import { PumpSession, Profile, Baby, NursingSession } from "../../types";
import { primaryBaby } from "../../lib/babies";

export default function ViewerDashboard() {
  const router = useRouter();
  const { user, viewingOwnerId, signOut } = useAuthStore();
  const { unit } = useUnit();

  const [ownerProfile, setOwnerProfile] = useState<Profile | null>(null);
  const [ownerBabies,  setOwnerBabies]  = useState<Baby[]>([]);
  const [sessions,     setSessions]     = useState<PumpSession[]>([]);
  const [nursingSessions, setNursingSessions] = useState<NursingSession[]>([]);
  const [stashOz,      setStashOz]      = useState<number>(0);
  const [viewerRole,   setViewerRole]   = useState<"partner" | "ibclc">("ibclc");
  const [refreshing,   setRefreshing]   = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [viewingOwnerId])
  );

  async function loadData() {
    if (!viewingOwnerId || !user) return;

    // 90 days of history for viewers (IBCLCs need to see trends)
    const since = subDays(new Date(), 90).toISOString();

    const [profileRes, babiesRes, sessionsRes, nursingRes, stashRes, accessRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", viewingOwnerId).maybeSingle(),
      supabase.from("babies").select("*").eq("user_id", viewingOwnerId).order("created_at", { ascending: true }),
      supabase.from("pump_sessions")
        .select("*")
        .eq("user_id", viewingOwnerId)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      supabase.from("nursing_sessions")
        .select("*")
        .eq("user_id", viewingOwnerId)
        .gte("nursed_at", since)
        .order("nursed_at", { ascending: false }),
      supabase.from("stash_entries")
        .select("oz")
        .eq("user_id", viewingOwnerId)
        .is("used_at", null)
        .is("discarded_at", null),
      supabase.from("viewer_accounts")
        .select("viewer_role")
        .eq("viewer_id", user.id)
        .eq("owner_id", viewingOwnerId)
        .maybeSingle(),
    ]);

    if (profileRes.data) setOwnerProfile(profileRes.data as Profile);
    setOwnerBabies((babiesRes.data ?? []) as Baby[]);
    if (sessionsRes.data) setSessions(sessionsRes.data as PumpSession[]);
    setNursingSessions((nursingRes.data ?? []) as NursingSession[]);
    setViewerRole((accessRes.data?.viewer_role as "partner" | "ibclc") ?? "ibclc");

    const totalStash = (stashRes.data ?? []).reduce((sum, e) => sum + (e.oz ?? 0), 0);
    setStashOz(totalStash);
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
            const { error } = await supabase.from("viewer_accounts").delete()
              .eq("owner_id", viewingOwnerId).eq("viewer_id", user.id);
            if (error) {
              Alert.alert("Could not remove access", error.message);
              return;
            }
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
  const todayNursing = nursingSessions.filter((n) => n.nursed_at >= today);

  const initials = getInitials(ownerProfile?.display_name, ownerProfile?.email);
  const babyName = primaryBaby(ownerBabies)?.name;
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
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, flexShrink: 1, gap: 10 }}>
          <Pressable onPress={() => router.push("/(viewer)" as any)} hitSlop={12}>
            <Text style={{ fontSize: 12, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              ← All clients
            </Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: COLORS.ink2, flex: 1, flexShrink: 1 }}>
            Viewing <Text style={{ fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>{initials}</Text>'s data
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <ViewerAccountMenuLink fontSize={12} />
          <Pressable onPress={handleLeaveAccess} hitSlop={12}>
            <Text style={{ fontSize: 12, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              Leave
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingVertical: 20, paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink, marginBottom: 2 }}>
            {babyName ? `${babyName}'s Pump Data` : "Pump Dashboard"}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.ink3 }}>
            Last updated {format(new Date(), "MMM d 'at' h:mm a")}
          </Text>
        </View>

        {/* Today card */}
        <View style={{
          marginHorizontal: 20,
          marginBottom: 16,
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
              <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 2 }}>In stash</Text>
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {fmtOz(stashOz)}
              </Text>
            </View>
            {todayNursing.length > 0 && (
              <View>
                <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 2 }}>Nursed today</Text>
                <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                  {todayNursing.length}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Partner gets a slim summary; IBCLC gets the full clinical detail
            view (with explainer copy) — see the IBCLC dashboard plan. */}
        {viewerRole === "partner" ? (
          <PartnerSummaryView
            sessions={sessions}
            nursingSessions={nursingSessions}
            personInitials={initials}
            unit={unit}
          />
        ) : (
          <ViewerDataDisplay
            sessions={sessions}
            nursingSessions={nursingSessions}
            personInitials={initials}
            unit={unit}
          />
        )}

        {/* Read-only notice */}
        <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 16, paddingHorizontal: 20 }}>
          You have read-only access. Data can only be edited by the account owner.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
