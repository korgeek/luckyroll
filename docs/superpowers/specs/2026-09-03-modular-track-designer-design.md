# Lucky Roll Modular Track Designer Design

## Goal

Add a browser-only 5-column by 8-row modular track designer to Lucky Roll so players can assemble, validate, save, share, and race custom marble tracks without editing source code. The designer uses square procedural 3D modules, keeps the existing 100-marble race experience, and stores all user data in the browser.

## Product Boundary

- The application remains client-only after its bundle loads.
- Track persistence uses browser `localStorage`; there is no database, account, authentication, cloud backup, or synchronization.
- Track sharing uses a user-copied Base64URL token or a link whose URL hash contains that token.
- JavaScript, Rapier WASM, geometry, icons, sounds, fonts, and materials ship with the application. The client makes no runtime API, telemetry, analytics, CDN, font, or asset requests.
- Cloudflare remains only the static application host. Remove the unused Hono `/api/` route and disable unused observability; the browser does not call an application backend.
- Startup eagerly loads every locally bundled lazy chunk and runtime asset required by editing, racing, sharing, audio, and Rapier before the main menu reports Ready. After that point, those workflows continue to work with all network requests, including same-origin requests, blocked. Cold offline reload, PWA installation, and service-worker caching are not included.
- A shared link still requires access to the hosted app origin. The raw Base64URL token is the origin-independent offline transfer format.

## User Experience

### Main menu and track library

The existing setup screen gains a **Track Designer** entry and a browser-local track list. The list is ordered by most recently updated and supports:

- create a new track;
- select or edit an existing track;
- play a valid track;
- share a valid track as a link or text token;
- delete a track after confirmation.

The existing built-in track remains the fallback when no custom track is selected. Deleting the selected custom track returns selection to the built-in track.

Track names are labels rather than identifiers. Duplicate names are allowed and never overwrite another track. Local identity and updates use a generated UUID.

### Board-focused editor

The editor uses the approved board-focused layout:

- a compact header contains Back, track name, Test Play, Share, and Save;
- the 5-column by 8-row board is the dominant surface;
- a compact palette contains the available module types;
- the local track list remains on the preceding screen rather than competing with the board.

Interaction rules:

- select a palette module, then tap an empty editable cell to place it;
- tap an occupied editable cell to rotate it through its distinct orientations;
- long-press an occupied cell to open Replace and Clear actions;
- pointer movement cancels a pending long-press;
- visible keyboard-accessible Replace and Clear actions mirror the long-press menu;
- Back asks for confirmation before discarding unsaved changes;
- Test Play, Share, and Save are disabled until the name, schema, and route are valid.

The top-left start and bottom-right finish are permanent. They cannot be replaced, cleared, or rotated. Empty cells are allowed anywhere else.

## Track Data

Use one localStorage key, `luckyroll.tracks`, with this versioned logical shape:

```ts
type TrackLibrary = {
  version: 1;
  tracks: LocalTrack[];
};

type LocalTrack = {
  id: string;
  name: string;
  cells: TrackCell[];
  updatedAt: number;
};

type SharedTrack = {
  version: 1;
  name: string;
  cells: TrackCell[];
};
```

Local IDs come from `crypto.randomUUID()` and timestamps from `Date.now()`. IDs and timestamps are never accepted from shared input. Names are trimmed, contain 1 to 60 characters, and contain no control characters.

`cells` contains exactly 40 row-major entries. Cell `0` is the fixed start with an east-facing output. Cell `39` is the fixed finish with a west-facing input. Other cells are empty or contain one module kind and a canonical quarter-turn orientation.

Portable data contains only version, name, and cells. Physics tuning, obstacle dimensions, resolved travel directions, and render data are derived and never serialized.

Reject rather than coerce:

- any version other than exactly `1`;
- missing or extra object fields;
- unknown module kinds or orientations;
- non-finite values;
- malformed names or a cell count other than 40;
- payloads that fail route validation.

After validation, construct a new normalized object containing only allowed fields.

## Route Validation

One pure validator is authoritative for the editor, storage, import, share, runtime build, and tests.

Starting at the fixed east output of the top-left start, follow reciprocal module connectors until the bottom-right finish is entered from the west. Horizontal traversal may move left or right. Vertical traversal may move down to a larger row but never up to a smaller row.

Reject a layout when:

