import { Baby } from "../types";

// First-added baby, used for single-baby-style UI (home greeting, hero
// card, notification scheduler, AI coach context). Falls back gracefully
// with an empty array (0-babies state).
export function primaryBaby(babies: Baby[]): Baby | null {
  return babies[0] ?? null;
}
