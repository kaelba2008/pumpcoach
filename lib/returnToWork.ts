/**
 * Return to Work Planner -- phase helper.
 * Single source of truth for "what stage of the return-to-work runway is
 * this mom in," driven purely by profiles.return_to_work (a calendar date
 * she entered). Dependency-free (no import of types/index.ts) to match
 * lib/schedule.ts's existing convention.
 *
 * Deliberately orthogonal to lib/patternDetection.ts's baby-age-driven
 * "approaching drop window" logic (11-13 weeks) -- that fires for every mom
 * regardless of any date being set; this is anchored to her own declared
 * date, which may land nowhere near that window. Not cross-referenced.
 *
 * TODO(katie): review the phase copy below (headline/body) for tone before
 * shipping -- same treatment the insight_templates content needs. This is
 * placeholder copy, not final.
 */

import { differenceInDays } from "date-fns";

export type ReturnToWorkPhase = "far_out" | "adjusting" | "final_week" | "returned";

export interface ReturnToWorkPhaseInfo {
  phase: ReturnToWorkPhase;
  daysUntil: number;
  label: string;
  headline: string;
  body: string;
}

/** null = no return-to-work date set -- callers must treat this as
 *  "no opinion" and behave exactly as if the feature didn't exist. */
export function getReturnToWorkPhase(
  returnToWork: string | null | undefined,
  today: Date = new Date(),
): ReturnToWorkPhaseInfo | null {
  if (!returnToWork) return null;

  const daysUntil = differenceInDays(new Date(returnToWork), today);

  if (daysUntil > 56) {
    return {
      phase: "far_out",
      daysUntil,
      label: `${Math.round(daysUntil / 7)} weeks until return`,
      headline: "Plenty of time to build a buffer",
      body: "This is the easiest window to build toward a stash without pressure -- a session or two of extra output a week adds up. No need to rush.",
    };
  }

  if (daysUntil > 14) {
    return {
      phase: "adjusting",
      daysUntil,
      label: `${Math.round(daysUntil / 7)} weeks until return`,
      headline: "Good time to think about your work-day rhythm",
      body: "Consider sketching out what pumping will actually look like on a work day -- when, how often, and how that compares to what baby will need while you're away.",
    };
  }

  if (daysUntil >= 0) {
    return {
      phase: "final_week",
      daysUntil,
      label: daysUntil === 0 ? "Returning today" : `${daysUntil} day${daysUntil === 1 ? "" : "s"} until return`,
      headline: "Logistics week",
      body: "Pack your pump bag, double-check your storage plan for at work, and confirm your pumping breaks with your workplace if you haven't already.",
    };
  }

  const daysSince = Math.abs(daysUntil);
  return {
    phase: "returned",
    daysUntil,
    label: daysSince <= 1 ? "Returned to work" : `Returned ${Math.round(daysSince / 7) || 1} week${Math.round(daysSince / 7) === 1 ? "" : "s"} ago`,
    headline: "Settling into your new rhythm",
    body: "The first couple weeks back are an adjustment for everyone -- output and timing may shift while your body and schedule find a new normal. That's expected, not a problem to fix.",
  };
}

export function formatReturnToWorkCountdown(returnToWork: string | null | undefined, today: Date = new Date()): string {
  const info = getReturnToWorkPhase(returnToWork, today);
  return info?.label ?? "Not set";
}
