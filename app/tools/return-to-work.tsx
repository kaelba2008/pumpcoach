import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { format } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/ui/Button";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { COLORS, SERIF } from "../../lib/constants";
import { getReturnToWorkPhase } from "../../lib/returnToWork";

export default function ReturnToWorkPlannerScreen() {
  const router = useRouter();
  const { user, profile, loadProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [dismissedWorkPrompt, setDismissedWorkPrompt] = useState(false);

  const returnDate = profile?.return_to_work ? new Date(`${profile.return_to_work}T12:00:00`) : null;
  const phaseInfo = getReturnToWorkPhase(profile?.return_to_work ?? null);

  const handleDateChange = async (date: Date | null) => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({ return_to_work: date ? format(date, "yyyy-MM-dd") : null })
      .eq("id", user.id)
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

  const handleUpdateContext = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ pumping_context: "work_pumping" })
      .eq("id", user.id);
    if (error) {
      Alert.alert("Could not update", error.message);
      return;
    }
    await loadProfile();
  };

  const showScheduleCard = phaseInfo && phaseInfo.phase !== "far_out";
  const showWorkPromptCard = phaseInfo?.phase === "returned"
    && profile?.pumping_context !== "work_pumping"
    && !dismissedWorkPrompt;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <View style={{ backgroundColor: "#2E3F40" }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 }}
        >
          <Pressable onPress={() => router.back()} style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              ‹ Back
            </Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Return to Work Planner</Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3, lineHeight: 18 }}>
            A gentle runway for the weeks around your return — building a
            buffer, adjusting your rhythm, and settling in. Change your date
            anytime.
          </Text>
        </LinearGradient>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <View style={{
          backgroundColor: "#fff", borderRadius: 20, padding: 18,
          shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <DatePickerField
            label="When do you go back to work? (optional)"
            value={returnDate}
            onChange={handleDateChange}
            mode="date"
            minimumDate={new Date()}
            optional
          />
        </View>

        {phaseInfo && (
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: COLORS.border,
          }}>
            <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              {phaseInfo.label}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6 }}>
              {phaseInfo.headline}
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
              {phaseInfo.body}
            </Text>
          </View>
        )}

        {returnDate && (
          <Pressable onPress={() => router.push("/(tabs)/stash")}>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 12,
              backgroundColor: COLORS.primaryMist, borderRadius: 16, padding: 16,
            }}>
              <Text style={{ fontSize: 22 }}>🧊</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                  Build your stash
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 2 }}>
                  Set a stash goal on the Stash tab →
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {showScheduleCard && (
          <Pressable onPress={() => router.push("/weekly-schedule" as any)}>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 12,
              backgroundColor: COLORS.primaryMist, borderRadius: 16, padding: 16,
            }}>
              <Text style={{ fontSize: 22 }}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                  Set your weekly schedule
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 2 }}>
                  Tell us which days you're away from baby →
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {showWorkPromptCard && (
          <View style={{
            backgroundColor: "#fff", borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: COLORS.border,
          }}>
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19, marginBottom: 12 }}>
              Since you're back at work, want to update your pumping
              situation to "Pumping at work, nursing otherwise"? This helps
              your insights better match your new rhythm.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Yes, update it" onPress={handleUpdateContext} size="sm" />
              <Pressable onPress={() => setDismissedWorkPrompt(true)} style={{ justifyContent: "center", paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 13, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  No thanks
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
