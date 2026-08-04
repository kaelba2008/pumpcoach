import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { COLORS, SERIF } from "../../lib/constants";

interface PremiumTeaserProps {
  headline: string;
  description: string;
  unlocks: string[];
  compact?: boolean;
}

export function PremiumTeaser({ headline, description, unlocks, compact = false }: PremiumTeaserProps) {
  const router = useRouter();

  if (compact) {
    return (
      <View style={{
        backgroundColor: COLORS.primaryMist, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: "#CBDBE0",
        flexDirection: "row", alignItems: "center", gap: 14,
      }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Text style={{ fontSize: 16 }}>✦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, marginBottom: 2 }}>
            {headline}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.ink2, lineHeight: 17 }}>{description}</Text>
        </View>
        <Pressable onPress={() => router.push("/paywall" as any)} style={{ flexShrink: 0 }}>
          <View style={{
            backgroundColor: "#FDF0EB",
            borderRadius: 10, borderWidth: 1, borderColor: COLORS.peach,
            paddingHorizontal: 12, paddingVertical: 7,
          }}>
            <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#8A4A35" }}>See Premium</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{
      backgroundColor: "#fff", borderRadius: 22, padding: 22,
      borderWidth: 1.5, borderColor: "#CBDBE0",
      shadowColor: COLORS.ink, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 18, color: "#fff" }}>✦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.mauve, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Premium
          </Text>
          <Text style={{ fontFamily: SERIF, fontSize: 17, color: COLORS.ink }}>
            {headline}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 16 }}>
        {description}
      </Text>

      {/* Unlocks list */}
      <View style={{ gap: 8, marginBottom: 18 }}>
        {unlocks.map((item) => (
          <View key={item} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: COLORS.primaryMist, alignItems: "center", justifyContent: "center",
              marginTop: 1, flexShrink: 0,
            }}>
              <Text style={{ fontSize: 10, color: COLORS.primary, fontFamily: "Nunito_800ExtraBold", fontWeight: "800" }}>✓</Text>
            </View>
            <Text style={{ fontSize: 13, color: COLORS.ink, flex: 1, lineHeight: 19 }}>{item}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push("/paywall" as any)}>
        <View style={{
          backgroundColor: COLORS.primary, borderRadius: 14,
          paddingVertical: 14, alignItems: "center",
        }}>
          <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>
            Unlock Premium →
          </Text>
        </View>
      </Pressable>

      <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", marginTop: 10 }}>
        From $5/mo with annual · 7-day free trial · Cancel anytime
      </Text>
    </View>
  );
}
