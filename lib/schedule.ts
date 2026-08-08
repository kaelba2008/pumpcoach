/**
 * Weekly Schedule -- day-type helper.
 * Single source of truth for "is this date a declared away day or a home
 * day," per the mom's Weekly Schedule setting. Every insight/pattern
 * integration point calls this rather than reimplementing the lookup.
 * Dependency-free (no import of types/index.ts) to match
 * lib/patternDetection.ts's existing convention.
 */

export type DayType = "away" | "home" | null;

/** null = feature is off / not configured -- callers must treat this as
 *  "no opinion" and behave exactly as if the feature didn't exist. */
export function dayTypeForDate(
  scheduleEnabled: boolean | null | undefined,
  scheduleAwayDays: number[] | null | undefined,
  date: Date,
  scheduleEffectiveDate?: string | null,
): DayType {
  if (!scheduleEnabled) return null;
  if (scheduleEffectiveDate && toLocalISODate(date) < scheduleEffectiveDate) return null;
  const days = scheduleAwayDays ?? [];
  if (days.length === 0) return null;
  return days.includes(date.getDay()) ? "away" : "home";
}

export function dayTypeForISO(
  scheduleEnabled: boolean | null | undefined,
  scheduleAwayDays: number[] | null | undefined,
  iso: string,
  scheduleEffectiveDate?: string | null,
): DayType {
  return dayTypeForDate(scheduleEnabled, scheduleAwayDays, new Date(iso), scheduleEffectiveDate);
}

/** Whether the schedule is "live" as of `today` -- enabled AND either no
 *  effective date set, or that date has arrived. For patterns that read
 *  scheduleEnabled/scheduleAwayDays directly instead of per-date. */
export function isScheduleEffective(
  scheduleEnabled: boolean | null | undefined,
  scheduleEffectiveDate: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!scheduleEnabled) return false;
  if (!scheduleEffectiveDate) return true;
  return toLocalISODate(today) >= scheduleEffectiveDate;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
