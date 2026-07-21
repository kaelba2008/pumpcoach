/**
 * Encouragement Notification Scheduler — Session 5 Part 6
 *
 * Manages daily encouraging push notifications using local scheduling.
 *
 * Architecture:
 *   • Notifications are LOCAL (no server push required).
 *   • On every app foreground, we:
 *       1. Cancel any pending encouraging notification for today
 *          (user already opened the app — skip it).
 *       2. Pick tomorrow's notification content from notifications_content.
 *       3. Schedule it at 9:30am local time.
 *   • Milestone notifications fire immediately when a threshold is crossed.
 *   • History is logged to user_notification_history so we avoid repeats.
 *
 * AsyncStorage keys:
 *   notification_encouragement_enabled  "true" | "false"
 *   notification_frequency              "daily" | "few" | "rarely" | "off"
 *   notification_last_scheduled_date    "YYYY-MM-DD"  (avoids double-scheduling)
 */

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// ── Constants ────────────────────────────────────────────────────────────────

const IDENTIFIER_PREFIX = "encourage_";
const TODAY_IDENTIFIER  = `${IDENTIFIER_PREFIX}today`;
const NEXT_IDENTIFIER   = `${IDENTIFIER_PREFIX}next`;

export const NOTIF_ENABLED_KEY   = "notification_encouragement_enabled";
export const NOTIF_FREQUENCY_KEY = "notification_frequency";
const LAST_SCHEDULED_KEY         = "notification_last_scheduled_date";

export type NotifFrequency = "daily" | "few" | "rarely" | "off";

const DELIVER_HOUR   = 9;
const DELIVER_MINUTE = 30;

// ── Frequency helpers ────────────────────────────────────────────────────────

function shouldSendToday(frequency: NotifFrequency, date: Date): boolean {
  if (frequency === "off")   return false;
  if (frequency === "daily") return true;
  const day = date.getDay(); // 0=Sun
  if (frequency === "few") {
    // Monday (1), Wednesday (3), Friday (5)
    return day === 1 || day === 3 || day === 5;
  }
  if (frequency === "rarely") {
    // Once per week — we deterministically pick Monday
    return day === 1;
  }
  return false;
}

// ── Category selection by baby age ───────────────────────────────────────────

function allowedCategories(babyAgeWeeks: number): string[] {
  const babyAgeDays = babyAgeWeeks * 7;
  if (babyAgeDays <= 7)  return ["affirmation"];
  if (babyAgeDays <= 30) return ["affirmation", "check_in"];
  return ["affirmation", "check_in", "milestone"];
}

// ── Android channel for encouraging notifications ────────────────────────────

export async function setupEncouragementChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("encouragement", {
    name:             "Encouraging Messages",
    importance:       Notifications.AndroidImportance.DEFAULT,
    sound:            "default",
    vibrationPattern: [0, 200],
  });
}

// ── Pick a notification from DB ──────────────────────────────────────────────

interface NotifRow {
  id: string;
  body: string;
  category: string;
}

async function pickNotification(
  userId: string,
  babyAgeWeeks: number,
): Promise<NotifRow | null> {
  const categories = allowedCategories(babyAgeWeeks);

  // Fetch IDs shown in the last 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const { data: recentHistory } = await supabase
    .from("user_notification_history")
    .select("notification_id")
    .eq("user_id", userId)
    .gt("sent_at", cutoff.toISOString())
    .not("notification_id", "is", null);

  const recentIds = new Set<string>(
    (recentHistory ?? []).map((r: { notification_id: string }) => r.notification_id)
  );

  // Fetch eligible notifications
  const { data: pool } = await supabase
    .from("notifications_content")
    .select("id, body, category")
    .in("category", categories)
    .eq("is_active", true);

  const eligible = (pool ?? []).filter(
    (n: NotifRow) => !recentIds.has(n.id)
  );

  if (!eligible.length) {
    // All have been shown recently — pick any from the pool
    if (!pool?.length) return null;
    return pool[Math.floor(Math.random() * pool.length)] as NotifRow;
  }

  return eligible[Math.floor(Math.random() * eligible.length)] as NotifRow;
}

// ── Log a sent notification ──────────────────────────────────────────────────

async function logNotification(
  userId: string,
  notificationId: string,
): Promise<void> {
  await supabase.from("user_notification_history").insert({
    user_id:         userId,
    notification_id: notificationId,
  });
}

// ── Schedule next encouraging notification ────────────────────────────────────

