/**
 * GoogleSignInButton
 *
 * A reusable button that follows Google's branding guidelines:
 *   - White background, subtle border
 *   - Official four-color "G" logo (rendered via react-native-svg)
 *   - "Continue with Google" / "Sign in with Google" label in dark text
 *
 * Google brand guidelines: https://developers.google.com/identity/branding-guidelines
 */

import React from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, ClipPath, Defs, Rect, G } from "react-native-svg";
import { COLORS } from "../lib/constants";

// ── Official Google "G" logo in SVG ──────────────────────────────────────────
// Paths derived from Google's published SVG asset (18×18 viewBox)

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Defs>
        <ClipPath id="g-clip">
          <Rect width="18" height="18" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#g-clip)">
        {/* Blue — right arm of G */}
        <Path
          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          fill="#4285F4"
        />
        {/* Green — bottom of G */}
        <Path
          d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
          fill="#34A853"
        />
        {/* Yellow — left side of G */}
        <Path
          d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
          fill="#FBBC05"
        />
        {/* Red — top-left of G */}
        <Path
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          fill="#EA4335"
        />
      </G>
    </Svg>
  );
}

// ── Button component ──────────────────────────────────────────────────────────

interface GoogleSignInButtonProps {
  label?:    string;
  onPress:   () => void;
  disabled?: boolean;
}

export function GoogleSignInButton({
  label    = "Continue with Google",
  onPress,
  disabled = false,
}: GoogleSignInButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection:   "row",
        alignItems:      "center",
        justifyContent:  "center",
        gap:             10,
        height:          50,
        borderRadius:    14,
        borderWidth:     1.5,
        borderColor:     COLORS.border,
        backgroundColor: pressed ? "#F2F2F2" : "#FFFFFF",
        opacity:         disabled ? 0.55 : 1,
      })}
    >
      <GoogleLogo size={20} />
      <Text
        style={{
          fontSize:    15,
          fontFamily:  "Nunito_600SemiBold",
          fontWeight:  "600",
          color:       "#3C4043",
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
