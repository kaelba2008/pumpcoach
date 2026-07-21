import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Switch, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { format, parse } from "date-fns";
import { supabase } from "../lib/supabase";
import { DatePickerField } from "../components/ui/DatePickerField";
import { Button } from "../components/ui/Button";
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  scheduleReminder,
  cancelReminder,
  syncAllReminders,
} from "../lib/notifications";
import { COLORS, SERIF } from "../lib/constants";
import { Reminder, ReminderMode } from "../types";

// ── Constants ──────────────────────────────────────────────────────────────
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const ALL_DAYS   = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS   = [1, 2, 3, 4, 5];
const WEEKENDS   = [0, 6];

const SNOOZE_OPTIONS = [5, 10, 15, 20, 30];

const PRESET_DAY_GROUPS: { label: string; days: number[] }[] = [
  { label: "Every day", days: ALL_DAYS  },
  { label: "Weekdays",  days: WEEKDAYS  },
  { label: "Weekends",  days: WEEKENDS  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function timeToDate(timeStr: string): Date {
  // timeStr = "HH:mm"
  return parse(timeStr, "HH:mm", new Date());
}

function dateToTime(d: Date): string {
  return format(d, "HH:mm");
}

function formatTime12(timeStr: string): string {
  return format(parse(timeStr, "HH:mm", new Date()), "h:mm a");
}

function daysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  if (sorted.join(",") === "0,6") return "Weekends";
  if (sorted.length === 1) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][sorted[0]];
  return sorted.map((d) => DAY_LABELS[d]).join(" · ");
}

// ── Add / Edit modal ───────────────────────────────────────────────────────
interface EditModalProps {
  visible:  boolean;
  reminder: Reminder | null; // null = add new
  onClose:  () => void;
  onSaved:  () => void;
}

