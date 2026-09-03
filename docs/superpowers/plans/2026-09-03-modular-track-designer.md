# Lucky Roll Modular Track Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-local 5×8 modular track library, editor, Base64URL sharing, seamless procedural Three.js/Rapier modules, and deterministic 100-marble custom-track racing without changing the existing built-in race.

**Architecture:** Keep the current continuous course as the default and add a separate modular-course builder behind one small race-course adapter consumed by `MarbleRaceScene`. Pure designer-domain modules own schema, route validation, codec, and `localStorage`; one canonical modular layout produces welded render/collider geometry and device descriptors. React owns menu/editor/import state, while the existing HUD, marble batching, results, camera, timeout, and lifecycle remain shared.

**Tech Stack:** TypeScript 5.9, React 19, Three.js 0.170, Rapier 3D compat 0.17, Vitest 3, Testing Library, Vite 7, Cloudflare static asset hosting.

**Spec:** `docs/superpowers/specs/2026-09-03-modular-track-designer-design.md`

## Global Constraints

- The application remains client-only after its bundle loads.
- Track persistence uses browser `localStorage`; there is no database, account, authentication, cloud backup, or synchronization.
- Track sharing uses a user-copied Base64URL token or a link whose URL hash contains that token.
- JavaScript, Rapier WASM, geometry, icons, sounds, fonts, and materials ship with the application. The client makes no runtime API, telemetry, analytics, CDN, font, or asset requests.
- Cloudflare remains only the static application host. Remove the unused Hono `/api/` route and disable unused observability; the browser does not call an application backend.
- Startup eagerly loads every locally bundled lazy chunk and runtime asset required by editing, racing, sharing, audio, and Rapier before the main menu reports Ready. After that point, those workflows continue to work with all network requests, including same-origin requests, blocked. Cold offline reload, PWA installation, and service-worker caching are not included.
- A shared link still requires access to the hosted app origin. The raw Base64URL token is the origin-independent offline transfer format.
- The board is exactly 5 columns by 8 rows; `cells` contains exactly 40 row-major entries.
- Cell `0` is the fixed start with an east-facing output. Cell `39` is the fixed finish with a west-facing input.
- Horizontal traversal may move left or right. Vertical traversal may move down to a larger row but never up to a smaller row.
- Empty cells are allowed, but every non-empty placed module belongs to one gap-free, unbranched start-to-finish route.
- Test Play, Share, and Save are disabled until the name, schema, and route are valid. Saved invalid drafts are a non-goal.
- Names are trimmed, contain 1 to 60 characters, contain no control characters, and may be duplicated. Local identity uses `crypto.randomUUID()`.
- Portable data contains only version, name, and cells. Physics tuning, obstacle dimensions, resolved travel directions, and render data are derived and never serialized.
- Reject any version other than exactly `1`, missing or extra fields, unknown module kinds or orientations, non-finite values, malformed names, wrong cell counts, and invalid routes.
- Marble diameter is `D = 0.68` world units; square module size is `S = 20`; clear channel width is `W = 12`; rail height is `4`; start bowl radius is `8.5`; timestep is `1/60` second.
- Build modules in board-local coordinates and apply one shared 20-degree world tilt toward increasing row numbers to both Three.js visuals and Rapier collider transforms.
- Every port has a `0.10S` straight landing, canonical cross-section, outward unit tangent, and zero longitudinal arc-length curvature vector at the seam.
- Connected static channel vertices are welded into one indexed board geometry; connected end faces are omitted; use identical topology/winding and Rapier `TriMeshFlags.FIX_INTERNAL_EDGES`.
- Longitudinal chord error is at most `0.02D`; longitudinal adjacent-triangle dihedral angle is at most 2 degrees.
- The editable catalog is exactly seven kinds: straight, 90-degree curve, gentle funnel straight, wave straight, pinwheel straight, booster straight, and diagonal bumper straight.
- The gentle funnel narrows internally to `max(0.80W, 6D)` and returns fully to `W` before the exit landing.
- Pinwheel radius is `0.28W`, arm thickness is `0.5D`, angular speed is `2` radians per second, and every phase retains at least `3D` open passage.
- Booster activation covers the full clear width and centered 20 percent of the module; forward speed becomes `min(1.20 × currentForwardSpeed, 18)` only when that is a positive delta.
- Each marble triggers each booster at most once per race; full and remaining-marble restarts clear the consumption matrix.
- Diagonal bumpers use three fixed rounded bars, `0.4D` to `0.5D` thick and `1.25D` to `1.5D` high, with at least `3D` passage and `2D` longitudinal opposing separation.
- Gravity, visible launcher, 20-degree grade, collisions, visible pinwheel, and boosters are the only energy sources. No hidden ranking force, continuous assist, random impulse, teleportation, or recovery force.
- The start launcher supplies eastward speed `8` world units per second.
- Keep the existing built-in track, 100-marble allocation, HUD, results, timeout, camera controls, and instanced marble rendering working.
- Do not add dependencies.
- All visible UI remains English and keyboard/touch accessible; color, motion, and sound are never the only information channel.
- Reduced motion uses a stable overview camera; Pause stops physics, pinwheel time, and race time together.
- The mobile target is median FPS at least 30 at `360×800`, measured for 30 seconds after a 5-second warm-up with 100 active marbles on the current development machine's Chromium browser.
- The modular qualification budget is a new ledger separate from the completed canonical-track ledger: seeds `11, 23, 37, 41, 53, 67, 71, 83, 97, 101`, each consumed at most once. Never rerun without user approval.
- Static/unit/single-marble seam tests do not consume the ten-run budget. A modular 100-marble world that begins stepping does.
- Sol owns planning, orchestration, coaching, review, acceptance interpretation, and final verification. Luna implements each approved slice. Terra is used only after a reproducible failure whose root cause remains unclear.
- Do not add or commit `.codex-remote-attachments/`.
- Database, application API, accounts, authentication, cloud backup or sync, real-time collaboration, remote runtime assets, analytics, compression, QR services, automatic track generation, custom per-track physics tuning, additional module kinds, saved invalid drafts, multi-tab synchronization, migration machinery beyond rejecting unknown versions, PWA/service worker, cold offline reload, and cross-browser bit-identical physics are non-goals.

---

## File Responsibility Map

### Designer domain

- `src/react-app/designer/trackDesign.ts` — schema types, constants, connector rotation, empty design, corrected 36-cell default serpentine, immutable cell edits, and course selection.
- `src/react-app/designer/trackDesign.testSupport.ts` — deterministic valid and worst-case track fixtures used only by tests/qualification.
- `src/react-app/designer/trackValidation.ts` — strict name/schema checks and the single authoritative directed-route traversal.
- `src/react-app/designer/trackValidation.test.ts` — endpoints, connectors, left/right/down travel, upward rejection, loops, gaps, and orphans.
- `src/react-app/designer/trackCodec.ts` — strict UTF-8 JSON/Base64URL token, hash, and full-URL codec.
- `src/react-app/designer/trackCodec.test.ts` — Unicode, alphabet, padding, size, version, type, field, and non-destructive decode cases.
- `src/react-app/designer/trackLibrary.ts` — one-key load, normalize, upsert, delete, reset, and persist-before-state operations.
- `src/react-app/designer/trackLibrary.test.ts` — duplicates, UUID identity, ordering, corrupt storage, quota denial, and delete failure.
- `src/react-app/designer/editorState.ts` — pure palette/place/rotate/replace/clear/name/dirty reducer.
- `src/react-app/designer/editorState.test.ts` — immutable editor transitions and fixed-cell protection.

### React UI

- `src/react-app/components/TrackEditor.tsx` — accessible 5×8 DOM grid, palette, long press, keyboard controls, validation summary, and disabled actions.
- `src/react-app/components/TrackEditor.test.tsx` — placement, distinct rotations, long-press cancellation, focus, announcements, and action gating.
- `src/react-app/components/TrackLibraryPanel.tsx` — newest-first custom-track list and New/Edit/Select/Play/Share/Delete/Import events.
- `src/react-app/components/TrackLibraryPanel.test.tsx` — duplicate-name identity and menu behavior.
- `src/react-app/components/ShareTrackDialog.tsx` — Web Share, clipboard, selectable URL/token fallback, and text import.
- `src/react-app/components/ShareTrackDialog.test.tsx` — native-share/clipboard rejection and import preservation.
- `src/react-app/components/SetupScreen.tsx` — retain player setup and host `TrackLibraryPanel`.
- `src/react-app/components/SetupScreen.test.tsx` — preserve current setup behavior and expose designer entry.
- `src/react-app/runtimeReady.ts` — eagerly import the race chunk and initialize Rapier before Ready.
- `src/react-app/runtimeReady.test.ts` — readiness ordering and rejection.
- `src/react-app/App.tsx` — loading/setup/editor/race/results state, local library persistence, hash import, selected course, errors, pause, and mute.
- `src/react-app/App.test.tsx` — built-in fallback, valid/invalid editor actions, share preview, storage failure, and runtime failure.
- `src/react-app/App.integration.test.tsx` — generated, saved, and shared custom selections enter the existing 100-marble HUD/results/restart/rematch lifecycle through the real App state machine and a non-stepping scene spy.
- `src/react-app/App.css` and `src/react-app/index.css` — board-first responsive layout, focus, contrast, touch targets, dialog, and reduced-motion styling.

### Modular Three.js/Rapier course

- `src/react-app/game/modular/modularTypes.ts` — sampled path, welded geometry, module-device, run, and validation result contracts.
- `src/react-app/game/modular/modulePath.ts` — exact port frames, quintic curve, funnel width, wave offset, adaptive longitudinal sampling, and 20-degree board transform.
- `src/react-app/game/modular/modulePath.test.ts` — landing joins, G2 vectors, funnel 80-percent waist, wave formula, chord error, and bounds.
- `src/react-app/game/modular/moduleGeometry.ts` — canonical U profile, welded indexed board buffers, normals, seam topology, and static geometry validator.
- `src/react-app/game/modular/moduleGeometry.test.ts` — shared port rows, no caps/duplicates/open edges, winding, profile match, and 2-degree normal bound.
- `src/react-app/game/modular/moduleDevices.ts` — canonical start, bumper, pinwheel, and booster descriptors resolved from route direction.
- `src/react-app/game/modular/moduleDevices.test.ts` — all fixed dimensions, landing exclusion, downstream mirroring, passage, and trigger intervals.
- `src/react-app/game/modular/modularTrackBuild.ts` — validate → resolve → sample → geometry → devices orchestration.
- `src/react-app/game/modular/modularTrackBuild.test.ts` — immutable canonical resource identity and invalid-build rejection.
- `src/react-app/game/modular/modularTrackRender.ts` — board surface/shell, shared materials, device meshes, direction markers, pose updates, and disposal.
- `src/react-app/game/modular/modularTrackRender.test.ts` — exact geometry buffers, names, neutral preview, instancing, pose parity, and one-time disposal.
- `src/react-app/game/modular/modularTrackPhysics.ts` — welded trimesh collider, fixed bumper primitives, start/pinwheel kinematics, launch, swept boosters, DNF detection, seam probe, and headless validation.
- `src/react-app/game/modular/modularTrackPhysics.test.ts` — flags, primitives, launcher, pinwheel, booster, seam probes, pause/reset/dispose, and deterministic focused runs.
- `src/react-app/game/modular/modularTrackPhysics.validation.test.ts` — guarded ten-seed 100-marble qualification only.
- `src/react-app/game/raceCourse.ts` — built-in and modular adapters with one scene-facing lifecycle.
- `src/react-app/game/raceCourse.test.ts` — built-in compatibility and modular adapter contracts.
- `src/react-app/game/MarbleRaceScene.ts` — consume a `RaceCourseSelection`, production pause/error/DNF events, and shared run lifecycle.
- `src/react-app/game/MarbleRaceScene.test.ts` — preserve existing tests and verify custom-course selection, pause, failure, and disposal.
- `src/react-app/game/track/obstacleGeometry.ts` — export the existing bowl generator for modular start reuse without changing built-in output.
- `src/react-app/game/track/trackPhysics.ts` — expose generic fixed-seed validation while retaining the legacy alias and existing course behavior.

