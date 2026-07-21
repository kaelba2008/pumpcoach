import React, { useEffect, useRef } from "react";
import {
  View, Text, Pressable, Animated, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SERIF } from "../lib/constants";

export default function WelcomeScreen() {
  const router    = useRouter();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>

      {/* Header */}
      <View style={{ backgroundColor: "#2E3F40" }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 48, paddingBottom: 52, paddingHorizontal: 32, position: "relative", overflow: "hidden" }}
        >
          {/* Decorative circles */}
          <View style={{
            position: "absolute", top: -40, right: -40,
            width: 200, height: 200, borderRadius: 100,
            backgroundColor: "rgba(255,255,255,0.04)",
          }} />

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Text style={{
              fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600",
              color: "rgba(255,255,255,0.45)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 22,
            }}>
              Pump Coach
            </Text>

            <Text style={{
              fontFamily: SERIF, fontSize: 38, fontWeight: "400",
              color: "#fff", lineHeight: 48, marginBottom: 0,
            }}>
              Your pumping{"\n"}journey,{"\n"}
              <Text style={{ fontStyle: "italic", color: "rgba(255,255,255,0.8)" }}>
                understood.
              </Text>
            </Text>
          </Animated.View>
        </LinearGradient>
      </View>

      {/* Cream notch */}
      <View style={{
        height: 28, backgroundColor: COLORS.cream,
        marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      }} />

      {/* Body */}
      <Animated.View style={{
        flex: 1, paddingHorizontal: 28, backgroundColor: COLORS.cream,
        opacity: fadeAnim, transform: [{ translateY: slideAnim }],
      }}>

        {/* Katie card */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 16,
          backgroundColor: "#fff", borderRadius: 20, padding: 18,
          borderWidth: 1, borderColor: COLORS.border, marginBottom: 24,
          shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        }}>
          <Image
            source={require("../assets/katie-clark.jpg")}
            style={{ width: 56, height: 56, borderRadius: 28, flexShrink: 0 }}
            accessibilityLabel="Katie Clark, IBCLC"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 2 }}>
              Katie Clark
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.5 }}>
              IBCLC · The Breastfeeding Mama
            </Text>
          </View>
        </View>

        <Text style={{
          fontSize: 15, color: COLORS.ink2, lineHeight: 25, marginBottom: 36,
        }}>
          Pump Coach is not just another tracking app. It was created by Katie Clark, an IBCLC who specializes in pumping and milk supply. She built it to help you actually understand your supply, meet your goals, and feel empowered — not anxious — about your pumping journey.
        </Text>

        {/* CTAs */}
        <View style={{ gap: 12, marginBottom: 24 }}>
          <Pressable
            onPress={() => router.push("/(auth)/sign-up")}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primary,
              borderRadius: 16, paddingVertical: 17,
              alignItems: "center",
              opacity: pressed ? 0.88 : 1,
              shadowColor: COLORS.primary, shadowOpacity: 0.3,
              shadowRadius: 12, elevation: 4,
            })}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", letterSpacing: 0.3 }}>
              Get started, it's free
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(auth)/sign-in")}
            style={({ pressed }) => ({
              borderRadius: 16, paddingVertical: 16,
              alignItems: "center", borderWidth: 1.5,
              borderColor: COLORS.border,
              opacity: pressed ? 0.7 : 1,
              backgroundColor: "#fff",
            })}
          >
            <Text style={{ color: COLORS.ink, fontSize: 15, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              Sign in
            </Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 17 }}>
          Created by Katie Clark, IBCLC · thebreastfeedingmama.com{"\n"}
          Evidence-informed · Not a substitute for clinical care
        </Text>
      </Animated.View>

    </SafeAreaView>
  );
}
