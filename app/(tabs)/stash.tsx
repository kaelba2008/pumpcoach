import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, RefreshControl,
  Modal, KeyboardAvoidingView, Platform, ActionSheetIOS, Dimensions, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addHours, addMonths, differenceInHours, differenceInDays,
  parseISO, format, isPast,
} from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { StashEntry, StashGoal, StashGoalType, PumpingWhileAway } from "../../types";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { OzInput } from "../../components/ui/OzInput";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { fmtOz, fmtDate } from "../../lib/formatters";
import { primaryBaby } from "../../lib/babies";
import { STASH_LOCATIONS, MILK_EXPIRY_HOURS, COLORS, SERIF } from "../../lib/constants";

const SCREEN_W = Dimensions.get("window").width;
const MYTH_DISMISSED_KEY = "stash_myth_dismissed";

// ── Expiry helpers ──────────────────────────────────────────────────────────

type ExpiryTier = "fresh" | "use_soon" | "expires_today" | "expired";

function expiresAt(entry: StashEntry): Date {
  return addHours(new Date(entry.expressed_at), MILK_EXPIRY_HOURS[entry.location] ?? 96);
}

function expiryTier(entry: StashEntry): ExpiryTier {
  const h = differenceInHours(expiresAt(entry), new Date());
  if (h <= 0)  return "expired";
  if (h <= 24) return "expires_today";
  if (h <= 48) return "use_soon";
  return "fresh";
}

const EXPIRY_COLOR: Record<ExpiryTier, string> = {
  fresh:         "#4CAF82",
  use_soon:      COLORS.amber,
  expires_today: "#E05C2A",
  expired:       COLORS.error,
};
const EXPIRY_LABEL: Record<ExpiryTier, string> = {
  fresh:         "Fresh",
  use_soon:      "Use soon",
  expires_today: "Expires today",
  expired:       "Expired",
};

// ── Goal helpers ────────────────────────────────────────────────────────────

const GOAL_META: Record<StashGoalType, { icon: string; label: string; description: string }> = {
  return_to_work:  { icon: "💼", label: "Return to Work",     description: "Build a buffer before going back"      },
  trip:            { icon: "✈️",  label: "Going on a Trip",    description: "Stash enough to cover time away"       },
  pump_until_done: { icon: "🏁",  label: "Pumping Until Done", description: "See how much stash you still need"     },
  custom:          { icon: "🎯",  label: "Custom Goal",        description: "Set your own oz target"                },
};

// avgDailyOz is used for trip pumping-while-away reduction
function computeTargetOz(goal: StashGoal, avgDailyOz = 0): number | null {
  switch (goal.goal_type) {
    case "return_to_work": {
      // Must-have: oz baby takes while mom is away (one day)
      // baby_oz_per_day stores oz_while_away in the redesigned form
      return goal.baby_oz_per_day ?? null;
    }
    case "trip": {
      if (!goal.trip_days || !goal.baby_oz_per_day) return null;
      const days    = goal.trip_days;
      const ozPerDay = goal.baby_oz_per_day;
      if (goal.pumping_while_away === "yes") {
        // Reduce by her avg daily output, capped so total never goes negative
        return Math.max(0, Math.round(days * Math.max(0, ozPerDay - avgDailyOz)));
      }
      if (goal.pumping_while_away === "some") {
        // Reduce by 50% of her avg daily output
        return Math.max(0, Math.round(days * ozPerDay - days * 0.5 * avgDailyOz));
      }
      return Math.round(days * ozPerDay);
    }
    case "pump_until_done": {
      // Total oz needed from now until goal date
      if (!goal.target_date || !goal.baby_oz_per_day) return null;
      const daysLeft = Math.max(0, differenceInDays(parseISO(goal.target_date), new Date()));
      return Math.round(daysLeft * goal.baby_oz_per_day);
    }
    case "custom": return goal.target_oz;
    default:       return null;
  }
}

// ── EntryCard ───────────────────────────────────────────────────────────────

function EntryCard({
  entry, onEdit, onUsed, onDiscard, onDelete,
}: {
  entry: StashEntry;
  onEdit:    () => void;
  onUsed:    () => void;
  onDiscard: () => void;
  onDelete:  () => void;
}) {
  const tier    = expiryTier(entry);
  const exp     = expiresAt(entry);
  const hours   = differenceInHours(exp, new Date());
  const loc     = STASH_LOCATIONS.find(l => l.value === entry.location);
  const expired = tier === "expired";

  const showActions = () => {
    const options  = ["Cancel", "Edit", "Mark as Used", "Discard", "Delete"];
    const onAction = (i: number) => {
      if (i === 1) onEdit();
      if (i === 2) onUsed();
      if (i === 3) onDiscard();
      if (i === 4) onDelete();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 4, cancelButtonIndex: 0 },
        onAction,
      );
    } else {
      Alert.alert("Options", undefined, [
        { text: "Edit",           onPress: onEdit },
        { text: "Mark as Used",   onPress: onUsed },
        { text: "Discard",        onPress: onDiscard },
        { text: "Delete",         style: "destructive", onPress: onDelete },
        { text: "Cancel",         style: "cancel" },
      ]);
    }
  };

  return (
    <Pressable
      onPress={showActions}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center",
        backgroundColor: pressed ? COLORS.muted : "#fff",
        borderRadius: 16, padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: COLORS.border,
        opacity: expired ? 0.55 : 1,
        gap: 12,
      })}
      accessibilityRole="button"
      accessibilityLabel="Stash entry options"
    >
      {/* Oz + meta, expiry dot inline with the oz line */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: EXPIRY_COLOR[tier] }} />
          <Text style={{ fontSize: 17, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
            {fmtOz(entry.oz)}
          </Text>
          {entry.label ? (
            <Text style={{ fontSize: 12, color: COLORS.ink2, fontStyle: "italic" }} numberOfLines={1}>{entry.label}</Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 12, color: COLORS.ink3, lineHeight: 16, marginLeft: 18 }}>
          {loc?.emoji} {loc?.label} · {fmtDate(entry.expressed_at)}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: EXPIRY_COLOR[tier], marginTop: 3, marginLeft: 18 }}>
          {tier === "expired"
            ? "Expired"
            : tier === "expires_today"
            ? `Expires in ${hours}h`
            : tier === "use_soon"
            ? `Use soon · good until ${format(exp, "MMM d")}`
            : `Good until ${format(exp, "MMM d")}`}
        </Text>
      </View>

      {/* Right: chevron, vertically centered */}
      <Text style={{ fontSize: 16, color: COLORS.ink3, alignSelf: "center" }}>›</Text>
    </Pressable>
  );
}

