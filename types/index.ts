export type SubscriptionTier = "free" | "premium" | "vip";
export type AccountType = "parent" | "professional";
export type PumpingContext =
  | "exclusive_pumping"
  | "equal_pumping_nursing"
  | "work_pumping"
  | "mostly_nursing"
  | "mostly_pumping"
  | "supply_building"
  | "triple_feeding"
  | "weaning"
  | "unspecified";
export type SessionType = "pump" | "hand_express" | "combo";
export type StashLocation = "fridge" | "freezer" | "deep_freezer" | "daycare" | "other";
export type ContainerType = "bag" | "bottle" | "tray" | "other";
export type ReminderMode = "standard" | "workday" | "overnight" | "travel";
export type LetdownQuality = "strong" | "normal" | "slow" | "none";
export type PumpMode = "massage" | "expression" | "combo";
export type RedFlagType = "pain" | "fever" | "mastitis" | "supply_concern" | "infant_concern" | "dehydration";
export type FlangeShape = "traditional" | "crater" | "pano" | "tapered" | "saucer";
export type FlangeMaterial = "plastic" | "silicone";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  pump_brand: string | null;
  pump_model: string | null;
  flange_size_mm: number | null;
  flange_size_mm_right: number | null;
  flange_size_mm_left: number | null;
  daily_goal_oz: number | null;
  return_to_work: string | null;
  pumping_context: PumpingContext | null;
  subscription_tier: SubscriptionTier;
  account_type: AccountType;
  timezone: string;
  onboarded_at: string | null;
  avatar_url: string | null;
  has_lactation_consultant: boolean | null;
  track_hydration: boolean;
  simple_mode: boolean;
  schedule_enabled: boolean;
  schedule_away_days: number[];
  created_at: string;
  updated_at: string;
}

export interface DailyHydration {
  id: string;
  user_id: string;
  date: string;
  glasses: number;
  created_at: string;
}

export interface PumpSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  left_oz: number | null;
  right_oz: number | null;
  total_oz: number | null;
  notes: string | null;
  session_type: SessionType;
  pain_level: number | null;
  letdown_quality: LetdownQuality | null;
  pump_name: string | null;
  baby_name: string | null;
  flange_size_mm: number | null;
  flange_size_mm_right: number | null;
  flange_size_mm_left: number | null;
  flange_shape: FlangeShape | null;
  flange_material: FlangeMaterial | null;
  suction_level: number | null;
  cycle_speed: number | null;
  pump_mode: PumpMode | null;
  massage_suction_level: number | null;
  massage_cycle_speed: number | null;
  massage_duration_sec: number | null;
  expression_suction_level: number | null;
  expression_cycle_speed: number | null;
  expression_duration_sec: number | null;
  time_to_letdown_sec: number | null;
  created_at: string;
}

