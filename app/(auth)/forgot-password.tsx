import React, { useState } from "react";
import {
  View, Text, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "react-native";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { COLORS, SERIF } from "../../lib/constants";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      Alert.alert("Please enter your email address.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "pumpcoach://",
    });
    setLoading(false);
    if (error) {
      Alert.alert("Something went wrong", "We could not send a reset link. Please check your email address and try again.");
      return;
    }
    setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
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
            Reset your password
          </Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {sent ? "Check your inbox" : "We will send you a reset link"}
          </Text>
        </LinearGradient>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 20 }}>
          {sent ? (
            // Confirmation state
            <View style={{ gap: 20 }}>
              <View style={{
                backgroundColor: "#fff", borderRadius: 20, padding: 24,
                borderWidth: 1, borderColor: COLORS.border, alignItems: "center", gap: 12,
              }}>
                <Text style={{ fontSize: 36 }}>📬</Text>
                <Text style={{
                  fontFamily: "Nunito_700Bold", fontWeight: "700",
                  fontSize: 16, color: COLORS.ink, textAlign: "center",
                }}>
                  Reset link sent
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 22 }}>
                  We sent a link to{" "}
                  <Text style={{ fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                    {email.trim()}
                  </Text>
                  . Tap the link in your email to set a new password.{"\n\n"}
                  It may take a minute or two to arrive. Check your spam folder if you don't see it.
                </Text>
              </View>

              <Button
                label="Resend link"
                variant="secondary"
                onPress={() => { setSent(false); }}
                fullWidth
              />

              <Pressable onPress={() => router.back()} style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Back to sign in</Text>
              </Pressable>
            </View>
          ) : (
            // Entry state
            <View style={{ gap: 20 }}>
              <Input
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <Button
                label="Send reset link"
                onPress={handleSend}
                loading={loading}
                fullWidth
                size="lg"
              />
              <Pressable onPress={() => router.back()} style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Back to sign in</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
