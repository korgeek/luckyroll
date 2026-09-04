# Track Visuals, Camera, and Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the modular race a thick protected-channel appearance, lit marbles, intuitive recoverable camera controls, and visual editor tiles without changing track collision geometry.

**Architecture:** Reuse the canonical `profileAt()` surface and existing Three.js scene. Pure camera math stays in `cameraControls.ts`; DOM pointer wiring stays in `MarbleRaceScene.ts`; editor SVGs derive from `portsFor()`; render-only shell and rim styling stay in existing modular render files.

**Tech Stack:** React 19, TypeScript, Three.js, Rapier, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-09-04-track-visuals-camera-editor-design.md`

## Global Constraints

- Do not change `profileAt()`, modular path samples, Rapier colliders, launch behavior, or race forces.
- Add no dependency, texture, external model, custom GLSL, API, or database.
- Preserve keyboard access, accessible grid-cell names, 5×8 storage/codec compatibility, and offline operation.
- Leave `.codex-remote-attachments/` and every unrelated user-owned change untouched.
- Spend the approved official 100-marble × 10-seed budget only after focused tests, lint, product tests, and build pass.

---

### Task 1: Visual editor tiles (Luna)

**Files:**
- Create: `src/react-app/components/TrackCellDiagram.tsx`
- Modify: `src/react-app/components/TrackEditor.tsx`
- Modify: `src/react-app/App.css`
- Test: `src/react-app/components/TrackEditor.test.tsx`

**Interfaces:**
- Consumes: `portsFor(cell: TrackCell): readonly Direction[]`.
- Produces: `TrackCellDiagram({ cell }: { cell: Exclude<TrackCell, null> }): JSX.Element` with SVG path endpoints marked by `data-port="north|east|south|west"`.

- [ ] **Step 1: Write the failing editor test**

Render the default track, assert the curve cell exposes north/east SVG port markers, rotate it, assert east/south markers, and assert occupied cells no longer display `CUR`, `STR`, or degree text. Keep the existing accessible label assertions.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `npx vitest run src/react-app/components/TrackEditor.test.tsx --exclude ".worktrees/**"`

- [ ] **Step 3: Implement the minimal diagram**

Use one `viewBox="0 0 100 100"` SVG. Map ports to edge points `{north:[50,0], east:[100,50], south:[50,100], west:[0,50]}`. Draw a straight line when ports oppose and a quadratic path through `[50,50]` when adjacent. Add only a small center glyph for funnel, wave, pinwheel, booster, and bumper; retain `START`, `FINISH`, and `+` text.

- [ ] **Step 4: Pass the focused test**

Run: `npx vitest run src/react-app/components/TrackEditor.test.tsx --exclude ".worktrees/**"`

- [ ] **Step 5: Commit**

Commit message: `feat: draw track editor connections`

---

### Task 2: Camera interaction and lit marbles (Luna)

**Files:**
- Modify: `src/react-app/game/cameraControls.ts`
- Modify: `src/react-app/game/cameraControls.test.ts`
- Modify: `src/react-app/game/cameraPlan.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

**Interfaces:**
- Extend `CameraControls` with `panX: number` and `panY: number`.
- Produce `applyPan(controls, deltaX, deltaY)`, `relaxControls(controls, amount)`, and `isCameraAtRest(controls)` as pure functions.
- `writeControlledTrackFollowShot()` applies pan to both `position` and `lookAt` after orbit/zoom.

- [ ] **Step 1: Write failing pure-control tests**

Assert pan offsets are bounded, zoom remains `0.72..1.35`, and `relaxControls(changed, 1)` equals `initialCameraControls`.

- [ ] **Step 2: Run the focused control tests and observe failure**

Run: `npx vitest run src/react-app/game/cameraControls.test.ts src/react-app/game/cameraPlan.test.ts --exclude ".worktrees/**"`

- [ ] **Step 3: Implement pure camera math**

Keep the existing yaw/pitch/zoom clamps. Clamp pan to a usable finite range and linearly move all five offsets toward `{ yaw:0, pitch:0, zoom:1, panX:0, panY:0 }`.

- [ ] **Step 4: Add failing lifecycle coverage**

Assert the canvas registers and removes `contextmenu`; right-drag changes the controlled view; two simultaneous pointer positions feed their distance delta to `applyZoom`; and controls begin returning after 3,000 ms of no input.

- [ ] **Step 5: Wire native Pointer Events**

Track active pointer coordinates in one `Map<number, {x:number;y:number}>`. One pointer or left drag calls `applyDrag`; right drag calls `applyPan`; two pointers call `applyZoom` from the change in their separation. Prevent the canvas context menu. Store `lastCameraInputAt`; in the animation loop call `relaxControls` after 3,000 ms, immediately when reduced motion is active. Remove every added event listener on teardown.

