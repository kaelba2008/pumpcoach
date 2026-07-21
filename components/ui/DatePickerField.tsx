import React, { useState } from "react";
import { View, Text, Pressable, Platform, Modal } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format, isToday, isYesterday } from "date-fns";
import { COLORS } from "../../lib/constants";

interface DatePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  mode?: "date" | "datetime" | "time";
  optional?: boolean;           // shows "Not set" state + clear option
  maximumDate?: Date;
  minimumDate?: Date;
}

function friendlyDate(date: Date, mode: "date" | "datetime" | "time"): string {
  if (mode === "time")     return format(date, "h:mm a");
  if (mode === "datetime") {
    if (isToday(date))     return `Today at ${format(date, "h:mm a")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
    return format(date, "MMM d, yyyy 'at' h:mm a");
  }
  if (isToday(date))     return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

export function DatePickerField({
  label,
  value,
  onChange,
  mode = "date",
  optional = false,
  maximumDate,
  minimumDate,
}: DatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  // On Android datetime mode, we need two steps: pick date then time
  const [androidStep, setAndroidStep] = useState<"date" | "time">("date");
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());

  const displayDate = value ?? new Date();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
      if (event.type === "dismissed") return;
      if (!selected) return;

      if (mode === "datetime" && androidStep === "date") {
        // First step done — now pick time
        setTempDate(selected);
        setAndroidStep("time");
        setShowPicker(true);
      } else if (mode === "datetime" && androidStep === "time") {
        // Merge date from tempDate with time from selected
        const merged = new Date(tempDate);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        setAndroidStep("date");
        onChange(merged);
      } else {
        onChange(selected);
      }
    } else {
      // iOS — picker stays visible inline; update live
      if (selected) onChange(selected);
    }
  };

  const openPicker = () => {
    setTempDate(value ?? new Date());
    setAndroidStep(mode === "time" ? "time" : "date");
    setShowPicker(true);
  };

  return (
    <View>
      <Text style={{
        fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600",
        color: COLORS.ink2, marginBottom: 8,
      }}>
        {label}
      </Text>

      {/* Pressable display row */}
      <Pressable
        onPress={openPicker}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 14, paddingVertical: 13,
          borderRadius: 14, borderWidth: 1.5,
          borderColor: COLORS.border, backgroundColor: "#fff",
        }}
      >
        <Text style={{
          fontSize: 15,
          color: value ? COLORS.ink : COLORS.ink3,
          fontFamily: value ? "Nunito_600SemiBold" : "Nunito_400Regular",
          fontWeight: value ? "600" : "400",
        }}>
          {value ? friendlyDate(displayDate, mode) : "Tap to select"}
        </Text>
        <Text style={{ fontSize: 16 }}>{mode === "time" ? "🕐" : "📅"}</Text>
      </Pressable>

      {/* Clear button for optional fields */}
      {optional && value && (
        <Pressable onPress={() => onChange(null)} style={{ marginTop: 6, alignSelf: "flex-end" }}>
          <Text style={{ fontSize: 12, color: COLORS.ink3, textDecorationLine: "underline" }}>
            Clear
          </Text>
        </Pressable>
      )}

      {/* iOS: inline picker shown below the row */}
      {Platform.OS === "ios" && showPicker && (
        <View style={{ marginTop: 8 }}>
          <DateTimePicker
            value={displayDate}
            mode={mode === "time" ? "time" : mode}
            display={mode === "date" ? "inline" : "spinner"}
            onChange={handleChange}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            accentColor={COLORS.primary}
            themeVariant="light"
          />
          <Pressable
            onPress={() => setShowPicker(false)}
            style={{
              alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8,
              backgroundColor: COLORS.primary, borderRadius: 10, marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>
              Done
            </Text>
          </Pressable>
        </View>
      )}

      {/* Android: native dialog */}
      {Platform.OS === "android" && showPicker && (
        <DateTimePicker
          value={tempDate}
          mode={mode === "datetime" ? androidStep : mode === "time" ? "time" : mode}
          display="default"
          onChange={handleChange}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
        />
      )}
    </View>
  );
}
