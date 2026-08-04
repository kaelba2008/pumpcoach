import React, { useState } from "react";
import { TextInput, Text, View, Pressable, TextInputProps } from "react-native";
import { COLORS } from "../../lib/constants";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, secureTextEntry, ...rest }: InputProps) {
  // secureTextEntry marks this as a password field — show a toggle so
  // typos are actually catchable instead of just trusting dots.
  const [visible, setVisible] = useState(false);

  return (
    <View className="gap-1">
      {label && <Text className="text-sm font-sans text-ink-2 mb-1">{label}</Text>}
      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          className={`bg-muted border rounded-xl px-4 py-3 text-ink text-base ${error ? "border-red-400" : "border-border"} ${secureTextEntry ? "pr-16" : ""}`}
          placeholderTextColor={COLORS.ink3}
          accessibilityLabel={label}
          style={style}
          secureTextEntry={secureTextEntry && !visible}
          autoCapitalize={secureTextEntry ? "none" : rest.autoCapitalize}
          {...rest}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setVisible(v => !v)}
            hitSlop={8}
            style={{ position: "absolute", right: 14, paddingVertical: 6 }}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
          >
            <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
              {visible ? "Hide" : "Show"}
            </Text>
          </Pressable>
        )}
      </View>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
