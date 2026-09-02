import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { attachSceneTrackCollider, createDebugCameraState, createSceneDebugOverlay, createSceneStartLifecycle, createSceneTrackResources, evaluateRaceBody, getRaceElapsedMs, initializeScenePhysics, hasFinishedTrack, isTrackDebugEnabled, projectRaceBody } from "./MarbleRaceScene";
import { createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, insideFinishVolume, launchPositionsFor } from "./track/trackPhysics";
import { projectToTrack } from "./track/trackSampler";
import { createLaunchSlots } from "./track/trackSpec";

const deferred = <Value,>() => {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
};

describe("continuous-track scene seams", () => {

  it("parses only the explicit track-debug query flag", () => {
    expect(isTrackDebugEnabled("?trackDebug=1")).toBe(true);
    expect(isTrackDebugEnabled("?trackDebug=0")).toBe(false);
    expect(isTrackDebugEnabled("?debug=1")).toBe(false);
  });

  it("holds a selected fixed debug view until Resume returns production camera updates", () => {
    const debug = createDebugCameraState(true);

    debug.select("side");
    expect(debug.activeShot()).toBe("side");
    expect(debug.isPaused()).toBe(true);
    debug.resume();
    expect(debug.isPaused()).toBe(false);
  });

  it("renders deterministic English debug buttons and throttles overlay DOM updates", () => {
    const mount = document.createElement("div");
    const debug = createDebugCameraState(true);
    const overlay = createSceneDebugOverlay(mount, debug);

    expect(Array.from(mount.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Top", "Side", "Profile", "Resume"]);
    expect(overlay.update({ fps: 31, drawCalls: 5, triangles: 1_024, active: 100, finished: 0, shot: "overview" }, 1_000)).toBe(true);
    expect(overlay.update({ fps: 30, drawCalls: 6, triangles: 1_024, active: 99, finished: 1, shot: "leader" }, 1_100)).toBe(false);
    expect(mount.textContent).toContain("FPS 31");
    overlay.dispose();
    expect(mount.childElementCount).toBe(0);
  });

  it("does not count time spent holding a debug view before the first resume", () => {
    expect(getRaceElapsedMs(5_000, 1_000, 0, 1_000, true)).toBe(0);
    expect(getRaceElapsedMs(5_000, 1_000, 4_000, 0, false)).toBe(0);
  });
  it("shares the canonical geometry with the browser render group", () => {
    const resources = createSceneTrackResources();
    const mesh = resources.renderGroup.getObjectByName("continuous-u-channel") as THREE.Mesh;
    const rendered = mesh.geometry as THREE.BufferGeometry;

    expect(rendered.getAttribute("position").array).toBe(resources.built.geometry.positions);
    expect(rendered.index!.array).toBe(resources.built.geometry.indices);
  });

  it("passes that same canonical geometry to the browser collider", () => {
    const resources = createSceneTrackResources();
    const collider = { kind: "shared-trimesh" };
    let received: typeof resources.built.geometry | undefined;

    const result = attachSceneTrackCollider({}, resources, (_world, geometry) => {
      received = geometry;
      return collider;
    });

    expect(result).toBe(collider);
    expect(received).toBe(resources.built.geometry);
  });

  it("enables the validated divider in production scene resources and collider creation", async () => {
    await initializeScenePhysics();
    const resources = createSceneTrackResources();
    const world = createTrackPhysicsWorld();

    try {
      const colliders = attachSceneTrackCollider(world, resources) as unknown as {
        outer: { parent: () => unknown };
        divider: { parent: () => unknown } | undefined;
      };
      expect(resources.built.geometry.featureIndices.length).toBeGreaterThan(0);
      expect(resources.renderGroup.getObjectByName("rounded-mixing-divider")).toBeDefined();
      expect(colliders.divider).toBeDefined();
      expect(colliders.divider!.parent()).toBe(colliders.outer.parent());
    } finally {
      world.free();
    }
  });

  it("initializes the shared physics module before the scene creates its collider and marbles", async () => {
    await initializeScenePhysics();
    const resources = createSceneTrackResources();
    const world = createTrackPhysicsWorld();
    const positions = launchPositionsFor(createLaunchSlots(1), resources.built.geometry, 11);

    try {
      expect(() => createTrackCollider(world, resources.built.geometry)).not.toThrow();
      const bodies = createMarbleBodies(world, positions);
      expect(bodies).toHaveLength(1);
      expect(bodies[0].translation().x).toBeCloseTo(positions[0].x);
    } finally {
      world.free();
    }
  });

  it("drops a queued start when reset occurs before physics initialization", async () => {
    const initialization = deferred<void>();
    const started: string[] = [];
    const lifecycle = createSceneStartLifecycle<{ id: string }>({
      initialize: () => initialization.promise,
      onReady: () => undefined,
      onStart: (request) => started.push(request.id),
      onError: () => undefined,
    });

    lifecycle.requestStart({ id: "queued" });
    lifecycle.reset();
    initialization.resolve();
    await lifecycle.ready;

    expect(started).toEqual([]);
  });

  it("cancels a queued start when disposed before physics initialization", async () => {
    const initialization = deferred<void>();
    const started: string[] = [];
    const lifecycle = createSceneStartLifecycle<{ id: string }>({
      initialize: () => initialization.promise,
      onReady: () => undefined,
      onStart: (request) => started.push(request.id),
      onError: () => undefined,
    });

    lifecycle.requestStart({ id: "queued" });
    lifecycle.dispose();
    initialization.resolve();
    await lifecycle.ready;

    expect(started).toEqual([]);
  });

  it("handles initialization rejection without retaining a queued start", async () => {
    const error = new Error("Rapier load failed");
    const errors: unknown[] = [];
    const lifecycle = createSceneStartLifecycle({
      initialize: () => Promise.reject(error),
      onReady: () => undefined,
      onStart: () => { throw new Error("rejected initialization must not start a race"); },
      onError: (cause) => errors.push(cause),
    });

    lifecycle.requestStart({ id: "queued" });
    await lifecycle.ready;

    expect(lifecycle.status()).toBe("failed");
    expect(errors).toEqual([error]);
  });

  it("projects runtime body progress without applying a guide force", () => {
    const resources = createSceneTrackResources();
    const body = {
      translation: () => resources.built.samples[0].position,
      addForce: () => { throw new Error("legacy guide force must not run"); },
    };

    expect(projectRaceBody(body, resources.built.samples).progress).toBe(0);
  });

  it("uses one projection for each active body evaluation", () => {
    const resources = createSceneTrackResources();
    let projections = 0;
    const state = evaluateRaceBody(
      { translation: () => resources.built.samples[0].position },
      resources.built.samples,
      (position, samples) => { projections += 1; return projectToTrack(position, samples); },
    );

    expect(projections).toBe(1);
    expect(state.projection.progress).toBe(0);
  });

  it("requires both final projected progress and the shared finish volume", () => {
    const resources = createSceneTrackResources();
    const samples = resources.built.samples;
    const final = samples[samples.length - 1].position;
    const earlyPosition = samples[samples.length - 5].position;

    expect(hasFinishedTrack(final, samples)).toBe(true);
    expect(insideFinishVolume(earlyPosition, samples[samples.length - 1])).toBe(true);
    expect(hasFinishedTrack(earlyPosition, samples)).toBe(false);
  });
});
