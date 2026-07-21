import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, Alert, Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { supabase } from "../../lib/supabase";
import { COLORS, SERIF, PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../lib/constants";
import { configureGoogleSignIn, signInWithGoogle } from "../../lib/googleAuth";

export default function SignUpScreen() {
  const router = useRouter();
  const [name,           setName]           = useState("");
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
      Alert.alert("Sign up failed", result.error);
    }
    // Success: onAuthStateChange in _layout.tsx routes to onboarding (new) or tabs (returning)
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
        Alert.alert("Sign up failed", "Could not complete Apple Sign In. Please try again.");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token:    credential.identityToken,
      });
      setLoading(false);

      if (error) Alert.alert("Sign up failed", friendlyAuthError(error.message));
      // On success, onAuthStateChange routes to onboarding (new user) or tabs (returning user)
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return; // User dismissed — no error
      setLoading(false);
      Alert.alert("Sign up failed", "Could not complete Apple Sign In. Please try again.");
    }
  };

  // ── Email / password ───────────────────────────────────────────────────────

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Please fill in your email and password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password too short", "Your password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email:   email.trim(),
      password,
      options: { data: { display_name: name.trim() || null } },
    });
    setLoading(false);
    if (error) Alert.alert("Sign up failed", friendlyAuthError(error.message));
    // On success, onAuthStateChange in _layout.tsx routes to onboarding
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
              style={{ paddingTop: 20, paddingBottom: 28, paddingHorizontal: 28 }}
            >
              <Pressable onPress={() => router.back()} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Back
                </Text>
              </Pressable>
              <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff", marginBottom: 4 }}>
                Create account
              </Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                Free to start. No credit card needed.
              </Text>
            </LinearGradient>
          </View>

          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 24 }}>
            <View style={{ gap: 12 }}>

              {/* ── Social sign-in ── */}
              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
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
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>or sign up with email</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
              </View>

              {/* ── Email / password ── */}
              <Input
                label="Your first name (optional)"
                value={name}
                onChangeText={setName}
                placeholder="Katie"
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
                label="Create Account"
                onPress={handleSignUp}
                loading={loading}
                fullWidth
                size="lg"
              />
            </View>

            <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center", lineHeight: 18 }}>
              By creating an account you agree to our{" "}
              <Text
                style={{ color: COLORS.primary, textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
              >
                Terms of Service
              </Text>
              {" "}and{" "}
              <Text
                style={{ color: COLORS.primary, textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              >
                Privacy Policy
              </Text>
              .{"\n"}Your data is encrypted and never sold.
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
