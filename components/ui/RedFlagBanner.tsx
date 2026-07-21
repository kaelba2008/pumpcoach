import React from "react";
import { View, Text } from "react-native";

interface RedFlagBannerProps {
  message: string;
}

export function RedFlagBanner({ message }: RedFlagBannerProps) {
  return (
    <View className="bg-amber/20 border border-amber rounded-2xl p-4 mb-3 flex-row gap-3">
      <Text className="text-lg">⚠️</Text>
      <View className="flex-1">
        <Text className="text-sm font-sans-semi text-ink mb-1">Heads up</Text>
        <Text className="text-sm text-ink-2 leading-5">{message}</Text>
      </View>
    </View>
  );
}
