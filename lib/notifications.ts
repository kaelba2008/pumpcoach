import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Reminder } from "../types";

// ── Foreground handler ─────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

// ── Android channel ────────────────────────────────────────────────────────
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("pump-reminders", {
    name:       "Pump Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound:      "default",
    vibrationPattern: [0, 250, 250, 250],
  });
}

// ── Permissions ────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as "granted" | "denied" | "undetermined";
}

// ── Identifier helpers ─────────────────────────────────────────────────────
// Each reminder × day-of-week pair gets a stable identifier so we can
// cancel individual days without affecting others.
function idFor(reminderId: string, dayOfWeek: number): string {
  return `pump_reminder_${reminderId}_day_${dayOfWeek}`;
}

// ── Schedule / cancel ──────────────────────────────────────────────────────
export async function scheduleReminder(reminder: Reminder): Promise<void> {
  if (!reminder.enabled || reminder.days_of_week.length === 0) return;

  const [hourStr, minuteStr] = reminder.time_of_day.split(":");
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);

  await Promise.all(
    reminder.days_of_week.map((day) =>
      Notifications.scheduleNotificationAsync({
        identifier: idFor(reminder.id, day),
        content: {
          title:        reminder.label ?? "Time to pump 🍼",
          body:         "Your pump reminder is here. You've got this!",
          sound:        true,
          categoryIdentifier: "pump_reminder",
          ...(Platform.OS === "android" && { channelId: "pump-reminders" }),
        },
        trigger: {
          // Expo weekday: 1 = Sunday … 7 = Saturday
          // Our days_of_week: 0 = Sunday … 6 = Saturday
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: (day % 7) + 1,
          hour,
          minute,
        },
      })
    )
  );
}

export async function cancelReminder(reminderId: string): Promise<void> {
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map((day) =>
      Notifications.cancelScheduledNotificationAsync(idFor(reminderId, day))
        .catch(() => {}) // silently ignore if not scheduled
    )
  );
}

// Called after any bulk change — cancels all pump reminders and re-schedules
// all currently enabled ones.
export async function syncAllReminders(reminders: Reminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith("pump_reminder_"))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  await Promise.all(
    reminders.filter((r) => r.enabled).map(scheduleReminder)
  );
}

// ── Snooze ─────────────────────────────────────────────────────────────────
export async function scheduleSnooze(minutes: number, label: string | null): Promise<void> {
  // Cancel any pending snooze before setting a new one
  await Notifications.cancelScheduledNotificationAsync("pump_snooze").catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: "pump_snooze",
    content: {
      title: label ?? "Time to pump 🍼",
      body:  "Snooze time is up!",
      sound: true,
      ...(Platform.OS === "android" && { channelId: "pump-reminders" }),
    },
    trigger: {
      type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: minutes * 60,
    },
  });
}
