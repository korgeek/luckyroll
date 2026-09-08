# Race Broadcast and Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Give wheel and pinball action broadcast coverage, start only after a ready countdown, and strengthen the final pinball combination.

**Architecture:** Extend existing cameraPlan helpers and scene lifecycle; keep native CSS overlays and Rapier colliders. Derive features from the selected route, not hard-coded default cell numbers.

**Tech Stack:** Existing React, Three.js, Rapier, Vitest. No new dependencies.

**Spec:** User-approved requirements recorded below (conversation is the design source).

## Global Constraints

- English game UI; preserve existing bird view, manual controls, reduced motion, pause, replay, and Back menu.
- Keep 100 marbles and all channel interfaces unchanged.
- Wheel holds from first entry until 81 distinct marbles pass; races with fewer marbles release when all remaining marbles clear. Exclude DNF from pending traffic.
- Bumper holds from first entry until all live marbles clear; smooth transitions back to automatic tracking. One visit per feature per run.
- Preparation precedes a three-second 3, 2, 1 countdown; GO starts movement. No race time or physics advance during countdown.
- Final bumper restitution 0.65; default cell 36 booster before cell 37 bumper. Other default geometry is preserved.
- Return-assist booster reverses backward motion only after a swept entry, with a short recharge; ordinary boosters retain one-shot forward behavior.
- Existing checkout/main and incremental pushes are the user's selected workflow. Preserve attachments and unrelated files.

### Task 1: Verified checkpoint

- [ ] Run `npm test -- --run` cleanly, including test-worker event-loop yield between heavy physics checks.
- [ ] Confirm build, lint, and `git diff --check`; stage only approved README, src/react-app and public/licenses changes.
- [ ] Commit and push this baseline before feature implementation.

### Task 2: Stronger pinball and return-assist

**Files:** `src/react-app/game/modular/moduleDevices.ts`, `modularTrackPhysics.ts`, their tests, and `src/react-app/designer/trackDesign.ts` / test.

**Interface:** Extend `BoosterTrigger` with a derived `returnAssist` flag when the next valid route step is bumper. Keep ordinary trigger API and serialized track schema unchanged.

- [ ] Add failing checks for collider restitution 0.65, default cell 36, and route-derived flag.
- [ ] Add physical checks: backward entry changes forward component to 18 while retaining perpendicular components; 45 fixed-step cooldown; ordinary wrong-way, consumed, lateral bypass and reset behavior remain intact.
- [ ] Implement return velocity as `v + forward * (18 - dot(v, forward))`, retaining existing speed cap 42 and per-marble/per-cell state.
- [ ] Run focused device/default tests plus actual 100-marble mixed course validation to 120 seconds.
- [ ] Review, commit, push.

### Task 3: Continuous follow and feature broadcast

**Files:** `src/react-app/game/cameraPlan.ts`, `cameraPlan.test.ts`, `MarbleRaceScene.ts`, relevant scene tests.

**Interfaces:** Reuse `CameraShot`, `TrackSample`, actual module sample metadata and `alongRouteDistance`; keep existing camera-control entry points.

- [ ] Add failing sparse-anchor continuity check around the current default straight midpoint (movement about 0.02 must not jump the camera about 5.8).
- [ ] Interpolate camera anchor at actual marble route distance minus existing six-unit trailing offset, including local up normalization.
- [ ] Add broadcast state checks: first entry, 80/81 boundary, duplicate recross, all-cleared small race, DNF, replay reset, multiple feature modules.
- [ ] Derive actual module bounds including wall height and fit whole module to FOV/aspect. Preserve user camera overrides.
- [ ] Replace frame-dependent camera interpolation with elapsed-time smoothing, e.g. `1 - Math.pow(1 - 0.042, deltaMs / (1000 / 60))`.
- [ ] Run camera and scene tests; visually check wheel/bumper in desktop and narrow portrait.
- [ ] Review, commit, push.

### Task 4: Ready countdown

**Files:** `src/react-app/App.tsx`, `App.css`, `App.test.tsx`, scene lifecycle files/tests if readiness needs an explicit event.

**Interface:** Scene reports real ready state after bodies exist; App owns countdown overlay and pause intent. Preserve native gate/pusher timing after GO.

- [ ] Add failing fake-timer checks for PREPARING RACE, 3/2/1 timing, GO, canceled preparation, pause menu during countdown, replay and unmount cleanup.
- [ ] Allow preparation overlay to paint before heavy scene construction. Start countdown only after actual scene readiness.
- [ ] Hold scene independently of user pause through countdown; release only after three seconds and no user pause. Disable BOOST while held.
- [ ] Run App/lifecycle tests, full suite, lint and build; visually check preparation and countdown.
- [ ] Review, commit, push.
