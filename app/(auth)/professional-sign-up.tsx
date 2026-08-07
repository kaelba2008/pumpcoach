import React, { useState } from "react";
import {
  View, Text, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF } from "../../lib/constants";

// Deliberately email/password only, no Apple/Google — matches the existing
// precedent set by viewer-invite.tsx's own signup form, so this is
// consistent with what a partner already experiences, not a new pattern.
//
// This screen is excluded from AuthGate's redirect effect (see
// app/_layout.tsx's `inProfessionalSignUp` check) and owns its entire
// post-signup routing itself — it must never rely on AuthGate to route it
// away, since AuthGate's own async block would otherwise race this
// screen's upsert and could read a stale profile.onboarded_at first,
// hijacking straight into the mom onboarding wizard this screen exists to
// avoid entirely.
export default function ProfessionalSignUpScreen() {
  const router = useRouter();
  const { setSession, loadProfile } = useAuthStore();

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSignUp = async () => {
    if (!name.trim()) { Alert.alert("Please enter your name"); return; }
    if (!email || !password) { Alert.alert("Please fill in your email and password."); return; }
    if (password.length < 8) {
      Alert.alert("Password too short", "Your password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email:   email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    if (error) {
      setLoading(false);
      Alert.alert("Sign up failed", friendlyAuthError(error.message));
      return;
    }
    if (data.session) {
      // Skips the mom onboarding wizard entirely — onboarded_at is set
      // immediately, and account_type routes this account to the viewer
      // (client-list) experience from here on.
      await supabase.from("profiles").upsert({
        id:           data.session.user.id,
        email:        email.trim(),
        display_name: name.trim(),
        account_type: "professional",
        onboarded_at: new Date().toISOString(),
      });
      setSession(data.session);
      await loadProfile();
      router.replace("/(viewer)" as any);
      return;
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ backgroundColor: "#2E3F40" }}>
            <LinearGradient
              colors={["#2E3F40", "#4A5E60"]}
              style={{ paddingTop: 20, paddingBottom: 28, paddingHorizontal: 28 }}
            >
              <Pressable onPress={() => router.back()} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Back
                </Text>
              </Pressable>
              <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff", marginBottom: 4 }}>
                Create a provider account
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                For lactation consultants. No baby or pumping info needed — just your own details.
              </Text>
            </LinearGradient>
          </View>

          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 24 }}>
            <View style={{ gap: 12 }}>
              <Input
                label="Your name"
                value={name}
                onChangeText={setName}
                placeholder="Jane Smith, IBCLC"
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
              />

              <Button
                label="Create provider account"
                onPress={handleSignUp}
                loading={loading}
                fullWidth
                size="lg"
              />
            </View>

            <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center", lineHeight: 18 }}>
              Once you're in, your clients can invite you from their own app to share their pumping data with you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function friendlyAuthError(message: string): string {
  if (message.includes("already registered"))    return "An account with this email already exists. Try signing in instead.";
  if (message.includes("Password should be"))    return "Your password must be at least 8 characters.";
  if (message.includes("invalid email"))         return "Please enter a valid email address.";
  if (message.includes("Too many requests"))     return "Too many attempts. Please wait a moment and try again.";
  if (message.includes("network"))               return "Connection error. Please check your internet and try again.";
  return "Something went wrong. Please try again.";
}
