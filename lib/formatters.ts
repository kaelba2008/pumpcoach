import { format, formatDistanceToNow } from "date-fns";

// Gentle, neutral wording for the removal-rate trend indicator —
// deliberately "increasing/steady/decreasing," not "improving/declining."
// Removal rate going down isn't inherently bad (weaning, a lower-supply
// baby, etc.) so this stays descriptive, not a value judgment; same
// reasoning behind the muted color used wherever this is rendered.
export function removalRateTrendLabel(
  trend: { trend: "improving" | "stable" | "declining"; insufficientData: boolean },
): { arrow: string; text: string } | null {
  if (trend.insufficientData) return null;
  if (trend.trend === "improving") return { arrow: "↗", text: "Increasing over the last few days" };
  if (trend.trend === "declining") return { arrow: "↘", text: "Decreasing over the last few days" };
  return { arrow: "→", text: "Holding steady" };
}

export const fmtOz = (oz: number | null | undefined): string => {
  if (oz == null) return "—";
  return `${oz % 1 === 0 ? oz.toFixed(0) : oz.toFixed(1)} oz`;
};

export const fmtDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const fmtMs = (ms: number): string => fmtDuration(Math.floor(ms / 1000));

export const fmtDate = (iso: string): string => format(new Date(iso), "MMM d");

export const fmtDateTime = (iso: string): string =>
  format(new Date(iso), "MMM d 'at' h:mm a");

export const fmtTime = (iso: string): string => format(new Date(iso), "h:mm a");

export const fmtRelative = (iso: string): string =>
  formatDistanceToNow(new Date(iso), { addSuffix: true });

export const fmtTimeOfDay = (timeStr: string): string => {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return format(d, "h:mm a");
};

export const babyAgeWeeks = (dob: string | null): number | null => {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 7));
};

export const babyAgeLabel = (dob: string | null): string => {
  const weeks = babyAgeWeeks(dob);
  if (weeks == null) return "";
  if (weeks < 4) return `${weeks}w old`;
  const months = Math.floor(weeks / 4.33);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} old`;
  return `${Math.floor(months / 12)} years old`;
};
