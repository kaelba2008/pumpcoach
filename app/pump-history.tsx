import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, Modal, ActivityIndicator,
  ActionSheetIOS, Platform, FlatList, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useUnit } from "../hooks/useUnit";
import { formatUnit, ozToMl, mlToOz } from "../lib/units";
import { COLORS, SERIF } from "../lib/constants";
import { PumpSession } from "../types";
import { OzInput } from "../components/ui/OzInput";
import { PainLevelPicker } from "../components/ui/PainLevelPicker";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { DatePickerField } from "../components/ui/DatePickerField";

const PAGE_SIZE = 30;

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

function groupByDay(sessions: PumpSession[]): { label: string; data: PumpSession[] }[] {
  const map = new Map<string, PumpSession[]>();
  for (const s of sessions) {
    const key = startOfDay(new Date(s.started_at)).toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([, data]) => ({
    label: dateLabel(data[0].started_at),
    data,
  }));
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  session: PumpSession | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ session, visible, onClose, onSaved }: EditModalProps) {
  const { unit } = useUnit();
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [leftOz,    setLeftOz]    = useState("");
  const [rightOz,   setRightOz]   = useState("");
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);

  const toDisplay = (oz: string) => {
    if (unit === "ml") { const n = parseFloat(oz) || 0; return n > 0 ? String(Math.round(ozToMl(n))) : ""; }
    return oz;
  };
  const fromDisplay = (val: string) => {
    if (unit === "ml") { const ml = parseFloat(val) || 0; return ml > 0 ? String(Math.round(mlToOz(ml) * 100) / 100) : ""; }
    return val;
  };

  useEffect(() => {
    if (session) {
      setStartedAt(new Date(session.started_at));
      setLeftOz(session.left_oz  != null ? String(session.left_oz)  : "");
      setRightOz(session.right_oz != null ? String(session.right_oz) : "");
      setPainLevel(session.pain_level);
      setNotes(session.notes ?? "");
    }
  }, [session]);

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase.from("pump_sessions").update({
      started_at: startedAt.toISOString(),
      left_oz:    parseFloat(leftOz)  || null,
      right_oz:   parseFloat(rightOz) || null,
      notes:      notes.trim() || null,
      pain_level: painLevel,
    }).eq("id", session.id);
    setSaving(false);
    if (error) { Alert.alert("Error saving", error.message); return; }
    onSaved();
    onClose();
  };

  if (!session) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 20, paddingVertical: 16,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
        }}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Edit Session</Text>
          <Pressable onPress={handleSave} hitSlop={12} disabled={saving}>
            <Text style={{ fontSize: 15, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20 }}>
          <DatePickerField
            label="When"
            value={startedAt}
            onChange={(d) => d && setStartedAt(d)}
            mode="datetime"
            maximumDate={new Date()}
          />

          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 8 }}>
              <OzInput label="Left"  value={toDisplay(leftOz)}  onChange={(v) => setLeftOz(fromDisplay(v))}  unit={unit} />
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <OzInput label="Right" value={toDisplay(rightOz)} onChange={(v) => setRightOz(fromDisplay(v))} unit={unit} />
            </View>
          </View>

          <PainLevelPicker value={painLevel} onChange={setPainLevel} />

          <Input
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="How did this session feel?"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 72 }}
            autoCapitalize="sentences"
          />

          <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth size="lg" />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({
  session,
  unit,
  onEdit,
  onDelete,
}: {
  session: PumpSession;
  unit: "oz" | "ml";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const durationMin = session.duration_sec ? Math.round(session.duration_sec / 60) : null;

  const showOptions = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Edit", "Delete", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (i) => { if (i === 0) onEdit(); if (i === 1) onDelete(); }
      );
    } else {
      Alert.alert("Session options", undefined, [
        { text: "Edit", onPress: onEdit },
        { text: "Delete", style: "destructive", onPress: onDelete },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={showOptions}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center",
        paddingVertical: 13, paddingHorizontal: 16,
        backgroundColor: pressed ? COLORS.muted : "transparent",
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
          {format(new Date(session.started_at), "h:mm a")}
        </Text>
        {durationMin && (
          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
            {durationMin} min
            {session.letdown_quality ? ` · ${session.letdown_quality} letdown` : ""}
            {session.pain_level && session.pain_level > 0 ? ` · pain ${session.pain_level}/10` : ""}
          </Text>
        )}
        {session.notes ? (
          <Text style={{ fontSize: 12, color: COLORS.ink2, marginTop: 3 }} numberOfLines={1}>
            {session.notes}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
        <Text style={{ fontSize: 18, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.primary }}>
          {formatUnit(session.total_oz, unit)}
        </Text>
        {session.left_oz != null && session.right_oz != null && (
          <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2 }}>
            L {formatUnit(session.left_oz, unit)} · R {formatUnit(session.right_oz, unit)}
          </Text>
        )}
      </View>

      <Text style={{ fontSize: 16, color: COLORS.ink3, marginLeft: 10 }}>›</Text>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PumpHistoryScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unit } = useUnit();

  const [sessions,    setSessions]    = useState<PumpSession[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [editSession, setEditSession] = useState<PumpSession | null>(null);
  const [showEdit,    setShowEdit]    = useState(false);

  const fetchSessions = useCallback(async (offset = 0, append = false) => {
    if (!user) return;
    if (offset === 0) setLoading(true); else setLoadingMore(true);

    const { data, error } = await supabase
      .from("pump_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (offset === 0) setLoading(false); else setLoadingMore(false);
    setRefreshing(false);
    if (error || !data) return;

    setSessions((prev) => append ? [...prev, ...data as PumpSession[]] : data as PumpSession[]);
    setHasMore(data.length === PAGE_SIZE);
  }, [user]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleDelete = (session: PumpSession) => {
    Alert.alert("Delete session?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("pump_sessions").delete().eq("id", session.id);
          setSessions((prev) => prev.filter((s) => s.id !== session.id));
        },
      },
    ]);
  };

  const groups = groupByDay(sessions);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 14, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>‹ Back</Text>
        </Pressable>
        <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink }}>Pump History</Text>
        <View style={{ width: 56 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.label}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchSessions(0); }}
              tintColor={COLORS.primary}
            />
          }
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          renderItem={({ item: group }) => (
            <View style={{ marginBottom: 20 }}>
              <Text style={{
                fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700",
                color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1,
                marginBottom: 10,
              }}>
                {group.label}
              </Text>
              <View style={{ backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                {group.data.map((s, idx) => (
                  <React.Fragment key={s.id}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 16 }} />}
                    <SessionRow
                      session={s}
                      unit={unit}
                      onEdit={() => { setEditSession(s); setShowEdit(true); }}
                      onDelete={() => handleDelete(s)}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🍼</Text>
              <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6 }}>
                No sessions yet
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, textAlign: "center" }}>
                Start pumping to see your history here.
              </Text>
            </View>
          }
          ListFooterComponent={
            hasMore && sessions.length > 0 ? (
              <Pressable
                onPress={() => fetchSessions(sessions.length, true)}
                style={{ alignItems: "center", paddingVertical: 16 }}
              >
                {loadingMore
                  ? <ActivityIndicator color={COLORS.primary} />
                  : <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Load more</Text>
                }
              </Pressable>
            ) : null
          }
        />
      )}

      <EditModal
        session={editSession}
        visible={showEdit}
        onClose={() => { setShowEdit(false); setEditSession(null); }}
        onSaved={() => fetchSessions()}
      />
    </SafeAreaView>
  );
}
