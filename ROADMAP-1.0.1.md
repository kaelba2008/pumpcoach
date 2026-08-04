# Pump Coach v1.0.1 Roadmap

Collected from tester + user feedback during the 1.0 launch push (July 30, 2026).

## Android entitlements outage (Aug 3-4, 2026) — resolved

Four stacked bugs, found and fixed in sequence overnight after Android
testers who previously had working access suddenly lost it, and no promo
code would grant premium:

- [x] `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` was empty in `.env` (present since
      it was first committed) — `Purchases.configure()` silently no-op'd on
      Android, so every entitlement check failed from the start. Native
      builds were unaffected (EAS's hosted env vars had the real key), but
      any `eas update` OTA shipped from this checkout baked in the blank
      one, bricking it for everyone already installed. Pulled the real key
      from EAS's production environment into `.env`.
- [x] `redeem-referral` recorded a code as "used" and always reported
      success to the app *before* confirming the RevenueCat grant call
      actually succeeded — a failed grant still permanently burned the
      code with no visible error and no entitlement. Reordered both the
      promo-code and referral-code paths to grant first, record usage only
      after that succeeds, and surface the real error otherwise.
- [x] RevenueCat's promotional-grant endpoint 404s ("subscriber was not
      found") for any `app_user_id` it has never seen before, which only
      happens once the client SDK calls `Purchases.logIn()` at least
      once — never true for Android accounts caught by the key bug above.
      `grantPromoDays()` now GETs the subscriber first (RevenueCat creates
      it as a side effect if missing) before granting.
- [x] `invalidateCustomerInfoCache()` was only ever called from the
      paywall's own in-app redemption success handler — every other check,
      including plain app-load, trusted RevenueCat's local SDK cache with
      no way to know about a grant that happened server-side out-of-band.
      Moved the invalidate into `refreshSubscription()` itself.
- [x] Secondary: Android-only startup race — `Purchases.configure()`
      returns void, not a Promise, and the following `logIn()` call could
      fire before native init finished, throwing "no singleton instance."
      `loginPurchases()` now retries with backoff (~3s worst-case budget).
- [x] OTA updates only checked for a new bundle on a true cold launch
      (`checkAutomatically: "ON_LOAD"`), which could sit unfetched a long
      time if someone kept the app backgrounded. Now also checks (fetch
      only, never force-reload) on every foreground.
- [x] Two separate invite-email code paths (`profile.tsx`, and a fully
      duplicated, never-migrated implementation in `snapshot.tsx`) were
      still sending a `pumpcoach.app/invite` link that has never worked —
      no page was ever built to serve that route. Both now send the
      working paste-in code instead.

Real accounts affected by the phantom-burn bug (codes marked used with no
actual grant) were individually identified and reset via direct DB query
against `promo_uses`/`profiles`, not a blanket fix — worth a periodic sweep
if more reports come in from testers who redeemed a code Aug 1-4 and never
saw premium.

## New insight: sudden sharp output drop (Aug 4, 2026)

- [x] **Check pump parts first, not buried in a list.** Added
      `sudden_output_drop` pattern (`lib/patternDetection.ts`) — a 30%+
      drop over just the last 2 days vs. the prior week, distinct from the
      existing gradual `declining_output_trend` (10%+ over a rolling
      5-day window) and higher priority than it. Based on a real client
      case: sudden drop + clogs, resolved by swapping pump parts. Insight
      copy leads directly with checking parts (names membranes, valves,
      duckbills) and flags a clogged duct + IBCLC contact if pain/a lump
      is also present.

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

- [x] **Unify the "oz/hr" metric — it currently means two different things.**
      DONE (Aug 1, 2026): home screen (`components/SessionAnalysis.tsx`)
      previously divided today's total ounces by a flat 24 hours regardless
      of time of day or session count, which looked artificially low most
      of the day (e.g. 0.17 oz/hr) and wasn't measuring pumping performance
      at all. Now both the home screen and viewer dashboard use the same
      definition (actual oz ÷ actual pumping hours) and the same label,
      "Output While Pumping." Also dropped the stale "~1 oz/hr" baseline
      caption, which was calibrated to the old, different-scale metric and
      would have read as nonsense next to the new number.
- [x] **Insight contradictions across screens — no cross-pattern consistency
      check.** DONE (Aug 1, 2026): root cause was two independent,
      never-reconciled trend algorithms — the insight engine
      (`lib/patternDetection.ts`) compared last 3-5 days vs the prior 5-day
      window at a 10% relative threshold, while the Supply page
      (`app/(tabs)/snapshot.tsx`) split the last 7 days in half and compared
      at a flat 0.3oz absolute threshold. They could (and did) disagree —
      e.g. "output dropped, needs attention" on one screen and "stay the
      course" on the other, at the same time. Extracted
      `computeSupplyTrend()` in `lib/patternDetection.ts` as the single
      shared definition (percentage-based — fairer across different
      baseline supply levels than a flat oz threshold) and pointed both the
      pattern-detection engine (declining_output_trend, output_trending_up)
      and the Supply page's guidance system at it, so they can no longer
      tell contradictory stories.
- [x] **Re-evaluate the session quality score's value.** DONE (Aug 1, 2026):
      removed both numeric scores — the home screen's blended 0-100
      "Session Quality" (`components/SessionAnalysis.tsx`) and the
      post-session circular gauge (`components/SessionInsightSheet.tsx`,
      via the now-deleted `components/ui/EfficiencyScore.tsx`). Turned out
      the actual recommendation/tips logic already used raw signals
      directly (pain, letdown, efficiency, trend), never the blended score
      — so removal was safe and isolated. Post-session sheet now leans on
      `getDeltaLabel()` alone (already a warm, self-referential, non-numeric
      comparison to the mom's own average — no changes needed, it was
      already doing this well). Home screen card now shows a one-line
      qualitative status ("Sessions are going well" / "A couple things
      worth a look") computed from the same flags that drive the Tips list
      below it, so the two can never disagree. The gap-aware, per-baby
      output baseline built earlier is preserved as one more signal feeding
      this status (and a new tip) rather than discarded.
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

- [x] **Hydration ↔ output correlation** — CORRECTED (Aug 1, 2026): this was
      wrongly listed as pending; it's already built. `app/(tabs)/index.tsx`
      overlays a dashed hydration line on the home screen output SparkLine
      (gated behind the `track_hydration` profile setting, toggled at
      Profile → "Track daily hydration"). Also already built and not
      previously tracked here: pump comparison
      (`app/tools/pump-compare.tsx`, Profile → My Pumps → "Compare pump
      performance," needs Premium + 2 saved pumps) and a "Peak output"
      best-time-of-day badge on the home screen chart.
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
