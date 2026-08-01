# Pump Coach v1.0.1 Roadmap

Collected from tester + user feedback during the 1.0 launch push (July 30, 2026).

## Features

- [ ] **Hydration ↔ output correlation** — add hydration line to the output
      trend chart so moms can see how water intake tracks with production.
- [ ] **Realistic cycle-speed ranges per pump** — cycle is not universally
      1–12. Spectra uses values like 36 / 46 / 50 / 54; some pumps have no
      cycle setting at all. Consider per-pump setting definitions (the
      user_pumps table could carry a settings schema per model), free-text
      entry, or brand presets.
- [ ] **MomCozy app integration** — client-requested. Investigate whether
      MomCozy exposes an API or Bluetooth data that could import session
      data automatically.
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
