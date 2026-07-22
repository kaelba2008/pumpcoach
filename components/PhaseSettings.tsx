import React from "react";
import { View, Text, Pressable } from "react-native";
import { COLORS } from "../lib/constants";
import { Input } from "./ui/Input";

interface PhaseSettingsProps {
  phase: "massage" | "expression";
  duration: string;
  suctionLevel: number | null;
  cycleSpeed: number | null;
  onDurationChange: (value: string) => void;
  onSuctionChange: (value: number) => void;
  onCycleSpeedChange: (value: number) => void;
}

export function PhaseSettings({
  phase,
  duration,
  suctionLevel,
  cycleSpeed,
  onDurationChange,
  onSuctionChange,
  onCycleSpeedChange,
}: PhaseSettingsProps) {
  const phaseName = phase === "massage" ? "Massage" : "Expression";

  return (
    <View className="bg-surface rounded-3xl p-6" style={{ shadowColor: "#1A1A2E", shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>
      <Text className="text-base font-sans-semi text-ink mb-4">{phaseName} Phase</Text>

      {/* Duration */}
      <View className="mb-4">
        <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Duration (minutes)</Text>
        <View className="border border-border rounded-xl px-3 py-2">
          <Input
            value={duration}
            onChangeText={onDurationChange}
            placeholder="0"
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      </View>

      {/* Suction & Speed */}
      <View className="flex-row gap-3 mb-4">
        <View className="flex-1">
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Suction (1–12)</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => onSuctionChange(Math.max(1, (suctionLevel ?? 1) - 1))}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <Text className="text-lg font-sans-bold text-ink">−</Text>
            </Pressable>
            <View className="flex-1 border border-border rounded-lg items-center py-2">
              <Text className="text-base font-sans-bold text-ink">{suctionLevel ?? "–"}</Text>
            </View>
            <Pressable
              onPress={() => onSuctionChange(Math.min(12, (suctionLevel ?? 0) + 1))}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <Text className="text-lg font-sans-bold text-ink">+</Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-1">
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Cycle (1–12)</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => onCycleSpeedChange(Math.max(1, (cycleSpeed ?? 1) - 1))}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <Text className="text-lg font-sans-bold text-ink">−</Text>
            </Pressable>
            <View className="flex-1 border border-border rounded-lg items-center py-2">
              <Text className="text-base font-sans-bold text-ink">{cycleSpeed ?? "–"}</Text>
            </View>
            <Pressable
              onPress={() => onCycleSpeedChange(Math.min(12, (cycleSpeed ?? 0) + 1))}
              className="w-8 h-8 rounded-lg bg-muted items-center justify-center"
            >
              <Text className="text-lg font-sans-bold text-ink">+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
