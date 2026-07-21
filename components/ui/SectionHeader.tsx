import React from "react";
import { View, Text, Pressable } from "react-native";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-base font-sans-bold text-ink">{title}</Text>
      {action && (
        <Pressable onPress={action.onPress}>
          <Text className="text-sm font-sans-semi text-primary">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
