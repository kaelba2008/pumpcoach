import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, FlatList, RefreshControl, ActivityIndicator, Animated, GestureResponderEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useUnit } from "../hooks/useUnit";
import { formatUnit } from "../lib/units";
import { COLORS, SERIF } from "../lib/constants";
import { PumpSession } from "../types";

const PAGE_SIZE = 50;

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function groupByDay(sessions: PumpSession[]): { label: string; date: string; data: PumpSession[] }[] {
  const map = new Map<string, PumpSession[]>();
  for (const s of sessions) {
    const key = startOfDay(new Date(s.started_at)).toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries())
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([date, data]) => ({
      label: dateLabel(data[0].started_at),
      date,
      data: data.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    }));
}

export default function PumpHistoryScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unit } = useUnit();

  const [sessions, setSessions] = useState<PumpSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchSessions = useCallback(async (loadOffset: number) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("pump_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .range(loadOffset, loadOffset + PAGE_SIZE - 1);

    if (!error && data) {
      if (loadOffset === 0) {
        setSessions(data as PumpSession[]);
      } else {
        setSessions((prev) => [...prev, ...(data as PumpSession[])]);
      }
      setHasMore((data as PumpSession[]).length === PAGE_SIZE);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    fetchSessions(0);
    setOffset(0);
  }, [fetchSessions]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSessions(0);
    setOffset(0);
  };

  const loadMore = () => {
    if (hasMore && !loading && !refreshing) {
      const newOffset = offset + PAGE_SIZE;
      setOffset(newOffset);
      fetchSessions(newOffset);
    }
  };

  const deleteSession = (session: PumpSession) => {
    Alert.alert("Delete session?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
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
      <View style={{ paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={{ fontSize: 24, color: COLORS.ink }}>‹</Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF, fontSize: 20, fontWeight: "600", color: COLORS.ink }}>
            Pump Sessions
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 16, color: COLORS.ink3, textAlign: "center" }}>
            No sessions yet. Start logging to see your history here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.date}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item: group }) => (
            <View style={{ marginBottom: 20 }}>
              {/* Day header */}
              <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 }}>
                {group.label}
              </Text>

              {/* Sessions for this day */}
              <View style={{ gap: 8 }}>
                {group.data.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    unit={unit}
                    onDelete={() => deleteSession(session)}
                  />
                ))}
              </View>
            </View>
          )}
          ListFooterComponent={
            hasMore && !refreshing ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

interface SessionCardProps {
  session: PumpSession;
  unit: "oz" | "ml";
  onDelete: () => void;
}

function SessionCard({ session, unit, onDelete }: SessionCardProps) {
  const time = format(new Date(session.started_at), "h:mm a");
  const totalOz = (session.left_oz ?? 0) + (session.right_oz ?? 0);
  const durationMin = Math.round((session.duration_sec ?? 0) / 60);

  const panX = new Animated.Value(0);
  const [showDelete, setShowDelete] = useState(false);

  const handleSwipe = (e: GestureResponderEvent) => {
    const { nativeEvent } = e;
    if (nativeEvent.locationX < 50) {
      setShowDelete(true);
    }
  };

  return (
    <View style={{ position: "relative" }}>
      {/* Delete background */}
      {showDelete && (
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "30%",
            backgroundColor: "#EF4444",
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Delete</Text>
        </View>
      )}

      {/* Session card */}
      <Pressable
        onPress={() => setShowDelete(false)}
        onLongPress={onDelete}
        delayLongPress={800}
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 12,
          marginRight: showDelete ? 0 : 0,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {/* Time & details */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: COLORS.ink, marginBottom: 4 }}>
              {time}
            </Text>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {/* Output */}
              <View>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 1 }}>Output</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.primary }}>
                  {formatUnit(totalOz, unit)}
                </Text>
              </View>

              {/* Duration */}
              <View>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 1 }}>Duration</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.ink }}>
                  {durationMin}m
                </Text>
              </View>

              {/* Pain */}
              {session.pain_level != null && session.pain_level > 0 && (
                <View>
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 1 }}>Pain</Text>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#EA580C" }}>
                    {session.pain_level}/10
                  </Text>
                </View>
              )}

              {/* Letdown */}
              {session.letdown_quality && (
                <View>
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 1 }}>Letdown</Text>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink, textTransform: "capitalize" }}>
                    {session.letdown_quality}
                  </Text>
                </View>
              )}
            </View>

            {/* Notes */}
            {session.notes && (
              <Text
                style={{
                  fontSize: 12,
                  color: COLORS.ink2,
                  marginTop: 6,
                  fontStyle: "italic",
                  maxWidth: "90%",
                }}
                numberOfLines={1}
              >
                "{session.notes}"
              </Text>
            )}
          </View>

          {/* Delete button hint */}
          <Pressable
            onPress={onDelete}
            style={{
              width: 36,
              height: 36,
              justifyContent: "center",
              alignItems: "center",
              marginLeft: 8,
            }}
          >
            <Text style={{ fontSize: 20, color: "#EF4444" }}>×</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}