- an output leaves the board;
- an output enters an empty cell or a mismatched connector;
- traversal moves upward;
- a cell is revisited, creating a loop;
- a module exposes the wrong number of route connections;
- traversal stops before the finish or passes through it;
- the finish is approached from any side except west;
- any non-empty placed module was not visited, creating an orphan path.

This traversal proves that every placed module belongs to one gap-free, unbranched start-to-finish route. It does not require all 40 cells to be filled. A north-facing connector may receive a marble from the row above; only actual upward traversal is prohibited.

Validation returns cell-addressed failures so the editor can highlight every affected cell, focus the first failure on request, and show a short textual error list.

## Local Storage and Sharing

### Storage

For every create, update, or delete:

1. construct and validate the next library value;
2. persist it to `localStorage` inside `try/catch`;
3. update React state only after persistence succeeds.

Invalid edits cannot be saved. An already-saved valid version remains untouched while invalid edits stay in memory. If storage is denied or quota-limited, retain the current in-memory editor state, keep the prior library visible, and report that the operation was not saved.

Do not silently delete or overwrite malformed or unknown-version stored data. Show an explicit reset-library action that requires confirmation.

Deletion uses `window.confirm()` and addresses tracks only by ID. If persistence fails, the track remains visible.

### Codec and import

The portable representation is compact UTF-8 JSON encoded as unpadded Base64URL. A shared URL uses one hash parameter:

```text
#track=<Base64URL token>
```

Use browser-native `TextEncoder`, `TextDecoder`, `btoa`, `atob`, `URL`, and `URLSearchParams`. Reject a token longer than 8,192 characters before decoding and decoded JSON larger than 6,144 bytes. Accept a raw token, the hash form, or a full URL containing the hash, but route all forms through one decoder and validator. Require exactly one non-empty `track` hash parameter.

A valid imported or linked track becomes an unsaved active preview with its shared name and cells already set. It can be played immediately or saved to the local library with a fresh UUID. Import never saves automatically, and a duplicate name remains a separate track.

An invalid or oversized import leaves the current preview and library unchanged.

The Share action prefers the native Web Share API when available. Otherwise it copies the full URL with the Clipboard API and also exposes a selectable link and raw token when clipboard access fails.

## Modular Board Geometry

Build modules in board-local coordinates and apply one shared 20-degree world tilt toward increasing row numbers to both Three.js visuals and Rapier collider transforms. Rotating only the render group is invalid.

The canonical starting scale is:

- marble diameter `D = 0.68` world units;
- square module size `S = 20` world units;
- standard clear channel width `W = 12` world units;
- containment rail height `4` world units;
- start bowl radius `8.5` world units;
- fixed physics timestep `1/60` second.

The board therefore occupies five modules across and eight modules down before tilt. Every cell-edge connector uses the same center, clear width, floor height, rail profile, and seam tolerance. Adjacent floor and rail geometry shares canonical endpoints or a sub-diameter overlap so no marble-sized gap exists.

Repeated module geometry and materials are shared or instanced. Decorative surfaces add no snag-prone collider detail. One canonical layout supplies transforms to rendering, physics, editor previews, and validation so visible and physical modules cannot drift apart.

### Module catalog

The approved catalog contains seven editable module kinds plus the fixed start and finish:

1. **Straight** — canonical two-edge U-channel; two distinct rotations.
2. **90-degree curve** — tangent-continuous quarter turn with a wide radius and containment rail; four rotations.
3. **Gentle funnel straight** — standard-width connectors, smooth symmetric taper to `max(0.80W, 6D)`, a waist no longer than 10 percent of the module, then a smooth return to full width.
4. **Wave straight** — a smooth S centerline whose offset and tangent return to zero at both seams. Its centerline is `0.15W × sin(2πt) × sin²(πt)`, which keeps the complete channel and rails inside the square module.
5. **Pinwheel straight** — a deterministic fixed-step kinematic rotor with rounded capsule arms, radius `0.28W`, arm thickness `0.5D`, and angular speed `2` radians per second. Every rotor phase retains at least `3D` of open passage; the module has two rotations.
6. **Booster straight** — standard straight collision geometry plus a flush, render-only activation panel and neon directional chevrons; two rotations.
7. **Diagonal bumper straight** — three fixed rounded bars alternating from the channel walls and angled downstream; two rotations. The runtime mirrors the bar layout from the validated travel direction so eastbound and westbound traversal always points bumper tips downstream. An invalid or disconnected editor preview uses symmetric neutral bars and no direction arrow.

