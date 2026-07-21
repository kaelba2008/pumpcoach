import React from "react";
import { View, ViewProps } from "react-native";

interface CardProps extends ViewProps {
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClass = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

export function Card({ children, padding = "md", className = "", style, ...rest }: CardProps) {
  return (
    <View
      className={`bg-surface rounded-2xl shadow-sm ${paddingClass[padding]} ${className}`}
      style={[{ shadowColor: "#1A1A2E", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }, style as object]}
      {...rest}
    >
      {children}
    </View>
  );
}
