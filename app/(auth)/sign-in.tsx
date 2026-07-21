import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { supabase } from "../../lib/supabase";
import { COLORS, SERIF } from "../../lib/constants";
import { configureGoogleSignIn, signInWithGoogle } from "../../lib/googleAuth";

export default function SignInScreen() {
  const router = useRouter();
  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [loading,        setLoading]        = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    configureGoogleSignIn();
  }, []);

  // ── Google ─────────────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (!result.success && !result.cancelled && result.error) {
      Alert.alert("Sign in failed", result.error);
    }
    // Success: onAuthStateChange in _layout.tsx handles routing
  };

  // ── Apple ──────────────────────────────────────────────────────────────────

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert("Sign in failed", "Could not complete Apple Sign In. Please try again.");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token:    credential.identityToken,
      });
      setLoading(false);

      if (error) Alert.alert("Sign in failed", friendlyAuthError(error.message));
      // On success, onAuthStateChange in _layout.tsx handles routing
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return; // User dismissed — no error
      setLoading(false);
      Alert.alert("Sign in failed", "Could not complete Apple Sign In. Please try again.");
    }
  };

  // ── Email / password ───────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Please enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", friendlyAuthError(error.message));
  };

  const handleMagicLink = async () => {
    if (!email) {
      Alert.alert("Enter your email address first.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) {
      Alert.alert("Could not send link", friendlyAuthError(error.message));
    } else {
      Alert.alert("Check your email", "We sent you a sign-in link. Tap it to open the app.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ backgroundColor: "#2E3F40" }}>
            <LinearGradient
              colors={["#2E3F40", "#4A5E60"]}
              style={{ paddingTop: 48, paddingBottom: 36, paddingHorizontal: 28, alignItems: "center" }}
            >
              <Text style={{ fontFamily: SERIF, fontSize: 30, color: "#fff", marginBottom: 6 }}>
                Pump Coach
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5 }}>
                Created by Katie Clark, IBCLC
              </Text>
            </LinearGradient>
          </View>

          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 24 }}>
            <View style={{ gap: 12 }}>

              {/* ── Social sign-in ── */}
              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={{ width: "100%", height: 50 }}
                  onPress={handleAppleSignIn}
                />
              )}

              <GoogleSignInButton
                label="Continue with Google"
                onPress={handleGoogleSignIn}
                disabled={loading}
              />

              {/* Divider */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>or sign in with email</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
              </View>

              {/* ── Email / password ── */}
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={{ gap: 8 }}>
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                />
                <Pressable
                  onPress={() => router.push("/(auth)/forgot-password" as any)}
                  style={{ alignSelf: "flex-end" }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                    Forgot password?
                  </Text>
                </Pressable>
              </View>

              <Button
                label="Sign In"
                onPress={handleSignIn}
                loading={loading}
                fullWidth
                size="lg"
              />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>or</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
              </View>

              <Button
                label="Email me a sign-in link"
                variant="secondary"
                onPress={handleMagicLink}
                loading={loading}
                fullWidth
              />
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>new here?</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
              </View>
              <Pressable
                onPress={() => router.push("/(auth)/sign-up" as any)}
                style={({ pressed }) => ({
                  borderRadius: 16, paddingVertical: 16,
                  alignItems: "center", borderWidth: 1.5,
                  borderColor: COLORS.primary,
                  backgroundColor: pressed ? "rgba(74,94,96,0.05)" : "#fff",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: COLORS.primary, fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>
                  Create a free account
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Convert raw Supabase error strings into human-readable messages
function friendlyAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) return "Incorrect email or password. Please try again.";
  if (message.includes("Email not confirmed"))       return "Please confirm your email before signing in. Check your inbox for a confirmation link.";
  if (message.includes("Too many requests"))         return "Too many attempts. Please wait a moment and try again.";
  if (message.includes("User not found"))            return "No account found with that email. Try signing up instead.";
  if (message.includes("network"))                   return "Connection error. Please check your internet and try again.";
  return "Something went wrong. Please try again.";
}
