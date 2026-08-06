import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, Pressable, RefreshControl, Alert, Modal, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, startOfDay, subDays } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF } from "../../lib/constants";
import { fmtOz } from "../../lib/formatters";
import { ViewerDataDisplay } from "../../components/ViewerDataDisplay";
import { useUnit } from "../../hooks/useUnit";
import { PumpSession, Profile, ViewerNote, Baby, NursingSession } from "../../types";
import { primaryBaby } from "../../lib/babies";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ViewerDashboard() {
  const router = useRouter();
  const { user, viewingOwnerId, setViewingMode, signOut } = useAuthStore();
  const { unit } = useUnit();

  const [ownerProfile, setOwnerProfile] = useState<Profile | null>(null);
  const [ownerBabies,  setOwnerBabies]  = useState<Baby[]>([]);
  const [sessions,     setSessions]     = useState<PumpSession[]>([]);
  const [nursingSessions, setNursingSessions] = useState<NursingSession[]>([]);
  const [stashOz,      setStashOz]      = useState<number>(0);
  const [note,         setNote]         = useState<ViewerNote | null>(null);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote,   setEditingNote]   = useState("");
  const [savingNote,    setSavingNote]    = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [viewingOwnerId])
  );

  async function loadData() {
    if (!viewingOwnerId || !user) return;

    // 90 days of history for viewers (IBCLCs need to see trends)
    const since = subDays(new Date(), 90).toISOString();

    const [profileRes, babiesRes, sessionsRes, nursingRes, stashRes, noteRes] = await Promise.all([
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
      supabase.from("viewer_notes")
        .select("*")
        .eq("viewer_id", user.id)
        .eq("viewing_user_id", viewingOwnerId)
        .maybeSingle(),
    ]);

    if (profileRes.data) setOwnerProfile(profileRes.data as Profile);
    setOwnerBabies((babiesRes.data ?? []) as Baby[]);
    if (sessionsRes.data) setSessions(sessionsRes.data as PumpSession[]);
    setNursingSessions((nursingRes.data ?? []) as NursingSession[]);
    setNote((noteRes.data as ViewerNote) ?? null);

    const totalStash = (stashRes.data ?? []).reduce((sum, e) => sum + (e.oz ?? 0), 0);
    setStashOz(totalStash);
    setRefreshing(false);
  }

  async function handleSaveNote() {
    if (!user || !viewingOwnerId) return;
    setSavingNote(true);
    const { error } = await supabase.from("viewer_notes").upsert(
      {
        viewer_id: user.id,
        viewing_user_id: viewingOwnerId,
        note_content: editingNote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "viewer_id,viewing_user_id" }
    );
    setSavingNote(false);
    if (error) {
      Alert.alert("Error", "Could not save the note: " + error.message);
      return;
    }
    setShowNoteModal(false);
    loadData();
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

  const initials = getInitials(ownerProfile?.display_name);
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
        <Text style={{ fontSize: 12, color: COLORS.ink2, flex: 1, flexShrink: 1 }}>
          Viewing <Text style={{ fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>{initials}</Text>'s data
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

        {/* My notes card */}
        <Pressable
          onPress={() => { setEditingNote(note?.note_content ?? ""); setShowNoteModal(true); }}
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
            backgroundColor: COLORS.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: note ? 8 : 0 }}>
            <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.8 }}>
              My Notes
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              {note ? "Edit →" : "+ Add note"}
            </Text>
          </View>
          {note && (
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }} numberOfLines={4}>
              {note.note_content}
            </Text>
          )}
        </Pressable>

        {/* Full data display: metrics, clickable graph, sessions grouped by day (90 days) */}
        <ViewerDataDisplay
          sessions={sessions}
          nursingSessions={nursingSessions}
          personInitials={initials}
          unit={unit}
        />

        {/* Read-only notice */}
        <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 16, paddingHorizontal: 20 }}>
          You have read-only access. Data can only be edited by the account owner.
        </Text>
      </ScrollView>

      {/* Note editor modal */}
      <Modal visible={showNoteModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowNoteModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <Pressable onPress={() => setShowNoteModal(false)} hitSlop={12}>
              <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>My Notes</Text>
            <Pressable onPress={handleSaveNote} hitSlop={12} disabled={savingNote}>
              <Text style={{ fontSize: 15, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700", opacity: savingNote ? 0.5 : 1 }}>
                {savingNote ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={editingNote}
              onChangeText={setEditingNote}
              placeholder="Observations, recommendations, things to follow up on…"
              multiline
              autoFocus
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
                color: COLORS.ink,
                minHeight: 180,
                textAlignVertical: "top",
              }}
            />
            <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 10, lineHeight: 16 }}>
              Notes are visible to you and to the person who shared their data with you.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
