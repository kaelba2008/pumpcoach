import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { format } from "date-fns";
import { DatePickerField } from "./ui/DatePickerField";
import { Button } from "./ui/Button";
import { supabase } from "../lib/supabase";
import { COLORS, SERIF } from "../lib/constants";
import { useAuthStore } from "../store/authStore";
import { NursingSession, NursingFeel, NursingSide } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pass an existing session to edit it */
  session?: NursingSession | null;
}

const SIDE_OPTIONS: { value: NursingSide; label: string }[] = [
  { value: "left",  label: "Left"  },
  { value: "right", label: "Right" },
  { value: "both",  label: "Both"  },
];

const FEEL_OPTIONS: { value: NursingFeel; label: string; emoji: string }[] = [
  { value: "went_well",  label: "Went well",  emoji: "😊" },
  { value: "struggled",  label: "Struggled",  emoji: "😔" },
  { value: "not_sure",   label: "Not sure",   emoji: "🤔" },
];

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function NursingEntryModal({ visible, onClose, onSaved, session }: Props) {
  const isEdit = !!session;
  const { user } = useAuthStore();

  const [nursedAt,     setNursedAt]     = useState<Date>(new Date());
  const [durationStr,  setDurationStr]  = useState("");
  const [side,         setSide]         = useState<NursingSide | null>(null);
  const [feel,         setFeel]         = useState<NursingFeel | null>(null);
  const [notes,        setNotes]        = useState("");
  const [saving,       setSaving]       = useState(false);

  // Timer state
  const [useTimer,     setUseTimer]     = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [elapsed,      setElapsed]      = useState(0); // ms
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);

  // Pre-populate when editing
  useEffect(() => {
    if (session) {
      setNursedAt(new Date(session.nursed_at));
      setDurationStr(session.duration_min != null ? String(session.duration_min) : "");
      setSide(session.side ?? null);
      setFeel(session.feel);
      setNotes(session.notes ?? "");
    } else {
      setNursedAt(new Date());
      setDurationStr("");
      setSide(null);
      setFeel(null);
      setNotes("");
    }
    // Reset timer whenever modal opens/closes
    setUseTimer(false);
    stopTimer(true);
  }, [session, visible]);

  function stopTimer(reset = false) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimerRunning(false);
    if (reset) {
      setTimerStarted(false);
      setElapsed(0);
      accumulatedRef.current = 0;
    }
  }

  function handleStartPause() {
    if (!timerStarted) {
      // First start
      setTimerStarted(true);
      setNursedAt(new Date());
    }
    if (timerRunning) {
      // Pause
      accumulatedRef.current += Date.now() - startTimeRef.current;
      stopTimer(false);
    } else {
      // Start / resume
      startTimeRef.current = Date.now();
      setTimerRunning(true);
      intervalRef.current = setInterval(() => {
        setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
      }, 500);
    }
  }

  function handleStopTimer() {
    const totalMs = accumulatedRef.current + (timerRunning ? (Date.now() - startTimeRef.current) : 0);
    stopTimer(true);
    const mins = Math.max(1, Math.round(totalMs / 60000));
    setDurationStr(String(mins));
    setUseTimer(false);
  }

  const handleSave = async () => {
    if (!feel) {
      Alert.alert("How did it go?", "Please select how the nursing session felt.");
      return;
    }

    const durationMin = durationStr.trim() ? parseInt(durationStr.trim(), 10) : null;
    if (durationStr.trim() && (isNaN(durationMin!) || durationMin! < 1 || durationMin! > 180)) {
      Alert.alert("Invalid duration", "Please enter a duration between 1 and 180 minutes, or leave it blank.");
      return;
    }

    setSaving(true);

    const payload = {
      user_id:      user?.id,
      nursed_at:    nursedAt.toISOString(),
      duration_min: durationMin ?? null,
      side:         side ?? null,
      feel,
      notes:        notes.trim() || null,
    };

    let error;
    if (isEdit && session) {
      ({ error } = await supabase
        .from("nursing_sessions")
        .update(payload)
        .eq("id", session.id));
    } else {
      ({ error } = await supabase
        .from("nursing_sessions")
        .insert(payload));
    }

    setSaving(false);

    if (error) {
      Alert.alert("Error saving session", error.message);
      return;
    }

    stopTimer(true);
    onSaved();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <LinearGradient
            colors={["#3D5A5C", "#4A6E70"]}
            style={{
              paddingHorizontal: 20, paddingVertical: 18,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                Cancel
              </Text>
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: SERIF, fontSize: 18, color: "#fff" }}>
                {isEdit ? "Edit nursing session" : "Log nursing session"}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                🤱 Breastfeeding tracker
              </Text>
            </View>
            <View style={{ width: 52 }} />
          </LinearGradient>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Timer toggle (new entries only) ── */}
            {!isEdit && (
              <View style={{
                backgroundColor: "#fff", borderRadius: 16,
                borderWidth: 1, borderColor: COLORS.border,
                overflow: "hidden",
              }}>
                {/* Toggle row */}
                <View style={{ flexDirection: "row", borderBottomWidth: useTimer ? 1 : 0, borderBottomColor: COLORS.border }}>
                  {[
                    { key: false, label: "Log manually", icon: "✏️" },
                    { key: true,  label: "Use timer",    icon: "⏱️" },
                  ].map(({ key, label, icon }) => {
                    const active = useTimer === key;
                    return (
                      <Pressable
                        key={String(key)}
                        onPress={() => {
                          if (key === false && timerStarted) {
                            // Switching away from timer — ask to stop
                            Alert.alert(
                              "Stop timer?",
                              "Switching to manual entry will stop the timer.",
                              [
                                { text: "Keep timer", style: "cancel" },
                                { text: "Stop & switch", onPress: () => { stopTimer(true); setUseTimer(false); } },
                              ]
                            );
                          } else {
                            setUseTimer(key as boolean);
                          }
                        }}
                        style={{
                          flex: 1, paddingVertical: 13, alignItems: "center",
                          flexDirection: "row", justifyContent: "center", gap: 6,
                          backgroundColor: active ? COLORS.primaryMist : "#fff",
                          borderRightWidth: key === false ? 1 : 0,
                          borderRightColor: COLORS.border,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={{ fontSize: 16 }}>{icon}</Text>
                        <Text style={{
                          fontSize: 13,
                          fontFamily: active ? "Nunito_700Bold" : "Nunito_400Regular",
                          fontWeight: active ? "700" : "400",
                          color: active ? COLORS.primary : COLORS.ink2,
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Timer display */}
                {useTimer && (
                  <View style={{ padding: 20, alignItems: "center", gap: 16 }}>
                    <Text style={{
                      fontSize: 56, fontFamily: "Nunito_700Bold", fontWeight: "700",
                      color: timerRunning ? COLORS.primary : COLORS.ink,
                      letterSpacing: -2,
                      includeFontPadding: false,
                      lineHeight: 64,
                    }}>
                      {fmtElapsed(elapsed)}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Pressable
                        onPress={handleStartPause}
                        style={{
                          flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center",
                          backgroundColor: timerRunning ? COLORS.border : COLORS.primary,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={timerRunning ? "Pause timer" : timerStarted ? "Resume timer" : "Start timer"}
                      >
                        <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: timerRunning ? COLORS.ink : "#fff" }}>
                          {timerRunning ? "⏸ Pause" : timerStarted ? "▶ Resume" : "▶ Start"}
                        </Text>
                      </Pressable>

                      {timerStarted && (
                        <Pressable
                          onPress={handleStopTimer}
                          style={{
                            flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center",
                            backgroundColor: "#FFF0ED", borderWidth: 1, borderColor: "#F2C4BB",
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Stop timer and use this duration"
                        >
                          <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#C0544A" }}>
                            ■ Done
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    {!timerStarted && (
                      <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center" }}>
                        Tap Start — the clock begins and the session time is recorded automatically.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* ── When ── */}
            <View style={{
              backgroundColor: "#fff", borderRadius: 16,
              borderWidth: 1, borderColor: COLORS.border,
              padding: 16,
            }}>
              <DatePickerField
                label="When"
                value={nursedAt}
                onChange={(d) => d && setNursedAt(d)}
                mode="datetime"
                maximumDate={new Date()}
              />
            </View>

            {/* ── Side ── */}
            <View style={{
              backgroundColor: "#fff", borderRadius: 16,
              borderWidth: 1, borderColor: COLORS.border,
              padding: 16, gap: 10,
            }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                Side (optional)
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SIDE_OPTIONS.map(({ value, label }) => {
                  const selected = side === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setSide(selected ? null : value)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 12,
                        borderWidth: 1.5, alignItems: "center",
                        borderColor: selected ? COLORS.primary : COLORS.border,
                        backgroundColor: selected ? "rgba(124,92,252,0.07)" : COLORS.muted,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontFamily: selected ? "Nunito_700Bold" : "Nunito_400Regular",
                        fontWeight: selected ? "700" : "400",
                        color: selected ? COLORS.primary : COLORS.ink2,
                      }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Duration ── */}
            <View style={{
              backgroundColor: "#fff", borderRadius: 16,
              borderWidth: 1, borderColor: COLORS.border,
              padding: 16, gap: 8,
            }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                Duration{useTimer && timerStarted ? " (filled by timer)" : " in minutes (optional)"}
              </Text>
              <View style={{
                flexDirection: "row", alignItems: "center",
                backgroundColor: COLORS.muted, borderRadius: 12,
                borderWidth: 1, borderColor: COLORS.border,
                paddingHorizontal: 14, height: 46,
              }}>
                <TextInput
                  value={durationStr}
                  onChangeText={setDurationStr}
                  placeholder="e.g. 15"
                  placeholderTextColor={COLORS.ink3}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  editable={!useTimer}
                  style={{
                    flex: 1, fontSize: 15, color: useTimer ? COLORS.ink3 : COLORS.ink,
                    fontFamily: "Nunito_400Regular",
                  }}
                />
                <Text style={{ fontSize: 13, color: COLORS.ink3 }}>min</Text>
              </View>
            </View>

            {/* ── How did it go ── */}
            <View style={{
              backgroundColor: "#fff", borderRadius: 16,
              borderWidth: 1, borderColor: COLORS.border,
              padding: 16, gap: 10,
            }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                How did it go?
              </Text>
              <View style={{ gap: 8 }}>
                {FEEL_OPTIONS.map(({ value, label, emoji }) => {
                  const selected = feel === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setFeel(value)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 14,
                        padding: 14, borderRadius: 12, borderWidth: 1.5,
                        borderColor: selected ? COLORS.primary : COLORS.border,
                        backgroundColor: selected ? "rgba(124,92,252,0.06)" : COLORS.muted,
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      accessibilityState={{ checked: selected }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                        alignItems: "center", justifyContent: "center",
                        borderColor: selected ? COLORS.primary : COLORS.border,
                        backgroundColor: selected ? COLORS.primary : "transparent",
                      }}>
                        {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                      </View>
                      <Text style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</Text>
                      <Text style={{
                        fontSize: 14, flex: 1,
                        fontFamily: selected ? "Nunito_700Bold" : "Nunito_400Regular",
                        fontWeight: selected ? "700" : "400",
                        color: selected ? COLORS.ink : COLORS.ink2,
                      }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Notes ── */}
            <View style={{
              backgroundColor: "#fff", borderRadius: 16,
              borderWidth: 1, borderColor: COLORS.border,
              padding: 16, gap: 8,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>
                  Notes (optional)
                </Text>
                <Text style={{ fontSize: 11, color: notes.length > 120 ? COLORS.amber : COLORS.ink3 }}>
                  {notes.length}/140
                </Text>
              </View>
              <TextInput
                value={notes}
                onChangeText={(t) => setNotes(t.slice(0, 140))}
                placeholder="Any observations or context..."
                placeholderTextColor={COLORS.ink3}
                multiline
                numberOfLines={3}
                autoCapitalize="sentences"
                style={{
                  backgroundColor: COLORS.muted, borderRadius: 12,
                  borderWidth: 1, borderColor: COLORS.border,
                  paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
                  fontSize: 14, color: COLORS.ink, fontFamily: "Nunito_400Regular",
                  minHeight: 80, textAlignVertical: "top",
                }}
              />
            </View>

            <Button
              label={isEdit ? "Save changes" : "Save session"}
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
