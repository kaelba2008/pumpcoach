import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { COLORS, SERIF } from "../lib/constants";
import { Button } from "../components/ui/Button";

type Step = "loading" | "invalid" | "sign-in" | "sign-up" | "accepting" | "done";

export default function ViewerInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session, setSession, loadViewerStatus } = useAuthStore();

  const [step,        setStep]        = useState<Step>("loading");
  const [ownerName,   setOwnerName]   = useState<string>("");
  const [inviteId,    setInviteId]    = useState<string>("");
  const [ownerId,     setOwnerId]     = useState<string>("");

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [name,        setName]        = useState("");
  const [busy,        setBusy]        = useState(false);
  const [authMode,    setAuthMode]    = useState<"sign-in" | "sign-up">("sign-in");

  // Verify the token on mount
  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    verifyToken();
  }, [token]);

  // Once we have a session AND a valid invite, accept it
  useEffect(() => {
    if (step === "sign-in" && session && inviteId) {
      acceptInvite();
    }
  }, [session, step]);

  async function verifyToken() {
    const { data, error } = await supabase
      .from("invitations")
      .select("id, owner_id, status, expires_at, profiles!owner_id(display_name, baby_name)")
      .eq("token", token)
      .maybeSingle();

    if (error || !data) { setStep("invalid"); return; }
    if (data.status === "revoked") { setStep("invalid"); return; }
    if (new Date(data.expires_at) < new Date()) { setStep("invalid"); return; }

    setInviteId(data.id);
    setOwnerId(data.owner_id);
    const profile = data.profiles as any;
    const name = profile?.display_name || profile?.baby_name ? `${profile.display_name || ""}${profile.display_name && profile.baby_name ? " (baby " + profile.baby_name + ")" : profile.baby_name ? "baby " + profile.baby_name : ""}` : "someone";
    setOwnerName(name);

    if (data.status === "accepted") {
      // Already accepted — if they're signed in as the right viewer just route them
      if (session) {
        await loadViewerStatus();
        router.replace("/(viewer)/dashboard" as any);
        return;
      }
    }

    if (session) {
      // Already signed in — go straight to accepting
      acceptInvite(data.id, data.owner_id);
    } else {
      setStep("sign-in");
    }
  }

  async function acceptInvite(id = inviteId, owner = ownerId) {
    if (!session?.user || !id) return;
    setStep("accepting");

    // Create viewer relationship
    const { error: vaError } = await supabase.from("viewer_accounts").upsert({
      owner_id:  owner,
      viewer_id: session.user.id,
    });

    if (vaError) {
      Alert.alert("Error", vaError.message);
      setStep("sign-in");
      return;
    }

    // Mark invitation accepted
    await supabase.from("invitations").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    }).eq("id", id);

    await loadViewerStatus();
    setStep("done");
    setTimeout(() => router.replace("/(viewer)/dashboard" as any), 1200);
  }

  async function handleSignIn() {
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { Alert.alert("Sign in failed", error.message); return; }
    if (data.session) {
      setSession(data.session);
      await acceptInvite(inviteId, ownerId);
    }
  }

  async function handleSignUp() {
    if (!name.trim()) { Alert.alert("Please enter your name"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    if (error) { setBusy(false); Alert.alert("Sign up failed", error.message); return; }
    if (data.session) {
      // Ensure a profile row exists
      await supabase.from("profiles").upsert({
        id: data.session.user.id,
        email: email.trim(),
        display_name: name.trim(),
      });
      setSession(data.session);
      await acceptInvite(inviteId, ownerId);
    }
    setBusy(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === "loading" || step === "accepting") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 16, color: COLORS.ink2, fontSize: 14 }}>
          {step === "accepting" ? "Setting up your access…" : "Checking invitation…"}
        </Text>
      </SafeAreaView>
    );
  }

  if (step === "done") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>🎉</Text>
        <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, textAlign: "center", marginBottom: 8 }}>
          You're in!
        </Text>
        <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center" }}>
          Taking you to the dashboard…
        </Text>
      </SafeAreaView>
    );
  }

  if (step === "invalid") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>🔗</Text>
        <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, textAlign: "center", marginBottom: 8 }}>
          This link isn't valid
        </Text>
        <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", marginBottom: 32 }}>
          It may have expired or already been used. Ask the person who shared it to send a new one.
        </Text>
        <Pressable onPress={() => router.replace("/welcome")}>
          <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", color: COLORS.primary }}>
            Go to Pump Coach →
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // sign-in / sign-up form
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 32, flexGrow: 1 }}>
          <Text style={{ fontSize: 13, color: COLORS.ink3, marginBottom: 8, textAlign: "center" }}>
            You've been invited by
          </Text>
          <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, textAlign: "center", marginBottom: 4 }}>
            {ownerName}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.ink2, textAlign: "center", marginBottom: 32 }}>
            to view their Pump Coach data.
          </Text>

          {/* Auth mode toggle */}
          <View style={{ flexDirection: "row", backgroundColor: COLORS.muted, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(["sign-in", "sign-up"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setAuthMode(m)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                  backgroundColor: authMode === m ? "#fff" : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", color: authMode === m ? COLORS.ink : COLORS.ink3 }}>
                  {m === "sign-in" ? "Sign in" : "Create account"}
                </Text>
              </Pressable>
            ))}
          </View>

          {authMode === "sign-up" && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 6 }}>Your name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Jane Smith"
                autoCapitalize="words"
                style={{
                  borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                  paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
                  backgroundColor: "#fff", color: COLORS.ink,
                }}
              />
            </View>
          )}

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 6 }}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{
                borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
                backgroundColor: "#fff", color: COLORS.ink,
              }}
            />
          </View>

          <View style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 6 }}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={authMode === "sign-up" ? "Choose a password" : "Your password"}
              secureTextEntry
              style={{
                borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
                backgroundColor: "#fff", color: COLORS.ink,
              }}
            />
          </View>

          <Button
            label={authMode === "sign-in" ? "Sign in & accept" : "Create account & accept"}
            onPress={authMode === "sign-in" ? handleSignIn : handleSignUp}
            loading={busy}
            fullWidth
            size="lg"
          />

          <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center", marginTop: 24, lineHeight: 18 }}>
            You'll have read-only access to their pumping data. You can't edit or delete anything.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
