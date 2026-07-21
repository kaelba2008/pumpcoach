import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { COLORS } from "../../lib/constants";

interface Props {
  score: number;   // 0–100
  size?: number;
}

function scoreLabel(s: number): { label: string; color: string } {
  if (s >= 90) return { label: "Excellent",       color: COLORS.sage   };
  if (s >= 75) return { label: "Good",            color: COLORS.primary };
  if (s >= 60) return { label: "Fair",            color: COLORS.amber  };
  return              { label: "Needs attention", color: COLORS.error  };
}

export function EfficiencyScore({ score, size = 72 }: Props) {
  const { label, color } = scoreLabel(score);
  const r        = (size - 8) / 2;
  const circum   = 2 * Math.PI * r;
  const dashOffset = circum * (1 - score / 100);
  const center   = size / 2;

  return (
    <View className="items-center gap-1">
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke="#E8E5F0" strokeWidth={6} fill="none" />
        <Circle
          cx={center} cy={center} r={r}
          stroke={color} strokeWidth={6} fill="none"
          strokeDasharray={`${circum}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View className="items-center" style={{ marginTop: -size * 0.72 }}>
        <Text style={{ fontSize: size * 0.28, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>{score}</Text>
      </View>
      <View style={{ marginTop: size * 0.28 }}>
        <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color }}>{label}</Text>
      </View>
    </View>
  );
}

// Calculate efficiency score from session data
export function calcEfficiencyScore(params: {
  durationSec: number;
  totalOz: number;
  avgOz: number;
}): number {
  const { durationSec, totalOz, avgOz } = params;
  const min = durationSec / 60;
  const ozPerMin = min > 0 ? totalOz / min : 0;

  let score = 70; // base

  // Duration scoring — 15–20 min is optimal per evidence-based guidance
  if (min >= 15 && min <= 20)     score += 15;
  else if (min >= 12 && min < 15) score += 8;
  else if (min > 20 && min <= 25) score += 5;
  else if (min < 10)              score -= 15;
  else if (min > 30)              score -= 10;

  // oz/min efficiency
  if (ozPerMin >= 0.25)      score += 15;
  else if (ozPerMin >= 0.18) score += 8;
  else if (ozPerMin >= 0.12) score += 3;
  else if (ozPerMin < 0.08 && totalOz > 0) score -= 10;

  // vs average
  if (avgOz > 0) {
    const ratio = totalOz / avgOz;
    if (ratio >= 0.9)  score += 5;
    else if (ratio < 0.6) score -= 8;
  }

  return Math.max(10, Math.min(100, Math.round(score)));
}
