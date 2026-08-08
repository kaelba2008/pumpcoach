import React, { useState } from "react";
import { View, Text, Pressable, Alert, Platform, KeyboardAvoidingView, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import { Share } from "react-native";
import { Button } from "./../components/ui/Button";
import { Input } from "./../components/ui/Input";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { COLORS, SERIF } from "../lib/constants";

const SUPPORT_EMAIL = "katie@thebreastfeedingmama.com";

export default function ReportIssueScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !message.trim()) return;
    setSubmitting(true);

    const appVersion = Constants.expoConfig?.version ?? null;
    const runtimeVersion = (Constants.expoConfig?.runtimeVersion as string) ?? null;

    const { error } = await supabase.from("issue_reports").insert({
      user_id: user.id,
      message: message.trim(),
      app_version: appVersion,
      runtime_version: runtimeVersion,
      platform: Platform.OS,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert("Could not submit", error.message);
      return;
    }

    // The DB row is the real guarantee this isn't lost -- the email below
    // is a best-effort way to get it in front of Katie promptly, same
    // pattern as the existing invite-email flow. Whether or not this step
    // completes, the report has already been saved.
    const subject = "Pump Coach: issue report";
    const body = [
      `From: ${profile?.display_name ?? "A Pump Coach user"} (${profile?.email ?? user.email ?? "unknown email"})`,
      `Platform: ${Platform.OS} · App version: ${appVersion ?? "unknown"} · Runtime: ${runtimeVersion ?? "unknown"}`,
      ``,
      message.trim(),
    ].join("\n");

    const available = await MailComposer.isAvailableAsync();
    if (available) {
      await MailComposer.composeAsync({ recipients: [SUPPORT_EMAIL], subject, body });
    } else {
      await Share.share({ message: `${subject}\n\n${body}` });
    }

    Alert.alert("Thanks", "This has been saved and sent — we'll take a look.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 }}
        >
          <Pressable onPress={() => router.back()} style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              ‹ Back
            </Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Report an issue</Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3, lineHeight: 18 }}>
            Something broken or confusing? Tell us and it'll actually reach us — no need to guess whether anyone saw it.
          </Text>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Input
            label="What went wrong?"
            value={message}
            onChangeText={setMessage}
            placeholder="Be as specific as you can — what you were doing, what you expected, what happened instead."
            multiline
            numberOfLines={6}
            style={{ minHeight: 140, textAlignVertical: "top" }}
          />
          <Button
            label="Submit"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!message.trim()}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
