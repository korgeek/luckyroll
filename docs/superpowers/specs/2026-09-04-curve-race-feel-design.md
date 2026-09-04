# Curve Safety and Race Feedback Design

## Goal

Fix the self-folding modular curves and camera intrusion shown in mobile captures, make marble rolling visibly readable, strengthen the three race-changing devices, clarify editor replacement, and separate finishers from eliminated marbles in the HUD.

This design supersedes the affected curve and device constants in `2026-09-03-modular-track-designer-design.md`.

## Confirmed causes

- The current curve centerline reaches a minimum radius of about `3.77`, while the channel half-width is `6`. The inner offset surface therefore crosses itself. This produces the visible loops or cover-like folds and creates physical traps.
- Modular seams are already represented by a shared indexed row. The defect is inside the curve, not a missing module weld.
- Decorative rims are separate closed boxes for every adaptive sample interval. Their dark segments and end caps produce the visible lines around dense curve samples.
- Automatic follow cameras extrapolate along a tangent instead of following the curved route and have no final rail-clearance constraint.
- Marble meshes copy body positions but not body rotations. A texture alone would therefore remain visually stationary.
- `DONE` currently counts every inactive marble, including DNF marbles.

## Curve geometry and rendering

- Keep module ports, channel width `12`, rail height `4`, route grade, and the straight `0.1S` landing at both ends unchanged.
- Replace the curve interior with an exact quarter-circle of radius `8` between `localU=0.1` and `localU=0.9`.
- Preserve exact position and tangent continuity at both landings. Banking remains zero at both landings and reaches its existing maximum only inside the arc.
- The centerline radius `8` leaves a positive inner radius of `2` for the full-width channel, so no profile row may fold across the curve center.
- Continue generating one shared indexed channel mesh and one shared Rapier trimesh with `FIX_INTERNAL_EDGES`; do not add hidden walls or recovery forces.
- Remove the per-sample closed-box decorative rims. The channel and shell silhouette remain, without black segmented caps or rings.

## Marble roll feedback

- Do not add a track-floor speed texture.
- Generate one small shared grayscale marble texture in code, with an asymmetric high-contrast band and spot so rotation is readable from any camera angle.
- Reuse the texture across the color-batched marble materials; the base player color remains visible.
- Copy each Rapier body's quaternion to the corresponding rendered marble instance every frame, together with position and visibility scale.
- Dispose the shared texture with the scene.

## Camera containment

- Build the automatic follow position from a real route sample behind the focused marble rather than a tangent chord through the curve.
- Keep the camera at least `5` world units above the local channel surface along the sampled `up` vector, which clears the `4`-unit rail.
- Apply manual controls, then enforce the same minimum local-up clearance so negative pitch or pan cannot put the camera inside or below the channel.
- Update `camera.up` before calling `lookAt`.
- Bird View behavior remains unchanged.

## Device changes

### Pinwheel

- Increase radius from `3.36` to `4`.
- Increase angular speed from `2` to `5 rad/s`.
- Physics and rendering must derive their geometry and rotation from the same `PinwheelLayout` descriptor; remove duplicated literals.
- The remaining tip-to-tip passage is `4`, greater than the required `3D = 2.04`.

### Funnel

- Keep full-width landings at both ports.
- Hold the narrow `9.6` waist from `localU=0.3` through `0.7`, increasing its length from `2` to `8` world units.
- Use smooth tapers between each landing and the waist. Rendering and physics continue to consume the same sampled surface.

### Bumpers

- Increase each bumper module from three to five alternating bars at `localU` values `0.25`, `0.375`, `0.5`, `0.625`, and `0.75`.
- Keep the existing bar length and safe central passage.
- Increase bumper restitution from `0.28` to `0.65` and use Rapier's `Max` restitution combine rule so contact produces a visible pinball-like rebound.

## Editor feedback

- Give the selected board cell a persistent high-contrast border/background and `aria-selected=true`.
- Keep the existing palette-then-cell replacement flow because it already replaces occupied editable cells.
- Make the armed palette state and action text explicit. The action must name both the selected cell and selected module, instead of a generic `Replace` label that can appear inert.
- Rotation and clearing remain available; fixed start and finish cells remain immutable.

## Race outcomes and HUD

- Track each marble as active, finished, or eliminated instead of treating every inactive marble as finished.
- `DONE` displays only actual finishers.
- `OUT` displays marbles removed by the existing off-track-distance or non-finite checks.
- Timed-out marbles remain late/active and are not counted as `OUT`.
- Leader and trailer rankings include only active marbles, as today.

## Verification

- Curve math tests assert radius `8`, unchanged ports and tangents, full width at seams, and no inward profile fold.
- A physical curve probe runs center and near-wall launches at speeds `8`, `18`, and `42`, requiring finite containment and forward exit.
- Render tests prove segmented rim boxes are gone and marble texture resources are reusable/disposable.
- Scene tests prove rendered marble quaternions follow body rotations and controlled follow cameras retain rail clearance on a banked curve.
- Device tests cover the new pinwheel dimensions/speed, eight-unit funnel waist, five bumpers, descriptor-driven render/physics agreement, and measurable bumper rebound.
- Editor tests cover persistent selected-cell state and an occupied-cell replacement with a different module.
- Scene/App tests cover separate `finishedCount` and `eliminatedCount`, including the rule that timeout does not increment `OUT`.
- Run focused tests while implementing, then the production build and full suite once before integration.

## Scope limits

- No hidden curve collider, automatic marble rescue, animated floor texture, new editor mode, or new dependency.
- Existing saved tracks remain compatible because module kinds and serialized data do not change.
