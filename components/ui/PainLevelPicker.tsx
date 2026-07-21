import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { COLORS } from "../../lib/constants";

interface Props {
  value: number | null;
  onChange: (level: number | null) => void;
}

// Color scale: green → amber → red
function colorForLevel(level: number): string {
  if (level === 0)           return "#4CAF82";
  if (level <= 2)            return "#7DC97F";
  if (level <= 4)            return COLORS.amber;
  if (level <= 6)            return "#E08A2A";
  if (level <= 8)            return "#D45C2A";
  return "#C0544A";
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function PainLevelPicker({ value, onChange }: Props) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
          Discomfort level
        </Text>
        {value != null && (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            accessibilityLabel="Clear discomfort level"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 12, color: COLORS.ink3, textDecorationLine: "underline" }}>Clear</Text>
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 6, paddingVertical: 2 }}>
          {LEVELS.map((level) => {
            const selected = value === level;
            const color    = colorForLevel(level);
            return (
              <Pressable
                key={level}
                onPress={() => onChange(selected ? null : level)}
                accessibilityLabel={`Discomfort level ${level}${level === 0 ? ", no pain" : level === 10 ? ", worst pain" : ""}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1.5,
                  backgroundColor: selected ? color : COLORS.muted,
                  borderColor:     selected ? color : COLORS.border,
                }}
              >
                <Text style={{
                  fontSize: 13,
                  fontFamily: "Nunito_700Bold",
                  fontWeight: "700",
                  color: selected ? "#fff" : COLORS.ink2,
                }}>
                  {level}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 11, color: COLORS.ink3 }}>No pain</Text>
        <Text style={{ fontSize: 11, color: COLORS.ink3 }}>Worst pain</Text>
      </View>

      {value != null && value > 0 && (
        <View style={{
          backgroundColor: value >= 7 ? "#FFF5F0" : value >= 4 ? "#FDF5EE" : "#F5FBF7",
          borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: value >= 7 ? "#F2D5CC" : value >= 4 ? "#F0DECA" : "#C8E6CB",
        }}>
          <Text style={{
            fontSize: 12, color: colorForLevel(value),
            fontFamily: "Nunito_600SemiBold", fontWeight: "600",
          }}>
            {value <= 2 ? "Mild: worth noting for your records"
            : value <= 4 ? "Moderate: check your flange fit and suction settings"
            : value <= 6 ? "Significant: consider stopping and reassessing your fit"
            : "Severe: stop pumping and consult an IBCLC or your provider"}
          </Text>
        </View>
      )}
    </View>
  );
}
