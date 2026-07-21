import React from "react";
import { Pressable, Text, ActivityIndicator, PressableProps } from "react-native";
import * as Haptics from "expo-haptics";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const containerClass: Record<Variant, string> = {
  primary:   "bg-primary active:bg-primary-600",
  secondary: "bg-muted border border-border active:bg-border",
  ghost:     "active:bg-muted",
  danger:    "bg-red-500 active:bg-red-600",
};

const textClass: Record<Variant, string> = {
  primary:   "text-white font-sans-semi",
  secondary: "text-ink font-sans-semi",
  ghost:     "text-primary font-sans-semi",
  danger:    "text-white font-sans-semi",
};

const sizeClass: Record<Size, string>  = { sm: "px-4 py-2", md: "px-6 py-4", lg: "px-8 py-5" };
const textSize:  Record<Size, string>  = { sm: "text-sm",   md: "text-base",  lg: "text-lg"   };

export function Button({
  label, variant = "primary", size = "md",
  loading = false, fullWidth = false, onPress, disabled, ...rest
}: ButtonProps) {
  const handlePress = (e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <Pressable
      className={`items-center justify-center rounded-2xl ${containerClass[variant]} ${sizeClass[size]} ${fullWidth ? "w-full" : ""} ${disabled || loading ? "opacity-50" : ""}`}
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: loading }}
      {...rest}
    >
      {loading
        ? <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#fff" : "#4A5E60"} />
        : <Text className={`${textClass[variant]} ${textSize[size]}`}>{label}</Text>}
    </Pressable>
  );
}
