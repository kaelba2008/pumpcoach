import React from "react";
import { Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../store/authStore";
import { COLORS } from "../lib/constants";

interface ViewerAccountMenuLinkProps {
  fontSize?: number;
}

// A professional (provider-only) account has no mom data to switch back
// to, so routing it to /(tabs) — the pattern every other viewer account
// uses here — is a dead end (empty tabs, blank profile). This branches to
// a minimal account/sign-out screen instead for that case.
export function ViewerAccountMenuLink({ fontSize = 13 }: ViewerAccountMenuLinkProps) {
  const router = useRouter();
  const { profile, setViewingMode } = useAuthStore();

  if (profile?.account_type === "professional") {
    return (
      <Pressable hitSlop={12} onPress={() => router.push("/(viewer)/account" as any)}>
        <Text style={{ fontSize, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
          Account
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      hitSlop={12}
      onPress={async () => {
        await AsyncStorage.setItem("viewer_mode_pref", "own");
        setViewingMode(null);
        router.replace("/(tabs)" as any);
      }}
    >
      <Text style={{ fontSize, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
        My Account
      </Text>
    </Pressable>
  );
}
