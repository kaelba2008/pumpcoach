import React from "react";
import { TextInput, Text, View, TextInputProps } from "react-native";
import { COLORS } from "../../lib/constants";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  return (
    <View className="gap-1">
      {label && <Text className="text-sm font-sans text-ink-2 mb-1">{label}</Text>}
      <TextInput
        className={`bg-muted border rounded-xl px-4 py-3 text-ink text-base ${error ? "border-red-400" : "border-border"}`}
        placeholderTextColor={COLORS.ink3}
        accessibilityLabel={label}
        style={style}
        {...rest}
      />
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