The fixed start contains the existing-style bowl, deterministic seeded placement for up to 100 marbles, visible agitator, release gate, and eastward launch. The fixed finish accepts only a west-to-east arrival and exposes the finish volume used by existing race events.

### Diagonal bumper dimensions

The bumper module produces order variation through deterministic geometry and dense marble collisions rather than random forces.

- Each bumper is `0.4D` to `0.5D` thick and `1.25D` to `1.5D` high.
- Free ends are rounded and point 25 to 35 degrees downstream so they deflect forward rather than create backward-facing pockets.
- Every longitudinal slice retains at least `3D` of unobstructed passage.
- Opposing bumpers are separated longitudinally by at least `2D`.
- The first and last bumpers stay at least `1.5D` from a module seam.
- Total projected obstruction is at most 40 percent of channel width.
- Wall ends overlap slightly; exposed ends use primitive cylinder caps.

Rendering and Rapier consume the same box-shaft and cylinder-cap transforms. Static bumper restitution starts at `0.28`; track friction remains the existing `0.24` baseline.

## Physics and Racing Feel

Gravity, the visible start launcher, the board's continuous 20-degree grade, collisions, the visible pinwheel, and explicit boosters are the only energy sources. There are no hidden ranking forces, continuous route assist, random impulses, teleportation, or recovery forces.

The start launcher provides an initial eastward forward speed of `8` world units per second so the first horizontal row moves immediately. Downward transitions convert the visible board grade into speed for later horizontal runs. The curve profile and containment rails preserve momentum; the booster lets authors deliberately reinforce long horizontal sections.

### Booster rule

The booster trigger covers the full drivable channel width and the centered 20 percent of its module length. After every fixed physics step, compare each marble's previous and current board-local positions so a fast marble that crosses the entire band still triggers.

For a forward crossing not previously consumed by that marble and booster:

```text
boostedForwardSpeed = min(1.20 × currentForwardSpeed, 18)
```

Apply only a positive velocity delta along the resolved route tangent. Preserve lateral, surface-normal, and angular velocity. If forward speed is non-positive or already at or above the cap of `18` world units per second, do nothing and never decelerate the marble.

Each marble can trigger each booster once per race. Reset the consumption matrix on full restart and remaining-marble restart. Resolve arrow direction from validated route traversal rather than serializing another orientation.

Booster and bumper stay separate modules. Both booster-to-bumper and bumper-to-booster adjacency are allowed and must be qualified. Add a spacer rule only if physical validation proves one is required.

## Race and Resource Lifecycle

Reuse the existing 100-marble bodies, instanced color rendering, HUD, results, timeout handling, fixed-step loop, camera controls, and reset/dispose lifecycle where compatible.

A valid design builds one board resource bundle that owns:

- Three.js module groups, geometries, materials, and lights;
- the Rapier world, fixed colliders, marble bodies, and pinwheel bodies;
- resolved booster triggers and per-marble consumption state;
- the animation loop, audio hooks, resize/pointer/keyboard listeners, and pause state.

Replacing or disposing a board stops its loop, removes listeners, removes or disposes physics resources, and disposes uniquely owned render resources exactly once before the replacement is built. Shared geometry and materials have one explicit owner. No frame loop creates geometry, materials, or unbounded arrays.

Race start initializes marble bodies and deterministic device state. Pause stops physics, pinwheel time, and race time together. Restart restores timing, pinwheel phase, marble bodies, the release sequence, and booster consumption state.

A non-finite or escaped marble becomes DNF without crashing or teleporting. Track-build, Rapier, or WebGL failure aborts Play, preserves the design and library, shows a user-facing error, and returns safely to the editor.

## Accessibility

- Represent the editor as a DOM `grid` of native controls; the canvas is a visualization, not the only interface.
- Support arrow-key cell navigation, placement, rotation, replace, clear, Save, Share, Play, Pause/Resume, Mute, and Exit.
- Announce each cell's row, column, module kind, rotation or resolved direction, fixed state, and validation error.
- Use visible focus, adequate contrast, text/icons/patterns in addition to color, and mobile-size touch targets.
- Use restrained live regions for validation, storage, import, and results rather than frame updates.
- Keep textual race standings and results available.
- Reduced-motion mode uses a stable overview camera and removes decorative pulses while physical obstacle visuals remain synchronized.
- Restore focus after confirmations and dialogs.

## Verification

### Data and UI

