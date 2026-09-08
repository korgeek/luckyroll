import { describe, expect, it } from "vitest";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { getTrackBounds } from "./cameraPlan";
import { createSceneTrackResources } from "./MarbleRaceScene";
import { projectToTrack } from "./track/trackSampler";
import { collectBumperHits, createFixedStepPauseState, createRaceCourse } from "./raceCourse";
import { createTrackPhysicsWorld, initializeTrackPhysics, getInitializedTrackPhysicsRapier } from "./track/trackPhysics";

describe("race-course adapters", () => {
  it("keeps the built-in course as the default", () => {
    const course = createRaceCourse({ kind: "builtin" });
    expect(course.kind).toBe("builtin");
    expect(course.samples.length).toBe(createSceneTrackResources().built.samples.length);
    course.dispose();
  });

  it("forwards debug rendering to the selected course", () => {
    const course = createRaceCourse({ kind: "builtin" }, { debug: true });
    expect(course.renderGroup.getObjectByName("track-debug-zones")).toBeDefined();
    course.dispose();
  });

  it("builds a custom course from validated shared cells", () => {
    const course = createRaceCourse({ kind: "custom", track: createValidTrackDesign("Course") });
    expect(course.kind).toBe("custom");
    const start = course.cameraSamples![0]; const first = course.samples[0];
    expect(course.cameraSamples).toHaveLength(course.samples.length + 2);
    expect(start.distance).toBeLessThan(first.distance);
    expect(start.channelDepth).toBe(6);
    const along = (start.position.x - first.position.x) * first.tangent.x + (start.position.y - first.position.y) * first.tangent.y + (start.position.z - first.position.z) * first.tangent.z;
    expect(along).toBeCloseTo(start.distance, 5);
    expect(course.cameraSamples![2].position).toEqual(first.position);
    expect(course.renderGroup.getObjectByName("modular-channel")).toBeDefined();
    const middle = Math.floor(course.samples.length / 2);
    expect(projectToTrack(course.samples[middle].position, course.samples).sampleIndex).toBe(middle);
    expect(Number.isFinite(getTrackBounds(course.samples).radius)).toBe(true);
    course.dispose();
  });

  it("pauses fixed-step consumption", () => {
    const clock = createFixedStepPauseState();
    clock.setPaused(true);
    expect(clock.consume(1000 / 60)).toBe(0);
    clock.setPaused(false);
    expect(clock.consume(1000 / 60)).toBeCloseTo(1000 / 60);
  });

  it("runs and disposes a custom course through the shared fixed-step boundary", async () => {
    await initializeTrackPhysics();
    const course = createRaceCourse({ kind: "custom", track: createValidTrackDesign("Run") });
    const world = createTrackPhysicsWorld();
    const run = course.createRun(world, 1, 11, true);
    expect(run.launchPositions).toHaveLength(1);
    expect(run.stepBeforeWorld().raceClockStarted).toBe(true);
    world.step();
    expect(run.stepAfterWorld([])).toEqual([]);
    run.reset(true);
    run.dispose();
    run.dispose();
    course.dispose();
    world.free();
  });
});

 it.each(["fixed", "kinematicPositionBased"] as const)("sounds only on real %s obstacle contact onset and rearms after separation", async (kind) => {
  await initializeTrackPhysics();
  const rapier = getInitializedTrackPhysicsRapier();
  const world = createTrackPhysicsWorld();
  world.gravity = { x: 0, y: 0, z: 0 };
  const bumper = world.createCollider(rapier.ColliderDesc.ball(1), world.createRigidBody(rapier.RigidBodyDesc[kind]()));
  const ball = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(1.4, 0, 0));
  world.createCollider(rapier.ColliderDesc.ball(0.5), ball);
  const contacts = new Set<string>();
  world.step();
  expect(collectBumperHits(world, [bumper], contacts)).toHaveLength(1);
  expect(collectBumperHits(world, [bumper], contacts)).toHaveLength(0);
  ball.setTranslation({ x: 10, y: 0, z: 0 }, true); world.step();
  expect(collectBumperHits(world, [bumper], contacts)).toHaveLength(0);
  expect(contacts.size).toBe(0);
  ball.setTranslation({ x: 1.4, y: 0, z: 0 }, true); world.step();
  expect(collectBumperHits(world, [bumper], contacts)).toHaveLength(1);
  world.free();
 });

it("sounds on actual mogul contact, not flat floor or hovering, and rearms after separation", async () => {
  await initializeTrackPhysics();
  const rapier = getInitializedTrackPhysicsRapier();
  const { funnelMogulHeight } = await import("./modular/moduleGeometry");
  const course = createRaceCourse({ kind: "custom", track: createValidTrackDesign("Mogul sound") });
  const world = createTrackPhysicsWorld(); world.gravity = { x: 0, y: 0, z: 0 };
  const run = course.createRun(world, 1, 11, true);
  const frames = (course.samples as readonly import("./modular/modulePath").ModulePathSample[]).filter(s => s.kind === "funnel");
  const peak = frames.reduce((a, b) => Math.abs(a.localU - .22) < Math.abs(b.localU - .22) ? a : b);
  const flat = frames.reduce((a, b) => Math.abs(a.localU - .5) < Math.abs(b.localU - .5) ? a : b);
  const point = (frame: typeof peak, side: number, lift: number) => {
    const height = funnelMogulHeight(frame.localU, side) + lift;
    return { x: frame.position.x + frame.side.x * side + frame.up.x * height, y: frame.position.y + frame.side.y * side + frame.up.y * height, z: frame.position.z + frame.side.z * side + frame.up.z * height };
  };
  const ball = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
  world.createCollider(rapier.ColliderDesc.ball(.5), ball);
  const move = (position: { x: number; y: number; z: number }) => { ball.setTranslation(position, true); ball.setLinvel({ x: 0, y: 0, z: 0 }, true); world.step(); return run.collectMogulHits!(); };
  try {
    expect(move(point(flat, 0, .45))).toHaveLength(0);
    expect(move(point(peak, -.6, 4))).toHaveLength(0);
    expect(move(point(peak, -.6, .45))).toHaveLength(1);
    expect(run.collectMogulHits!()).toHaveLength(0);
    expect(move(point(peak, -.6, 4))).toHaveLength(0);
    expect(move(point(peak, -.6, .45))).toHaveLength(1);
  } finally { run.dispose(); course.dispose(); world.free(); }
});
