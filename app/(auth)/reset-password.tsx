import React, { useState } from "react";
import {
  View, Text, KeyboardAvoidingView, Platform, Alert, Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { COLORS, SERIF } from "../../lib/constants";
import { useAuthStore } from "../../store/authStore";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const setPasswordRecovery = useAuthStore((s) => s.setPasswordRecovery);
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);

  const handleReset = async () => {
    if (!password || !confirm) {
      Alert.alert("Please fill in both fields.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password too short", "Your password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Please make sure both fields match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Alert.alert("Could not update password", "Your reset link may have expired. Please request a new one from the sign in screen.");
      return;
    }

    // Success — clear the recovery flag so normal routing resumes, then
    // route to tabs and show confirmation
    setPasswordRecovery(false);
    router.replace("/(tabs)" as any);
    setTimeout(() => {
      Alert.alert("Password updated", "Your new password is set. You are now signed in.");
    }, 400);
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
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff", marginBottom: 4 }}>
            Set a new password
          </Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            Choose something you will remember
          </Text>
        </LinearGradient>

        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 20 }}>
          <View style={{ gap: 16 }}>
            <Input
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              autoFocus
            />
            <Input
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Type it again"
              secureTextEntry
            />
          </View>

          <Button
            label="Set new password"
            onPress={handleReset}
            loading={loading}
            fullWidth
            size="lg"
          />

          <Pressable
            onPress={() => {
              setPasswordRecovery(false);
              router.replace("/welcome" as any);
            }}
            style={{ alignItems: "center" }}
          >
            <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Cancel and go back to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
