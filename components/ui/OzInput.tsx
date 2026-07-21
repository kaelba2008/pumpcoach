import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Keyboard } from "react-native";
import { COLORS } from "../../lib/constants";

interface OzInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: "oz" | "ml";
}

export function OzInput({ label, value, onChange, unit = "oz" }: OzInputProps) {
  const step = unit === "ml" ? 1 : 0.25;

  // Local state drives the TextInput directly — avoids the Android IME roundtrip
  // bug where converting ml→oz→ml on every keystroke causes double-digits.
  const [localValue, setLocalValue] = useState(value);
  const lastEmitted = useRef(value);

  // Sync from parent only when the value changed externally (e.g. parent cleared
  // the field, or a different component set it). Skip updates that came from us.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setLocalValue(value);
      lastEmitted.current = value;
    }
  }, [value]);

  const emit = (raw: string) => {
    lastEmitted.current = raw;
    setLocalValue(raw);
    onChange(raw);
  };

  const adjust = (delta: number) => {
    const current = parseFloat(localValue) || 0;
    const next = Math.max(0, unit === "ml"
      ? Math.round(current + delta)
      : Math.round((current + delta) * 100) / 100);
    emit(next === 0 ? "" : String(next));
  };

  return (
    <View className="items-center gap-2">
      <Text className="text-xs font-sans-semi text-ink-2 uppercase tracking-wider">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => adjust(-step)}
          className="w-10 h-10 rounded-full bg-muted border border-border items-center justify-center active:bg-border"
          accessibilityLabel={`Decrease ${label} by ${step} ${unit}`}
          accessibilityRole="button"
        >
          <Text className="text-lg font-sans-semi text-ink-2">−</Text>
        </Pressable>

        <View className="items-center">
          <TextInput
            className="text-3xl font-sans-bold text-ink text-center w-20"
            accessibilityLabel={`${label} ${unit}`}
            value={localValue}
            onChangeText={(t) => {
              const cleaned = unit === "ml"
                ? t.replace(/[^0-9]/g, "")
                : t.replace(/[^0-9.]/g, "");
              emit(cleaned);
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            placeholder="0"
            placeholderTextColor={COLORS.ink3}
            selectTextOnFocus
          />
          <Text className="text-xs text-ink-2 -mt-1">{unit}</Text>
        </View>

        <Pressable
          onPress={() => adjust(step)}
          className="w-10 h-10 rounded-full bg-primary items-center justify-center active:bg-primary-600"
          accessibilityLabel={`Increase ${label} by ${step} ${unit}`}
          accessibilityRole="button"
        >
          <Text className="text-lg font-sans-semi text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