export async function scheduleNextEncouragingNotification(
  userId: string,
  babyAgeWeeks: number,
): Promise<void> {
  const [enabledRaw, frequencyRaw, lastScheduledRaw] = await Promise.all([
    AsyncStorage.getItem(NOTIF_ENABLED_KEY),
    AsyncStorage.getItem(NOTIF_FREQUENCY_KEY),
    AsyncStorage.getItem(LAST_SCHEDULED_KEY),
  ]);

  const enabled   = enabledRaw !== "false"; // default on
  const frequency = (frequencyRaw ?? "daily") as NotifFrequency;

  if (!enabled || frequency === "off") {
    // Cancel any pending encouraging notification
    await cancelEncouragingNotifications();
    return;
  }

  // Check permission
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  // Find the next qualifying delivery date (starting tomorrow)
  const now = new Date();
  let deliveryDate = new Date(now);
  deliveryDate.setDate(deliveryDate.getDate() + 1);
  deliveryDate.setHours(DELIVER_HOUR, DELIVER_MINUTE, 0, 0);

  // Advance until we hit a qualifying day (max 7 iterations)
  for (let i = 0; i < 7; i++) {
    if (shouldSendToday(frequency, deliveryDate)) break;
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }

  const deliveryDateStr = deliveryDate.toISOString().slice(0, 10);

  // Don't double-schedule the same date
  if (lastScheduledRaw === deliveryDateStr) return;

  // Pick content
  const notif = await pickNotification(userId, babyAgeWeeks);
  if (!notif) return;

  // Cancel the previous next notification
  await Notifications.cancelScheduledNotificationAsync(NEXT_IDENTIFIER).catch(() => {});

  // Schedule
  await Notifications.scheduleNotificationAsync({
    identifier: NEXT_IDENTIFIER,
    content: {
      title: "Pump Coach",
      body:  notif.body,
      sound: true,
      data:  { notificationId: notif.id, type: "encouragement" },
      ...(Platform.OS === "android" && { channelId: "encouragement" }),
    },
    trigger: {
      type:  Notifications.SchedulableTriggerInputTypes.DATE,
      date:  deliveryDate,
    },
  });

  // Log it to history now (we optimistically record it at schedule time)
  await logNotification(userId, notif.id);
  await AsyncStorage.setItem(LAST_SCHEDULED_KEY, deliveryDateStr);
}

/**
 * Call this on every app foreground.
 * Cancels today's pending notification (user is in the app — don't send)
 * and re-schedules for the next qualifying day.
 */
export async function onAppForeground(
  userId: string,
  babyAgeWeeks: number,
): Promise<void> {
  // Cancel today's notification if it hasn't fired yet
  await Notifications.cancelScheduledNotificationAsync(TODAY_IDENTIFIER).catch(() => {});

  // Re-schedule for the next qualifying day
  await scheduleNextEncouragingNotification(userId, babyAgeWeeks).catch((err) =>
    console.warn("scheduleNextEncouragingNotification error:", err)
  );
}

export async function cancelEncouragingNotifications(): Promise<void> {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(TODAY_IDENTIFIER).catch(() => {}),
    Notifications.cancelScheduledNotificationAsync(NEXT_IDENTIFIER).catch(() => {}),
  ]);
}

// ── Milestone notifications ───────────────────────────────────────────────────

export type MilestoneKey =
  | "oz_100"
  | "oz_500"
  | "oz_1000"
  | "month_1"
  | "month_3"
  | "month_6";

const MILESTONE_MESSAGES: Record<MilestoneKey, string> = {
  oz_100:   "You just crossed 100 oz pumped. That is a lot of work and a lot of love.",
  oz_500:   "You just crossed 500 oz pumped. That number represents hundreds of sessions, missed sleep, and a body working super hard. You are a rock star.",
  oz_1000:  "1,000 oz pumped. You have given your baby something really meaningful. Celebrate this.",
  month_1:  "One month of pumping. That is an accomplishment that should not go unnoticed.",
  month_3:  "Three months postpartum. Your supply is more established than it has ever been.",
  month_6:  "Six months. Whatever comes next, you have given your baby something really meaningful.",
};

/**
 * Check whether any milestones have been newly crossed.
 * Call this when session data loads on the home screen.
 *
 * @param userId           Current user's ID
 * @param totalOz          Lifetime oz pumped
 * @param accountCreatedAt ISO date of account creation (used as proxy for logging start)
 */
export async function checkAndFireMilestones(
  userId: string,
  totalOz: number,
  accountCreatedAt: string,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const [enabledRaw] = await Promise.all([AsyncStorage.getItem(NOTIF_ENABLED_KEY)]);
  const enabled = enabledRaw !== "false";
  if (!enabled) return;

  // Fetch already-fired milestone keys for this user
  const { data: history } = await supabase
    .from("user_notification_history")
    .select("milestone_key")
    .eq("user_id", userId)
    .not("milestone_key", "is", null);

  const firedKeys = new Set<string>(
    (history ?? [])
      .map((r: { milestone_key: string | null }) => r.milestone_key)
      .filter(Boolean) as string[]
  );

  const now = new Date();
  const accountAge = (now.getTime() - new Date(accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24 * 30);

  // Determine which milestones have been crossed
  const toFire: MilestoneKey[] = [];

  if (totalOz >= 100  && !firedKeys.has("oz_100"))   toFire.push("oz_100");
  if (totalOz >= 500  && !firedKeys.has("oz_500"))   toFire.push("oz_500");
  if (totalOz >= 1000 && !firedKeys.has("oz_1000"))  toFire.push("oz_1000");
  if (accountAge >= 1 && !firedKeys.has("month_1"))  toFire.push("month_1");
  if (accountAge >= 3 && !firedKeys.has("month_3"))  toFire.push("month_3");
  if (accountAge >= 6 && !firedKeys.has("month_6"))  toFire.push("month_6");

  for (const key of toFire) {
    // Fire immediately (trigger: null = deliver immediately)
    await Notifications.scheduleNotificationAsync({
      identifier: `milestone_${key}`,
      content: {
        title: "Pump Coach",
        body:  MILESTONE_MESSAGES[key],
        sound: true,
        data:  { type: "milestone", milestoneKey: key },
        ...(Platform.OS === "android" && { channelId: "encouragement" }),
      },
      trigger: null, // immediate
    });

    // Log to history so we don't re-fire
    await supabase.from("user_notification_history").insert({
      user_id:      userId,
      notification_id: null, // milestone rows reference key, not a notifications_content row
      milestone_key: key,
    });
  }
}
