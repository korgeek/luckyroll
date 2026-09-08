import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { alongRouteDistance, applyRaceRushPulse, attachSceneTrackCollider, createDebugCameraState, createFrameRateCounter, createLiveStandings, createRaceBoost, createSceneDebugOverlay, createSceneObstacleResources, createSceneRaceClock, createSceneStartLifecycle, createSceneTrackResources, disposeSceneObstacleResources, evaluateRaceBody, getRaceElapsedMs, initializeScenePhysics, hasFinishedTrack, isTrackDebugEnabled, productionSceneStyle, projectRaceBody, refreshCameraRankView, shouldEmitSceneTick, shouldStartRaceRush, stepSceneObstacleResources } from "./MarbleRaceScene";
import { createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, insideFinishVolume, launchPositionsFor } from "./track/trackPhysics";
import { projectToTrack } from "./track/trackSampler";
import { createLaunchSlots } from "./track/trackSpec";
import type { RapierWorld } from "./raceCourse";

const deferred = <Value,>() => {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
};

const activeBoostState = { running: true, manualPaused: false, debugPaused: false, gateOpen: true, disposed: false };
const chargeBoost = (boost: ReturnType<typeof createRaceBoost>) => {
  for (let step = 0; step < 300; step += 1) boost.step(activeBoostState);
};
const boostBall = (initialVelocity: { x: number; y: number; z: number }, sampleIndex = 0, done = false) => {
  let velocity = initialVelocity;
  return {
    ball: { done, sampleIndex, body: { linvel: () => velocity, setLinvel: (next: { x: number; y: number; z: number }) => { velocity = next; } } },
    velocity: () => velocity,
  };
};

