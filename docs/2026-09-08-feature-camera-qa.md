# Feature camera and Worker logging follow-up

## Baseline and scope

- Baseline `23e4f7428cf5d0d40e1ff825a4d7651f9b2b2142` was pushed to `origin/main`; Cloudflare Workers Builds completed successfully before this follow-up began.
- Strengthen only wheel/pinball broadcasts: bolder zoom, angle/height and lateral movement, route-aligned portrait framing, and a minimum occupied close shot before the half-field top return. Empty completed sections must not delay automatic follow. Preserve manual, Bird View, pause and reduced-motion behavior.
- Enable Wrangler Observability, Workers Logs and invocation logs. Preserve static asset routing; do not add gameplay telemetry, request-body logging, a logging dependency, or a new hosting provider.

## Logging verification

- `wrangler.json` explicitly sets `observability.enabled`, `observability.logs.enabled`, and `observability.logs.invocation_logs` to `true`.
- A Node assertion verified all three flags. The installed Wrangler configuration schema supports these fields.
- Configuration follows [Cloudflare Workers Logs documentation](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). These are Worker invocation logs, not browser gameplay events. Dashboard ingestion cannot be claimed from a local build alone.

## Status

Implementation and verification are complete. Ready for the follow-up commit and Git-triggered deployment; deployment is not claimed by this pre-push record.

## Visual regression caught before release

- First revised portrait wheel broadcast: top view visible at 8.1 seconds, but the 10.1-second close shot showed a solid wall instead of the wheel/marbles; top view recovered at 12.2 seconds.
- Cause: the oblique camera moved outside the narrow channel's 12-unit-high walls. Frustum inclusion alone did not establish an unobstructed view.
- Required correction: keep lateral camera travel inside the channel, use height and longitudinal movement for the stronger close shot, and test actual final framing plus wall clearance. This failed candidate was not committed or deployed.

## Corrected camera and verification

- Establish 0–0.5 seconds, ease toward the close shot until 1.6 seconds, then hold close for 1.5 seconds. Half-field overhead return is latched and eligible after 3.1 seconds. A fast >80% wheel passage waits only while occupied; full clearance releases immediately.
- Camera lateral position is bounded inside the channel and route dolly stays within the module. Clearance remains above the 12-unit walls. Portrait uses route-aligned screen-up; landscape uses a stable side axis. Physical/control up remains separate, preserving follow and Bird View behavior.
- Focused camera/lifecycle tests: 66/66 pass. Actual default-track wheel and bumper checks cover both aspect ratios, transition poses, floor/lane projection, lateral bounds and wall clearance.
- Browser 360×800: corrected wheel visible throughout 8.0/9.5/11.1/12.6-second shots; no solid-wall obstruction. Pinball close shot paused at 55.2 seconds shows all six posts, marbles and passing lanes.
- Browser 1024×768: wheel visible at 8.1/10.2/12.2 seconds; pinball close shot at 56.2 seconds shows all six posts and surrounding traffic. Pause/resume and aspect transition work. RUSH and full results/confetti also completed during portrait QA. Browser log has no errors, only the pre-existing Rapier initialization warning. QA tab closed and temporary viewport reset.
- Independent Astra review caught the obsolete offline test asserting Observability was absent. Sol reproduced RED, updated the title and three flag assertions without changing no-API/no-Hono/SPA checks, then verified GREEN (1/1). Follow-up review found no remaining actionable issue.
- `npm run check` passes: TypeScript, production build and Wrangler deployment dry-run. Generated `dist/luckyroll/wrangler.json` retains the enabled logging configuration. Existing large-chunk/proxy notices remain warnings, not failures.
- `npm run lint` passes. First full regression run reported two unchanged heavy-test timeouts (5.387 and 5.471 seconds against the default 5 seconds), 473 passing tests and three optional skips, plus a Vitest worker update timeout. The deterministic native race and worst-case path/geometry tests now have individual 15-second limits; assertions, global timeout and runtime physics are unchanged. A clean full rerun is required before release.
- Final serial `npm test -- --run`: exit 0, all 46 files pass; 475 tests pass and three optional tests skip (478 total), 440.74 seconds. Former timeout tests complete in 4.718 and 4.569 seconds. No unhandled errors or worker RPC timeout on this run. Focused verification also passed both corrected tests. `git diff --check` passes.
