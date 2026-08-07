import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { COLORS } from "../lib/constants";
import { FlangeShape, FlangeMaterial } from "../types";

const SHAPE_OPTIONS: { value: FlangeShape; label: string }[] = [
  { value: "traditional", label: "Traditional" },
  { value: "crater",      label: "Crater" },
  { value: "pano",        label: "Pano" },
  { value: "tapered",     label: "Tapered" },
  { value: "saucer",      label: "Saucer" },
];

const MATERIAL_OPTIONS: { value: FlangeMaterial; label: string }[] = [
  { value: "plastic",  label: "Plastic" },
  { value: "silicone", label: "Silicone" },
];

interface FlangePickerProps {
  sizeMmRight: number | null;
  sizeMmLeft: number | null;
  shape: FlangeShape | null;
  material: FlangeMaterial | null;
  onSizeRightChange: (value: number | null) => void;
  onSizeLeftChange: (value: number | null) => void;
  onShapeChange: (value: FlangeShape | null) => void;
  onMaterialChange: (value: FlangeMaterial | null) => void;
}

function Chip<T extends string>({
  label, selected, onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
        borderWidth: 1.5,
        backgroundColor: selected ? COLORS.primary : COLORS.muted,
        borderColor: selected ? COLORS.primary : COLORS.border,
      }}
    >
      <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: selected ? "#fff" : COLORS.ink2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Collapsed by default — most sessions use the same flange as always, so
// this stays out of the way unless a mom is deliberately trying something
// different. Editing here only affects THIS session, not the profile default.
export function FlangePicker({
  sizeMmRight, sizeMmLeft, shape, material,
  onSizeRightChange, onSizeLeftChange, onShapeChange, onMaterialChange,
}: FlangePickerProps) {
  const [expanded, setExpanded] = useState(false);

  const sizeSummary = sizeMmRight != null && sizeMmLeft != null && sizeMmRight === sizeMmLeft
    ? `${sizeMmRight}mm`
    : [
        sizeMmRight != null ? `R ${sizeMmRight}mm` : null,
        sizeMmLeft  != null ? `L ${sizeMmLeft}mm`  : null,
      ].filter(Boolean).join(" · ") || null;

  const summary = [
    sizeSummary,
    shape ? SHAPE_OPTIONS.find(o => o.value === shape)?.label : null,
    material ? MATERIAL_OPTIONS.find(o => o.value === material)?.label : null,
  ].filter(Boolean).join(" · ") || "Same as usual";

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setExpanded(v => !v)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View>
          <Text className="text-sm font-sans-semi text-ink-2">Flange (optional)</Text>
          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>{summary}</Text>
        </View>
        <Text style={{ fontSize: 14, color: COLORS.ink3 }}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded && (
        <View className="bg-surface rounded-2xl p-4 mt-3" style={{ borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 10 }}>
            Trying something different this session? Change it here without updating your profile default.
          </Text>

          {/* Size — right and left, since many people size differently per side */}
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Size (mm)</Text>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            {([
              { label: "Right", value: sizeMmRight, onChange: onSizeRightChange },
              { label: "Left",  value: sizeMmLeft,  onChange: onSizeLeftChange },
            ]).map(({ label, value, onChange }) => (
              <View key={label} style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4 }}>{label}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    onPress={() => onChange(Math.max(9, (value ?? 9) - 1))}
                    style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.muted, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>−</Text>
                  </Pressable>
                  <View style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, alignItems: "center", paddingVertical: 7 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>{value ?? "—"}</Text>
                  </View>
                  <Pressable
                    onPress={() => onChange(Math.min(35, (value ?? 20) + 1))}
                    style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.muted, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {/* Shape */}
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Shape</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
            {SHAPE_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={shape === opt.value}
                onPress={() => onShapeChange(shape === opt.value ? null : opt.value)}
              />
            ))}
          </ScrollView>

          {/* Material */}
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Material</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {MATERIAL_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={material === opt.value}
                onPress={() => onMaterialChange(material === opt.value ? null : opt.value)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