describe("continuous-track scene seams", () => {
	it("averages actual animation frames over half-second windows", () => {
		const frameRate = createFrameRateCounter();
		expect(frameRate.sample(0)).toBe(0);
		let fps = 0;
		for (let frame = 1; frame <= 30; frame += 1) fps = frameRate.sample(frame * 1000 / 60);
		expect(fps).toBeCloseTo(60, 5);
		expect(frameRate.sample(600)).toBeCloseTo(60, 5);
		const slowFrameRate = createFrameRateCounter();
		slowFrameRate.sample(0);
		for (let frame = 1; frame <= 5; frame += 1) fps = slowFrameRate.sample(frame * 100);
		expect(fps).toBe(10);
	});
	it("charges boost only during active post-gate fixed steps and resets for replay", () => {
		const boost = createRaceBoost();
		const blocked = [
			{ ...activeBoostState, running: false },
			{ ...activeBoostState, manualPaused: true },
			{ ...activeBoostState, debugPaused: true },
			{ ...activeBoostState, gateOpen: false },
			{ ...activeBoostState, disposed: true },
		];

		expect(boost.remainingMs()).toBe(5_000);
		blocked.forEach((state) => boost.step(state));
		expect(boost.remainingMs()).toBe(5_000);
		for (let step = 0; step < 299; step += 1) boost.step(activeBoostState);
		expect(boost.remainingMs()).toBeGreaterThan(0);
		boost.step(activeBoostState);
		expect(boost.remainingMs()).toBe(0);
		boost.reset();
		expect(boost.remainingMs()).toBe(5_000);
	});

	it("continues charging BOOST on active fixed steps during RUSH", () => {
		const boost = createRaceBoost();
		for (let step = 0; step < 299; step += 1) boost.step({ ...activeBoostState, rushActive: true });
		expect(boost.remainingMs()).toBeGreaterThan(0);
		boost.step({ ...activeBoostState, rushActive: true });
		expect(boost.remainingMs()).toBe(0);
	});

	it("starts RUSH only for positive live fields at or below half of the original field", () => {
		expect(shouldStartRaceRush(50, 100)).toBe(true);
		expect(shouldStartRaceRush(51, 100)).toBe(false);
		expect(shouldStartRaceRush(100, 200)).toBe(true);
		expect(shouldStartRaceRush(150, 300)).toBe(true);
		expect(shouldStartRaceRush(1, 0)).toBe(false);
		expect(shouldStartRaceRush(0, 100)).toBe(false);
	});

	it("pulses live reverse ranks from +3 at the back to +0.5 at the front without changing lateral velocity", () => {
		const back = boostBall({ x: 10, y: 2, z: -4 });
		const middle = boostBall({ x: 10, y: 3, z: -5 });
		const front = boostBall({ x: 10, y: 4, z: -6 });
		applyRaceRushPulse([
			{ ...back.ball, id: 1, eliminated: false, position: { x: 1, y: 0, z: 0 } },
			{ ...middle.ball, id: 2, eliminated: false, position: { x: 5, y: 0, z: 0 } },
			{ ...front.ball, id: 3, eliminated: false, position: { x: 9, y: 0, z: 0 } },
		], [{ distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } }, { distance: 10, position: { x: 10, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } }]);

		expect(back.velocity()).toEqual({ x: 13, y: 2, z: -4 });
		expect(middle.velocity()).toEqual({ x: 11.75, y: 3, z: -5 });
		expect(front.velocity()).toEqual({ x: 10.5, y: 4, z: -6 });
	});

	it("boosts forward speed by half up to 42 without changing lateral or local-normal velocity", () => {
		const boost = createRaceBoost();
		const twenty = boostBall({ x: 15.2, y: 3, z: 13.6 });
		const thirty = boostBall({ x: 22, y: -2, z: 21 });
		const samples = [{ tangent: { x: 0.6, y: 0, z: 0.8 } }];
		chargeBoost(boost);

		expect(boost.activate(activeBoostState, [twenty.ball, thirty.ball], samples)).toBe(true);
		expect(twenty.velocity()).toEqual({ x: 21.2, y: 3, z: 21.6 });
		expect(thirty.velocity()).toEqual({ x: 29.2, y: -2, z: 30.6 });
		expect(boost.remainingMs()).toBe(5_000);
	});

	it("skips finished and unsafe velocities without consuming a ready boost", () => {
		const boost = createRaceBoost();
		const unchanged = [
			boostBall({ x: 42, y: 2, z: 0 }),
			boostBall({ x: 50, y: 2, z: 0 }),
			boostBall({ x: -4, y: 2, z: 0 }),
			boostBall({ x: 0, y: 2, z: 0 }),
			boostBall({ x: Number.NaN, y: 2, z: 0 }),
			boostBall({ x: 20, y: 2, z: 0 }, 0, true),
		];
		const samples = [{ tangent: { x: 1, y: 0, z: 0 } }];
		chargeBoost(boost);

		expect(boost.activate(activeBoostState, unchanged.map(({ ball }) => ball), samples)).toBe(false);
		expect(boost.remainingMs()).toBe(0);
		const valid = boostBall({ x: 20, y: 2, z: 0 });
		expect(boost.activate(activeBoostState, [valid.ball], samples)).toBe(true);
		expect(valid.velocity()).toEqual({ x: 30, y: 2, z: 0 });
		expect(boost.activate(activeBoostState, [valid.ball], samples)).toBe(false);
		expect(valid.velocity()).toEqual({ x: 30, y: 2, z: 0 });
	});

	it("rejects boost activation for every unavailable scene state", () => {
		const samples = [{ tangent: { x: 1, y: 0, z: 0 } }];
		for (const state of [
			{ ...activeBoostState, running: false },
			{ ...activeBoostState, manualPaused: true },
			{ ...activeBoostState, debugPaused: true },
			{ ...activeBoostState, gateOpen: false },
			{ ...activeBoostState, disposed: true },
		]) {
			const boost = createRaceBoost(); const candidate = boostBall({ x: 20, y: 0, z: 0 });
			chargeBoost(boost);
			expect(boost.activate(state, [candidate.ball], samples)).toBe(false);
			expect(candidate.velocity().x).toBe(20);
		}
	});

	it("blocks manual BOOST during RUSH without changing velocity or charge", () => {
		const boost = createRaceBoost(); const candidate = boostBall({ x: 20, y: 2, z: 0 });
		chargeBoost(boost);
		expect(boost.activate({ ...activeBoostState, rushActive: true }, [candidate.ball], [{ tangent: { x: 1, y: 0, z: 0 } }])).toBe(false);
		expect(candidate.velocity()).toEqual({ x: 20, y: 2, z: 0 });
		expect(boost.remainingMs()).toBe(0);
	});

	it("forces a final scene tick at timeout or when the last marble finishes", () => {
		expect(shouldEmitSceneTick(120_000, 119_950, 120_000, 1)).toBe(true);
		expect(shouldEmitSceneTick(5_050, 5_000, 5_050, 0)).toBe(true);
		expect(shouldEmitSceneTick(5_050, 5_000, 5_050, 1)).toBe(false);
	});

	it("orders only active standings by ascending route distance and reports gaps from last place", () => {
		const marble = (id: number) => ({ id, ownerId: "owner", color: "#fff", symbol: "x" });
		const samples = [
			{ distance: 0, position: { x: 0, y: 0, z: 0 } },
			{ distance: 10, position: { x: 2, y: 0, z: 0 } },
			{ distance: 40, position: { x: 8, y: 0, z: 0 } },
		];
		const balls = [
			{ id: 1, marble: marble(1), done: false, sampleIndex: 1, position: { x: 5, y: 0, z: 0 } },
			{ id: 2, marble: marble(2), done: true, sampleIndex: 0, position: { x: 0, y: 0, z: 0 } },
			{ id: 3, marble: marble(3), done: false, sampleIndex: 1, position: { x: 2, y: 0, z: 0 } },
		];

		expect(createLiveStandings([], samples)).toEqual([]);
		expect(createLiveStandings(balls.filter((ball) => ball.done), samples)).toEqual([]);
		expect(createLiveStandings(balls, samples)).toEqual([
			{ marble: balls[2].marble, gap: 0 },
			{ marble: balls[0].marble, gap: 15 },
		]);
	});

	it("interpolates along the nearest adjacent real-distance segment", () => {
		const samples = [
			{ distance: 0, position: { x: 0, y: 0, z: 0 } },
			{ distance: 10, position: { x: 2, y: 0, z: 0 } },
			{ distance: 40, position: { x: 8, y: 0, z: 0 } },
		];
		expect(alongRouteDistance({ x: 5, y: 0, z: 0 }, 1, samples)).toBeCloseTo(25, 8);
	});

	it("returns a finite distance at route boundaries", () => {
		const samples = [{ distance: 0, position: { x: 0, y: 0, z: 0 } }];
		expect(alongRouteDistance({ x: 3, y: 0, z: 0 }, 0, samples)).toBe(0);
	});

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

    const result = attachSceneTrackCollider({} as RapierWorld, resources, (_world, geometry) => {
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
    expect(state.projection.sampleIndex).toBe(0);
  });

  it("exposes bounded dark-neon production styling without a post-processing hook", () => {
    expect(productionSceneStyle.background).toBe("#050713");
    expect(productionSceneStyle.pointLightCount).toBe(2);
    expect(productionSceneStyle.bloom).toBe(false);
  });

  it("builds the canonical obstacle render and physics bundle for the production scene", async () => {
    await initializeScenePhysics();
    const track = createSceneTrackResources();
    const world = createTrackPhysicsWorld();
    const obstacles = createSceneObstacleResources(world, track);

    try {
      expect(obstacles.geometry.layout).toBe(track.built.obstacleLayout);
      expect(obstacles.renderGroup.getObjectByName("start-bowl")).toBeDefined();
      expect(obstacles.renderGroup.getObjectByName("peg-shuffler")).toBeDefined();
      expect(obstacles.renderGroup.getObjectByName("alternating-pushers")).toBeDefined();
      expect(obstacles.renderGroup.getObjectByName("vortex-catch-channel")).toBeDefined();
      expect(obstacles.physics.fixedColliders.length).toBeGreaterThan(0);
    } finally {
      disposeSceneObstacleResources(obstacles);
      world.free();
    }
  });

  it("steps obstacle kinematics before Rapier and applies that shared pose after the world step", async () => {
    await initializeScenePhysics();
    const track = createSceneTrackResources();
    const world = createTrackPhysicsWorld();
    const obstacles = createSceneObstacleResources(world, track);
    const originalStep = world.step.bind(world);
    let renderedDuringWorldStep = false;
    world.step = () => {
      renderedDuringWorldStep = obstacles.renderGroup.getObjectByName("release-gate")!.position.y !== obstacles.physics.controller.initialPose().gate.translation.y;
      return originalStep();
    };

    try {
      const pose = stepSceneObstacleResources(world, obstacles);
      expect(pose.elapsedMs).toBeCloseTo(1000 / 60);
      expect(renderedDuringWorldStep).toBe(false);
      expect(obstacles.renderGroup.getObjectByName("release-gate")!.position.y).toBeCloseTo(pose.gate.translation.y);
    } finally {
      disposeSceneObstacleResources(obstacles);
      world.free();
    }
  });

  it("starts displayed race time only after the shuffle gate opens and resets remaining marbles with an open gate", async () => {
    await initializeScenePhysics();
    const track = createSceneTrackResources();
    const world = createTrackPhysicsWorld();
    const obstacles = createSceneObstacleResources(world, track);
    const clock = createSceneRaceClock();

    try {
      expect(clock.elapsedMs(1_000)).toBe(0);
      for (let step = 0; step < 90; step += 1) clock.consumeAfterWorldStep(stepSceneObstacleResources(world, obstacles), 1_000 + step * 1000 / 60);
      expect(clock.elapsedMs(2_600)).toBeCloseTo(700 / 6);
      const open = obstacles.reset({ gateOpen: true });
      expect(open.gateOpen).toBe(true);
      expect(open.raceClockStarted).toBe(true);
    } finally {
      disposeSceneObstacleResources(obstacles);
      world.free();
    }
  });

  it("disposes obstacle physics before callers free the replay world", async () => {
    await initializeScenePhysics();
    const track = createSceneTrackResources();
    const world = createTrackPhysicsWorld();
    const obstacles = createSceneObstacleResources(world, track);
    const gate = obstacles.physics.gate;

    disposeSceneObstacleResources(obstacles);

    expect(gate.isValid()).toBe(false);
    expect(() => disposeSceneObstacleResources(obstacles)).not.toThrow();
    world.free();
  });

  it("keeps the race camera clock paused while a debug view is held", () => {
    expect(getRaceElapsedMs(7_500, 1_000, 5_000, 0, false)).toBe(1_500);
  });

  it("keeps emitted live-marble order stable while the reusable camera rank view sorts by progress", () => {
    const live = [
      { id: "first-emitted", done: false, progress: 0.4 },
      { id: "finished", done: true, progress: 1 },
      { id: "second-emitted", done: false, progress: 0.8 },
    ];
    const ranked: typeof live = [];

    refreshCameraRankView(live, ranked);

    expect(live.map((ball) => ball.id)).toEqual(["first-emitted", "finished", "second-emitted"]);
    expect(ranked.map((ball) => ball.id)).toEqual(["second-emitted", "first-emitted"]);
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
