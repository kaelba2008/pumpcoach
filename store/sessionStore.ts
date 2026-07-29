import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActiveSession, LetdownQuality, SessionType } from "../types";

interface SessionState {
  active: ActiveSession | null;
  startSession: (type?: SessionType) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  updateOz: (side: "left" | "right", value: string) => void;
  updateNotes: (notes: string) => void;
  updatePainLevel: (level: number | null) => void;
  updateLetdown: (quality: LetdownQuality | null) => void;
  clearSession: () => void;
  getElapsedMs: () => number;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      active: null,

      startSession: (type = "pump") =>
        set({
          active: {
            startedAt:       new Date().toISOString(),
            left_oz:         "",
            right_oz:        "",
            notes:           "",
            pain_level:      null,
            letdown_quality: null,
            session_type:    type,
            isPaused:        false,
            pausedAt:        null,
            totalPausedMs:   0,
          },
        }),

      pauseSession: () =>
        set((s) => {
          if (!s.active || s.active.isPaused) return s;
          return { active: { ...s.active, isPaused: true, pausedAt: new Date() } };
        }),

      resumeSession: () =>
        set((s) => {
          if (!s.active || !s.active.isPaused || !s.active.pausedAt) return s;
          const pausedMs = Date.now() - new Date(s.active.pausedAt).getTime();
          return {
            active: {
              ...s.active,
              isPaused:      false,
              pausedAt:      null,
              totalPausedMs: s.active.totalPausedMs + pausedMs,
            },
          };
        }),

      updateOz: (side, value) =>
        set((s) => s.active ? { active: { ...s.active, [`${side}_oz`]: value } } : s),

      updateNotes: (notes) =>
        set((s) => s.active ? { active: { ...s.active, notes } } : s),

      updatePainLevel: (level) =>
        set((s) => s.active ? { active: { ...s.active, pain_level: level } } : s),

      updateLetdown: (quality) =>
        set((s) => s.active ? { active: { ...s.active, letdown_quality: quality } } : s),

      clearSession: () => set({ active: null }),

      getElapsedMs: () => {
        const { active } = get();
        if (!active) return 0;
        const now    = Date.now();
        // Dates come back from AsyncStorage as ISO strings — coerce them
        const start  = new Date(active.startedAt).getTime();
        const gross  = now - start;
        const paused = active.totalPausedMs +
          (active.isPaused && active.pausedAt
            ? now - new Date(active.pausedAt).getTime()
            : 0);
        return Math.max(0, gross - paused);
      },
    }),
    {
      name:    "pump-session",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the active session — actions are recreated by zustand
      partialize: (state) => ({ active: state.active }),
    }
  )
);