- [ ] **Step 6: Replace marble batch materials**

Use `THREE.MeshStandardMaterial({ color: batch.color, roughness: 0.28, metalness: 0.18 })` in the existing instanced color batches. Do not change marble geometry, body creation, colors, or batch mapping.

- [ ] **Step 7: Pass camera and lifecycle tests**

Run: `npx vitest run src/react-app/game/cameraControls.test.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts --exclude ".worktrees/**"`

- [ ] **Step 8: Commit**

Commit message: `feat: add recoverable race camera controls`

---

### Task 3: Thick shell and hazard rims (Terra)

**Files:**
- Modify: `src/react-app/game/track/obstacleGeometry.ts`
- Modify: `src/react-app/game/track/obstacleGeometry.test.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.test.ts`

**Interfaces:**
- `buildTrackShell(track)` remains render-only and returns its measured `thickness`.
- `createModularTrackRender()` keeps all existing object names and device APIs.

- [ ] **Step 1: Write failing render tests**

Assert the shell is at least `1.2` world units deep, channel and shell use `MeshStandardMaterial` with metal-like and concrete-like parameters respectively, rim instances alternate yellow and near-black through instance colors, and the modular surface position buffer is still the exact `built.geometry.positions` object.

- [ ] **Step 2: Run focused geometry/render tests and observe failure**

Run: `npx vitest run src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/modular/modularTrackRender.test.ts --exclude ".worktrees/**"`

- [ ] **Step 3: Implement render-only depth and materials**

Increase only `buildTrackShell()`'s downward visual extrusion from `0.7` to `1.2`. Use a rough, low-metalness concrete shell and a smoother dark metal channel. Set alternating `#ffd21f` and `#111319` instance colors on existing rim segments; rename no public object and create no texture.

- [ ] **Step 4: Prove physics inputs did not change**

Run: `npx vitest run src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/modular/modularTrackBuild.test.ts --exclude ".worktrees/**"`

- [ ] **Step 5: Pass focused render tests**

Run: `npx vitest run src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/modular/modularTrackRender.test.ts --exclude ".worktrees/**"`

- [ ] **Step 6: Commit**

Commit message: `feat: style modular track as a protected channel`

---

### Task 4: Sol review, local qualification, and delivery

**Files:**
- Modify only if review finds a requirement defect in Task 1–3 files.
- Modify: `src/react-app/game/modular/modularTrackPhysics.validation.test.ts`
- Create: `.superpowers/sdd/2026-09-04-track-visuals-camera-editor/physics-run-ledger.md`

- [ ] **Step 1: Review each implementation against the spec**

Reject changes that alter `profileAt()`, Rapier collider generation, route data, launch forces, storage format, or accessible names.

- [ ] **Step 2: Run local static and product checks**

Run: `npm run lint`

Run: `npx vitest run --exclude ".worktrees/**" --exclude "**/modularTrackPhysics.validation.test.ts"`

Run: `npx tsc -b --pretty false`

Run: `npx vite build --config vite.config.ts`

- [ ] **Step 3: Prepare the separate approved ledger**

Create the new ledger with source commit set to the reviewed Task 1–3 `git rev-parse HEAD`, budget `0/10 consumed`, and pending rows for `11, 23, 37, 41, 53, 67, 71, 83, 97, 101`. Point only `ledgerPath` in `modularTrackPhysics.validation.test.ts` to the new file. Preserve the 2026-09-03 ledger unchanged. Commit message: `test: open approved modular qualification budget`.

- [ ] **Step 4: Run the newly approved official qualification exactly once**

Run:

```powershell
$env:RUN_MODULAR_TRACK_QUALIFICATION='1'; npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts; $qualificationExit=$LASTEXITCODE; Remove-Item Env:RUN_MODULAR_TRACK_QUALIFICATION; exit $qualificationExit
```

Capture all ten JSON result rows. Immediately replace only the new ledger's pending rows with the printed `recorded` results and set its budget to `10/10 consumed`; an error after stepping also consumes its seed. Do not rerun failed seeds.

- [ ] **Step 5: Inspect the built UI locally**

Run: `npx vite preview --config vite.config.ts --host 127.0.0.1`

Check the 5×8 editor diagrams, hazard rims, marble lighting, mouse right-drag, wheel zoom, touch pinch, and 3-second return at a desktop and narrow viewport.

- [ ] **Step 6: Commit qualification evidence or review fixes**

Commit message: `test: qualify track visual controls update`

- [ ] **Step 7: Clean worktrees and deliver**

Remove only worktrees created for this task after their commits are integrated. Confirm `main` contains the finished commits and no task worktree remains. Push `main` to `origin`; report GitHub success or the exact network failure.