### Hosting, documentation, and evidence

- `src/worker/index.ts` — retain a static-host fallback only; remove Hono/API behavior.
- `package.json` and `package-lock.json` — remove the now-unused `hono` dependency; add nothing.
- `wrangler.json` — retain static asset hosting and remove observability.
- `README.md` — local library/editor/share/offline behavior, controls, and checks.
- `.superpowers/sdd/2026-09-03-modular-track-designer/physics-run-ledger.md` — new immutable ten-run modular qualification ledger.
- `.superpowers/sdd/2026-09-03-modular-track-designer/acceptance.md` — browser, accessibility, offline, lifecycle, and performance evidence.

---

## Execution Protocol

Every task uses this gate:

1. **Sol dispatch:** Sol gives Luna only the current task, its interfaces, the approved spec, and the current reviewed commit.
2. **Luna RED/GREEN:** Luna writes the stated failing test, captures the expected failure, implements only the task, runs the focused command, and commits with the exact message.
3. **Sol review:** Sol checks the commit against this task and the spec, reruns the GREEN command, and either approves the next task or returns concrete findings.
4. **Terra exception:** Terra may be invoked only when the stated command produces a reproducible unexpected failure and Luna plus Sol cannot identify the root cause. Terra receives the failing command/output and returns diagnosis evidence; Luna makes the scoped correction and Sol re-verifies.

---

### Task 1: Track Schema, Immutable Edits, and Directed Route Validation

**Files:**
- Create: `src/react-app/designer/trackDesign.ts`
- Create: `src/react-app/designer/trackDesign.testSupport.ts`
- Create: `src/react-app/designer/trackValidation.ts`
- Create: `src/react-app/designer/trackValidation.test.ts`

**Interfaces:**
- Produces: `Direction`, `Rotation`, `ModuleKind`, `TrackCell`, `TrackDesign`, `SharedTrack`, `LocalTrack`, `TrackLibrary`, `RaceCourseSelection`.
- Produces: `createEmptyTrackDesign(name?: string): TrackDesign`, `createDefaultTrackDesign(name?: string): TrackDesign`, `portsFor(cell: TrackCell): readonly Direction[]`, `rotateEditableCell(cell: TrackCell): TrackCell`.
- Produces: `resolveRoute(cells: readonly TrackCell[]): RouteResult`, `validateTrackDesign(track: TrackDesign): DesignValidation`, `assertValidTrackDesign(track: TrackDesign): ValidRoute`.
- Produces for tests: `createValidTrackDesign(name?: string): TrackDesign`, `createWorstCaseTrackDesign(): TrackDesign`.

- [ ] **Step 1: Sol dispatches Task 1 to Luna**

Sol confirms the branch starts from the approved spec commit and that `.codex-remote-attachments/` remains untracked.

- [ ] **Step 2: Write the failing validator tests**

```ts
import { describe, expect, it } from "vitest";
import { createEmptyTrackDesign, type TrackCell } from "./trackDesign";
import { createValidTrackDesign } from "./trackDesign.testSupport";
import { resolveRoute, validateTrackDesign } from "./trackValidation";

describe("modular route validation", () => {
  it("accepts the corrected 36-cell default serpentine and visits every occupied cell", () => {
    const result = resolveRoute(createValidTrackDesign().cells);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.route.map((step) => step.cellIndex)).toEqual([
      0, 1, 2, 3, 4, 9, 8, 7, 6, 5,
      10, 11, 12, 13, 14, 19, 18, 17, 16, 15,
      20, 21, 22, 23, 24, 29, 28, 27, 26, 25,
      30, 35, 36, 37, 38, 39,
    ]);
  });

  it("rejects upward travel", () => {
    const valid = createValidTrackDesign();
    const cells = [...valid.cells] as TrackCell[];
    cells[7] = { kind: "curve", rotation: 0 };
    const failures = validateTrackDesign({ ...valid, cells }).failures;
    expect(failures.map((failure) => failure.code)).toContain("upward");
  });

  it("rejects an orphan module", () => {
    const valid = createValidTrackDesign();
    const cells = [...valid.cells] as TrackCell[];
    cells[31] = { kind: "straight", rotation: 0 };
    const failures = validateTrackDesign({ ...valid, cells }).failures;
    expect(failures.map((failure) => failure.code)).toContain("orphan");
  });

  it("keeps an empty new design invalid and its endpoints fixed", () => {
    const track = createEmptyTrackDesign("New Track");
    expect(track.cells[0]).toEqual({ kind: "start", rotation: 0 });
    expect(track.cells[39]).toEqual({ kind: "finish", rotation: 0 });
    expect(validateTrackDesign(track).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/designer/trackValidation.test.ts`

Expected: FAIL with module-resolution errors for `trackDesign`, `trackDesign.testSupport`, and `trackValidation`. This does not create a Rapier world.

- [ ] **Step 4: Implement the minimal schema and traversal**

```ts
export type Direction = "north" | "east" | "south" | "west";
export type Rotation = 0 | 1 | 2 | 3;
export type ModuleKind = "straight" | "curve" | "funnel" | "wave" | "pinwheel" | "booster" | "bumper";
export type TrackCell =
  | null
  | Readonly<{ kind: "start" | "finish"; rotation: 0 }>
  | Readonly<{ kind: ModuleKind; rotation: Rotation }>;
export type TrackDesign = Readonly<{ name: string; cells: readonly TrackCell[] }>;
export type SharedTrack = Readonly<{ version: 1; name: string; cells: readonly TrackCell[] }>;
export type LocalTrack = Readonly<{ id: string; name: string; cells: readonly TrackCell[]; updatedAt: number }>;
export type TrackLibrary = Readonly<{ version: 1; tracks: readonly LocalTrack[] }>;
export type RaceCourseSelection = Readonly<{ kind: "builtin" }> | Readonly<{ kind: "custom"; track: TrackDesign }>;

export const createEmptyTrackDesign = (name = ""): TrackDesign => {
  const cells: TrackCell[] = Array.from({ length: 40 }, () => null);
  cells[0] = Object.freeze({ kind: "start", rotation: 0 });
  cells[39] = Object.freeze({ kind: "finish", rotation: 0 });
  return Object.freeze({ name, cells: Object.freeze(cells) });
};

export const createDefaultTrackDesign = (name = "New Track"): TrackDesign => Object.freeze({
  name,
  cells: Object.freeze<TrackCell[]>([
    { kind: "start", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "curve", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "curve", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "straight", rotation: 1 }, null, null, null, null,
    { kind: "curve", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "finish", rotation: 0 },
  ]),
});

export const createValidTrackDesign = (name = "Valid Track"): TrackDesign => createDefaultTrackDesign(name);

export const createWorstCaseTrackDesign = (): TrackDesign => {
  const cells = [...createDefaultTrackDesign("Qualification Track").cells] as TrackCell[];
  for (const [index, kind] of [[1, "booster"], [2, "bumper"], [3, "bumper"], [6, "pinwheel"], [8, "wave"], [11, "bumper"], [12, "booster"], [16, "wave"], [18, "pinwheel"], [21, "booster"], [23, "bumper"], [26, "pinwheel"], [28, "wave"], [36, "bumper"], [38, "booster"]] as const) {
    cells[index] = Object.freeze({ kind, rotation: 0 });
  }
  return Object.freeze({ name: "Qualification Track", cells: Object.freeze(cells) });
};
```

Place `createDefaultTrackDesign` with the production schema in `trackDesign.ts`; place the two delegating/substitution fixtures in `trackDesign.testSupport.ts` and import the production function there. The proposed fully occupied eight-row snake cannot satisfy the approved endpoints: seven row reversals leave row 8 travelling east-to-west and therefore end at bottom-left, while the fixed finish is bottom-right and must be entered from the west. The default above is the minimal correction: rows 1–6 remain fully serpentine, row 7 keeps only the vertical continuation at column 1, and row 8 travels east through curve/straight/funnel/straight into the finish. `createWorstCaseTrackDesign` preserves that route while substituting every device kind for qualification.

Use this exact connector table and normalize straight-family rotations to `0 | 1`:

```ts
const ROTATED_PORTS: Readonly<Record<ModuleKind | "start" | "finish", readonly (readonly Direction[])[]>> = {
  start: [["east"]], finish: [["west"]],
  straight: [["west", "east"], ["north", "south"]],
  curve: [["north", "east"], ["east", "south"], ["south", "west"], ["west", "north"]],
  funnel: [["west", "east"], ["north", "south"]],
  wave: [["west", "east"], ["north", "south"]],
  pinwheel: [["west", "east"], ["north", "south"]],
  booster: [["west", "east"], ["north", "south"]],
  bumper: [["west", "east"], ["north", "south"]],
};
```

`resolveRoute` starts with `{ cellIndex: 0, exit: "east" }`, checks reciprocal entry, selects the only other port, rejects `north` exits, detects repeats, requires finish index `39` entered from west, and finally compares visited count with occupied count. Return:

