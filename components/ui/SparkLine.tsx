import React from "react";
import { View, Pressable } from "react-native";
import Svg, { Path, Circle, Line, Text as SvgText } from "react-native-svg";

interface SparkLineProps {
  data: number[];       // one value per day, oldest first
  labels?: string[];    // optional day labels
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  // Optional secondary series (e.g. hydration glasses) — normalized independently
  secondaryData?: number[];
  secondaryColor?: string;
  onPointPress?: (index: number) => void;
}

export function SparkLine({
  data,
  labels,
  width = 300,
  height = 80,
  color = "#4A5E60",
  fillColor = "rgba(74,94,96,0.08)",
  secondaryData,
  secondaryColor = "#E8854A",
  onPointPress,
}: SparkLineProps) {
  if (!data || data.length < 2) return <View style={{ width, height }} />;

  const padX = 12;
  const padY = 12;
  const w = width  - padX * 2;
  const h = height - padY * 2;

  const max = Math.max(...data, 0.1);

  const pts = data.map((v, i) => ({
    x: padX + (i / (data.length - 1)) * w,
    y: padY + (1 - v / max) * h,
  }));

  // Smooth primary line via cubic bezier
  const pathD = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = pts[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y} ${cpX} ${pt.y} ${pt.x} ${pt.y}`;
  }, "");

  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${padY + h} L ${pts[0].x} ${padY + h} Z`;
  const lastPt = pts[pts.length - 1];

  // Secondary line — own scale, dashed
  let secPathD: string | null = null;
  let secEnd: { x: number; y: number } | null = null;
  if (secondaryData && secondaryData.length >= 2) {
    const secMax = Math.max(...secondaryData, 1);
    const secPts = secondaryData.map((v, i) => ({
      x: padX + (i / (secondaryData.length - 1)) * w,
      y: padY + (1 - v / secMax) * h,
    }));
    secPathD = secPts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = secPts[i - 1];
      const cpX  = (prev.x + pt.x) / 2;
      return `${acc} C ${cpX} ${prev.y} ${cpX} ${pt.y} ${pt.x} ${pt.y}`;
    }, "");
    secEnd = secPts[secPts.length - 1];
  }

  return (
    <View style={{ position: "relative", width, height }}>
      <Svg width={width} height={height}>
        {/* Fill under primary */}
        <Path d={fillD} fill={fillColor} />
        {/* Primary line */}
        <Path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        {/* Primary end dot */}
        <Circle cx={lastPt.x} cy={lastPt.y} r={4} fill={color} />

        {/* Secondary (hydration) dashed line */}
        {secPathD && (
          <Path
            d={secPathD}
            stroke={secondaryColor}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="4,3"
            opacity={0.8}
          />
        )}
        {secEnd && (
          <Circle cx={secEnd.x} cy={secEnd.y} r={3} fill={secondaryColor} opacity={0.8} />
        )}

        {/* Day labels */}
        {labels?.map((label, i) => (
          <SvgText
            key={i}
            x={padX + (i / (data.length - 1)) * w}
            y={height - 2}
            fontSize={9}
            fill="#B09880"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </Svg>

      {/* Invisible touchable areas for each point */}
      {onPointPress && (
        <View style={{ position: "absolute", width, height, flexDirection: "row" }}>
          {pts.map((pt, i) => (
            <Pressable
              key={i}
              onPress={() => onPointPress(i)}
              style={{
                position: "absolute",
                left: pt.x - 20,
                top: pt.y - 20,
                width: 40,
                height: 40,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
