/**
 * App Store rating prompt utility for Pump Coach.
 *
 * Triggers (called from outside):
 *   - approaching_milestone insight fires  → maybeRequestRating()
 *   - output_trending_up insight fires     → maybeRequestRating()
 *   - User logs their 7th consecutive day  → maybeRequestRatingForStreak()
 *
 * Guards (all enforced internally):
 *   - Once per app session
 *   - At most every 60 days
 *   - At most 3 times per calendar year (counter resets each January)
 *   - Never after a negative/declining insight
 */

import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Storage keys (match spec exactly) ────────────────────────────────────────
const RATING_LAST_PROMPTED_KEY = "rating_last_prompted_at";
const RATING_PROMPT_COUNT_KEY  = "rating_prompt_count";
const RATING_PROMPT_YEAR_KEY   = "rating_prompt_year"; // for annual reset

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_DAYS_BETWEEN_PROMPTS = 60;
const MAX_PROMPTS_PER_YEAR     = 3;
const PROMPT_DELAY_MS          = 2000; // 2-second delay so the insight card settles first

// ── Session guard (in-memory, resets on app restart) ─────────────────────────
let hasPromptedThisSession = false;

// ── Positive patterns that may trigger the prompt ────────────────────────────
const TRIGGER_PATTERNS = new Set([
  "approaching_milestone",
  "output_trending_up",
]);

// ── Negative patterns that must never trigger the prompt ─────────────────────
const BLOCK_PATTERNS = new Set([
  "declining_output_trend",
]);

// ── Primary export — call this directly or via the wrappers below ─────────────

/**
 * Checks all guards and, if they pass, waits 2 seconds then requests a review.
 * Safe to call from anywhere; is a no-op when any guard blocks.
 */
export async function maybeRequestRating(): Promise<void> {
  if (hasPromptedThisSession) return;

  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) return;

  // ── Count guard (with annual reset) ─────────────────────────────────────────
  const now      = new Date();
  const thisYear = now.getFullYear();

  const [countStr, yearStr, lastPromptedStr] = await Promise.all([
    AsyncStorage.getItem(RATING_PROMPT_COUNT_KEY),
    AsyncStorage.getItem(RATING_PROMPT_YEAR_KEY),
    AsyncStorage.getItem(RATING_LAST_PROMPTED_KEY),
  ]);

  const storedYear = yearStr ? parseInt(yearStr, 10) : null;
  const count      = storedYear === thisYear ? parseInt(countStr ?? "0", 10) : 0;

  if (count >= MAX_PROMPTS_PER_YEAR) return;

  // ── Recency guard ─────────────────────────────────────────────────────────
  if (lastPromptedStr) {
    const daysSince =
      (now.getTime() - new Date(lastPromptedStr).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return;
  }

  // ── All guards passed — set session flag, wait, then prompt ──────────────
  hasPromptedThisSession = true;

  await new Promise<void>((resolve) => setTimeout(resolve, PROMPT_DELAY_MS));

  await StoreReview.requestReview();

  await Promise.all([
    AsyncStorage.setItem(RATING_LAST_PROMPTED_KEY, now.toISOString()),
    AsyncStorage.setItem(RATING_PROMPT_COUNT_KEY, String(count + 1)),
    AsyncStorage.setItem(RATING_PROMPT_YEAR_KEY, String(thisYear)),
  ]);
}

// ── Insight trigger wrapper ───────────────────────────────────────────────────

/**
 * Called from CoachCard after an insight card renders.
 * Filters to only positive trigger patterns and blocks negative ones.
 */
export async function maybeRequestRatingAfterInsight(
  patternName: string,
): Promise<void> {
  if (BLOCK_PATTERNS.has(patternName)) return;
  if (!TRIGGER_PATTERNS.has(patternName)) return;
  await maybeRequestRating();
}

// ── Streak trigger wrapper ────────────────────────────────────────────────────

/**
 * Called after a session saves successfully.
 * Pass the deduplicated list of "YYYY-MM-DD" strings for every day the user
 * has logged at least one session (most recent 30 days is sufficient).
 */
export async function maybeRequestRatingForStreak(
  loggedDays: string[],
): Promise<void> {
  if (hasSevenDayStreak(loggedDays)) {
    await maybeRequestRating();
  }
}

// ── Streak calculation ────────────────────────────────────────────────────────

/**
 * Returns true when the provided day strings contain a run of 7+ consecutive
 * calendar days. Sorts descending and walks back from the most recent day.
 */
function hasSevenDayStreak(days: string[]): boolean {
  if (days.length < 7) return false;

  const sorted = [...days].sort().reverse(); // most-recent first
  let streak   = 1;

  for (let i = 1; i < sorted.length; i++) {
    const msPerDay  = 1000 * 60 * 60 * 24;
    const prev      = new Date(sorted[i - 1]).getTime();
    const curr      = new Date(sorted[i]).getTime();
    const diffDays  = Math.round((prev - curr) / msPerDay);

    if (diffDays === 1) {
      streak++;
      if (streak >= 7) return true;
    } else {
      break; // gap in the streak — stop early
    }
  }

  return false;
}
