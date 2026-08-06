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
): DayType {
  if (!scheduleEnabled) return null;
  const days = scheduleAwayDays ?? [];
  if (days.length === 0) return null;
  return days.includes(date.getDay()) ? "away" : "home";
}

export function dayTypeForISO(
  scheduleEnabled: boolean | null | undefined,
  scheduleAwayDays: number[] | null | undefined,
  iso: string,
): DayType {
  return dayTypeForDate(scheduleEnabled, scheduleAwayDays, new Date(iso));
}