function EditReminderModal({ visible, reminder, onClose, onSaved }: EditModalProps) {
  const isEdit = !!reminder;

  const [timeDate,     setTimeDate]     = useState<Date>(new Date());
  const [selectedDays, setSelectedDays] = useState<number[]>(WEEKDAYS);
  const [label,        setLabel]        = useState("");
  const [snoozeMin,    setSnoozeMin]    = useState(10);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (reminder) {
      setTimeDate(timeToDate(reminder.time_of_day));
      setSelectedDays(reminder.days_of_week);
      setLabel(reminder.label ?? "");
      setSnoozeMin(reminder.snooze_minutes);
    } else {
      setTimeDate(new Date());
      setSelectedDays(WEEKDAYS);
      setLabel("");
      setSnoozeMin(10);
    }
  }, [reminder, visible]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const applyPreset = (days: number[]) => setSelectedDays(days);

  const handleSave = async () => {
    if (selectedDays.length === 0) {
      Alert.alert("Select at least one day", "Choose which days you'd like to be reminded.");
      return;
    }

    setSaving(true);
    const payload = {
      time_of_day:    dateToTime(timeDate),
      days_of_week:   [...selectedDays].sort((a, b) => a - b),
      label:          label.trim() || null,
      snooze_minutes: snoozeMin,
    };

    let error, data;
    if (isEdit && reminder) {
      ({ error, data } = await supabase
        .from("reminders")
        .update(payload)
        .eq("id", reminder.id)
        .select()
        .single());
    } else {
      ({ error, data } = await supabase
        .from("reminders")
        .insert({ ...payload, enabled: true, mode: "standard" as ReminderMode })
        .select()
        .single());
    }
    setSaving(false);

    if (error) { Alert.alert("Error saving reminder", error.message); return; }

    // Sync with notification scheduler
    if (data) {
      if (isEdit) {
        await cancelReminder(data.id);
        if (data.enabled) await scheduleReminder(data as Reminder);
      } else {
        await scheduleReminder(data as Reminder);
      }
    }

    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>
              {isEdit ? "Edit reminder" : "New reminder"}
            </Text>
            <View style={{ width: 52 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

            {/* Time */}
            <DatePickerField
              label="Time"
              value={timeDate}
              onChange={(d) => d && setTimeDate(d)}
              mode="time"
            />

            {/* Day presets */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                Repeat
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                {PRESET_DAY_GROUPS.map(({ label: pl, days }) => {
                  const sorted = [...days].sort((a, b) => a - b);
                  const active = JSON.stringify(sorted) === JSON.stringify([...selectedDays].sort((a, b) => a - b));
                  return (
                    <Pressable
                      key={pl}
                      onPress={() => applyPreset(days)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: active ? COLORS.primary : COLORS.border,
                        backgroundColor: active ? "rgba(124,92,252,0.08)" : "#fff",
                      }}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontFamily: active ? "Nunito_700Bold" : "Nunito_400Regular",
                        fontWeight: active ? "700" : "400",
                        color: active ? COLORS.primary : COLORS.ink2,
                      }}>
                        {pl}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* Individual day pills */}
              <View style={{ flexDirection: "row", gap: 6 }}>
                {ALL_DAYS.map((day) => {
                  const sel = selectedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => toggleDay(day)}
                      style={{
                        flex: 1, aspectRatio: 1, borderRadius: 10,
                        alignItems: "center", justifyContent: "center",
                        borderWidth: 1.5,
                        borderColor: sel ? COLORS.primary : COLORS.border,
                        backgroundColor: sel ? COLORS.primary : "#fff",
                      }}
                    >
                      <Text style={{
                        fontSize: 11,
                        fontFamily: "Nunito_700Bold",
                        fontWeight: "700",
                        color: sel ? "#fff" : COLORS.ink3,
                      }}>
                        {DAY_LABELS[day]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Label */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                Label (optional)
              </Text>
              <View style={{
                backgroundColor: "#fff", borderRadius: 12,
                borderWidth: 1, borderColor: COLORS.border,
                paddingHorizontal: 14, height: 46, justifyContent: "center",
              }}>
                <TextInput
                  value={label}
                  onChangeText={(t) => setLabel(t.slice(0, 40))}
                  placeholder="e.g. Morning pump, Work pump..."
                  placeholderTextColor={COLORS.ink3}
                  style={{ fontSize: 15, color: COLORS.ink, fontFamily: "Nunito_400Regular" }}
                />
              </View>
            </View>

            {/* Snooze */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                Snooze duration
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SNOOZE_OPTIONS.map((min) => {
                  const sel = snoozeMin === min;
                  return (
                    <Pressable
                      key={min}
                      onPress={() => setSnoozeMin(min)}
                      style={{
                        flex: 1, paddingVertical: 9, borderRadius: 10,
                        alignItems: "center", borderWidth: 1.5,
                        borderColor: sel ? COLORS.primary : COLORS.border,
                        backgroundColor: sel ? "rgba(124,92,252,0.08)" : "#fff",
                      }}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontFamily: sel ? "Nunito_700Bold" : "Nunito_400Regular",
                        fontWeight: sel ? "700" : "400",
                        color: sel ? COLORS.primary : COLORS.ink2,
                      }}>
                        {min}m
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Button
              label={isEdit ? "Save changes" : "Add reminder"}
              onPress={handleSave}
              loading={saving}
              fullWidth
              size="lg"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function RemindersScreen() {
  const router = useRouter();

  const [reminders,    setReminders]    = useState<Reminder[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [permStatus,   setPermStatus]   = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [modalVisible, setModalVisible] = useState(false);
  const [editing,      setEditing]      = useState<Reminder | null>(null);

  const loadReminders = useCallback(async () => {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .order("time_of_day", { ascending: true });
    if (data) setReminders(data as Reminder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReminders();
    getNotificationPermissionStatus().then(setPermStatus);
  }, [loadReminders]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermStatus(granted ? "granted" : "denied");
    if (granted) {
      // Sync any already-enabled reminders now that we have permission
      await syncAllReminders(reminders);
    }
  };

  const handleToggle = async (reminder: Reminder, enabled: boolean) => {
    // Optimistic update
    setReminders((prev) => prev.map((r) => r.id === reminder.id ? { ...r, enabled } : r));

    const { error } = await supabase
      .from("reminders")
      .update({ enabled })
      .eq("id", reminder.id);

    if (error) {
      // Revert
      setReminders((prev) => prev.map((r) => r.id === reminder.id ? { ...r, enabled: !enabled } : r));
      Alert.alert("Error", "Could not update reminder.");
      return;
    }

    if (enabled) {
      await scheduleReminder({ ...reminder, enabled: true });
    } else {
      await cancelReminder(reminder.id);
    }
  };

  const handleDelete = (reminder: Reminder) => {
    Alert.alert("Delete reminder?", "This will remove the reminder and cancel future notifications.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await cancelReminder(reminder.id);
          await supabase.from("reminders").delete().eq("id", reminder.id);
          loadReminders();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      {/* Header */}
      <LinearGradient
        colors={["#2E3F40", "#4A5E60"]}
        style={{ paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Pressable onPress={() => router.back()} style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                ‹ Back
              </Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Reminders</Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
              Schedule your pump reminders
            </Text>
          </View>
          <Pressable
            onPress={() => { setEditing(null); setModalVisible(true); }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 22, lineHeight: 26 }}>+</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>

        {/* Permission banner */}
        {permStatus !== "granted" && (
          <Pressable
            onPress={handleRequestPermission}
            style={{
              backgroundColor: permStatus === "denied" ? "#FFF3E0" : COLORS.primaryMist,
              borderRadius: 16, padding: 16,
              borderWidth: 1,
              borderColor: permStatus === "denied" ? "#FFCC80" : "rgba(124,92,252,0.2)",
              flexDirection: "row", alignItems: "center", gap: 12,
            }}
          >
            <Text style={{ fontSize: 26 }}>{permStatus === "denied" ? "🔕" : "🔔"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700",
                color: permStatus === "denied" ? "#E65100" : COLORS.primary, marginBottom: 2,
              }}>
                {permStatus === "denied"
                  ? "Notifications blocked"
                  : "Enable notifications"}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.ink2, lineHeight: 17 }}>
                {permStatus === "denied"
                  ? "Go to Settings > Pump Coach to allow notifications."
                  : "Tap to allow Pump Coach to send you pump reminders."}
              </Text>
            </View>
            {permStatus !== "denied" && (
              <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>
                Allow
              </Text>
            )}
          </Pressable>
        )}

        {/* Empty state */}
        {!loading && reminders.length === 0 && (
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 32, alignItems: "center",
            shadowColor: "#1A1A2E", shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>⏰</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink, marginBottom: 6, textAlign: "center" }}>
              No reminders yet
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
              Add your first reminder to stay on your pumping schedule.
            </Text>
            <Button
              label="Add reminder"
              onPress={() => { setEditing(null); setModalVisible(true); }}
              size="md"
            />
          </View>
        )}

        {/* Reminder list */}
        {reminders.length > 0 && (
          <View style={{ backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            {reminders.map((r, idx) => (
              <React.Fragment key={r.id}>
                {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border }} />}
                <View style={{ padding: 18, opacity: r.enabled ? 1 : 0.55 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: SERIF, fontSize: 32, color: COLORS.ink, letterSpacing: -0.5 }}>
                        {formatTime12(r.time_of_day)}
                      </Text>
                      <Text style={{ fontSize: 13, color: COLORS.ink2, marginTop: 3 }}>
                        {daysLabel(r.days_of_week)}
                        {r.label ? `  ·  ${r.label}` : ""}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                        Snooze {r.snooze_minutes} min
                      </Text>
                    </View>
                    <Switch
                      value={r.enabled}
                      onValueChange={(v) => handleToggle(r, v)}
                      trackColor={{ true: COLORS.primary, false: COLORS.border }}
                      thumbColor="#fff"
                    />
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
                    <Pressable
                      onPress={() => { setEditing(r); setModalVisible(true); }}
                      style={{
                        flex: 1, paddingVertical: 9, borderRadius: 10,
                        backgroundColor: COLORS.muted, alignItems: "center",
                        borderWidth: 1, borderColor: COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(r)}
                      style={{
                        flex: 1, paddingVertical: 9, borderRadius: 10,
                        backgroundColor: "#FFF0F5", alignItems: "center",
                        borderWidth: 1, borderColor: "#FFD6E7",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.error }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Add more */}
        {reminders.length > 0 && (
          <Pressable
            onPress={() => { setEditing(null); setModalVisible(true); }}
            style={{
              backgroundColor: "#fff", borderRadius: 16,
              paddingVertical: 16, paddingHorizontal: 18,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              borderWidth: 1.5, borderColor: COLORS.border, borderStyle: "dashed",
            }}
          >
            <Text style={{ fontSize: 18, color: COLORS.ink3 }}>+</Text>
            <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
              Add another reminder
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <EditReminderModal
        visible={modalVisible}
        reminder={editing}
        onClose={() => { setModalVisible(false); setEditing(null); }}
        onSaved={loadReminders}
      />
    </SafeAreaView>
  );
}
