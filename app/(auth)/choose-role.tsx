import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SERIF } from "../../lib/constants";

export default function ChooseRoleScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <View style={{ backgroundColor: "#2E3F40" }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 20, paddingBottom: 28, paddingHorizontal: 28 }}
        >
          <Pressable onPress={() => router.back()} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              ‹ Back
            </Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff", marginBottom: 4 }}>
            Which describes you?
          </Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 18 }}>
            This just sets up the right experience for you — you can always share data across roles later.
          </Text>
        </LinearGradient>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28, gap: 14 }}>
        <Pressable onPress={() => router.push("/(auth)/sign-up")}>
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 22,
            borderWidth: 1.5, borderColor: COLORS.border,
            shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
          }}>
            <Text style={{ fontSize: 30, marginBottom: 10 }}>🤱</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, marginBottom: 6 }}>
              I'm a Parent
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
              Track your own pumping journey — sessions, supply trends, and coaching built for you.
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={() => router.push("/(auth)/provider-intro" as any)}>
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 22,
            borderWidth: 1.5, borderColor: COLORS.border,
            shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
          }}>
            <Text style={{ fontSize: 30, marginBottom: 10 }}>👩‍⚕️</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, marginBottom: 6 }}>
              I'm a Provider
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>
              Lactation consultant or IBCLC — view the data your clients choose to share with you.
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