```ts
export type RouteFailure = Readonly<{ code: "endpoint" | "off-board" | "gap" | "connector" | "upward" | "loop" | "branch" | "finish-entry" | "orphan"; cellIndex: number; message: string }>;
export type RouteStep = Readonly<{ cellIndex: number; entry?: Direction; exit?: Direction }>;
export type ValidRoute = Readonly<{ ok: true; route: readonly RouteStep[]; directionByCell: ReadonlyMap<number, Direction> }>;
export type RouteResult = ValidRoute | Readonly<{ ok: false; failures: readonly RouteFailure[] }>;
export type DesignValidation = Readonly<{ ok: boolean; failures: readonly RouteFailure[] }>;
```

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/designer/trackValidation.test.ts`

Expected: PASS for valid route, empty design, fixed endpoints, gaps, mismatches, left/right/down motion, upward exit, loop, wrong finish entry, and orphan cases.

```bash
git add src/react-app/designer/trackDesign.ts src/react-app/designer/trackDesign.testSupport.ts src/react-app/designer/trackValidation.ts src/react-app/designer/trackValidation.test.ts
git commit -m "feat: validate modular track designs"
```

- [ ] **Step 6: Sol review gate**

Sol reruns the GREEN command, confirms both 36-cell fixtures resolve in the exact listed order, confirms cells 31–34 are the only empty cells in the corrected default, confirms no three-port abstraction was added, and approves Task 2.

---

### Task 2: Strict Base64URL Codec and Atomic Local Library

**Files:**
- Create: `src/react-app/designer/trackCodec.ts`
- Create: `src/react-app/designer/trackCodec.test.ts`
- Create: `src/react-app/designer/trackLibrary.ts`
- Create: `src/react-app/designer/trackLibrary.test.ts`

**Interfaces:**
- Consumes: `TrackDesign`, `SharedTrack`, `LocalTrack`, `TrackLibrary`, `validateTrackDesign`.
- Produces: `encodeSharedTrack(track: TrackDesign): string`, `decodeSharedTrack(input: string): SharedTrack`, `createShareUrl(track: TrackDesign, baseHref: string): Readonly<{ token: string; url: string }>`.
- Produces: `loadTrackLibrary(storage: Storage): LibraryLoadResult`, `persistTrackLibrary(storage: Storage, library: TrackLibrary): void`, `upsertTrack(library: TrackLibrary, track: TrackDesign, options: SaveIdentity): SaveResult`, `deleteTrack(library: TrackLibrary, id: string): TrackLibrary`, `resetTrackLibrary(storage: Storage): TrackLibrary`.

- [ ] **Step 1: Sol dispatches Task 2 to Luna**

Luna receives Task 1's reviewed signatures and must use browser built-ins only.

- [ ] **Step 2: Write failing codec/storage tests**

```ts
it("round-trips Unicode through unpadded Base64URL", () => {
  const track = createValidTrackDesign("Jalapeño 日本");
  const token = encodeSharedTrack(track);
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeSharedTrack(token)).toEqual({ version: 1, ...track });
});

it("keeps duplicate names under separate UUIDs", () => {
  const library = { version: 1, tracks: [] } as const;
  const first = upsertTrack(library, createValidTrackDesign("Same"), { id: undefined, now: 10, uuid: () => "one" });
  const second = upsertTrack(first.library, createValidTrackDesign("Same"), { id: undefined, now: 20, uuid: () => "two" });
  expect(second.library.tracks.map((track) => track.id)).toEqual(["two", "one"]);
});

it("does not replace corrupt storage", () => {
  const storage = memoryStorage({ "luckyroll.tracks": "{broken" });
  expect(loadTrackLibrary(storage).ok).toBe(false);
  expect(storage.getItem("luckyroll.tracks")).toBe("{broken");
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/designer/trackCodec.test.ts src/react-app/designer/trackLibrary.test.ts`

Expected: FAIL because codec and library modules do not exist.

- [ ] **Step 4: Implement strict decode and persist-before-state helpers**

```ts
const TOKEN_LIMIT = 8192;
const JSON_BYTE_LIMIT = 6144;
const ALPHABET = /^[A-Za-z0-9_-]+$/;

export const encodeSharedTrack = (track: TrackDesign): string => {
  assertValidTrackDesign(track);
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, name: track.name.trim(), cells: track.cells }));
  if (bytes.byteLength > JSON_BYTE_LIMIT) throw new Error("Shared track exceeds 6,144 decoded bytes.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const extractTrackToken = (input: string): string => {
  const value = input.trim();
  if (ALPHABET.test(value)) return value;
  const hash = value.startsWith("#") ? value.slice(1) : new URL(value).hash.slice(1);
  const params = new URLSearchParams(hash);
  const entries = Array.from(params.entries());
  if (entries.length !== 1 || entries[0][0] !== "track" || entries[0][1] === "") throw new Error("Expected exactly one non-empty track hash parameter.");
  return entries[0][1];
};

