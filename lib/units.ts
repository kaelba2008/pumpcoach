import AsyncStorage from "@react-native-async-storage/async-storage";

export type UnitPref = "oz" | "ml";
export const UNIT_PREF_KEY = "unit_preference";
export const OZ_TO_ML = 29.5735;

export function ozToMl(oz: number): number {
  return Math.round(oz * OZ_TO_ML);
}

export function mlToOz(ml: number): number {
  return Math.round((ml / OZ_TO_ML) * 100) / 100;
}

export async function getUnitPref(): Promise<UnitPref> {
  const val = await AsyncStorage.getItem(UNIT_PREF_KEY);
  return (val === "ml") ? "ml" : "oz";
}

export async function setUnitPref(unit: UnitPref): Promise<void> {
  await AsyncStorage.setItem(UNIT_PREF_KEY, unit);
}

/** Display a stored oz value in the user's preferred unit */
export function formatUnit(oz: number | null | undefined, unit: UnitPref): string {
  if (oz == null) return unit === "ml" ? "0 ml" : "0 oz";
  if (unit === "ml") return `${ozToMl(oz)} ml`;
  const n = oz % 1 === 0 ? oz.toFixed(0) : oz.toFixed(2).replace(/\.?0+$/, "");
  return `${n} oz`;
}

/** Parse a user-entered value (in their unit) back to oz for storage */
export function parseToOz(str: string, unit: UnitPref): number {
  const n = parseFloat(str) || 0;
  return unit === "ml" ? mlToOz(n) : n;
}