export interface UserPump {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Baby {
  id: string;
  user_id: string;
  name: string;
  dob: string | null;
  created_at: string;
}

export interface StashEntry {
  id: string;
  user_id: string;
  expressed_at: string;
  oz: number;
  location: StashLocation;
  container_type: ContainerType | null;
  label: string | null;
  used_at: string | null;
  discarded_at: string | null;
  discard_reason: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  label: string | null;
  time_of_day: string;
  days_of_week: number[];
  mode: ReminderMode;
  enabled: boolean;
  snooze_minutes: number;
  created_at: string;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

export interface AiConversation {
  id: string;
  user_id: string;
  title: string | null;
  messages: AiMessage[];
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Active session (in-memory, saved to DB on finish)
export interface ActiveSession {
  startedAt: Date;
  left_oz: string;
  right_oz: string;
  notes: string;
  pain_level: number | null;
  letdown_quality: LetdownQuality | null;
  session_type: SessionType;
  isPaused: boolean;
  pausedAt: Date | null;
  totalPausedMs: number;
}

export interface DailySummary {
  date: string;
  total_oz: number;
  session_count: number;
  avg_oz_per_session: number;
}

// Flange Fit Analyzer — PumpCoach CARE Check
// CARE = Comfort · Alignment · Release · Emptying

// C — Comfort: what pumping feels like (multi-select)
export type ComfortScore =
  | "no_pain_gentle_tug"         // ideal: comfortable, gentle tug sensation
  | "nipple_pinching"            // too small: pinching at nipple base
  | "burning_stinging"           // too small: burning or stinging pain
  | "deep_breast_aching"         // too large: deep pulling or aching
  | "nipple_tip_soreness"        // too small: soreness at nipple tip
  | "blanching_after"            // too small: nipple turns white on removal
  | "nipple_ridged_creased";     // too small: compression marks after

// A — Alignment: how the nipple looks and behaves in the tunnel (single-select)
export type AlignmentScore =
  | "centered_light_touch"       // ideal: centered, sides lightly touch walls, slight back-and-forth
  | "too_much_space"             // too large: nipple doesn't reach the sides
  | "areola_pulled_in"           // too large: areola tissue entering the tunnel
  | "fills_entire_tunnel"        // too small: no space on sides, nipple wall-to-wall
  | "side_to_side_movement"      // too large: nipple thrashing sideways
  | "barely_moves";              // too small or suction issue: almost no nipple motion

// R — Release: how milk flows during pumping (single-select)
export type ReleaseScore =
  | "sprays_streams"             // ideal: milk sprays in multiple streams
  | "drips_slowly"               // possible fit or supply issue: milk drips, doesn't spray
  | "quick_letdown"              // good: let-down within ~2 minutes
  | "slow_or_no_letdown"         // possible fit or stress issue: delayed or absent let-down
  | "inconsistent_flow";         // possible fit issue: flow stops and starts unexpectedly

// E — Emptying: overall output and breast emptying (single-select)
export type EmptyingScore =
  | "satisfied_good_output"      // ideal: output meets expectations, breast empties well
  | "lower_than_expected"        // possible fit or supply concern
  | "breasts_feel_full_after"    // likely poor emptying — often too small
  | "output_has_declined"        // concerning trend — needs assessment
  | "not_sure_new_to_pumping";   // not enough data yet

export type StashGoalType    = "return_to_work" | "trip" | "pump_until_done" | "custom";
export type PumpingWhileAway = "yes" | "no" | "some";

export interface StashGoal {
  id:                  string;
  user_id:             string;
  goal_type:           StashGoalType;
  goal_name:           string;
  target_oz:           number | null;
  target_date:         string | null;   // ISO date string YYYY-MM-DD
  work_days_per_week:  number | null;
  baby_oz_per_day:     number | null;
  trip_days:           number | null;
  pumping_while_away:  PumpingWhileAway | null;
  is_active:           boolean;
  is_completed:        boolean;
  sort_order:          number;
  created_at:          string;
  updated_at:          string;
}

export type NursingFeel = "went_well" | "struggled" | "not_sure";
export type NursingSide = "left" | "right" | "both";

export interface NursingSession {
  id: string;
  user_id: string;
  nursed_at: string;
  duration_min: number | null;
  side: NursingSide | null;
  feel: NursingFeel;
  notes: string | null;
  created_at: string;
}

export type FlangeSide = "both" | "right" | "left";

export interface FlangeFitInput {
  side: FlangeSide | null;
  current_size_mm_right: number | null;
  current_size_mm_left: number | null;
  pump_brand: string;
  flange_style: "regular" | "insert" | null;
  nipple_diameter_mm_right: number | null;
  nipple_diameter_mm_left: number | null;
  // CARE scores
  comfort_scores: ComfortScore[];
  alignment_score: AlignmentScore | null;
  release_score: ReleaseScore | null;
  emptying_score: EmptyingScore | null;
  session_duration_min: number | null;
}

export interface FlangeFitResult {
  assessment: "likely_too_small" | "likely_too_large" | "likely_good_fit" | "unclear";
  recommended_size_mm_right: number | null;
  recommended_size_mm_left: number | null;
  confidence: "high" | "medium" | "low";
  // CARE breakdown
  care_c: string;
  care_a: string;
  care_r: string;
  care_e: string;
  explanation: string;
  tips: string[];
  see_ibclc: boolean;
}

export interface Invitation {
  id: string;
  owner_id: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  viewer_role: "partner" | "ibclc";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

export interface ViewerAccount {
  id: string;
  owner_id: string;
  viewer_id: string;
  viewer_email: string | null;
  viewer_role: "partner" | "ibclc";
  label: string | null;
  created_at: string;
}
