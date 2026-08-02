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
  sizeMm: number | null;
  shape: FlangeShape | null;
  material: FlangeMaterial | null;
  onSizeChange: (value: number | null) => void;
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
  sizeMm, shape, material, onSizeChange, onShapeChange, onMaterialChange,
}: FlangePickerProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = [
    sizeMm ? `${sizeMm}mm` : null,
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

          {/* Size */}
          <Text className="text-xs text-ink-2 font-sans-semi mb-1.5">Size (mm)</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Pressable
              onPress={() => onSizeChange(Math.max(9, (sizeMm ?? 9) - 1))}
              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>−</Text>
            </Pressable>
            <View style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>{sizeMm ?? "—"}</Text>
            </View>
            <Pressable
              onPress={() => onSizeChange(Math.min(35, (sizeMm ?? 20) + 1))}
              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 18, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>+</Text>
            </Pressable>
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
