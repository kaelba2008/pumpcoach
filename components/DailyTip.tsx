import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { getDailyTip } from "../lib/playbook";
import { COLORS, SERIF } from "../lib/constants";

const CATEGORY_EMOJI: Record<string, string> = {
  flange:    "🔬",
  output:    "📊",
  schedule:  "⏰",
  mindset:   "💛",
  technique: "💡",
  stash:     "🧊",
  work:      "💼",
  supply:    "📈",
};

export function DailyTip() {
  const tip   = getDailyTip();
  const emoji = CATEGORY_EMOJI[tip.category] ?? "💡";

  return (
    <View style={{
      backgroundColor: "#fff",
      borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: COLORS.border,
      shadowColor: COLORS.ink, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: COLORS.muted,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.mauve, textTransform: "uppercase", letterSpacing: 1.2 }}>
            Daily tip
          </Text>
          <Text style={{ fontFamily: SERIF, fontSize: 15, color: COLORS.ink, marginTop: 2, lineHeight: 21 }}>
            {tip.headline}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>{tip.body}</Text>

      <View style={{ marginTop: 12, gap: 8 }}>
        <Pressable onPress={() => Linking.openURL(tip.learn_more_url ?? "https://www.thebreastfeedingmama.com/the-pumping-playbook")}>
          <Text style={{ fontSize: 12, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            Read more in The Pumping Playbook →
          </Text>
        </Pressable>
        {tip.course_promo && (
          <Text style={{ fontSize: 12, color: COLORS.ink3, fontStyle: "italic" }}>
            This is covered in depth in The Pump Fix course.
          </Text>
        )}
        <Text style={{ fontSize: 11, color: COLORS.ink3, fontStyle: "italic" }}>
          From The Pumping Playbook · Katie Clark, IBCLC
        </Text>
      </View>
    </View>
  );
}
