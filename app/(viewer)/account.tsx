import React from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF } from "../../lib/constants";

// Minimal account screen for professional (provider-only) accounts — there's
// no mom data to switch to here, so this is just identity + sign out,
// reached via ViewerAccountMenuLink instead of the usual "My Account" ->
// /(tabs) path other viewer accounts use.
export default function ViewerAccountScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert(
      "Sign out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: signOut },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            ← Back
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, marginBottom: 20 }}>
          Account
        </Text>

        <View style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 16,
          marginBottom: 24,
        }}>
          <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Name
          </Text>
          <Text style={{ fontSize: 15, color: COLORS.ink, marginBottom: 16 }}>
            {profile?.display_name || "—"}
          </Text>
          <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Email
          </Text>
          <Text style={{ fontSize: 15, color: COLORS.ink }}>
            {profile?.email || "—"}
          </Text>
        </View>

        <Pressable onPress={handleSignOut} hitSlop={12}>
          <Text style={{ fontSize: 13, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
