# Track Visuals, Camera, and Editor Design

## Goal

Make the modular track read as a thick, protective race channel while keeping its qualified collision surface unchanged. Make marbles respond to scene lighting, add familiar camera input with automatic recovery, and replace editor rotation codes with visual connection diagrams.

## Track appearance

- Keep `profileAt()` and every Rapier collider unchanged. The flat floor, curved walls, and inward 0.75D lips remain the single physical channel profile.
- Strengthen only the render shell generated around that surface: a visibly deeper concrete-colored outer body under a dark metal channel.
- Replace the neon edge treatment with alternating yellow/black hazard accents on the upper rims. The surrounding UI remains neon.
- Reuse existing Three.js geometry and standard materials. Do not add textures, models, shaders, or dependencies.

## Marble lighting

- Replace each color batch's `MeshBasicMaterial` with one shared `MeshStandardMaterial` per batch.
- Preserve the marble color, batching, geometry, and disposal path.
- Use moderate roughness and low metalness so existing ambient, hemisphere, directional, cyan, and magenta lights remain readable without bloom.

## Camera interaction

- One touch or left-button drag orbits the current directed camera.
- Right-button drag pans the camera focus; suppress the browser context menu on the canvas.
- Mouse wheel and two-touch pinch zoom within the existing safe limits.
- Any interaction resets an idle deadline. Three seconds after the final input, offsets ease back to the initial controls so the existing race camera resumes control.
- Reduced-motion mode returns without an animated recovery.
- Pointer capture, multiple active touch points, timers, and all added listeners are released on scene disposal.

## Editor diagrams

- Replace `STR`, `CUR`, and degree labels inside board cells with small inline SVG diagrams.
- Draw the real two open edges for the cell rotation. Straight modules use a line and curve modules use a quarter arc; the curve therefore shows both its entry/exit edges without requiring a numeric angle.
- Funnel, wave, pinwheel, booster, and bumper modules reuse the same port path and add one small center glyph.
- Start and finish retain readable labels. Existing accessible names continue to describe kind and rotation for assistive technology.
- Derive visual ports from the same track-design port function used by validation so the drawing cannot disagree with saved track connectivity.

## Verification and delivery

- Add focused tests for camera input math/recovery, material choice and cleanup, and editor SVG ports across all rotations.
- Run lint, the non-budget product tests, and the production build locally.
- Then spend the newly approved qualification budget exactly once: 100 marbles across the official 10 seeds. Record the result whether it passes or fails; do not silently rerun failed seeds.
- Commit in reviewable stages. After completion, remove only task-created worktrees, leave user-owned untracked files untouched, keep the finished history on `main`, and push `main` to `korgeek/luckyroll` so the existing deployment hook can run.

## Non-goals

- No collision-profile redesign, new physics forces, PBR texture pipeline, custom GLSL, or third-party camera library.
- This visual/input work does not claim to resolve the previously observed 100-marble escape until the new official qualification run proves it.
