/**
 * Return to Work Planner -- guided checklist.
 * Static, phase-appropriate action items. Dependency-free (no import of
 * types/index.ts) to match lib/schedule.ts / lib/returnToWork.ts's
 * existing convention. Only completion state (a key array on the profile)
 * is user data -- the items themselves live here as code.
 */

import { ReturnToWorkPhase } from "./returnToWork";

export interface ChecklistItem {
  key: string;
  phase: ReturnToWorkPhase;
  label: string;
  linksTo?: "stash_goal" | "weekly_schedule";
}

const PHASE_ORDER: ReturnToWorkPhase[] = ["far_out", "adjusting", "final_week", "returned"];

export const RETURN_TO_WORK_CHECKLIST: ChecklistItem[] = [
  { key: "introduce_bottle",  phase: "far_out",    label: "Introduce a bottle, if baby isn't used to one yet" },
  { key: "start_stash",       phase: "far_out",    label: "Start building your stash", linksTo: "stash_goal" },
  { key: "pumping_plan",      phase: "adjusting",  label: "Make a plan for pumping at work", linksTo: "weekly_schedule" },
  { key: "consult_ibclc",     phase: "adjusting",  label: "Book a return-to-work consult with your IBCLC" },
  { key: "talk_to_employer",  phase: "adjusting",  label: "Talk to your employer about pump breaks and space" },
  { key: "trial_run",         phase: "final_week", label: "Do a trial run of your work-day pumping schedule" },
  { key: "pack_bag",          phase: "final_week", label: "Pack your pump bag and check your storage plan" },
  { key: "confirm_caregiver", phase: "final_week", label: "Confirm your caregiver's bottle-feeding plan" },
];

/** Items "due" as of the given phase -- everything up through the current
 *  phase, so a mom who sets her date late (skipping far_out) still sees
 *  earlier items instead of losing them. */
export function checklistForPhase(phase: ReturnToWorkPhase | null): ChecklistItem[] {
  if (!phase) return [];
  const cutoff = PHASE_ORDER.indexOf(phase);
  return RETURN_TO_WORK_CHECKLIST.filter((item) => PHASE_ORDER.indexOf(item.phase) <= cutoff);
}
