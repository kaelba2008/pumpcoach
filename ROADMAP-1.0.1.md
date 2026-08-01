# Pump Coach v1.0.1 Roadmap

Collected from tester + user feedback during the 1.0 launch push (July 30, 2026).

## Insights & Analytics Redesign (flagged Aug 1, 2026 — needs a real focused session, not a launch-day patch)

**The brief, in Katie's words** (this should be the north star for every decision
in this section, not just a UX nice-to-have): "I just really want this app to
be non-anxiety inducing and actually help the mom understand what's going on
and how to adapt her sessions and catch issues. It needs to be very
encouraging... I need the information to be consistent." This traces directly
back to why she became an IBCLC and built The Breastfeeding Mama the way she
did — evidence-based, but never clinical-distance, never guilt. The existing
`NO_GUILT_INSTRUCTION` in `supabase/functions/generate-insight/index.ts`
already gestures at this; the problem is the surrounding system doesn't
consistently deliver on it.

- [ ] **Unify the "oz/hr" metric — it currently means two different things.**
      Home screen (`components/SessionAnalysis.tsx` `ozPerHour`) divides
      *today's total ounces so far* by a flat 24 hours regardless of time of
      day or session count — structurally guaranteed to look low most of the
      day (e.g. 0.17 oz/hr), which is actively anxiety-inducing since it's
      not measuring pumping performance at all, just how much of the day has
      elapsed. Viewer dashboard / mom's own session analysis (already fixed
      once for a duration_sec:0 bug) computes actual ounces ÷ actual pumping
      hours — a real "rate while pumping" metric, and reads much higher
      (e.g. 9 oz/hr). Both are internally consistent by their own definition,
      but showing both as unqualified "oz/hr" guarantees confusion. Need to
      pick ONE definition, use it everywhere, and label it honestly (e.g.
      distinguish "today's pace" from "output while pumping").
- [ ] **Insight contradictions across screens — no cross-pattern consistency
      check.** Katie saw "your output has dropped 25%... triple feeding
      takes an enormous toll" on one screen and "stay the course, what
      you're doing is working" on the Supply page, simultaneously. Confirmed
      her test accounts' `pumping_context` is NOT set to triple_feeding
      (one is `work_pumping`, one `unspecified`), and `insight_cache` has
      zero rows for either — so the exact generation path for that specific
      message wasn't pinned down. Architecturally, though, the risk is real
      regardless: `lib/patternDetection.ts` runs several independent pattern
      detectors (declining_output_trend, stay_the_course, etc.), each of
      which can fire and get AI-elaborated via
      `supabase/functions/generate-insight` and cached in `insight_cache`
      independently, with nothing checking whether two simultaneously-shown
      insights actually agree with each other. Needs either a single
      insight-selection step that picks one coherent story to tell across
      the app, or explicit suppression rules between contradictory patterns.
- [ ] **Re-evaluate the session quality score's value.** Katie's read: it
      doesn't give much real insight. Not a pure cosmetic removal though —
      `analysis.efficiency` thresholds (`components/SessionAnalysis.tsx`)
      feed the recommendation engine, so reworking/removing the score means
      auditing what else depends on it.
- [ ] **Audit `insight_templates` content against the encouragement/no-guilt
      brief above.** The system prompt already has good bones (see
      `NO_GUILT_INSTRUCTION`), but the actual template rows (clinical
      context, tone, forbidden phrases, example outputs) haven't been
      reviewed end-to-end by Katie herself for whether they land the way she
      wants. Worth a dedicated pass once things are calm.
      NOTE (Aug 1, 2026): Katie asked separately whether insights should be
      "generated with AI, with strict parameters" — this already exists and
      is already live (`supabase/functions/generate-insight/index.ts` calls
      Claude constrained to each template's clinical_context/tone/forbidden
      phrases, with the template's example_output as a hard style anchor and
      a static fallback if the output violates the forbidden-phrase list or
      comes back too short). The gap isn't the AI layer — it's whether the
      template rows themselves (whoever wrote clinical_context/tone/example
      per pattern) actually reflect Katie's voice and the encouraging brief.
      This audit item IS that work; no new AI infrastructure needed.

## Features

- [ ] **Hydration ↔ output correlation** — add hydration line to the output
      trend chart so moms can see how water intake tracks with production.
- [ ] **Realistic cycle-speed ranges per pump** — cycle is not universally
      1–12. Spectra uses values like 36 / 46 / 50 / 54; some pumps have no
      cycle setting at all. Consider per-pump setting definitions (the
      user_pumps table could carry a settings schema per model), free-text
      entry, or brand presets.
- [ ] **MomCozy app integration** — client-requested. Researched (Aug 2026):
      no viable path today. Checked MomCozy, Willow, and Elvie's App Store
      listings directly — none integrate with Apple HealthKit or expose any
      export/sync capability, and HealthKit's only lactation-related type
      (`HKCategoryTypeIdentifierLactation`) is a yes/no daily flag with no
      volume/duration/timestamp fields anyway, so it wouldn't help even if
      one did write to it. This needs a business-development ask (a real
      data-sharing partnership with MomCozy) — not an engineering solution
      on its own. Side note: Willow's own app already has native Apple
      Watch control, useful competitive context for the Watch item below.
- [ ] **iOS Live Activities** — lock-screen/Dynamic Island live timer for
      an in-progress pumping session (deferred from 1.0: requires native
      widget extension, new build, review).
- [ ] **Apple Watch integration** — companion watchOS app/complication for
      starting, tracking, and ending a session from the wrist, plus a
      glanceable today's-output complication. Big feature: needs a native
      watchOS target, a new build, and App Store review — not a JS-only
      change like most of this list.
- [ ] **Average split by nursing** — break the daily/weekly averages into
      "with nursing" vs "without nursing" so combo feeders see honest
      numbers.
- [ ] **Weaning mode** — guided session-dropping plan; big feature, needs
      IBCLC-driven spec from Katie.
- [ ] **Simple mode toggle** — a tester stopped tracking entirely because
      the numbers/analytics were causing anxiety. Add a Profile setting
      that hides Session Insights, quality score, and trend/efficiency
      stats everywhere they appear (home, session detail, Coach tab),
      leaving just the core log: time, output, notes.

## Cleanups deferred from 1.0

- [ ] Delete the stray "Premium Annual" subscription group in App Store
      Connect (unused duplicate; the live annual is
      com.thebreastfeedingmama.pumpcoach.annual in the PumpCoach Premium
      group).
- [ ] Consider a real invite web page at pumpcoach.app/invite that
      redirects to the app (current flow uses paste-in invite codes).
- [ ] Verify 7-day free trial intro offers exist on the App Store
      subscriptions (paywall promises them).