const decodeUtf8 = (token: string): string => {
  if (token.length > TOKEN_LIMIT || !ALPHABET.test(token) || token.length % 4 === 1) throw new Error("Invalid shared track token.");
  const base64 = token.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength > JSON_BYTE_LIMIT) throw new Error("Shared track exceeds 6,144 decoded bytes.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};
```

`decodeSharedTrack` extracts exactly one `track` parameter for hash/full URL input, rejects empty/duplicate parameters, checks `TOKEN_LIMIT`, `ALPHABET`, length modulo four, fatal UTF-8, decoded byte limit, exact keys, exact cell unions, then calls `assertValidTrackDesign`. It returns a newly frozen `{ version: 1, name, cells }`.

```ts
export type LibraryLoadResult =
  | Readonly<{ ok: true; library: TrackLibrary }>
  | Readonly<{ ok: false; raw: string | null; message: string }>;
export type SaveIdentity = Readonly<{ id: string | undefined; now: number; uuid: () => string }>;
export type SaveResult = Readonly<{ library: TrackLibrary; track: LocalTrack }>;
export const TRACK_LIBRARY_KEY = "luckyroll.tracks";

export const persistTrackLibrary = (storage: Storage, library: TrackLibrary): void => {
  storage.setItem(TRACK_LIBRARY_KEY, JSON.stringify(library));
};
```

`upsertTrack` validates first, uses the supplied existing ID or UUID, sorts descending by `updatedAt`, and never matches by name. `deleteTrack` filters only by ID. `resetTrackLibrary` writes `{version:1,tracks:[]}` before returning it.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/designer/trackCodec.test.ts src/react-app/designer/trackLibrary.test.ts`

Expected: PASS for Unicode, malformed alphabet/padding/UTF-8/JSON, 8,192/6,144 limits, exact fields, invalid routes, duplicate names, UUID updates, corrupt reads, throwing storage, quota failure, and failed delete preservation.

```bash
git add src/react-app/designer/trackCodec.ts src/react-app/designer/trackCodec.test.ts src/react-app/designer/trackLibrary.ts src/react-app/designer/trackLibrary.test.ts
git commit -m "feat: store and share modular tracks locally"
```

- [ ] **Step 6: Sol review gate**

Sol reruns both tests, checks that decode never mutates storage/current preview, verifies no `id` or `updatedAt` enters shared JSON, and approves Task 3.

---

### Task 3: Pure Editor State and Accessible Board UI

**Files:**
- Create: `src/react-app/designer/editorState.ts`
- Create: `src/react-app/designer/editorState.test.ts`
- Create: `src/react-app/components/TrackEditor.tsx`
- Create: `src/react-app/components/TrackEditor.test.tsx`
- Modify: `src/react-app/App.css`

**Interfaces:**
- Consumes: Task 1 model/validator.
- Produces: `EditorState`, `EditorAction`, `createEditorState(track: TrackDesign, id?: string): EditorState`, `editorReducer(state: EditorState, action: EditorAction): EditorState`.
- Produces: `TrackEditor(props: TrackEditorProps): JSX.Element`.

- [ ] **Step 1: Sol dispatches Task 3 to Luna**

Sol requires DOM controls to remain authoritative; Three.js is not used by this component.

- [ ] **Step 2: Write failing reducer and interaction tests**

```tsx
it("places, rotates, and protects fixed cells", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TrackEditor state={createEditorState(createEmptyTrackDesign("Course"))} onChange={onChange} onBack={vi.fn()} onSave={vi.fn()} onShare={vi.fn()} onPlay={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Straight module" }));
  await user.click(screen.getByRole("gridcell", { name: /row 1 column 2, empty/i }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ cells: expect.arrayContaining([{ kind: "straight", rotation: 0 }]) }) }));
  expect(screen.getByRole("gridcell", { name: /row 1 column 1, fixed start/i })).toBeDisabled();
});

it("keeps save, share, and play disabled for an invalid route", () => {
  render(<TrackEditor state={createEditorState(createEmptyTrackDesign("Course"))} onChange={vi.fn()} onBack={vi.fn()} onSave={vi.fn()} onShare={vi.fn()} onPlay={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Test Play" })).toBeDisabled();
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/designer/editorState.test.ts src/react-app/components/TrackEditor.test.tsx`

Expected: FAIL because editor state/component modules do not exist.

- [ ] **Step 4: Implement the reducer and grid**

```ts
export type EditorState = Readonly<{ id?: string; draft: TrackDesign; selectedKind: ModuleKind; selectedCell: number; dirty: boolean; validation: DesignValidation }>;
export type EditorAction =
  | Readonly<{ type: "name"; name: string }>
  | Readonly<{ type: "palette"; kind: ModuleKind }>
  | Readonly<{ type: "place"; cellIndex: number }>
  | Readonly<{ type: "rotate"; cellIndex: number }>
  | Readonly<{ type: "replace"; cellIndex: number }>
  | Readonly<{ type: "clear"; cellIndex: number }>
  | Readonly<{ type: "focus"; cellIndex: number }>;
export type TrackEditorProps = Readonly<{
  state: EditorState; onChange: (state: EditorState) => void; onBack: () => void;
  onSave: () => void; onShare: () => void; onPlay: () => void;
}>;
```

For `place`, require `null` and non-fixed index; for `rotate`, call `rotateEditableCell`; for `replace`, use selected kind at rotation `0`; for `clear`, set `null`. Every content/name action rebuilds `validation` and sets `dirty`.

```tsx
<div role="grid" aria-label="5 column by 8 row track board">
  {Array.from({ length: 8 }, (_, row) => (
    <div role="row" key={row}>
      {Array.from({ length: 5 }, (_, column) => {
        const cellIndex = row * 5 + column;
        return <button role="gridcell" key={cellIndex} tabIndex={state.selectedCell === cellIndex ? 0 : -1} aria-label={cellLabel(state, cellIndex)} />;
      })}
    </div>
  ))}
</div>
```

Arrow keys move focus within 5×8 bounds; Enter/Space places or rotates; Delete/Backspace clears; fixed buttons are disabled. A 500 ms pointer timer opens Replace/Clear, and `pointermove`, `pointerup`, or `pointercancel` clears it. Render validation in `role="status"`/`aria-live="polite"`. CSS provides `:focus-visible`, 44-pixel controls, board dominance, high contrast, and `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/designer/editorState.test.ts src/react-app/components/TrackEditor.test.tsx`

Expected: PASS for palette placement, 2/4 rotation cycles, replace, clear, fixed endpoints, long-press open/cancel, keyboard movement, cell labels, live errors, dirty Back confirmation callback, and action gating.

```bash
git add src/react-app/designer/editorState.ts src/react-app/designer/editorState.test.ts src/react-app/components/TrackEditor.tsx src/react-app/components/TrackEditor.test.tsx src/react-app/App.css
git commit -m "feat: add accessible modular track editor"
```

- [ ] **Step 6: Sol review gate**

Sol reruns the command using keyboard-only Testing Library interactions, checks that no canvas interaction is required, and approves Task 4.

---

### Task 4: Track Library and Share/Import UI

**Files:**
- Create: `src/react-app/components/TrackLibraryPanel.tsx`
- Create: `src/react-app/components/TrackLibraryPanel.test.tsx`
- Create: `src/react-app/components/ShareTrackDialog.tsx`
- Create: `src/react-app/components/ShareTrackDialog.test.tsx`
- Modify: `src/react-app/components/SetupScreen.tsx`
- Modify: `src/react-app/components/SetupScreen.test.tsx`
- Modify: `src/react-app/App.css`

**Interfaces:**
- Consumes: `LocalTrack`, `TrackDesign`, Task 2 codec.
- Produces: `TrackLibraryPanel(props: TrackLibraryPanelProps): JSX.Element`, `ShareTrackDialog(props: ShareTrackDialogProps): JSX.Element`.
- Changes: `SetupScreen` props add `tracks`, `selectedTrackId`, `onNewTrack`, `onEditTrack`, `onSelectTrack`, `onShareTrack`, `onDeleteTrack`, `onImportTrack`.

- [ ] **Step 1: Sol dispatches Task 4 to Luna**

The existing two-player setup submission must remain byte-for-byte compatible at its `onStart` boundary.

- [ ] **Step 2: Write failing menu/share tests**

```tsx
it("keeps duplicate names addressable by UUID", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  render(<TrackLibraryPanel tracks={[local("a", "Same", 2), local("b", "Same", 1)]} selectedTrackId="a" onNew={vi.fn()} onEdit={onEdit} onSelect={vi.fn()} onPlay={vi.fn()} onShare={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Edit Same, track b" }));
  expect(onEdit).toHaveBeenCalledWith("b");
});

it("falls back to selectable text when sharing APIs reject", async () => {
  const share = vi.fn().mockRejectedValue(new Error("denied"));
  render(<ShareTrackDialog track={createValidTrackDesign("Course")} baseHref="https://example.test/" share={share} writeText={vi.fn()} onImport={vi.fn()} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Share" }));
  expect(screen.getByLabelText("Share link")).toHaveValue(expect.stringContaining("#track="));
  expect(screen.getByLabelText("Share token")).toHaveValue(expect.stringMatching(/^[A-Za-z0-9_-]+$/));
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/components/TrackLibraryPanel.test.tsx src/react-app/components/ShareTrackDialog.test.tsx src/react-app/components/SetupScreen.test.tsx`

Expected: FAIL because library/share components and expanded Setup props do not exist.

- [ ] **Step 4: Implement minimal menu/dialog composition**

```ts
export type TrackLibraryPanelProps = Readonly<{
  tracks: readonly LocalTrack[]; selectedTrackId?: string;
  onNew: () => void; onEdit: (id: string) => void; onSelect: (id?: string) => void;
  onPlay: (id: string) => void; onShare: (id: string) => void; onDelete: (id: string) => void;
  onImport: (input: string) => void;
}>;
export type ShareTrackDialogProps = Readonly<{
  track: TrackDesign; baseHref: string;
  share: ((data: ShareData) => Promise<void>) | undefined;
  writeText: ((text: string) => Promise<void>) | undefined;
  onImport: (input: string) => void; onClose: () => void;
}>;
```

Render built-in selection separately, sort custom tracks by `updatedAt`, include IDs in accessible names, and use native buttons. `ShareTrackDialog` calls `navigator.share` when injected, otherwise clipboard; either rejection leaves readonly link/token inputs and a visible status message. Import submits one text field and never mutates state itself.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/components/TrackLibraryPanel.test.tsx src/react-app/components/ShareTrackDialog.test.tsx src/react-app/components/SetupScreen.test.tsx`

Expected: PASS, including the pre-existing player-name/prize test.

```bash
git add src/react-app/components/TrackLibraryPanel.tsx src/react-app/components/TrackLibraryPanel.test.tsx src/react-app/components/ShareTrackDialog.tsx src/react-app/components/ShareTrackDialog.test.tsx src/react-app/components/SetupScreen.tsx src/react-app/components/SetupScreen.test.tsx src/react-app/App.css
git commit -m "feat: add local track menu and sharing UI"
```

- [ ] **Step 6: Sol review gate**

Sol verifies deletion is only an emitted ID action, every fallback remains selectable, duplicate names are distinguishable to assistive technology, and approves Task 5.

---

### Task 5: Canonical Modular Paths, Landings, and Board Tilt

**Files:**
- Create: `src/react-app/game/modular/modularTypes.ts`
- Create: `src/react-app/game/modular/modulePath.ts`
- Create: `src/react-app/game/modular/modulePath.test.ts`

**Interfaces:**
- Consumes: `TrackDesign`, `ValidRoute`, existing `Vec3` and `TrackSample`.
- Produces: `ModulePathSample`, `ModulePort`, `sampleModulePath(track: TrackDesign, route: ValidRoute): readonly ModulePathSample[]`, `boardToWorld(vector: Vec3): Vec3`, `moduleWidthAt(kind: ModuleKind, u: number): number`.

- [ ] **Step 1: Sol dispatches Task 5 to Luna**

Luna implements analytic paths only; no Three.js or Rapier objects enter this task.

- [ ] **Step 2: Write failing analytic-contract tests**

```ts
it("keeps reciprocal ports G2 and funnel ports at full width", () => {
  const track = createValidTrackDesign();
  const route = assertValidTrackDesign(track);
  const samples = sampleModulePath(track, route);
  const seam = reciprocalPortSamples(samples, 4, 9);
  expect(distance(seam.upstream.position, seam.downstream.position)).toBeLessThanOrEqual(1e-6);
  expect(dot(seam.upstream.outwardTangent, seam.downstream.outwardTangent)).toBeCloseTo(-1, 6);
  expect(length(seam.upstream.curvature)).toBeLessThanOrEqual(1e-6);
  expect(length(seam.downstream.curvature)).toBeLessThanOrEqual(1e-6);
  expect(moduleWidthAt("funnel", 0)).toBe(12);
  expect(moduleWidthAt("funnel", 0.5)).toBe(9.6);
  expect(moduleWidthAt("funnel", 1)).toBe(12);
});

it("keeps wave offset and two derivatives zero through both landings", () => {
  expect(waveOffset(0.1)).toBe(0);
  expect(waveOffset(0.9)).toBe(0);
  expect(waveDerivativesAtJoin()).toEqual({ first: 0, second: 0 });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/game/modular/modulePath.test.ts`

Expected: FAIL because modular path types and functions do not exist.

- [ ] **Step 4: Implement exact paths and adaptive sampling**

```ts
export type ModulePort = Readonly<{
  cellIndex: number; direction: Direction; position: Vec3; outwardTangent: Vec3;
  curvature: Vec3; floorHeight: number; clearWidth: number; railHeight: number;
}>;
export type ModulePathSample = TrackSample & Readonly<{
  cellIndex: number; localU: number; centerlineCurvature: Vec3; port?: ModulePort;
}>;

export const MARBLE_DIAMETER = 0.68;
export const MODULE_SIZE = 20;
export const CHANNEL_WIDTH = 12;
export const RAIL_HEIGHT = 4;
export const LANDING_LENGTH = MODULE_SIZE * 0.10;
export const BOARD_TILT = 20 * Math.PI / 180;

export const boardToWorld = ({ x, y, z }: Vec3): Vec3 => ({
  x,
  y: y * Math.cos(BOARD_TILT) - z * Math.sin(BOARD_TILT),
  z: y * Math.sin(BOARD_TILT) + z * Math.cos(BOARD_TILT),
});
```

For the curve interior, use the quintic Hermite basis with endpoint second derivatives zero and derivative magnitude `0.80S`:

```ts
const quintic = (p0: number, p1: number, d0: number, d1: number, t: number): number => {
  const t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
  return p0 * (1 - 10*t3 + 15*t4 - 6*t5) + d0 * (t - 6*t3 + 8*t4 - 3*t5)
    + p1 * (10*t3 - 15*t4 + 6*t5) + d1 * (-4*t3 + 7*t4 - 3*t5);
};
```

Funnel width is `W` on `[0,0.1]` and `[0.9,1]`; inside, taper with `6t^5-15t^4+10t^3`, hold `9.6` for `0.10S`, and mirror. Wave offset is zero in landings and `0.15W*sin(2πu)*sin²(πu)` for `u=(t-0.1)/0.8`. Recursively bisect each analytic interval until chord error is `≤0.02D` and its estimated longitudinal normal turn is `≤2°`. Remove only the duplicate sample at each reciprocal seam.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/game/modular/modulePath.test.ts`

Expected: PASS for exact port positions, opposite outward tangents, zero curvature vectors, curve/funnel/wave landing joins, 9.6-unit funnel waist, no-up route order, chord bound, dihedral estimate, and one shared seam sample.

```bash
git add src/react-app/game/modular/modularTypes.ts src/react-app/game/modular/modulePath.ts src/react-app/game/modular/modulePath.test.ts
git commit -m "feat: sample seamless modular paths"
```

- [ ] **Step 6: Sol review gate**

Sol checks all derivative assertions use board-local arc-length vectors before the shared tilt and approves Task 6.

---

### Task 6: Welded U-Channel Geometry and Static Validation

**Files:**
- Create: `src/react-app/game/modular/moduleGeometry.ts`
- Create: `src/react-app/game/modular/moduleGeometry.test.ts`
- Create: `src/react-app/game/modular/modularTrackBuild.ts`
- Create: `src/react-app/game/modular/modularTrackBuild.test.ts`

**Interfaces:**
- Consumes: `ModulePathSample[]`, `TrackDesign`, `ValidRoute`.
- Produces: `buildModuleGeometry(samples: readonly ModulePathSample[]): ModularTrackGeometry`, `validateModuleGeometry(geometry: ModularTrackGeometry): readonly ModularGeometryFailure[]`, `buildModularTrack(track: TrackDesign): BuiltModularTrack`.

- [ ] **Step 1: Sol dispatches Task 6 to Luna**

Luna reuses the existing indexed-buffer/normal style but does not modify the built-in `generateTrackGeometry`.

- [ ] **Step 2: Write failing welded-geometry tests**

```ts
it("uses one boundary row and no cap for each connected port", () => {
  const built = buildModularTrack(createValidTrackDesign());
  expect(built.geometry.seams.every((seam) => seam.upstreamRow === seam.downstreamRow)).toBe(true);
  expect(findConnectedPortCaps(built.geometry)).toEqual([]);
  expect(findOpenConnectedPortEdges(built.geometry)).toEqual([]);
  expect(findDuplicateTriangles(built.geometry.indices)).toEqual([]);
});

it("keeps every longitudinal triangle turn within two degrees", () => {
  const failures = validateModuleGeometry(buildModularTrack(createWorstCaseTrackDesign()).geometry);
  expect(failures.filter((failure) => failure.code === "longitudinal-normal")).toEqual([]);
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackBuild.test.ts`

Expected: FAIL because geometry/build modules do not exist.

- [ ] **Step 4: Implement the canonical profile and welded indices**

```ts
const PROFILE_SEGMENTS = 12;
const profile = Array.from({ length: PROFILE_SEGMENTS + 1 }, (_, column) => {
  const angle = -Math.PI / 2 + Math.PI * column / PROFILE_SEGMENTS;
  return Object.freeze({
    lateral: Math.sin(angle) * CHANNEL_WIDTH / 2,
    height: RAIL_HEIGHT * (1 - Math.cos(angle)),
  });
});
```

For each unique path row, create one vertex per profile point using sample `side` and `up`. Connect successive rows with consistent `(a,c,b)` and `(b,c,d)` winding. `sampleModulePath` already removes reciprocal duplicate rows, so record both neighboring cell IDs against that one row in `geometry.seams`. Compute normals once after the entire board index is complete.

```ts
export type ModularTrackGeometry = TrackGeometry & Readonly<{
  sourceCellBySample: Uint8Array;
  seams: readonly Readonly<{ upstreamCell: number; downstreamCell: number; upstreamRow: number; downstreamRow: number }>[];
}>;
export type ModularGeometryFailure = Readonly<{
  code: "non-finite" | "index" | "degenerate" | "normal" | "disconnected" | "seam" | "cap" | "duplicate" | "profile" | "chord" | "longitudinal-normal";
  sampleIndex?: number; message: string;
}>;
export type BuiltModularTrack = Readonly<{ track: TrackDesign; route: ValidRoute; samples: readonly ModulePathSample[]; geometry: ModularTrackGeometry }>;
export const buildModularTrack = (track: TrackDesign): BuiltModularTrack => {
  const route = assertValidTrackDesign(track);
  const samples = sampleModulePath(track, route);
  const geometry = buildModuleGeometry(samples);
  const failures = validateModuleGeometry(geometry);
  if (failures.length) throw new Error(failures.map((failure) => failure.message).join("\n"));
  return Object.freeze({ track, route, samples, geometry });
};
```

The validator checks finite buffers, index ranges, non-degenerate triangles, normalized normals, one connected indexed component, one row per seam, no duplicate triangles/caps, canonical profile coordinates within `1e-6`, chord error `≤0.0136`, and longitudinal adjacent-triangle dihedral `≤2°`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackBuild.test.ts`

Expected: PASS for straight/curve/funnel/wave pairings, exact welded topology, winding, finite normals, no connected caps, no overlaps/open seams, and invalid-design build rejection.

```bash
git add src/react-app/game/modular/moduleGeometry.ts src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackBuild.ts src/react-app/game/modular/modularTrackBuild.test.ts
git commit -m "feat: weld modular channel geometry"
```

- [ ] **Step 6: Sol review gate**

Sol verifies the rendered and collider buffers can share exact typed-array identity and that no per-cell floor collider remains, then approves Task 7.

---

### Task 7: Canonical Devices and Procedural Rendering

**Files:**
- Create: `src/react-app/game/modular/moduleDevices.ts`
- Create: `src/react-app/game/modular/moduleDevices.test.ts`
- Create: `src/react-app/game/modular/modularTrackRender.ts`
- Create: `src/react-app/game/modular/modularTrackRender.test.ts`
- Modify: `src/react-app/game/track/obstacleGeometry.ts`

**Interfaces:**
- Consumes: `BuiltModularTrack`, route directions, existing `IndexedGeometry`, `sampleStartBowlSurface`.
- Produces: `ModuleDevices`, `ModulePreviewDescriptor`, `ModularDevicePose`, `ModularRenderOptions`, `ModularRenderResources`, `resolveModuleDevices(track: TrackDesign, route: ValidRoute, samples: readonly ModulePathSample[]): ModuleDevices`, `resolveModulePreview(cell: Exclude<TrackCell, null>, travel?: Direction): ModulePreviewDescriptor`, `createModularTrackRender(built: BuiltModularTrack, options?: ModularRenderOptions): ModularRenderResources`, `setModularDevicePose(resources: ModularRenderResources, pose: ModularDevicePose): void`, `disposeModularTrackRender(resources: ModularRenderResources): void`.
- Changes: export `buildWalledBowl(frame, radius, outletRadius, drop, outletAlong, wallHeight, entryAngle?): IndexedGeometry` from existing obstacle geometry without changing current callers.

- [ ] **Step 1: Sol dispatches Task 7 to Luna**

Sol requires one canonical descriptor per visible/physical device; decorative booster markings remain collider-free.

- [ ] **Step 2: Write failing descriptor/render tests**

```ts
it("mirrors bumper tips downstream and keeps all obstacles out of landings", () => {
  const built = buildModularTrack(createWorstCaseTrackDesign());
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  for (const bumper of devices.bumpers) {
    expect(dot(bumper.forward, bumper.tipDirection)).toBeGreaterThan(0);
    expect(bumper.clearPassage).toBeGreaterThanOrEqual(3 * 0.68);
    expect(bumper.distanceFromNearestSeam).toBeGreaterThanOrEqual(2);
  }
});

it("renders exact board buffers and collider-free booster chevrons", () => {
  const built = buildModularTrack(createWorstCaseTrackDesign());
  const rendered = createModularTrackRender(built);
  const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
  expect(surface.geometry.getAttribute("position").array).toBe(built.geometry.positions);
  expect(rendered.group.getObjectByName("booster-chevrons")!.userData.collider).toBe(false);
});

it("uses symmetric bars and no arrow for an unresolved bumper preview", () => {
  const preview = resolveModulePreview({ kind: "bumper", rotation: 0 });
  expect(preview.directionArrow).toBeUndefined();
  expect(preview.bumperOffsets).toEqual([-preview.bumperOffsets[2], 0, -preview.bumperOffsets[0]]);
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts`

Expected: FAIL because modular descriptors/render resources and public bowl builder do not exist.

- [ ] **Step 4: Implement canonical descriptors and shared meshes**

```ts
export type BoosterTrigger = Readonly<{ cellIndex: number; startDistance: number; endDistance: number; forward: Vec3 }>;
export type BumperBar = Readonly<{ cellIndex: number; center: Vec3; forward: Vec3; tipDirection: Vec3; length: number; thickness: number; height: number; clearPassage: number; distanceFromNearestSeam: number }>;
export type PinwheelLayout = Readonly<{ cellIndex: number; center: Vec3; axis: Vec3; radius: number; armThickness: number; angularSpeed: number; minimumPassage: number }>;
export type ModuleDevices = Readonly<{ start: ResolvedStart; boosters: readonly BoosterTrigger[]; bumpers: readonly BumperBar[]; pinwheels: readonly PinwheelLayout[] }>;
export type ModulePreviewDescriptor = Readonly<{
  directionArrow?: Direction; bumperOffsets: readonly [number, number, number]; collider: false;
}>;
export type ModularDevicePose = Readonly<{
  elapsedSeconds: number; gateOpen: boolean; agitatorAngle: number; pinwheelAngles: readonly number[];
}>;
export type ModularRenderOptions = Readonly<{ debug?: boolean; preview?: boolean }>;
export type ModularRenderResources = Readonly<{
  group: THREE.Group; devices: ModuleDevices; dispose: () => void;
}>;
```

Resolve three bumper bars in the central `0.60S`, thickness `0.45D`, height `1.4D`, 30-degree downstream tips, `≥3D` slice passage, `≥2D` opposing separation, and `≥max(0.10S,1.5D)` seam clearance. Resolve pinwheels at cell center with the fixed constants. Booster distance interval is `[cellStart+0.40S, cellStart+0.60S]`.

`createModularTrackRender` creates one board group tilted through the already-world-transformed buffers, one exact buffer surface, dark shell, shared rim materials, instanced bumper shafts/caps, instanced pinwheel arms, and render-only flat chevrons. Store mutable pinwheel/gate/agitator refs in `group.userData`, and dispose each owned geometry/material once.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts`

Expected: PASS for all exact device dimensions, mirrored east/west bumpers, neutral invalid preview descriptor, trigger placement, shared buffers/materials, pose parity, and idempotent disposal; built-in bowl tests remain green.

```bash
git add src/react-app/game/modular/moduleDevices.ts src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.ts
git commit -m "feat: render modular track devices"
```

- [ ] **Step 6: Sol review gate**

Sol compares every render transform with its descriptor, checks preview caps/neutral bars cannot enter race resources, and approves Task 8.

---

### Task 8: Rapier Collider, Launcher, Pinwheels, Boosters, and Seam Probes

**Files:**
- Create: `src/react-app/game/modular/modularTrackPhysics.ts`
- Create: `src/react-app/game/modular/modularTrackPhysics.test.ts`
- Modify: `src/react-app/game/track/trackPhysics.ts`

**Interfaces:**
- Consumes: `BuiltModularTrack`, `resolveModuleDevices(track, route, samples): ModuleDevices`, existing Rapier initialization/world/marble helpers and `FIXED_VALIDATION_SEEDS`.
- Produces: `BoosterEvent`, `SeamProbeOptions`, `SeamProbeResult`, `ModularValidationOptions`, `ModularScenarioCoverage`, `createModularPhysics(world: RapierWorld, built: BuiltModularTrack): ModularPhysicsResources`, `createModularLaunchPositions(count: number, built: BuiltModularTrack, seed: number): readonly PhysicalLaunchPosition[]`, `createBoosterState(marbleCount: number, cellCount?: number): Uint8Array`, `applyBoosterVelocity(velocity: Vec3, forward: Vec3, consumed: Uint8Array, boosterCellIndex: number, marbleIndex: number): Vec3`, `applyBoosterCrossings(resources: ModularPhysicsResources, bodies: readonly RapierBody[]): readonly BoosterEvent[]`, `runModularSeamProbe(options: SeamProbeOptions): Promise<SeamProbeResult>`, `runModularValidationRace(options: ModularValidationOptions): Promise<ModularValidationResult>`.
- Changes: `validateQualificationSeeds(seeds, recorded): readonly number[]` becomes the generic export; retain `validateObstacleQualificationSeeds` as an alias for existing tests.

- [ ] **Step 1: Sol dispatches Task 8 to Luna**

No 100-marble end-to-end run is permitted in this task. Tests use primitives, one marble, or zero-duration body creation.

- [ ] **Step 2: Write failing focused physics tests**

```ts
it("creates one fixed welded trimesh with internal-edge fixing", async () => {
  await initializeTrackPhysics();
  const world = createTrackPhysicsWorld();
  const resources = createModularPhysics(world, buildModularTrack(createValidTrackDesign()));
  expect(resources.trackCollider.shapeType()).toBe(RAPIER.ShapeType.TriMesh);
  expect((resources.trackCollider.shape as RAPIER.TriMesh).flags & RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).toBeTruthy();
  resources.dispose(); world.free();
});

it("boosts only forward velocity once and never brakes above the cap", () => {
  const state = createBoosterState(8, 40);
  expect(applyBoosterVelocity({ x: 10, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 6)).toEqual({ x: 12, y: 2, z: 3 });
  expect(applyBoosterVelocity({ x: 20, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 7)).toEqual({ x: 20, y: 2, z: 3 });
  expect(applyBoosterVelocity({ x: 10, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 7)).toEqual({ x: 10, y: 2, z: 3 });
});

it.each([
  [8, 0], [8, 12 / 2 - 1.5 * 0.68], [8, -(12 / 2 - 1.5 * 0.68)],
  [18, 0], [18, 12 / 2 - 1.5 * 0.68], [18, -(12 / 2 - 1.5 * 0.68)],
  [42, 0], [42, 12 / 2 - 1.5 * 0.68], [42, -(12 / 2 - 1.5 * 0.68)],
] as const)("crosses every seam at speed %i and lateral %f without seam loss", async (speed, lateral) => {
  const result = await runModularSeamProbe({ speed, lateral });
  expect(result.maxNormalVelocityDelta).toBeLessThanOrEqual(0.05);
  expect(result.maxForwardLossRatio).toBeLessThanOrEqual(0.01);
  expect(result.escapes).toBe(0);
});

it("covers the focused device transitions with deterministic fixed-step results", async () => {
  const track = createWorstCaseTrackDesign();
  const route = assertValidTrackDesign(track).route;
  const kinds = route.map((step) => track.cells[step.cellIndex]!.kind);
  const pairs = kinds.slice(1).map((kind, index) => `${kinds[index]}->${kind}`);
  expect(pairs).toEqual(expect.arrayContaining(["booster->bumper", "bumper->booster", "bumper->curve"]));
  const first = await runModularValidationRace({ track, seed: 23, marbleCount: 16, durationSeconds: 60 });
  const second = await runModularValidationRace({ track, seed: 23, marbleCount: 16, durationSeconds: 60 });
  expect(first.finishOrder.length).toBeGreaterThan(0);
  expect(first.coverage).toEqual(expect.objectContaining({ maximumHorizontalCells: 5 }));
  expect(first.coverage.funnelEntries).toBeGreaterThan(1);
  expect(first.coverage.pinwheelContacts).toBeGreaterThan(0);
  expect(first.coverage.obstacleToCurveCrossings).toBeGreaterThan(0);
  expect(first.coverage.boosterToBumperCrossings).toBeGreaterThan(0);
  expect(first.coverage.bumperToBoosterCrossings).toBeGreaterThan(0);
  expect(second.finishOrder).toEqual(first.finishOrder);
  expect(second.finishTimesMs.every((time, index) => Math.abs(time - first.finishTimesMs[index]) <= 1_000 / 60)).toBe(true);
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/track/trackPhysics.test.ts`

Expected: FAIL because modular physics APIs do not exist; existing track tests still execute without a modular 100-marble run.

- [ ] **Step 4: Implement minimal fixed-step physics**

```ts
const trackDesc = rapier.ColliderDesc.trimesh(
  built.geometry.positions,
  built.geometry.indices,
  rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
).setFriction(0.24).setRestitution(0.08);
```

Resolve `ModuleDevices` once from `built.track`, `built.route`, and `built.samples`. Create fixed box shafts plus vertical cylinder caps from every `BumperBar`; use restitution `0.28`. Create kinematic-position pinwheel bodies with capsule arms and update angle by exactly `2/60` radians before each `world.step()`. Reuse `createBowlLaunchPositions` for 100 non-overlapping positions and set eastward body velocity to `8` when the gate opens.

```ts
type RapierModule = typeof import("@dimforge/rapier3d-compat");
type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export type ModularPhysicsResources = Readonly<{
  trackCollider: RapierCollider; fixedColliders: readonly RapierCollider[];
  stepBeforeWorld: () => ModularDevicePose; stepAfterWorld: (bodies: readonly RapierBody[]) => readonly BoosterEvent[];
  reset: (remainingRestart?: boolean) => ModularDevicePose; dispose: () => void;
}>;
export type BoosterEvent = Readonly<{
  marbleId: number; cellIndex: number; beforeForwardSpeed: number; afterForwardSpeed: number;
}>;
export type SeamProbeOptions = Readonly<{ speed: 8 | 18 | 42; lateral: number }>;
export type SeamProbeResult = Readonly<{
  maxNormalVelocityDelta: number; maxForwardLossRatio: number; escapes: number;
}>;
export type ModularValidationOptions = Readonly<{
  track: TrackDesign; seed: number; marbleCount: number; durationSeconds: number;
}>;
export type ModularScenarioCoverage = Readonly<{
  maximumHorizontalCells: number; funnelEntries: number; pinwheelContacts: number;
  obstacleToCurveCrossings: number; boosterToBumperCrossings: number; bumperToBoosterCrossings: number;
}>;
export type ModularValidationResult = ValidationRaceResult & Readonly<{
  nonFinite: readonly MarbleFailure[]; boosterCapViolations: readonly BoosterEvent[]; coverage: ModularScenarioCoverage;
}>;
```

For each body, transform previous/current position to its booster-local forward coordinate. Trigger when the swept segment intersects `[0.40S,0.60S]`, forward dot is positive, and the `Uint8Array(marbleCount*40)` slot is zero. Mark that valid forward crossing consumed even when the marble is already at or above the cap, then set only `delta = max(0,min(1.2*forward,18)-forward)` along the tangent. Reset replaces/fills the matrix with zero.

Each `runModularSeamProbe` call tests every legal upstream/downstream kind/orientation for its requested speed and lateral offset, samples at `0.05S` inside the downstream landing, and compares with equal-length seamless straight physics. The test matrix above covers speeds `8,18,42` and lateral offsets `0, ±(W/2-1.5D)`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/track/trackPhysics.test.ts`

Expected: PASS for flags, collider counts, 100 launch positions without stepping, deterministic pinwheel poses, `≥3D` phase passage, swept skip, wrong-way entry, cap/no-brake, once/reset, all seam speeds/offsets, the maximum five-cell horizontal run, dense funnel entry, pinwheel contact, obstacle-to-curve, booster-to-bumper, bumper-to-booster, same-seed finish order/timing, disposal, and every existing built-in track test.

```bash
git add src/react-app/game/modular/modularTrackPhysics.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/track/trackPhysics.ts
git commit -m "feat: simulate modular track physics"
```

- [ ] **Step 6: Sol review gate**

Sol verifies no rank/guide/recovery force exists, the collider receives the exact rendered buffers plus `FIX_INTERNAL_EDGES`, and approves Task 9.

---

### Task 9: Shared Race-Course Adapter and Existing Scene Integration

**Files:**
- Create: `src/react-app/game/raceCourse.ts`
- Create: `src/react-app/game/raceCourse.test.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/game/MarbleRaceScene.test.ts`

**Interfaces:**
- Consumes: current built-in resources, modular build/render/physics, `RaceCourseSelection`.
- Produces: `createRaceCourse(selection): RaceCourse`, changed `createRaceScene(canvas, emit, selection?: RaceCourseSelection): RaceScene`.
- Changes: `RaceScene` adds `setPaused(paused: boolean): void`; `SceneEvent` adds `{type:"error"; message:string}` and `{type:"dnf"; marble:Marble; reason:"escape"|"non-finite"}`.

- [ ] **Step 1: Sol dispatches Task 9 to Luna**

The default third argument remains `{kind:"builtin"}` so all current callers and tests keep the canonical course.

- [ ] **Step 2: Write failing adapter/scene tests**

```ts
it("keeps the built-in course as the default", () => {
  const course = createRaceCourse({ kind: "builtin" });
  expect(course.kind).toBe("builtin");
  expect(course.samples.length).toBe(createSceneTrackResources().built.samples.length);
});

it("builds a custom course from validated shared cells", () => {
  const course = createRaceCourse({ kind: "custom", track: createValidTrackDesign("Course") });
  expect(course.kind).toBe("custom");
  expect(course.renderGroup.getObjectByName("modular-channel")).toBeDefined();
  const middle = Math.floor(course.samples.length / 2);
  expect(projectToTrack(course.samples[middle].position, course.samples).sampleIndex).toBe(middle);
  expect(Object.values(getTrackBounds(course.samples)).every(Number.isFinite)).toBe(true);
});

it("pauses physics and device time together", () => {
  const clock = createFixedStepPauseState();
  clock.setPaused(true);
  expect(clock.consume(1000 / 60)).toBe(0);
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/game/raceCourse.test.ts src/react-app/game/MarbleRaceScene.test.ts`

Expected: FAIL for missing adapter/custom selection/pause while all unchanged built-in assertions identify the compatibility surface.

- [ ] **Step 4: Implement the two concrete adapters and shared loop**

```ts
export type RaceCourseRun = Readonly<{
  launchPositions: readonly PhysicalLaunchPosition[];
  stepBeforeWorld: () => Readonly<{ raceClockStarted: boolean }>;
  stepAfterWorld: (bodies: readonly RapierBody[]) => readonly BoosterEvent[];
  reset: (remainingRestart: boolean) => void; dispose: () => void;
}>;
export type RaceCourse = Readonly<{
  kind: "builtin" | "custom"; samples: readonly TrackSample[]; geometry: TrackGeometry;
  renderGroup: THREE.Group; attach: (world: RapierWorld) => unknown;
  createRun: (world: RapierWorld, count: number, seed: number, remainingRestart: boolean) => RaceCourseRun;
  dispose: () => void;
}>;
```

The built-in adapter wraps `buildValidatedTrack`, `createTrackRenderGroup`, `createObstaclePhysics`, and existing launch helpers. The modular adapter wraps Tasks 6–8. `MarbleRaceScene` owns one `RaceCourse`, creates a run on `begin`, calls `stepBeforeWorld → world.step → stepAfterWorld` once per fixed step, and feeds common `samples` into existing projection/camera/finish code.

`setPaused(true)` stops accumulator consumption and race/device clocks while rendering the stable frame. Non-finite/out-of-bounds bodies are disabled and emit DNF once. Initialization/build errors emit `error`, leave no world/resources alive, and allow App to return to the editor.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/game/raceCourse.test.ts src/react-app/game/MarbleRaceScene.test.ts`

Expected: PASS for every pre-existing built-in assertion plus custom buffers, existing projection/camera consumption of custom samples, exact adapter order, pause/resume, remaining restart reset, DNF, error, and idempotent disposal.

```bash
git add src/react-app/game/raceCourse.ts src/react-app/game/raceCourse.test.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.test.ts
git commit -m "feat: run built-in and modular courses"
```

- [ ] **Step 6: Sol review gate**

Sol reruns both suites and a targeted `npm test -- --run src/react-app/game/track/trackRender.test.ts src/react-app/game/track/obstaclePhysics.test.ts`, verifies default selection is built-in, and approves Task 10.

---

### Task 10: App State, Readiness, Persistence, Import, Pause, and Errors

**Files:**
- Create: `src/react-app/runtimeReady.ts`
- Create: `src/react-app/runtimeReady.test.ts`
- Create: `src/react-app/App.test.tsx`
- Create: `src/react-app/App.integration.test.tsx`
- Modify: `src/react-app/App.tsx`
- Modify: `src/react-app/App.css`
- Modify: `src/react-app/index.css`

**Interfaces:**
- Consumes: Tasks 1–4 and Task 9.
- Produces: `preloadRuntime(loadRace?): Promise<void>` and the complete loading/setup/editor/race/results application flow.

- [ ] **Step 1: Sol dispatches Task 10 to Luna**

App must write storage before replacing library state and must never auto-save imported hashes.

- [ ] **Step 2: Write failing readiness/App tests**

```tsx
it("reports Ready only after the race chunk and Rapier initialize", async () => {
  const physics = deferred<void>();
  const ready = preloadRuntime(async () => ({ initializeScenePhysics: () => physics.promise }));
  expect(await isSettled(ready)).toBe(false);
  physics.resolve();
  await expect(ready).resolves.toBeUndefined();
});

it("loads a hash share as an unsaved playable preview", async () => {
  location.hash = `track=${encodeSharedTrack(createValidTrackDesign("Shared"))}`;
  render(<App />);
  expect(await screen.findByDisplayValue("Shared")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Test Play" })).toBeEnabled();
  expect(localStorage.getItem("luckyroll.tracks")).toBeNull();
});

it("keeps invalid edits out of storage", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openNewTrack();
  await user.click(screen.getByRole("button", { name: "Clear row 1 column 2" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(localStorage.getItem("luckyroll.tracks")).toBeNull();
});
```

Add an App integration suite whose scene spy never constructs or steps a Rapier world, so allocating the ordinary 100 marble records does not consume a qualification seed:

```tsx
const sceneHarness = vi.hoisted(() => ({
  emit: undefined as ((event: SceneEvent) => void) | undefined,
  start: vi.fn(), restartRemaining: vi.fn(), reset: vi.fn(), setPaused: vi.fn(), dispose: vi.fn(),
  create: vi.fn(),
}));

vi.mock("./game/MarbleRaceScene", () => ({
  initializeScenePhysics: () => Promise.resolve(),
  createRaceScene: sceneHarness.create,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  location.hash = "";
  sceneHarness.create.mockImplementation((_canvas, emit) => {
    sceneHarness.emit = emit;
    return { start: sceneHarness.start, restartRemaining: sceneHarness.restartRemaining, reset: sceneHarness.reset, setPaused: sceneHarness.setPaused, dispose: sceneHarness.dispose };
  });
});

it.each(["generated", "saved", "shared"] as const)("runs a %s track through the existing race lifecycle", async (source) => {
  const track = createDefaultTrackDesign(`${source} course`);
  if (source === "saved") persistTrackLibrary(localStorage, { version: 1, tracks: [{ id: "saved-id", updatedAt: 1, ...track }] });
  if (source === "shared") location.hash = `track=${encodeSharedTrack(track)}`;
  render(<App />);
  await screen.findByText("Ready");

  if (source === "generated") {
    await userEvent.click(screen.getByRole("button", { name: "Track Designer" }));
    await userEvent.click(screen.getByRole("button", { name: "New Track" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Track name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Track name" }), track.name);
    await userEvent.click(screen.getByRole("button", { name: "Test Play" }));
  } else if (source === "saved") {
    await userEvent.click(screen.getByRole("button", { name: "Play saved course, track saved-id" }));
  } else {
    await userEvent.click(screen.getByRole("button", { name: "Test Play" }));
  }

  await waitFor(() => expect(sceneHarness.start).toHaveBeenCalled());
  const [marbles] = sceneHarness.start.mock.calls.at(-1)!;
  expect(marbles).toHaveLength(100);
  expect(sceneHarness.create.mock.calls.at(-1)![2]).toEqual({ kind: "custom", track: { name: track.name, cells: track.cells } });

  act(() => sceneHarness.emit!({ type: "tick", elapsedMs: 1_000, finishedCount: 0, remaining: marbles, leader: marbles[0], trailer: marbles[99] }));
  expect(screen.getByText("0/100")).toBeInTheDocument();
  act(() => sceneHarness.emit!({ type: "timeout", remaining: marbles.slice(0, 2) }));
  await userEvent.click(screen.getByRole("button", { name: "RACE REMAINING MARBLES" }));
  expect(sceneHarness.restartRemaining).toHaveBeenCalledWith(marbles.slice(0, 2));

  for (const marble of marbles) act(() => sceneHarness.emit!({ type: "finish", marble }));
  expect(await screen.findByRole("heading", { name: "TOP 10" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "AGAIN!" }));
  await userEvent.click(screen.getByRole("button", { name: "START RACE" }));
  await waitFor(() => expect(sceneHarness.create).toHaveBeenCalledTimes(2));
  expect(sceneHarness.create.mock.calls[1][2]).toEqual({ kind: "custom", track: { name: track.name, cells: track.cells } });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/runtimeReady.test.ts src/react-app/App.test.tsx src/react-app/App.integration.test.tsx src/react-app/components/SetupScreen.test.tsx`

Expected: FAIL because readiness and application designer flows do not exist.

- [ ] **Step 4: Implement the state machine and atomic handlers**

```ts
export const preloadRuntime = async (
  loadRace: () => Promise<Pick<typeof import("./game/MarbleRaceScene"), "initializeScenePhysics">> =
    () => import("./game/MarbleRaceScene"),
): Promise<void> => {
  const race = await loadRace();
  await race.initializeScenePhysics();
};
```

Use views `"loading" | "setup" | "editor" | "race" | "results"`. On mount: call `preloadRuntime`, call `loadTrackLibrary`, then decode one hash share. A corrupt library yields a visible reset action; invalid hash yields a non-destructive error. New Track starts from `createDefaultTrackDesign`; Test Play, saved-track Play, and shared-preview Play all pass `{ kind: "custom", track }` into the same existing race start path. That path always calls `allocateMarbles` for 100 race marbles and preserves the selected course across timeout restart, remaining-marble restart, results, and `AGAIN!`; only choosing Built-in or another track changes it.

Save handler:

```ts
const saveEditor = () => {
  if (!editor || !editor.validation.ok) return;
  try {
    const result = upsertTrack(library, editor.draft, { id: editor.id, now: Date.now(), uuid: () => crypto.randomUUID() });
    persistTrackLibrary(localStorage, result.library);
    setLibrary(result.library);
    setEditor(createEditorState(result.track, result.track.id));
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Could not save locally.");
  }
};
```

Delete follows the same construct → persist → set order after `window.confirm`. `start` stores `RaceCourseSelection` in `Session`; built-in remains selected when no custom ID exists. Race UI adds Pause/Resume, Mute, Exit, textual DNF/error status, and passes selection to `createRaceScene`. Reduced motion is read through `matchMedia` and selects the stable overview camera.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- --run src/react-app/runtimeReady.test.ts src/react-app/App.test.tsx src/react-app/App.integration.test.tsx src/react-app/components/SetupScreen.test.tsx src/react-app/components/TrackEditor.test.tsx src/react-app/components/TrackLibraryPanel.test.tsx src/react-app/components/ShareTrackDialog.test.tsx`

Expected: PASS for Ready ordering, built-in fallback, local select/delete, valid Save, invalid action disabling, duplicate UUIDs, share preview, corrupt/quota/clipboard/runtime errors, pause/mute, dirty exit, focus restoration, current player setup, and generated/saved/shared tracks entering the existing 100-marble HUD, timeout, remaining restart, results, and rematch lifecycle.

```bash
git add src/react-app/runtimeReady.ts src/react-app/runtimeReady.test.ts src/react-app/App.test.tsx src/react-app/App.integration.test.tsx src/react-app/App.tsx src/react-app/App.css src/react-app/index.css
git commit -m "feat: integrate modular track designer"
```

- [ ] **Step 6: Sol review gate**

Sol verifies no state setter precedes a storage write, imported content has no local ID until Save, race errors retain editor/library data, and approves Task 11.

---

### Task 11: Remove the Unused API and Prove the Loaded Offline Contract

**Files:**
- Modify: `src/worker/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `wrangler.json`
- Create: `src/react-app/offlineContract.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `preloadRuntime`.
- Produces: static-host-only worker configuration and documented post-Ready network contract.

- [ ] **Step 1: Sol dispatches Task 11 to Luna**

No dependency may be added. Keep the Cloudflare assets directory and SPA fallback.

- [ ] **Step 2: Write the failing repository contract test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("contains no application API, Hono runtime, or observability", () => {
  const root = process.cwd();
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const worker = readFileSync(resolve(root, "src/worker/index.ts"), "utf8");
  const wrangler = JSON.parse(readFileSync(resolve(root, "wrangler.json"), "utf8"));
  expect(pkg.dependencies?.hono).toBeUndefined();
  expect(worker).not.toContain("Hono");
  expect(worker).not.toContain("/api/");
  expect(wrangler.observability).toBeUndefined();
  expect(wrangler.assets.not_found_handling).toBe("single-page-application");
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- --run src/react-app/offlineContract.test.ts`

Expected: FAIL because `hono`, `/api/`, and `observability` still exist.

- [ ] **Step 4: Remove only unused backend behavior**

Run: `npm uninstall hono`

Replace the worker with a static-host fallback:

```ts
export default {
  fetch: () => new Response("Not Found", { status: 404 }),
} satisfies ExportedHandler<Env>;
```

Keep `main`, `assets.directory`, and SPA `not_found_handling` in `wrangler.json`; remove only `observability`. Update README with the 5×8 editor, valid-only Save/Share/Play, token sharing, post-Ready no-network guarantee, and cold-offline/PWA exclusion. Remove the Hono documentation link and remote future-audio recommendation.

- [ ] **Step 5: Run GREEN, build, and commit**

Run: `npm test -- --run src/react-app/offlineContract.test.ts src/react-app/runtimeReady.test.ts`

Expected: PASS with static hosting intact and no app API/runtime Hono.

Run: `npm run build`

Expected: `tsc -b && vite build` exits 0 and emits the client bundle plus Cloudflare static worker output without unresolved Hono imports.

```bash
git add src/worker/index.ts package.json package-lock.json wrangler.json src/react-app/offlineContract.test.ts README.md
git commit -m "chore: remove unused application API"
```

- [ ] **Step 6: Sol review gate**

Sol inspects the built asset graph for external URLs, confirms the static host still serves SPA navigation, reruns build, and approves Task 12.

---

### Task 12: Focused Regression, Modular Qualification Ledger, and Ten Seed Runs

**Files:**
- Create: `src/react-app/game/modular/modularTrackPhysics.validation.test.ts`
- Create: `.superpowers/sdd/2026-09-03-modular-track-designer/physics-run-ledger.md`

**Interfaces:**
- Consumes: `createWorstCaseTrackDesign`, `FIXED_VALIDATION_SEEDS`, `validateQualificationSeeds`, `runModularValidationRace`.
- Produces: guarded qualification output and an immutable separate ledger.

- [ ] **Step 1: Sol dispatches Task 12 to Luna**

Sol records the reviewed Task 11 commit hash. Luna may write the guard test and ledger, but must not change product physics code or set `RUN_MODULAR_TRACK_QUALIFICATION=1`.

- [ ] **Step 2: Write the failing ledger guard**

```ts
const ledgerPath = resolve(process.cwd(), ".superpowers/sdd/2026-09-03-modular-track-designer/physics-run-ledger.md");
const runQualification = process.env.RUN_MODULAR_TRACK_QUALIFICATION === "1";
const ledgerRows = (markdown: string): readonly Readonly<{ seed: number; state: "pending" | "recorded" }>[] =>
  Array.from(markdown.matchAll(/^\|\s*(\d+)\s*\|\s*(pending|recorded)\s*\|/gm), (match) => ({ seed: Number(match[1]), state: match[2] as "pending" | "recorded" }));

it("accepts only the pending canonical seed suffix", () => {
  const rows = ledgerRows(readFileSync(ledgerPath, "utf8"));
  const recorded = rows.filter((row) => row.state === "recorded").map((row) => row.seed);
  const pending = rows.filter((row) => row.state === "pending").map((row) => row.seed);
  expect(validateQualificationSeeds(pending, recorded)).toEqual(FIXED_VALIDATION_SEEDS.slice(recorded.length));
});

it.runIf(runQualification)("runs each pending 100-marble seed exactly once", async () => {
  const rows = ledgerRows(readFileSync(ledgerPath, "utf8"));
  const seeds = validateQualificationSeeds(rows.filter((row) => row.state === "pending").map((row) => row.seed), rows.filter((row) => row.state === "recorded").map((row) => row.seed));
  const results = [];
  const errors: Readonly<{ seed: number; message: string }>[] = [];
  for (const seed of seeds) {
    try {
      const result = await runModularValidationRace({ track: createWorstCaseTrackDesign(), seed, marbleCount: 100, durationSeconds: 60 });
      console.log(JSON.stringify({ seed, state: "recorded", finishers: result.finishOrder.length, escapes: result.escapes.length, stalls: result.stalls.length, nonFinite: result.nonFinite.length, capViolations: result.boosterCapViolations.length, result: "PASS" }));
      results.push(result);
    } catch (error) {
      const failure = { seed, message: error instanceof Error ? error.message : String(error) };
      console.log(JSON.stringify({ seed, state: "recorded", result: "ERROR", error: failure.message }));
      errors.push(failure);
    }
  }
  expect(errors).toEqual([]);
  expect(results.flatMap((result) => result.nonFinite)).toEqual([]);
  expect(results.flatMap((result) => result.escapes)).toEqual([]);
  expect(results.flatMap((result) => result.stalls)).toEqual([]);
  expect(results.flatMap((result) => result.boosterCapViolations)).toEqual([]);
  expect(results.every((result) => new Set(result.finishOrder).size === result.finishOrder.length)).toBe(true);
}, 600_000);
```

- [ ] **Step 3: Run RED without consuming the budget**

Run: `npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts`

Expected: FAIL because the new ledger is absent. The guarded 100-marble test is skipped.

- [ ] **Step 4: Create the untouched ledger and make the guard GREEN**

```md
# Lucky Roll Modular Track Physics Qualification Ledger

- Source commit: record immediately before qualification
- Budget: 0/10 consumed
- Command: RUN_MODULAR_TRACK_QUALIFICATION=1 npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts
- Rule: a seed is consumed once its 100-marble world begins stepping; never rerun without user approval.

| Seed | State | Finishers | Escapes | Stalls | Non-finite | Cap violations | Result |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 11 | pending | — | — | — | — | — | — |
| 23 | pending | — | — | — | — | — | — |
| 37 | pending | — | — | — | — | — | — |
| 41 | pending | — | — | — | — | — | — |
| 53 | pending | — | — | — | — | — | — |
| 67 | pending | — | — | — | — | — | — |
| 71 | pending | — | — | — | — | — | — |
| 83 | pending | — | — | — | — | — | — |
| 97 | pending | — | — | — | — | — | — |
| 101 | pending | — | — | — | — | — | — |
```

Run: `npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts`

Expected: PASS for ledger parsing/seed refusal; qualification remains skipped and budget remains 0/10.

- [ ] **Step 5: Run every non-budgeted verification before qualification**

Run:

`npm test -- --run src/react-app/designer src/react-app/components src/react-app/runtimeReady.test.ts src/react-app/offlineContract.test.ts src/react-app/App.test.tsx src/react-app/game/cameraControls.test.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/marbleBatches.test.ts src/react-app/game/raceTiming.test.ts src/react-app/game/MarbleRaceScene.test.ts src/react-app/game/raceCourse.test.ts src/react-app/game/modular src/react-app/game/track/trackSpec.test.ts src/react-app/game/track/trackSampler.test.ts src/react-app/game/track/trackGeometry.test.ts src/react-app/game/track/trackValidation.test.ts src/react-app/game/track/trackRender.test.ts src/react-app/game/track/trackPhysics.launchInvariants.test.ts src/react-app/game/track/obstacleLayout.test.ts src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/track/obstacleRender.test.ts src/react-app/game/track/obstaclePhysics.test.ts`

Expected: PASS. The qualification case is skipped because the environment variable is absent; legacy `*Seeds.test.ts` files and the consumed obstacle qualification are not run.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 6: Sol authorizes the single qualification command**

Replace `record immediately before qualification` with the exact reviewed Task 11 `git rev-parse HEAD` value. Sol confirms the ledger says 0/10, product code matches that recorded commit, and no product code may change during the run; only the untracked guard test and ledger may differ.

Run exactly once:

`$env:RUN_MODULAR_TRACK_QUALIFICATION='1'; npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts; $qualificationExit=$LASTEXITCODE; Remove-Item Env:RUN_MODULAR_TRACK_QUALIFICATION; exit $qualificationExit`

Expected: ten printed result rows and PASS: zero non-finite bodies, escapes, stalls (`speed <0.12` continuously for 3,000 ms after gate release), booster-created results above 18, or duplicate finish IDs. Each seed is consumed even if its world errors after stepping begins.

Immediately replace every invoked seed's pending ledger row with its printed `recorded` result using `apply_patch`; a printed `ERROR` row is still consumed. Set the budget to the exact recorded-row count, which is `10/10 consumed` when the command reaches all seeds. Never rerun this command. If the process aborts before invoking every seed, leave only never-invoked seeds pending, preserve the output/ledger, reproduce only with focused lower-count or seam tests, and request user approval before any additional 100-marble run.

- [ ] **Step 7: Commit qualification evidence**

```bash
git add src/react-app/game/modular/modularTrackPhysics.validation.test.ts
git add -f .superpowers/sdd/2026-09-03-modular-track-designer/physics-run-ledger.md
git commit -m "test: qualify modular track physics"
```

- [ ] **Step 8: Sol review gate**

Sol checks the command was invoked once, all ten canonical seeds are recorded once, the old canonical ledger is unchanged, and no post-qualification physics code changed.

---

### Task 13: Browser, Accessibility, Offline, Performance, and Lifecycle Acceptance

**Files:**
- Create: `.superpowers/sdd/2026-09-03-modular-track-designer/acceptance.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed application and debug overlay.
- Produces: recorded acceptance evidence only; discovered product defects return to the responsible task and require focused tests before another browser pass.

- [ ] **Step 1: Sol dispatches Task 13 to Luna for evidence capture**

Luna starts the reviewed build without changing product code.

- [ ] **Step 2: Start the production preview**

Run: `npm run build`

Expected: exit 0.

Run: `npm run preview -- --host 127.0.0.1`

Expected: Vite prints a reachable local URL. Leave this process running for the browser checks.

- [ ] **Step 3: Verify browser flows and lifecycle**

In Chromium, execute this exact sequence:

1. Wait for Ready, open New Track, confirm the corrected 36-cell default fixture is valid, Test Play it, and confirm the existing HUD reports 100 total marbles, camera controls work, timeout remaining/all restart work, results appear, and `AGAIN!` starts a rematch on the same custom track.
2. Edit one track into an invalid route; confirm Save/Share/Test Play disable and the stored valid version remains after reload.
3. Save the valid track, play it from the library, and repeat the HUD/camera/timeout/results/rematch checks; then create a same-named second track and confirm distinct list actions.
4. Copy link and token; open the link, confirm an unsaved playable preview, Test Play it through the same full lifecycle, then Save and confirm a new UUID entry.
5. Try malformed/oversized import; confirm current preview/library remain.
6. Play built-in, then custom; Pause for five seconds and confirm marble/pinwheel/time freeze; Resume; restart remaining; Exit.
7. Repeat custom edit/play/reset/import/dispose ten times with `?trackDebug=1`; record stable renderer objects, Rapier body/collider counts, listeners, loops, and memory.
8. Deny storage and clipboard in browser permissions; confirm visible errors and selectable share fields without lost state.

Expected: every sequence succeeds with no uncaught console error.

- [ ] **Step 4: Verify accessibility and reduced motion**

Keyboard-only: traverse the menu, palette, all 40 cells, name, Replace/Clear, validation errors, Save/Share/Play, Pause/Resume/Mute/Exit, dialogs, and results. Confirm focus returns to its opener.

Enable Chromium reduced-motion emulation. Expected: stable overview camera, no decorative pulses, and synchronized physical devices. Use the platform screen reader to confirm cell row/column/kind/direction/fixed/error labels, restrained status announcements, textual standings/results, and no per-frame speech. Confirm visible focus, non-color indicators, AA text contrast, and 44-pixel touch targets.

- [ ] **Step 5: Verify post-Ready offline and mobile performance**

Load once, wait for Ready, then block all network including same-origin. Create/edit/save/play a track and import a raw token.

Expected: no network request is attempted and all loaded workflows succeed. Reload is not tested.

At `360×800`, run the worst-case custom design with 100 active marbles. Ignore the first 5 seconds, record the next 30 seconds, and compute median FPS from debug samples.

Expected: median FPS `≥30`, no per-frame allocation growth, no clipped controls, and touch drag/zoom remains usable. Record machine, OS, Chromium version, viewport, median FPS, console status, and screenshots in `acceptance.md`.

- [ ] **Step 6: Write the acceptance record and commit**

Create `acceptance.md` with the heading `# Modular Track Designer Acceptance` and these exact keys: `Commit`, `Machine/OS`, `Chromium`, `Viewport`, `Warm-up`, `Measurement`, `Median FPS`, `Network after Ready`, `Keyboard/screen reader/reduced motion`, `Lifecycle ten-cycle counts`, `Console`, and `Desktop/mobile flow`. Populate `Commit` from `git rev-parse HEAD`; populate machine, OS, and Chromium from the test environment; record `Viewport: 360x800`, `Warm-up: 5 seconds`, `Measurement: 30 seconds`, and the numeric median. The last five fields contain `PASS` plus the observed zero-request, stable-count, or zero-error evidence. Do not commit blank fields or instructional text.

```bash
git add README.md
git add -f .superpowers/sdd/2026-09-03-modular-track-designer/acceptance.md
git commit -m "docs: record modular designer acceptance"
```

- [ ] **Step 7: Sol final verification**

Run: `npm test -- --run`

Expected: PASS with guarded qualification skipped and no legacy regression failure.

Run: `npm run lint`

Expected: exit 0 with no errors.

Run: `npm run build`

Expected: exit 0.

Run: `git diff --check`

Expected: no output.

Sol reviews the complete implementation range against every spec section, confirms the two ledgers are separate and immutable, confirms `.codex-remote-attachments/` is absent from commits, and declares acceptance only if all evidence is present.

- [ ] **Step 8: Offer final integration options**

After Sol acceptance, use `superpowers:finishing-a-development-branch` and offer exactly:

1. fast-forward/merge the reviewed branch locally;
2. push the reviewed branch and open a pull request;
3. keep the reviewed branch/worktree for later.

Do not merge, push, deploy, delete a worktree, or alter `main` without the user's selected option. Cloudflare remains the static host; after an authorized push, the user confirms deployment status.