// ── GoalCard ────────────────────────────────────────────────────────────────

function GoalCard({
  goal, allocatedOz, totalStashOz, avgDailyOz, onDelete, onEdit,
  priority, canMoveUp, canMoveDown, onMoveUp, onMoveDown,
}: {
  goal: StashGoal;
  allocatedOz: number;
  totalStashOz: number;
  avgDailyOz: number;
  onDelete: () => void;
  onEdit: () => void;
  priority: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta     = GOAL_META[goal.goal_type];

  const showMenu = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Edit goal", "Remove goal", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (idx) => { if (idx === 0) onEdit(); else if (idx === 1) onDelete(); }
      );
    } else {
      Alert.alert("Goal options", undefined, [
        { text: "Edit goal", onPress: onEdit },
        { text: "Remove goal", style: "destructive", onPress: onDelete },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const priorityNote = allocatedOz < totalStashOz
    ? `${fmtOz(totalStashOz - allocatedOz)} reserved by higher-priority goals`
    : null;

  const GoalHeader = () => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, letterSpacing: 0.5 }}>
              #{priority}
            </Text>
            <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, flex: 1 }}>
              {goal.goal_name}
            </Text>
          </View>
          {priorityNote && (
            <Text style={{ fontSize: 11, color: COLORS.amber, marginTop: 1 }}>{priorityNote}</Text>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 0 }}>
        {canMoveUp && (
          <Pressable onPress={onMoveUp} hitSlop={10} style={{ padding: 6 }}>
            <Text style={{ fontSize: 14, color: COLORS.ink3 }}>↑</Text>
          </Pressable>
        )}
        {canMoveDown && (
          <Pressable onPress={onMoveDown} hitSlop={10} style={{ padding: 6 }}>
            <Text style={{ fontSize: 14, color: COLORS.ink3 }}>↓</Text>
          </Pressable>
        )}
        <Pressable onPress={showMenu} hitSlop={10} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Goal options">
          <Text style={{ fontSize: 18, color: COLORS.ink3, lineHeight: 18 }}>•••</Text>
        </Pressable>
      </View>
    </View>
  );
  const daysLeft = goal.target_date
    ? Math.max(0, differenceInDays(parseISO(goal.target_date), new Date()))
    : null;

  // ── Return to Work: two-bar display ──────────────────────────────────────
  if (goal.goal_type === "return_to_work") {
    const ozWhileAway   = goal.baby_oz_per_day ?? 0;
    const mustHave      = ozWhileAway;
    const niceToHaveLow = ozWhileAway * 2;
    const niceToHaveHigh = ozWhileAway * 3;
    const pMust = mustHave > 0 ? Math.min(1, allocatedOz / mustHave) : 0;
    const pNice = niceToHaveHigh > 0 ? Math.min(1, allocatedOz / niceToHaveHigh) : 0;
    const mustReached = allocatedOz >= mustHave;

    return (
      <View style={{
        backgroundColor: "#fff", borderRadius: 20,
        borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 12,
      }}>
        <GoalHeader />

        {daysLeft != null && (
          <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 12 }}>
            {daysLeft} days until you go back
          </Text>
        )}

        {/* Must-have bar */}
        <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6 }}>
          Must-have goal
        </Text>
        <View style={{ height: 12, backgroundColor: COLORS.border, borderRadius: 6, marginBottom: 6, overflow: "hidden" }}>
          <View style={{
            height: "100%", borderRadius: 6,
            width: `${Math.round(pMust * 100)}%`,
            backgroundColor: mustReached ? "#4CAF82" : COLORS.primary,
          }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: COLORS.ink2 }}>{fmtOz(allocatedOz)} saved</Text>
          <Text style={{ fontSize: 12, color: mustReached ? "#4CAF82" : COLORS.ink2 }}>
            {fmtOz(mustHave)} {mustReached ? "reached" : "for first day back"}
          </Text>
        </View>

        {/* Nice-to-have bar */}
        <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink2, marginBottom: 6 }}>
          Nice-to-have buffer
        </Text>
        <View style={{ height: 12, backgroundColor: COLORS.border, borderRadius: 6, marginBottom: 6, overflow: "hidden" }}>
          <View style={{
            height: "100%", borderRadius: 6,
            width: `${Math.round(pNice * 100)}%`,
            backgroundColor: COLORS.primary + "88",
          }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
            {fmtOz(niceToHaveLow)} to {fmtOz(niceToHaveHigh)} (2 to 3 day buffer)
          </Text>
        </View>

        <View style={{ backgroundColor: COLORS.primaryMist, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 12, color: COLORS.ink, lineHeight: 18 }}>
            After your first day back, you will pump at work and bring home fresh milk. Your stash is just the runway, not the whole supply. Most moms do not need a freezer full of milk to go back to work.
          </Text>
        </View>
      </View>
    );
  }

  // ── Pump Until Done: gap display ──────────────────────────────────────────
  if (goal.goal_type === "pump_until_done") {
    const totalNeeded = daysLeft != null && goal.baby_oz_per_day
      ? daysLeft * goal.baby_oz_per_day
      : null;
    const ozGap = totalNeeded != null ? Math.max(0, totalNeeded - allocatedOz) : null;
    const alreadyEnough = totalNeeded != null && allocatedOz >= totalNeeded;
    const dailyOzToAdd = ozGap && ozGap > 0 && daysLeft && daysLeft > 0
      ? ozGap / daysLeft
      : null;
    const progress = totalNeeded && totalNeeded > 0
      ? Math.min(1, allocatedOz / totalNeeded)
      : 0;

    let suggestion = "";
    if (dailyOzToAdd != null) {
      if (dailyOzToAdd < 2) {
        suggestion = "That is just one extra pumping session every few days. Try pumping right after your first morning nursing session when your supply is highest, or right before bed if baby is sleeping longer stretches.";
      } else if (dailyOzToAdd <= 5) {
        suggestion = "Try adding one dedicated pumping session per day. Right after your first morning nursing session is usually the most productive time. Even 10 to 15 minutes can add up significantly over weeks.";
      } else {
        suggestion = "This is an ambitious goal and may require more than one extra session per day. Consider whether your goal date or oz target has flexibility. Working with an IBCLC can help you build a realistic plan.";
      }
    }

    return (
      <View style={{
        backgroundColor: "#fff", borderRadius: 20,
        borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 12,
      }}>
        <GoalHeader />

        {daysLeft != null && (
          <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 8 }}>
            {daysLeft} days until your target date
          </Text>
        )}

        {totalNeeded != null && (
          <>
            <View style={{ height: 12, backgroundColor: COLORS.border, borderRadius: 6, marginBottom: 6, overflow: "hidden" }}>
              <View style={{
                height: "100%", borderRadius: 6,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: alreadyEnough ? "#4CAF82" : COLORS.primary,
              }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: COLORS.ink2 }}>{fmtOz(allocatedOz)} saved</Text>
              <Text style={{ fontSize: 12, color: COLORS.ink2 }}>{fmtOz(totalNeeded)} needed</Text>
            </View>
          </>
        )}

        {alreadyEnough ? (
          <View style={{ backgroundColor: "#F5FBF7", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#C8E6CB" }}>
            <Text style={{ fontSize: 12, color: "#4CAF82", fontFamily: "Nunito_600SemiBold", fontWeight: "600", lineHeight: 18 }}>
              You already have enough stash to cover your goal. You could stop pumping today if you wanted to.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {dailyOzToAdd != null && (
              <Text style={{ fontSize: 13, color: COLORS.ink, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                Add about {fmtOz(dailyOzToAdd)} per day to close the gap
              </Text>
            )}
            {suggestion !== "" && (
              <View style={{ backgroundColor: COLORS.primaryMist, borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 12, color: COLORS.ink, lineHeight: 18 }}>{suggestion}</Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: COLORS.ink3, fontStyle: "italic", lineHeight: 16 }}>
              These are general suggestions. An IBCLC who knows your situation can give you a personalized plan.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Standard: Trip + Custom ───────────────────────────────────────────────
  const targetOz      = computeTargetOz(goal, avgDailyOz);
  const progress      = targetOz && targetOz > 0 ? Math.min(1, allocatedOz / targetOz) : 0;
  const ozRemaining   = targetOz ? Math.max(0, targetOz - allocatedOz) : 0;
  const ozPerDayNeed  = daysLeft && daysLeft > 0 && ozRemaining > 0 ? ozRemaining / daysLeft : 0;
  const onTrack       = avgDailyOz > 0 && ozPerDayNeed <= avgDailyOz * 1.1;
  const complete      = progress >= 1;

  const statusColor = complete ? "#4CAF82" : onTrack ? COLORS.primary : COLORS.amber;
  const statusLabel = complete ? "Goal reached" : onTrack ? "On track" : "Needs attention";

  return (
    <View style={{
      backgroundColor: "#fff", borderRadius: 20,
      borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 12,
    }}>
      <GoalHeader />
      <View style={{ marginBottom: 10 }}>
        <View style={{ backgroundColor: statusColor + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
          <Text style={{ fontSize: 11, color: statusColor, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {targetOz != null && (
        <>
          <View style={{ height: 12, backgroundColor: COLORS.border, borderRadius: 6, marginBottom: 8, overflow: "hidden" }}>
            <View style={{
              height: "100%", borderRadius: 6,
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: complete ? "#4CAF82" : COLORS.primary,
            }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: COLORS.ink2 }}>{fmtOz(allocatedOz)} saved</Text>
            <Text style={{ fontSize: 12, color: COLORS.ink2 }}>{fmtOz(targetOz)} goal</Text>
          </View>
        </>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {daysLeft != null && (
          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>{daysLeft} days left</Text>
        )}
        {!complete && ozPerDayNeed > 0 && (
          <Text style={{ fontSize: 12, color: COLORS.ink3 }}>Need {fmtOz(ozPerDayNeed)}/day</Text>
        )}
      </View>

      {/* Trip pumping note */}
      {goal.goal_type === "trip" && goal.pumping_while_away === "yes" && (
        <View style={{ backgroundColor: COLORS.muted, borderRadius: 10, padding: 10, marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: COLORS.ink2, lineHeight: 17 }}>
            Since you plan to pump during your trip, that will offset some of your stash use. Make sure you have a plan for storing milk while traveling.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── StashEntryModal ─────────────────────────────────────────────────────────

function StashEntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry?: StashEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuthStore();
  const [oz,       setOz]       = useState(entry ? String(entry.oz) : "");
  const [location, setLocation] = useState<string>(entry?.location ?? "freezer");
  const [label,    setLabel]    = useState(entry?.label ?? "");
  const [date,     setDate]     = useState<Date>(
    entry ? new Date(entry.expressed_at) : new Date()
  );
  const [saving, setSaving] = useState(false);
  const isEdit = !!entry;

  const handleSave = async () => {
    if (!user || !oz) { Alert.alert("Please enter the amount in ounces."); return; }
    setSaving(true);
    const payload = {
      user_id:      user.id,
      expressed_at: date.toISOString(),
      oz:           parseFloat(oz),
      location,
      label:        label.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("stash_entries").update(payload).eq("id", entry!.id)
      : await supabase.from("stash_entries").insert(payload);
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
              <Pressable onPress={onClose}>
                <Text style={{ fontSize: 14, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {isEdit ? "Edit Entry" : "Add to Stash"}
              </Text>
              <View style={{ width: 56 }} />
            </View>

            <View style={{ paddingHorizontal: 24, gap: 20, paddingBottom: 40 }}>
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <OzInput label="Ounces" value={oz} onChange={setOz} />
              </View>

              <DatePickerField
                label="Date expressed"
                value={date}
                onChange={(d) => d && setDate(d)}
                mode="date"
                maximumDate={new Date()}
              />

              <View>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 10 }}>
                  Storage location
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {STASH_LOCATIONS.map((loc) => {
                    const sel = location === loc.value;
                    return (
                      <Pressable
                        key={loc.value}
                        onPress={() => setLocation(loc.value)}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 6,
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5,
                          backgroundColor: sel ? COLORS.primary : COLORS.muted,
                          borderColor:     sel ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text>{loc.emoji}</Text>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: sel ? "#fff" : COLORS.ink }}>
                          {loc.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Input
                label="Label (optional)"
                value={label}
                onChangeText={setLabel}
                placeholder="Morning stash, Bag 1..."
              />

              <Button
                label={isEdit ? "Save Changes" : "Add to Stash"}
                onPress={handleSave}
                loading={saving}
                fullWidth
                size="lg"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── CreateGoalModal ─────────────────────────────────────────────────────────

type GoalStep = "type" | "details" | "review";
type MilestoneMonths = 6 | 12 | 18 | 24 | "custom";

function CreateGoalModal({
  onClose, onSaved, avgDailyOz, currentStashOz, existingGoal,
}: {
  onClose: () => void;
  onSaved: () => void;
  avgDailyOz: number;
  currentStashOz: number;
  existingGoal?: StashGoal;
}) {
  const isEdit = !!existingGoal;
  const { user, profile, babies } = useAuthStore();
  const [step,              setStep]             = useState<GoalStep>(isEdit ? "details" : "type");
  const [goalType,          setGoalType]         = useState<StashGoalType | null>(existingGoal?.goal_type ?? null);
  const [goalName,          setGoalName]         = useState(existingGoal?.goal_name ?? "");
  const [targetDate,        setTargetDate]       = useState<Date | null>(existingGoal?.target_date ? parseISO(existingGoal.target_date) : null);
  const [babyOzPerDay,      setBabyOzPerDay]     = useState(existingGoal?.baby_oz_per_day != null ? String(existingGoal.baby_oz_per_day) : "");

  // return_to_work
  const [hoursAway,         setHoursAway]        = useState(""); // local only, not stored to DB

  // trip
  const [tripDays,          setTripDays]         = useState(existingGoal?.trip_days != null ? String(existingGoal.trip_days) : "");
  const [pumpingWhileAway,  setPumpingWhileAway] = useState<PumpingWhileAway | null>(existingGoal?.pumping_while_away ?? null);

  // pump_until_done
  const [milestone,         setMilestone]        = useState<MilestoneMonths | null>(isEdit ? "custom" : null);
  const [localBabyDob,      setLocalBabyDob]     = useState<Date | null>(
    primaryBaby(babies)?.dob ? new Date(`${primaryBaby(babies)!.dob}T12:00:00`) : null
  );

  // custom
  const [customTargetOz,    setCustomTargetOz]   = useState(existingGoal?.goal_type === "custom" && existingGoal.target_oz != null ? String(existingGoal.target_oz) : "");
  const [saving,            setSaving]           = useState(false);

  const goToDetails = (type: StashGoalType) => {
    setGoalType(type);
    setGoalName(GOAL_META[type].label);
    setStep("details");
  };

  const effectiveBabyDob = primaryBaby(babies)?.dob ? new Date(`${primaryBaby(babies)!.dob}T12:00:00`) : localBabyDob;

  const hoursNum    = parseFloat(hoursAway) || 0;
  const hintLow     = hoursNum > 0 ? Math.round(hoursNum * 10) / 10 : null;
  const hintHigh    = hoursNum > 0 ? Math.round(hoursNum * 1.25 * 10) / 10 : null;

  const canAdvanceToReview = (): boolean => {
    if (!goalType) return false;
    if (goalType === "return_to_work")  return !!babyOzPerDay;
    if (goalType === "trip")            return !!targetDate && !!tripDays && !!babyOzPerDay && !!pumpingWhileAway;
    if (goalType === "pump_until_done") return !!targetDate && !!babyOzPerDay;
    if (goalType === "custom")          return !!customTargetOz;
    return false;
  };

  const reviewData = (): { targetOz: number | null; summary: string; details: string[] } => {
    if (!goalType) return { targetOz: null, summary: "", details: [] };
    const today = new Date();

    if (goalType === "return_to_work" && babyOzPerDay) {
      const ozWhileAway   = parseFloat(babyOzPerDay);
      const bufferLow     = ozWhileAway * 2;
      const bufferHigh    = ozWhileAway * 3;
      const daysLeft      = targetDate ? differenceInDays(targetDate, today) : null;
      return {
        targetOz: ozWhileAway,
        summary: `Your must-have goal is ${fmtOz(ozWhileAway)}: enough for your first day back.`,
        details: [
          `Nice-to-have buffer: ${fmtOz(bufferLow)} to ${fmtOz(bufferHigh)} (2 to 3 extra days)`,
          `After your first day back, you will pump at work and bring home fresh milk. Your stash is just the runway.`,
          ...(daysLeft != null ? [`${daysLeft} days until your return date`] : []),
        ],
      };
    }

    if (goalType === "trip" && targetDate && tripDays && babyOzPerDay) {
      const days   = parseInt(tripDays);
      const ozPerDay = parseFloat(babyOzPerDay);
      let target: number;
      if (pumpingWhileAway === "yes") {
        target = Math.max(0, Math.round(days * Math.max(0, ozPerDay - avgDailyOz)));
      } else if (pumpingWhileAway === "some") {
        target = Math.max(0, Math.round(days * ozPerDay - days * 0.5 * avgDailyOz));
      } else {
        target = Math.round(days * ozPerDay);
      }
      const needed   = Math.max(0, target - currentStashOz);
      const daysLeft = differenceInDays(targetDate, today);
      const ozPerDayBuild = daysLeft > 0 ? (needed / daysLeft).toFixed(1) : "0";
      const details = [
        `${fmtOz(target)} needed for the trip`,
        `${fmtOz(needed)} still to build`,
        `About ${ozPerDayBuild} oz/day to reach your goal`,
      ];
      if (pumpingWhileAway === "yes") {
        details.push("Make sure you have a plan for storing milk while traveling.");
      }
      return {
        targetOz: target,
        summary: `For a ${tripDays}-day trip you need ${fmtOz(target)}. You currently have ${fmtOz(currentStashOz)}.`,
        details,
      };
    }

    if (goalType === "pump_until_done" && targetDate && babyOzPerDay) {
      const daysLeft   = Math.max(0, differenceInDays(targetDate, today));
      const totalNeeded = daysLeft * parseFloat(babyOzPerDay);
      const ozGap      = totalNeeded - currentStashOz;
      const dailyOzToAdd = daysLeft > 0 && ozGap > 0 ? ozGap / daysLeft : 0;

      if (ozGap <= 0) {
        return {
          targetOz: Math.round(totalNeeded),
          summary: `You already have enough stash to cover your goal.`,
          details: ["You could stop pumping today if you wanted to."],
        };
      }

      const details = [
        `${fmtOz(currentStashOz)} saved, ${fmtOz(Math.round(totalNeeded))} needed total`,
        `Gap to close: ${fmtOz(Math.round(ozGap))}`,
        `Add about ${fmtOz(dailyOzToAdd)} per day to your stash`,
      ];
      return {
        targetOz: Math.round(totalNeeded),
        summary: `To reach your goal by ${format(targetDate, "MMM d, yyyy")}, you need about ${fmtOz(Math.round(totalNeeded))} total.`,
        details,
      };
    }

    if (goalType === "custom" && customTargetOz) {
      const target = parseFloat(customTargetOz);
      const needed = Math.max(0, target - currentStashOz);
      return {
        targetOz: target,
        summary: `Target: ${fmtOz(target)}. You have ${fmtOz(currentStashOz)} saved.`,
        details: [`${fmtOz(needed)} to go`],
      };
    }

    return { targetOz: null, summary: "", details: [] };
  };

  const handleSave = async () => {
    if (!user || !goalType) return;
    setSaving(true);
    const { targetOz } = reviewData();
    const payload = {
      goal_type:          goalType,
      goal_name:          goalName.trim() || GOAL_META[goalType].label,
      target_oz:          targetOz,
      target_date:        targetDate ? format(targetDate, "yyyy-MM-dd") : null,
      work_days_per_week: null,
      baby_oz_per_day:    babyOzPerDay ? parseFloat(babyOzPerDay) : null,
      trip_days:          goalType === "trip" ? parseInt(tripDays) : null,
      pumping_while_away: pumpingWhileAway,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from("stash_goals").update(payload).eq("id", existingGoal!.id));
    } else {
      // Get next sort_order (place new goal last in priority)
      const { data: existing } = await supabase
        .from("stash_goals")
        .select("sort_order")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      ({ error } = await supabase.from("stash_goals").insert({ user_id: user.id, sort_order: nextOrder, ...payload }));
    }
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    onSaved();
    onClose();
  };

  const review = reviewData();

  const selectMilestone = (m: MilestoneMonths) => {
    setMilestone(m);
    if (m !== "custom" && effectiveBabyDob) {
      setTargetDate(addMonths(effectiveBabyDob, m));
    } else if (m === "custom") {
      setTargetDate(null);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
              <Pressable onPress={isEdit || step === "type" ? onClose : () => setStep(step === "review" ? "details" : "type")}>
                <Text style={{ fontSize: 14, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  {isEdit || step === "type" ? "Cancel" : "Back"}
                </Text>
              </Pressable>
              <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                {isEdit ? "Edit Goal" : step === "type" ? "Create a Goal" : step === "details" ? "Goal Details" : "Review"}
              </Text>
              <View style={{ width: 56 }} />
            </View>

            <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 16 }}>

              {/* Step 1: Goal type */}
              {step === "type" && (
                <>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22 }}>
                    What are you building toward?
                  </Text>
                  {(Object.keys(GOAL_META) as StashGoalType[]).map((type) => {
                    const meta = GOAL_META[type];
                    return (
                      <Pressable
                        key={type}
                        onPress={() => goToDetails(type)}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? COLORS.muted : "#fff",
                          borderRadius: 18, borderWidth: 1.5,
                          borderColor: COLORS.border, padding: 18,
                          flexDirection: "row", alignItems: "center", gap: 14,
                        })}
                      >
                        <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 2 }}>
                            {meta.label}
                          </Text>
                          <Text style={{ fontSize: 13, color: COLORS.ink2 }}>{meta.description}</Text>
                        </View>
                        <Text style={{ fontSize: 18, color: COLORS.ink3 }}>›</Text>
                      </Pressable>
                    );
                  })}
                </>
              )}

              {/* Step 2: Details */}
              {step === "details" && goalType && (
                <>
                  <Input
                    label="Goal name"
                    value={goalName}
                    onChangeText={setGoalName}
                    placeholder={GOAL_META[goalType].label}
                  />

                  {/* ── Return to Work ── */}
                  {goalType === "return_to_work" && (
                    <>
                      <DatePickerField
                        label="When do you go back to work? (optional)"
                        value={targetDate}
                        onChange={setTargetDate}
                        mode="date"
                        minimumDate={new Date()}
                        optional
                      />
                      <View>
                        <Input
                          label="How many hours will you be away from baby on a typical work day?"
                          value={hoursAway}
                          onChangeText={setHoursAway}
                          placeholder="e.g. 9"
                          keyboardType="decimal-pad"
                        />
                        <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 4 }}>
                          Include commute time
                        </Text>
                      </View>
                      <View>
                        <Input
                          label="How many oz do you expect baby to take while you are away?"
                          value={babyOzPerDay}
                          onChangeText={setBabyOzPerDay}
                          placeholder="e.g. 12"
                          keyboardType="decimal-pad"
                        />
                        <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 4 }}>
                          A general guide is 1 to 1.25 oz per hour you are away.
                          {hintLow != null && hintHigh != null
                            ? ` Based on ${hoursAway} hours: about ${hintLow} to ${hintHigh} oz.`
                            : ""}
                        </Text>
                      </View>
                    </>
                  )}

                  {/* ── Trip ── */}
                  {goalType === "trip" && (
                    <>
                      <DatePickerField
                        label="When do you leave?"
                        value={targetDate}
                        onChange={setTargetDate}
                        mode="date"
                        minimumDate={new Date()}
                      />
                      <Input
                        label="How many days will you be gone?"
                        value={tripDays}
                        onChangeText={setTripDays}
                        placeholder="e.g. 5"
                        keyboardType="number-pad"
                      />
                      <Input
                        label="How many oz does baby take per day?"
                        value={babyOzPerDay}
                        onChangeText={setBabyOzPerDay}
                        placeholder="e.g. 24"
                        keyboardType="decimal-pad"
                      />
                      <View>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 10 }}>
                          Will you pump while away?
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {([
                            { value: "yes",  label: "Yes" },
                            { value: "some", label: "Some" },
                            { value: "no",   label: "No" },
                          ] as const).map(opt => (
                            <Pressable
                              key={opt.value}
                              onPress={() => setPumpingWhileAway(opt.value)}
                              style={{
                                flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
                                backgroundColor: pumpingWhileAway === opt.value ? COLORS.primary : COLORS.muted,
                                borderColor:     pumpingWhileAway === opt.value ? COLORS.primary : COLORS.border,
                              }}
                            >
                              <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: pumpingWhileAway === opt.value ? "#fff" : COLORS.ink }}>
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        {pumpingWhileAway === "yes" && avgDailyOz > 0 && (
                          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 6 }}>
                            Your 7-day average of {fmtOz(avgDailyOz)}/day will be used to estimate the reduction.
                          </Text>
                        )}
                        {pumpingWhileAway === "yes" && avgDailyOz === 0 && (
                          <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 6 }}>
                            No recent stash data found. The full oz amount will be used as your target.
                          </Text>
                        )}
                      </View>
                    </>
                  )}

                  {/* ── Pump Until Done ── */}
                  {goalType === "pump_until_done" && (
                    <>
                      {/* Baby DOB — only ask if not already on file */}
                      {!primaryBaby(babies)?.dob && (
                        <View>
                          <DatePickerField
                            label="When was baby born?"
                            value={localBabyDob}
                            onChange={(d) => {
                              setLocalBabyDob(d ?? null);
                              if (d && milestone && milestone !== "custom") {
                                setTargetDate(addMonths(d, milestone));
                              }
                            }}
                            mode="date"
                            maximumDate={new Date()}
                          />
                        </View>
                      )}

                      {/* Milestone picker */}
                      <View>
                        <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 10 }}>
                          How long do you want to provide breast milk?
                        </Text>
                        <View style={{ gap: 8 }}>
                          {([6, 12, 18, 24] as const).map((months) => {
                            const endDate = effectiveBabyDob ? addMonths(effectiveBabyDob, months) : null;
                            const sel     = milestone === months;
                            return (
                              <Pressable
                                key={months}
                                onPress={() => selectMilestone(months)}
                                style={{
                                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                                  padding: 14, borderRadius: 14, borderWidth: 1.5,
                                  backgroundColor: sel ? "rgba(124,92,252,0.06)" : "#fff",
                                  borderColor: sel ? COLORS.primary : COLORS.border,
                                }}
                              >
                                <Text style={{ fontSize: 14, fontFamily: sel ? "Nunito_700Bold" : "Nunito_400Regular", fontWeight: sel ? "700" : "400", color: sel ? COLORS.primary : COLORS.ink }}>
                                  Until baby is {months} months
                                </Text>
                                {endDate && (
                                  <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                                    {format(endDate, "MMM yyyy")}
                                  </Text>
                                )}
                              </Pressable>
                            );
                          })}
                          <Pressable
                            onPress={() => selectMilestone("custom")}
                            style={{
                              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                              padding: 14, borderRadius: 14, borderWidth: 1.5,
                              backgroundColor: milestone === "custom" ? "rgba(124,92,252,0.06)" : "#fff",
                              borderColor: milestone === "custom" ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{ fontSize: 14, fontFamily: milestone === "custom" ? "Nunito_700Bold" : "Nunito_400Regular", fontWeight: milestone === "custom" ? "700" : "400", color: milestone === "custom" ? COLORS.primary : COLORS.ink }}>
                              Custom date
                            </Text>
                            <Text style={{ fontSize: 18, color: COLORS.ink3 }}>›</Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Custom date picker */}
                      {milestone === "custom" && (
                        <DatePickerField
                          label="Provide breast milk until"
                          value={targetDate}
                          onChange={setTargetDate}
                          mode="date"
                          minimumDate={new Date()}
                        />
                      )}

                      <View>
                        <Input
                          label="How many oz do you want baby to have per day from your milk?"
                          value={babyOzPerDay}
                          onChangeText={setBabyOzPerDay}
                          placeholder="e.g. 24"
                          keyboardType="decimal-pad"
                        />
                        <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 4 }}>
                          This can be their full intake or just a portion, whatever your goal is.
                        </Text>
                      </View>

                      <View style={{ backgroundColor: COLORS.muted, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
                        <Text style={{ fontSize: 12, color: COLORS.ink2, lineHeight: 18 }}>
                          This calculation uses your logged stash total ({fmtOz(currentStashOz)}). If you have milk not logged here, add it for a more accurate result.
                        </Text>
                      </View>
                    </>
                  )}

                  {/* ── Custom ── */}
                  {goalType === "custom" && (
                    <>
                      <Input
                        label="Target oz"
                        value={customTargetOz}
                        onChangeText={setCustomTargetOz}
                        placeholder="e.g. 200"
                        keyboardType="decimal-pad"
                      />
                      <DatePickerField
                        label="Target date (optional)"
                        value={targetDate}
                        onChange={setTargetDate}
                        mode="date"
                        minimumDate={new Date()}
                        optional
                      />
                    </>
                  )}

                  <Button
                    label="Review"
                    onPress={() => setStep("review")}
                    disabled={!canAdvanceToReview()}
                    fullWidth
                    size="lg"
                  />
                </>
              )}

              {/* Step 3: Review */}
              {step === "review" && goalType && (
                <>
                  <View style={{
                    backgroundColor: "#fff", borderRadius: 20,
                    borderWidth: 1, borderColor: COLORS.border, padding: 20,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <Text style={{ fontSize: 28 }}>{GOAL_META[goalType].icon}</Text>
                      <Text style={{ fontSize: 17, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                        {goalName || GOAL_META[goalType].label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22, marginBottom: 14 }}>
                      {review.summary}
                    </Text>
                    {review.details.map((d, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 7, flexShrink: 0 }} />
                        <Text style={{ fontSize: 13, color: COLORS.ink, flex: 1, lineHeight: 20 }}>{d}</Text>
                      </View>
                    ))}
                  </View>

                  <Button
                    label="Save goal"
                    onPress={handleSave}
                    loading={saving}
                    fullWidth
                    size="lg"
                  />
                  <Pressable onPress={() => setStep("details")} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Go back and edit</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── StashScreen ─────────────────────────────────────────────────────────────

export default function StashScreen() {
  const router = useRouter();
  const { user, profile, isPremium, loadProfile } = useAuthStore();
  const [entries,       setEntries]       = useState<StashEntry[]>([]);
  const [goals,         setGoals]         = useState<StashGoal[]>([]);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editEntry,     setEditEntry]     = useState<StashEntry | null>(null);
  const [showGoal,      setShowGoal]      = useState(false);
  const [editGoal,      setEditGoal]      = useState<StashGoal | null>(null);
  const [mythDismissed, setMythDismissed] = useState(false);
  const [renameModal,   setRenameModal]   = useState<{ id: string; name: string } | null>(null);
  const [renamingText,  setRenamingText]  = useState("");
  const [renameSaving,  setRenameSaving]  = useState(false);
  const renameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(MYTH_DISMISSED_KEY).then((v) => {
      if (v === "true") setMythDismissed(true);
    });
  }, []);

  const dismissMyth = async () => {
    setMythDismissed(true);
    await AsyncStorage.setItem(MYTH_DISMISSED_KEY, "true");
  };

  const handleEditDailyGoal = () => {
    const current = profile?.daily_goal_oz ? String(profile.daily_goal_oz) : "";
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Daily goal",
        "How many ounces per day are you aiming for?",
        async (text) => {
          const oz = parseFloat(text);
          if (!isNaN(oz) && oz > 0 && profile?.id) {
            await supabase.auth.getSession();
            const { data, error } = await supabase.from("profiles").update({ daily_goal_oz: oz }).eq("id", profile.id).select();
            if (error || !data?.length) {
              Alert.alert("Could not save", error?.message ?? "Your session may have expired. Please sign out and sign back in.");
            } else {
              await loadProfile();
            }
          }
        },
        "plain-text",
        current,
        "numeric"
      );
    } else {
      const presets = [10, 15, 20, 25, 30, 35];
      Alert.alert(
        "Daily goal",
        "Select your daily ounce goal:",
        [
          ...presets.map((oz) => ({
            text: `${oz} oz`,
            onPress: async () => {
              if (profile?.id) {
                await supabase.auth.getSession();
                const { data, error } = await supabase.from("profiles").update({ daily_goal_oz: oz }).eq("id", profile.id).select();
                if (error || !data?.length) {
                  Alert.alert("Could not save", error?.message ?? "Your session may have expired. Please sign out and sign back in.");
                } else {
                  await loadProfile();
                }
              }
            },
          })),
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const loadEntries = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("stash_entries")
      .select("*")
      .eq("user_id", user.id)
      .is("used_at", null)
      .is("discarded_at", null)
      .order("expressed_at", { ascending: true });
    if (data) setEntries(data as StashEntry[]);
  }, [user]);

  const loadGoals = useCallback(async () => {
    if (!user || !isPremium) return;
    const { data } = await supabase
      .from("stash_goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (data) setGoals(data as StashGoal[]);
  }, [user, isPremium]);

  useEffect(() => { loadEntries(); loadGoals(); }, [loadEntries, loadGoals]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadEntries(), loadGoals()]);
    setRefreshing(false);
  };

  const markUsed = async (id: string) => {
    await supabase.from("stash_entries").update({ used_at: new Date().toISOString() }).eq("id", id);
    loadEntries();
  };

  const discardEntry = async (id: string) => {
    Alert.alert("Discard this bag?", "It will be removed from your stash.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: async () => {
        await supabase.from("stash_entries").update({ discarded_at: new Date().toISOString() }).eq("id", id);
        loadEntries();
      }},
    ]);
  };

  const deleteEntry = async (id: string) => {
    Alert.alert("Delete entry?", "This will permanently remove this entry from your records.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await supabase.from("stash_entries").delete().eq("id", id);
        loadEntries();
      }},
    ]);
  };

  const deleteGoal = async (id: string) => {
    Alert.alert("Remove this goal?", "You can create a new one at any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await supabase.from("stash_goals").update({ is_active: false }).eq("id", id);
        loadGoals();
      }},
    ]);
  };

  const moveGoal = async (id: string, direction: "up" | "down") => {
    const idx = goals.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= goals.length) return;
    const currentOrder = goals[idx].sort_order;
    const swapOrder    = goals[swapIdx].sort_order;
    await Promise.all([
      supabase.from("stash_goals").update({ sort_order: swapOrder }).eq("id", id),
      supabase.from("stash_goals").update({ sort_order: currentOrder }).eq("id", goals[swapIdx].id),
    ]);
    loadGoals();
  };

  const renameGoal = (id: string, currentName: string) => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Rename goal",
        "Enter a new name for this goal",
        async (text) => {
          if (text.trim()) {
            await supabase.from("stash_goals").update({ goal_name: text.trim() }).eq("id", id);
            loadGoals();
          }
        },
        "plain-text",
        currentName
      );
    } else {
      setRenamingText(currentName);
      setRenameModal({ id, name: currentName });
      setTimeout(() => renameInputRef.current?.focus(), 100);
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameModal || !renamingText.trim()) return;
    setRenameSaving(true);
    await supabase.from("stash_goals").update({ goal_name: renamingText.trim() }).eq("id", renameModal.id);
    setRenameSaving(false);
    setRenameModal(null);
    loadGoals();
  };

  const totalOz      = entries.reduce((s, e) => s + e.oz, 0);
  const alertCount   = entries.filter(e => expiryTier(e) !== "fresh").length;
  const expiredCount = entries.filter(e => expiryTier(e) === "expired").length;

  const daysOfStash = profile?.daily_goal_oz && profile.daily_goal_oz > 0
    ? (totalOz / profile.daily_goal_oz)
    : null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const recentOz     = entries.filter(e => e.expressed_at >= sevenDaysAgo).reduce((s, e) => s + e.oz, 0);
  const avgDailyOz   = recentOz / 7;

  // Priority allocation: each goal gets the remaining oz after higher-priority goals claim their target
  let remainingForAlloc = totalOz;
  const goalAllocations = goals.map((goal) => {
    const allocated = remainingForAlloc;
    const claimed   = Math.max(0, computeTargetOz(goal, avgDailyOz) ?? 0);
    remainingForAlloc = Math.max(0, remainingForAlloc - claimed);
    return allocated;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      {showAdd && (
        <StashEntryModal onClose={() => setShowAdd(false)} onSaved={loadEntries} />
      )}
      {editEntry && (
        <StashEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={loadEntries} />
      )}
      {showGoal && (
        <CreateGoalModal
          onClose={() => setShowGoal(false)}
          onSaved={loadGoals}
          avgDailyOz={avgDailyOz}
          currentStashOz={totalOz}
        />
      )}
      {editGoal && (
        <CreateGoalModal
          onClose={() => setEditGoal(null)}
          onSaved={loadGoals}
          avgDailyOz={avgDailyOz}
          currentStashOz={totalOz}
          existingGoal={editGoal}
        />
      )}

      {/* Rename modal (Android) */}
      <Modal
        visible={!!renameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModal(null)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 32 }}
            onPress={() => setRenameModal(null)}
          >
            <Pressable onPress={() => {}} style={{ width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 24 }}>
              <Text style={{ fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 16 }}>
                Rename goal
              </Text>
              <TextInput
                ref={renameInputRef}
                value={renamingText}
                onChangeText={setRenamingText}
                style={{
                  borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 15, color: COLORS.ink, marginBottom: 20,
                }}
                returnKeyType="done"
                onSubmitEditing={handleRenameSubmit}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  onPress={() => setRenameModal(null)}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.muted }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleRenameSubmit}
                  disabled={renameSaving || !renamingText.trim()}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: COLORS.primary, opacity: renameSaving ? 0.7 : 1 }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>
                    {renameSaving ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Header */}
      <View style={{ overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
      <LinearGradient
        colors={["#2E3F40", "#4A5E60"]}
        style={{ paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Stash</Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
              Your milk inventory
            </Text>
          </View>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
            }}
            accessibilityRole="button"
            accessibilityLabel="Add stash entry"
          >
            <Text style={{ fontSize: 22, color: "#fff", lineHeight: 26, marginTop: -1 }}>+</Text>
          </Pressable>
        </View>
      </LinearGradient>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary — intentionally card-free, numbers breathe directly on background */}
        <View style={{ paddingTop: 24, paddingBottom: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: SERIF, fontSize: 48, color: COLORS.ink, lineHeight: 52, letterSpacing: -1 }}>
              {fmtOz(totalOz)}
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink3, marginTop: 3 }}>
              {entries.length} {entries.length === 1 ? "bag" : "bags"} in stash
            </Text>
          </View>

          <Pressable onPress={handleEditDailyGoal} style={{ alignItems: "flex-end", paddingBottom: 4 }}>
            {daysOfStash != null ? (
              <>
                <Text style={{ fontSize: 28, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.primary }}>
                  {daysOfStash.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 1 }}>
                  days · {profile!.daily_goal_oz} oz/day ›
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                  Set daily goal ›
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 1 }}>to see days of stash</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Thin divider */}
        <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: 20 }} />

        {/* Expiry alert */}
        {alertCount > 0 && (
          <View style={{
            backgroundColor: expiredCount > 0 ? "#FEF0EC" : "#FFF8EC",
            borderRadius: 14, borderWidth: 1,
            borderColor: expiredCount > 0 ? "#E05C2A55" : COLORS.amber + "55",
            padding: 14, marginBottom: 16,
            flexDirection: "row", alignItems: "center", gap: 10,
          }}>
            <Text style={{ fontSize: 20 }}>{expiredCount > 0 ? "🚨" : "⚠️"}</Text>
            <Text style={{ flex: 1, fontSize: 13, color: COLORS.ink, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
              {expiredCount > 0
                ? `${expiredCount} ${expiredCount === 1 ? "bag has" : "bags have"} expired`
                : `${alertCount} ${alertCount === 1 ? "bag is" : "bags are"} expiring soon`}
            </Text>
          </View>
        )}

        {/* Premium goal cards */}
        {isPremium && (
          <View style={{ marginBottom: 20 }}>
            {goals.length > 0 ? (
              <>
                <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                  Goals
                </Text>
                {goals.map((g, idx) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    allocatedOz={goalAllocations[idx] ?? totalOz}
                    totalStashOz={totalOz}
                    avgDailyOz={avgDailyOz}
                    priority={idx + 1}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < goals.length - 1}
                    onMoveUp={() => moveGoal(g.id, "up")}
                    onMoveDown={() => moveGoal(g.id, "down")}
                    onDelete={() => deleteGoal(g.id)}
                    onEdit={() => setEditGoal(g)}
                  />
                ))}
                <Button
                  label="+ Add another goal"
                  onPress={() => setShowGoal(true)}
                  fullWidth
                />
              </>
            ) : (
              <Pressable
                onPress={() => setShowGoal(true)}
                style={{
                  backgroundColor: COLORS.primaryMist,
                  borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + "30",
                  padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
                }}
              >
                <Text style={{ fontSize: 22 }}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary, marginBottom: 2 }}>
                    Smart Stash Planner
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.ink2 }}>
                    Set a goal and track your progress
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: COLORS.primary }}>›</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Myth-busting card (dismissible) */}
        {!mythDismissed && (
          <View style={{
            backgroundColor: "#FFF8F0", borderRadius: 16, borderWidth: 1,
            borderColor: "#F0DEC8", padding: 16, marginBottom: 16,
            flexDirection: "row", alignItems: "flex-start", gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6 }}>
                About that freezer stash
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                Social media makes you think you need a freezer full of milk. Most moms do not. Everyone has different goals, but many moms do not need more than a few extra bags. Focus on your goal, not the highlight reel.
              </Text>
            </View>
            <Pressable
              onPress={dismissMyth}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={{ fontSize: 16, color: COLORS.ink3 }}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Entry list */}
        {entries.length === 0 ? (
          <View style={{
            backgroundColor: "#fff", borderRadius: 16, borderWidth: 1,
            borderColor: COLORS.border, padding: 32, alignItems: "center",
          }}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>🍼</Text>
            <Text style={{ fontSize: 15, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink, marginBottom: 6 }}>
              Your stash is empty
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2, textAlign: "center" }}>
              Tap the + button above to log your first bag.
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Oldest first
            </Text>
            <View>
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => setEditEntry(entry)}
                  onUsed={() => markUsed(entry.id)}
                  onDiscard={() => discardEntry(entry.id)}
                  onDelete={() => deleteEntry(entry.id)}
                />
              ))}
            </View>
          </>
        )}
        {/* Premium teaser — free users only */}
        {!isPremium && (
          <Pressable
            onPress={() => router.push("/paywall" as any)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#f0f5f6" : "#fff",
              borderRadius: 16, borderWidth: 1, borderColor: "#CBDBE0",
              padding: 18, marginTop: 8, marginBottom: 8,
              flexDirection: "row", alignItems: "flex-start", gap: 14,
            })}
          >
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: COLORS.primaryMist, alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Text style={{ fontSize: 16 }}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 6, lineHeight: 20 }}>
                Want to plan ahead?
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                Pump Coach Premium includes smart stash goals for returning to work, trips, and more, with personalized math based on your pumping data.
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary, marginTop: 10 }}>
                See Premium →
              </Text>
            </View>
          </Pressable>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
