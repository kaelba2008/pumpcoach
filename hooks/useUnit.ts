import { useEffect, useState } from "react";
import { getUnitPref, setUnitPref, UnitPref } from "../lib/units";

export function useUnit() {
  const [unit, setUnitState] = useState<UnitPref>("oz");

  useEffect(() => {
    getUnitPref().then(setUnitState);
  }, []);

  const changeUnit = async (u: UnitPref) => {
    setUnitState(u);
    await setUnitPref(u);
  };

  return { unit, changeUnit };
}
