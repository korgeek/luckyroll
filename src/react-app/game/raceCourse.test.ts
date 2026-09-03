import { describe, expect, it } from "vitest";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { getTrackBounds } from "./cameraPlan";
import { createSceneTrackResources } from "./MarbleRaceScene";
import { projectToTrack } from "./track/trackSampler";
import { createFixedStepPauseState, createRaceCourse } from "./raceCourse";
import { createTrackPhysicsWorld, initializeTrackPhysics } from "./track/trackPhysics";

describe("race-course adapters", () => {
  it("keeps the built-in course as the default", () => {
    const course = createRaceCourse({ kind: "builtin" });
    expect(course.kind).toBe("builtin");
    expect(course.samples.length).toBe(createSceneTrackResources().built.samples.length);
    course.dispose();
  });

  it("builds a custom course from validated shared cells", () => {
    const course = createRaceCourse({ kind: "custom", track: createValidTrackDesign("Course") });
    expect(course.kind).toBe("custom");
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
