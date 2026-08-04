import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { COLORS, SERIF } from "../lib/constants";

interface BookConsultCardProps {
  variant?: "full" | "compact";
  trigger?: "pain" | "low_output" | "general" | "flange";
}

const MESSAGES = {
  pain: {
    headline: "Pain deserves real answers",
    body: "Pumping pain is almost always fixable, but figuring out why requires a trained eye. Our team of expert IBCLCs specializes in exactly this.",
  },
  low_output: {
    headline: "Still stuck on output?",
    body: "When adjustments aren't moving the needle, it's time for a full picture. A 1:1 consult identifies what's being missed.",
  },
  flange: {
    headline: "Get a professional fit assessment",
    body: "Flange fit is the #1 factor in pumping success. Our team of expert IBCLCs offers virtual fittings, often covered by insurance.",
  },
  general: {
    headline: "You don't have to\nfigure this out alone",
    body: "Our team of expert IBCLCs would love to help you meet your pumping and milk supply goals.",
  },
};

export function BookConsultCard({ variant = "full", trigger = "general" }: BookConsultCardProps) {
  const msg = MESSAGES[trigger];

  const handleBook = () => {
    Linking.openURL("https://www.thebreastfeedingmama.com/virtual-consultations");
  };

  if (variant === "compact") {
    return (
      <Pressable onPress={handleBook}>
        <View style={{
          backgroundColor: "#fff",
          borderRadius: 14, padding: 14,
          flexDirection: "row", alignItems: "center", gap: 12,
          borderWidth: 1.5, borderColor: COLORS.border,
        }}>
          <Text style={{ fontSize: 22 }}>👩‍⚕️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
              Book with a Pumping Expert
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
              Virtual · HSA/FSA · Insurance-friendly
            </Text>
          </View>
          <Text style={{ color: COLORS.primary, fontSize: 16 }}>→</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{
      backgroundColor: COLORS.primary,
      borderRadius: 22, padding: 22, overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <View style={{
        position: "absolute", top: -30, right: -30,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: "rgba(255,255,255,0.05)",
      }} />
      <View style={{
        position: "absolute", bottom: -20, left: 60,
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: "rgba(255,255,255,0.04)",
      }} />

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: "rgba(255,255,255,0.12)",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Text style={{ fontSize: 24 }}>👩‍⚕️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontFamily: SERIF, fontSize: 18, color: "#fff",
            lineHeight: 24, marginBottom: 6,
          }}>
            {msg.headline}
          </Text>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 20 }}>
            {msg.body}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["📞 Virtual or in-person", "💳 HSA/FSA", "🏥 Insurance-friendly"].map((badge) => (
          <View key={badge} style={{
            backgroundColor: "rgba(255,255,255,0.12)",
            borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
          }}>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              {badge}
            </Text>
          </View>
        ))}
      </View>

      <Pressable onPress={handleBook}>
        <View style={{
          backgroundColor: "#fff", borderRadius: 14,
          paddingVertical: 14, alignItems: "center",
        }}>
          <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
            Book with a Pumping Expert →
          </Text>
        </View>
      </Pressable>

      <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 10 }}>
        thebreastfeedingmama.com
      </Text>
    </View>
  );
}
