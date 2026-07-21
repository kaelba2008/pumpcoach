import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { COLORS, SERIF, TBM_CONSULT_URL } from "../lib/constants";

interface Props {
  hasLactationConsultant: boolean | null;
}

export function ConsultRecommendation({ hasLactationConsultant }: Props) {
  const router = useRouter();

  const openConsult = () => Linking.openURL(TBM_CONSULT_URL);
  const openSnapshot = () => router.push("/(tabs)/snapshot" as any);

  if (hasLactationConsultant === true) {
    return (
      <View style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
        <Pressable onPress={openSnapshot}>
          <Text style={{ fontSize: 12, color: COLORS.ink3, lineHeight: 18 }}>
            Share your Pump Coach snapshot with your lactation consultant.{" "}
            <Text style={{ fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
              Open snapshot →
            </Text>
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Primary block */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 16, padding: 18,
        borderWidth: 1, borderColor: COLORS.border,
        shadowColor: COLORS.ink, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
      }}>
        <Text style={{ fontFamily: SERIF, fontSize: 16, color: COLORS.ink, marginBottom: 8, lineHeight: 22 }}>
          Want personalized pumping support?
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 12 }}>
          The Breastfeeding Mama team of IBCLCs specializes in pumping and milk supply. Virtual consultations available.
        </Text>
        <Pressable onPress={openConsult}>
          <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
            Book a consult →
          </Text>
        </Pressable>
      </View>

      {/* Secondary block */}
      <View style={{ paddingHorizontal: 4, gap: 2 }}>
        <Text style={{ fontSize: 12, color: COLORS.ink3, lineHeight: 18 }}>
          Already working with a lactation consultant? Share your Pump Coach data with them.
        </Text>
        <Pressable onPress={openSnapshot}>
          <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
            Share my snapshot →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
