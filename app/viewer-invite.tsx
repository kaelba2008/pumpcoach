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

type Step = "loading" | "enter-token" | "invalid" | "sign-in" | "sign-up" | "accepting" | "done";

export default function ViewerInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session, setSession, loadViewerStatus } = useAuthStore();

  const [step,        setStep]        = useState<Step>("loading");
  const [ownerName,   setOwnerName]   = useState<string>("");
  const [inviteId,    setInviteId]    = useState<string>("");
  const [ownerId,     setOwnerId]     = useState<string>("");
  const [manualToken, setManualToken] = useState("");

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [name,        setName]        = useState("");
  const [busy,        setBusy]        = useState(false);
  const [authMode,    setAuthMode]    = useState<"sign-in" | "sign-up">("sign-in");

  // Verify the token on mount; without one (opened from the welcome screen),
  // let the viewer paste the code from their invite email.
  useEffect(() => {
    if (!token) { setStep("enter-token"); return; }
    verifyToken(token);
  }, [token]);

  // Once we have a session AND a valid invite, accept it
  useEffect(() => {
    if (step === "sign-in" && session && inviteId) {
      acceptInvite();
    }
  }, [session, step, inviteId]);

  async function verifyToken(tokenValue: string) {
    setStep("loading");
    // Goes through a SECURITY DEFINER RPC rather than a direct table
    // select — invitations has no public SELECT policy (it would let
    // anyone dump every pending invite app-wide), so a pre-auth preview
    // can only ever look up the exact token given, never list rows.
    const { data, error } = await supabase
      .rpc("get_invitation_preview", { p_token: tokenValue.trim() })
      .maybeSingle() as {
        data: { id: string; owner_id: string; status: string; expires_at: string; owner_display_name: string | null } | null;
        error: { message: string } | null;
      };

    if (error || !data) { setStep("invalid"); return; }
    if (data.status === "revoked") { setStep("invalid"); return; }

    setInviteId(data.id);
    setOwnerId(data.owner_id);
    // Baby name isn't shown in this pre-acceptance preview — the babies
    // table's viewer-read RLS policy only grants access once a
    // viewer_accounts relationship exists, which isn't true yet here.
    setOwnerName(data.owner_display_name || "someone");

    if (data.status === "accepted") {
      // Already accepted — expiry doesn't matter, the viewer relationship exists.
      // If already signed in, route directly; otherwise prompt sign-in to regain access.
      if (session) {
        await loadViewerStatus();
        router.replace("/(viewer)/dashboard" as any);
        return;
      }
      // Fall through to sign-in form — acceptInvite will handle the existing relationship gracefully.
    }

    // Only block pending invitations on expiry
    if (data.status !== "accepted" && new Date(data.expires_at) < new Date()) { setStep("invalid"); return; }

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

    // Create viewer relationship (or update if it already exists). The
    // database requires this email to match a real, non-revoked
    // invitation for this owner (see 20260805020000_viewer_invite_security_fix.sql) —
    // an account signed in under a different email than the invite was
    // sent to will be rejected here, not silently granted access.
    const { error: vaError } = await supabase.from("viewer_accounts").upsert({
      owner_id:     owner,
      viewer_id:    session.user.id,
      viewer_email: session.user.email,
    });

    if (vaError) {
      // Ignore constraint violation errors — the viewer relationship already exists, which is fine
      const isDuplicateOrConstraint =
        vaError.message?.includes("duplicate key") ||
        vaError.message?.includes("violates unique constraint") ||
        vaError.code === "23505"; // PostgreSQL unique constraint violation code

      if (!isDuplicateOrConstraint) {
        const isRlsRejection = vaError.code === "42501" || vaError.message?.includes("row-level security");
        Alert.alert(
          "Could not accept invite",
          isRlsRejection
            ? "This invite was sent to a different email address, or it's no longer valid. Sign in with the email the invite was sent to, or ask for a new invite."
            : vaError.message,
        );
        setStep("sign-in");
        return;
      }
      // If it's a duplicate/constraint error, continue — the relationship is already there
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
          That code isn't valid
        </Text>
        <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", marginBottom: 32 }}>
          It may have expired, already been used, or been mistyped. Try pasting it again, or ask the person who shared it to send a new invite.
        </Text>
        <Button label="Try again" onPress={() => { setManualToken(""); setStep("enter-token"); }} />
        <Pressable onPress={() => router.replace("/welcome")} style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", color: COLORS.primary }}>
            Go to Pump Coach →
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (step === "enter-token") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 32 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 40, marginBottom: 16, textAlign: "center" }}>💌</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, textAlign: "center", marginBottom: 8 }}>
              Enter your invite code
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
              Paste the code from your invitation email to view someone's pumping data.
            </Text>
            <TextInput
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="Paste invite code here"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border,
                borderRadius: 12, padding: 14, fontSize: 14, color: COLORS.ink, marginBottom: 16,
              }}
            />
            <Button
              label="Continue"
              fullWidth
              disabled={manualToken.trim().length < 8}
              onPress={() => verifyToken(manualToken)}
            />
            <Pressable onPress={() => router.replace("/welcome")} style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", color: COLORS.primary, textAlign: "center" }}>
                ← Back
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
            <View style={{ position: "relative", justifyContent: "center" }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={authMode === "sign-up" ? "Choose a password" : "Your password"}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                style={{
                  borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                  paddingHorizontal: 16, paddingVertical: 12, paddingRight: 64, fontSize: 15,
                  backgroundColor: "#fff", color: COLORS.ink,
                }}
              />
              <Pressable
                onPress={() => setPasswordVisible(v => !v)}
                hitSlop={8}
                style={{ position: "absolute", right: 14, paddingVertical: 6 }}
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
              >
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
                  {passwordVisible ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>
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
