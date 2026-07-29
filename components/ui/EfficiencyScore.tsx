import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { COLORS } from "../../lib/constants";

interface Props {
  score: number;   // 0–100
  size?: number;
}

function scoreLabel(s: number): { label: string; color: string } {
  if (s >= 90) return { label: "Excellent",  color: COLORS.sage   };
  if (s >= 75) return { label: "Good",       color: COLORS.primary };
  if (s >= 60) return { label: "Fair",       color: COLORS.amber  };
  return              { label: "Keep going", color: COLORS.amber  };
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
  /** ISO timestamp when this session started — used to compute gap from previous session */
  sessionStartedAt?: string;
  /** ISO timestamp when the previous session ended — used to normalize for pumping frequency */
  prevSessionEndedAt?: string;
  /** Mean inter-session gap (hours) from recent history — used to cap the gap so erratic
   *  tracking (one logged session after a long untracked stretch) doesn't inflate the score */
  typicalGapHours?: number;
}): number {
  const { durationSec, totalOz, avgOz, sessionStartedAt, prevSessionEndedAt, typicalGapHours } = params;
  const min = durationSec / 60;
  const ozPerMin = min > 0 ? totalOz / min : 0;

  // Gap since previous session — default to 3h (a "normal" gap) when unknown
  let gapHours = 3;
  if (sessionStartedAt && prevSessionEndedAt) {
    const gapMs = new Date(sessionStartedAt).getTime() - new Date(prevSessionEndedAt).getTime();
    if (gapMs > 0) gapHours = Math.min(gapMs / 3_600_000, 24); // cap at 24h
  }

  // Guard against erratic tracking: if this gap is more than 2.5× their typical,
  // it's likely they pumped in between and just didn't log it. Fall back to typical.
  const effectiveGapHours = typicalGapHours && typicalGapHours > 0
    ? Math.min(gapHours, typicalGapHours * 2.5)
    : gapHours;

  // Gap factor normalises oz/min expectations relative to breast fullness.
  // Shorter gap → breast less full → lower oz/min is expected.
  // Longer gap  → breast fuller   → higher oz/min is expected.
  const gapFactor = effectiveGapHours < 2 ? 0.65
                  : effectiveGapHours < 5 ? 1.0
                  : effectiveGapHours < 8 ? 1.2
                  : 1.35;

  // Effective oz/min scaled to a "standard 3-hour gap" baseline
  const normalizedOzPerMin = ozPerMin / gapFactor;

  let score = 70; // base

  // Duration scoring — 15–20 min is optimal per evidence-based guidance
  if (min >= 15 && min <= 20)     score += 15;
  else if (min >= 12 && min < 15) score += 8;
  else if (min > 20 && min <= 25) score += 5;
  else if (min < 10)              score -= 15;
  else if (min > 30)              score -= 10;

  // oz/min efficiency — scored against gap-normalised rate
  if (normalizedOzPerMin >= 0.25)      score += 15;
  else if (normalizedOzPerMin >= 0.18) score += 8;
  else if (normalizedOzPerMin >= 0.12) score += 3;
  else if (normalizedOzPerMin < 0.08 && totalOz > 0) score -= 10;

  // vs average — soften penalty for short gaps (less milk available by design)
  if (avgOz > 0) {
    const ratio = totalOz / avgOz;
    const highThreshold = 0.9;
    const lowThreshold  = effectiveGapHours < 2 ? 0.35 : 0.6; // short gap → expect less vs avg
    if (ratio >= highThreshold)   score += 5;
    else if (ratio < lowThreshold) score -= 8;
  }

  return Math.max(10, Math.min(100, Math.round(score)));
}