- Route validation covers fixed endpoints, reciprocal connectors, left/right/down traversal, rejected upward movement, gaps, loops, branches, orphan modules, and wrong finish entry.
- Codec tests cover Unicode names, strict Base64URL alphabet and padding, raw/hash/full-URL imports, malformed UTF-8/JSON, size limits, unknown versions/types/fields, wrong cell count, and invalid routes.
- Valid shared data changes only the active preview; Save creates a fresh UUID even for duplicate names.
- Corrupt or throwing storage never erases the prior UI state or claims success.
- Editor tests cover palette placement, distinct rotation cycles, long-press cancellation, replace, clear, disabled actions, dirty-exit confirmation, and keyboard equivalents.

### Geometry and physics

- Every generated buffer and transform is finite.
- Visual and collider transforms, board tilt, module seams, connector widths, and finish volume agree.
- Funnel width/profile, bumper clearances, rounded exposed ends, wave seam tangents, curve containment, and pinwheel passage pass static checks.
- Booster tests cover the 1.20 multiplier, positive-only tangent delta, cap, swept crossing, backward entry, once-only behavior, and restart reset.
- Fixed-seed physics tests cover a maximum legal horizontal run, dense funnel entry, pinwheel contact, obstacle-to-curve transitions, booster-to-bumper, and bumper-to-booster.
- One consolidated worst-case valid design runs 100 marbles across the existing ten fixed seeds. Record these as a new track-designer qualification budget and ledger, separate from the completed canonical-track ledger, and consume each seed at most once without user approval for additional runs. Require zero non-finite velocities, escapes, duplicate finish IDs, and booster cap violations, where a violation means the booster adds positive forward speed that leaves the result above `18`; natural incoming speed above `18` is allowed and is never reduced. A marble is stalled when its total speed remains below `0.12` world units per second continuously for `3,000` milliseconds after gate release. Do not add hidden recovery behavior to make qualification pass.
- Two runs with identical layout, seed, build, browser, and fixed timestep must produce identical finish IDs and finish times within one fixed step (`1/60` second). Cross-browser bit-identical replay is not promised.

### Lifecycle, offline, accessibility, and performance

- Repeated edit/play/pause/restart/import/dispose cycles leave stable scene-object, collider/body, listener, animation-loop, and memory counts.
- Disposed boards perform no further physics, rendering, hash, pointer, keyboard, or resize work.
- With all networking blocked after Ready, editor, race, library, and raw-token import continue to work and runtime inspection shows no same-origin or external requests.
- Complete keyboard-only, screen-reader-readable, reduced-motion, pause/mute, focus, contrast, and touch workflows pass.
- In the current development machine's Chromium browser at a 360 by 800 viewport, measure the 30 seconds after a 5-second warm-up with 100 active marbles. Median FPS must be at least 30 with no per-frame allocation growth; record the browser version and machine in the acceptance log.
- The full unit suite and production build pass before integration.

## Delivery Orchestration

- **Sol** owns specification, implementation planning, orchestration, coaching, design/code review, acceptance interpretation, and final verification.
- **Luna** performs approved implementation slices and their focused tests.
- **Terra** is invoked only after a reproducible failure or when root cause remains unclear; it investigates the failing path and reports evidence before further implementation.
- Each slice follows `Luna implementation → Sol review and verification`. Sol alone declares final acceptance.
- No additional role, abstraction layer, or agent hierarchy is introduced.

## Acceptance

- A player can create, name, validate, save, select, edit, play, share, import, and delete multiple browser-local tracks.
- Duplicate names remain independent and never overwrite one another.
- Opening a valid share link loads the shared name and design as an unsaved playable preview; invalid data is non-destructive.
- The 5×8 board enforces fixed start/finish directions and one left/right/down, unbranched, gap-free path containing every non-empty module.
- All seven procedural square module kinds render and collide consistently on the shared 20-degree board.
- Boosters, gentle funnels, pinwheels, waves, curves, and diagonal bumpers change order without violating containment and speed limits.
- The client uses no database or runtime application API, persists only to browser storage, and runs loaded workflows without external network access.
- Focused tests, ten-seed 100-marble qualification, full tests, production build, accessibility checks, and desktop/mobile browser acceptance pass before integration.

## Non-goals

Database, application API, accounts, authentication, cloud backup or sync, real-time collaboration, remote runtime assets, analytics, compression, QR services, automatic track generation, custom per-track physics tuning, additional module kinds, saved invalid drafts, multi-tab synchronization, migration machinery beyond rejecting unknown versions, PWA/service worker, cold offline reload, and cross-browser bit-identical physics.
