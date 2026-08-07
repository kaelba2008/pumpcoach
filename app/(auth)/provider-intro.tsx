import React from "react";
import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/ui/Button";
import { COLORS, SERIF } from "../../lib/constants";

// TODO(katie): review this copy before ship -- first-impression content for
// a peer-professional audience, drafted in your general voice (see the
// existing "Meet your coach" bio in onboarding.tsx as the tone reference)
// but not something that should ship unreviewed.
const WHAT_YOU_GET = [
  {
    icon: "📋",
    title: "Your real client list",
    body: "See everyone who's shared their data with you in one place — no more juggling screenshots or asking a mom to read her numbers out loud.",
  },
  {
    icon: "🔒",
    title: "Patient-initiated, always",
    body: "A client invites you — you never request access. She can revoke it any time. Nothing here works around her control of her own data.",
  },
  {
    icon: "🩺",
    title: "Built for your judgment, not instead of it",
    body: "No documentation, no EHR, no diagnosis. Just the data she's already tracking, laid out clearly enough to inform the conversation you're already having.",
  },
];

export default function ProviderIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <View style={{ backgroundColor: "#2E3F40" }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 20, paddingBottom: 24, paddingHorizontal: 28 }}
        >
          <Pressable onPress={() => router.back()} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              ‹ Back
            </Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>For lactation consultants</Text>
        </LinearGradient>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 20 }}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <Image
            source={require("../../assets/katie-clark.jpg")}
            style={{ width: 120, height: 120, borderRadius: 60 }}
          />
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink }}>Katie Clark</Text>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3, letterSpacing: 1.5, textTransform: "uppercase" }}>
              IBCLC
            </Text>
          </View>
        </View>

        <View style={{
          backgroundColor: "#fff", borderRadius: 20, padding: 20,
          borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Text style={{ fontSize: 15, color: COLORS.ink, lineHeight: 24 }}>
            Hi, I'm Katie — an IBCLC and mom of four. I built Pump Coach for my own clients first, because I wanted a way to actually see what was happening between sessions instead of guessing from memory at an appointment. The provider side of this app is built for colleagues like you: something that respects your clinical judgment, never gets between you and your client, and never asks either of you to do more data entry than you already do.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          {WHAT_YOU_GET.map(({ icon, title, body }) => (
            <View key={title} style={{
              flexDirection: "row", gap: 14,
              backgroundColor: "#fff", borderRadius: 16, padding: 14,
              borderWidth: 1, borderColor: COLORS.border,
            }}>
              <Text style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 3 }}>
                  {title}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>{body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Button
          label="Create my provider account"
          onPress={() => router.push("/(auth)/professional-sign-up" as any)}
          fullWidth
          size="lg"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
