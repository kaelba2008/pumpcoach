export const COLORS = {
  // Brand — Slate (primary), Powder (secondary)
  primary:      "#4A5E60",   // Slate — buttons, key UI
  primaryLight: "#6B8083",   // lighter Slate
  primaryMist:  "#E5EFF3",   // light Powder wash

  // Accent tones — from The Breastfeeding Mama palette
  mauve:        "#A5818E",   // Mauve
  mauveLight:   "#CEC5CC",   // Blush
  mauveDark:    "#5A7274",   // dark Slate-teal

  // Support palette
  sage:         "#7A754B",   // Olive
  amber:        "#875A38",   // Terracotta (warm warning)
  error:        "#C0544A",   // warm red

  // Backgrounds
  cream:        "#FDF6EE",   // Cream
  creamDeep:    "#F3ECE4",   // Bone
  surface:      "#FFFFFF",
  muted:        "#F3ECE4",   // Bone
  border:       "#E8DDD4",   // warm bone border

  // Text
  ink:          "#442E1D",   // Espresso
  ink2:         "#7A5C44",   // medium Espresso
  ink3:         "#B09880",   // light warm tan

  // Extended palette — charts, illustrations, secondary states
  peach:        "#EEA890",
  terracotta:   "#875A38",
  mustard:      "#E2C374",
  blush:        "#CEC5CC",
  powder:       "#CBDBE0",
  olive:        "#7A754B",
  butter:       "#DFDBA9",
  espresso:     "#442E1D",
} as const;

// Gradient pairs — use with expo-linear-gradient
export const GRADIENTS = {
  slate:     ["#4A5E60", "#6B8083"] as const,
  slateDeep: ["#2E3F40", "#4A5E60"] as const,
  // Aliases so existing screens continue to work
  plum:      ["#4A5E60", "#6B8083"] as const,
  plumRich:  ["#2E3F40", "#4A5E60"] as const,
  warm:      ["#FDF6EE", "#F3ECE4"] as const,
  mauve:     ["#E5EFF3", "#FDF6EE"] as const,
  tip:       ["#FFFDF8", "#FDF6EE"] as const,
  card:      ["#FDF6EE", "#F3ECE4"] as const,
} as const;

// Typography
export const SERIF         = "Fraunces_500Medium";   // display / wordmark
export const SANS          = "Nunito_400Regular";     // body / UI
export const SANS_SEMIBOLD = "Nunito_600SemiBold";
export const SANS_BOLD     = "Nunito_700Bold";
export const SANS_EXTRABOLD = "Nunito_800ExtraBold";

// CDC / ABM milk storage guidelines
export const MILK_EXPIRY_HOURS: Record<string, number> = {
  fridge:       4 * 24,         // 4 days
  freezer:      12 * 30 * 24,   // 12 months (6 months ideal, 12 acceptable)
  deep_freezer: 12 * 30 * 24,   // 12 months
  daycare:      4 * 24,
  other:        4 * 24,
};
export const EXPIRY_WARNING_HOURS = 72;

// Sessions shorter than this are almost certainly a mis-tap or test log, not
// a real pumping session — excluded from oz/hr-style rate calculations so a
// 20-30 second stray entry can't extrapolate into an absurd hourly figure.
export const MIN_MEANINGFUL_SESSION_SEC = 120;

// Every oz-denominated numeric column (profiles.daily_goal_oz,
// pump_sessions.total_oz/left_oz/right_oz, stash_entries.oz,
// stash_goals.baby_oz_per_day) is NUMERIC(5,2) — Postgres throws a raw
// "numeric field overflow" error above this, which free-text inputs must
// reject client-side with a real message instead of surfacing that.
export const MAX_OZ_NUMERIC = 999.99;

export const SESSION_QUICK_PROMPTS = [
  "Why did my output dip today?",
  "Can I drop a session?",
  "How much stash do I need?",
  "Is my schedule hurting my supply?",
  "Why does pumping hurt?",
  "How do I build a freezer stash fast?",
  "When should I pump at work?",
];

export const RED_FLAG_KEYWORDS = [
  "fever", "mastitis", "plugged duct", "blood", "not feeding",
  "weight loss", "dehydration", "abscess", "severe pain",
  "won't latch", "not gaining", "jaundice",
];

export const LETDOWN_OPTIONS = [
  { value: "strong", label: "Strong",  emoji: "💪" },
  { value: "normal", label: "Normal",  emoji: "✓"  },
  { value: "slow",   label: "Slow",    emoji: "🐢" },
  { value: "none",   label: "None",    emoji: "✗"  },
] as const;

export const STASH_LOCATIONS = [
  { value: "fridge",       label: "Fridge",       emoji: "🥶" },
  { value: "freezer",      label: "Freezer",      emoji: "🧊" },
  { value: "deep_freezer", label: "Deep Freezer", emoji: "❄️" },
  { value: "daycare",      label: "Daycare",      emoji: "🏫" },
  { value: "other",        label: "Other",        emoji: "📦" },
] as const;

export const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Full flange size range (mm) — 9 through 35
export const FLANGE_SIZES_MM = Array.from({ length: 27 }, (_, i) => i + 9); // [9, 10, ..., 35]

// PumpCoach CARE Check label maps — Comfort · Alignment · Release · Emptying

export const CARE_C_LABELS: Record<string, string> = {
  no_pain_gentle_tug:    "Comfortable — nothing or a gentle tug",
  nipple_pinching:       "Pinching at the nipple base",
  burning_stinging:      "Burning or stinging pain",
  deep_breast_aching:    "Deep pulling or aching in the breast",
  nipple_tip_soreness:   "Soreness at the nipple tip",
  blanching_after:       "Nipple turns white after removing flange",
  nipple_ridged_creased: "Nipple looks ridged or creased after",
};

export const CARE_A_LABELS: Record<string, string> = {
  centered_light_touch:  "Centered — sides lightly touch walls, slight back-and-forth",
  too_much_space:        "Lots of space — nipple doesn't reach the sides",
  areola_pulled_in:      "Areola tissue is being pulled into the tunnel",
  fills_entire_tunnel:   "Nipple fills the whole tunnel wall-to-wall",
  side_to_side_movement: "Nipple moves side-to-side excessively",
  barely_moves:          "Nipple barely moves — almost no motion",
};

export const CARE_R_LABELS: Record<string, string> = {
  sprays_streams:        "Milk sprays in streams",
  drips_slowly:          "Milk drips rather than sprays",
  quick_letdown:         "Let-down happens quickly (within ~2 min)",
  slow_or_no_letdown:    "Let-down is slow or doesn't happen",
  inconsistent_flow:     "Flow stops and starts unexpectedly",
};

// Legal URLs — used in paywall, sign-up, and profile
export const PRIVACY_POLICY_URL   = "https://www.thebreastfeedingmama.com/privacy-policy";
export const TERMS_OF_SERVICE_URL = "https://www.thebreastfeedingmama.com/terms-and-conditions-of-use";

export const TBM_CONSULT_URL = "https://www.thebreastfeedingmama.com/virtual-consultations";

export const CARE_E_LABELS: Record<string, string> = {
  satisfied_good_output:     "Satisfied — breast empties well, output meets expectations",
  lower_than_expected:       "Output seems lower than expected",
  breasts_feel_full_after:   "Breasts still feel full after a complete session",
  output_has_declined:       "Output has been declining over time",
  not_sure_new_to_pumping:   "Not sure — I'm new to pumping",
};
