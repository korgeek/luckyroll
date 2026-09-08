import * as THREE from "three";
import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import type { RaceCourseSelection } from "../designer/trackDesign";
import { buildModularTrack, type BuiltModularTrack } from "./modular/modularTrackBuild";
import { createModularLaunchPositions, createModularPhysics, type BoosterEvent, type ModularPhysicsResources } from "./modular/modularTrackPhysics";
import { createModularTrackRender, disposeModularTrackRender, setModularDevicePose, type ModularRenderResources } from "./modular/modularTrackRender";
import { buildValidatedTrack, type BuiltTrack } from "./track/trackBuild";
import { buildObstacleGeometry } from "./track/obstacleGeometry";
import { createBowlLaunchPositions, createObstaclePhysics, type ObstaclePhysicsResources } from "./track/obstaclePhysics";
import { createObstacleRenderGroup, disposeObstacleRenderGroup, setDeviceRenderPose } from "./track/obstacleRender";
import { createTrackCollider, launchPositionsFor } from "./track/trackPhysics";
import { createTrackRenderGroup, disposeTrackRenderGroup } from "./track/trackRender";
import { createLaunchSlots } from "./track/trackSpec";
import type { PhysicalLaunchPosition, TrackGeometry, TrackSample } from "./track/trackTypes";

type RapierModule = typeof RAPIER_TYPE;
export type RapierWorld = InstanceType<RapierModule["World"]>;
export type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;

// Only contact onset makes a sound: resting against a bumper must stay quiet.
export const collectBumperHits = (world: RapierWorld, bumpers: readonly ReturnType<RapierWorld["createCollider"]>[], previous: Set<string>): Array<{ x: number; y: number; z: number }> => {
  const current = new Set<string>();
  const hits: Array<{ x: number; y: number; z: number }> = [];
  for (const bumper of bumpers) world.contactPairsWith(bumper, (other) => {
    if (!other.parent()?.isDynamic() || !other.parent()?.isEnabled()) return;
    world.contactPair(bumper, other, (manifold) => {
      if (!manifold.numSolverContacts()) return;
      const key = `${bumper.handle}:${other.handle}`;
      if (!previous.has(key) && !current.has(key)) hits.push(bumper.translation());
      current.add(key);
    });
  });
  previous.clear();
  for (const key of current) previous.add(key);
  return hits;
};

export type RaceCourseRun = Readonly<{
  launchPositions: readonly PhysicalLaunchPosition[];
  bumperColliders?: readonly ReturnType<RapierWorld["createCollider"]>[];
  pinwheelColliders?: readonly ReturnType<RapierWorld["createCollider"]>[];
  pinwheelBodies?: readonly RapierBody[];
  stepBeforeWorld: () => Readonly<{ raceClockStarted: boolean }>;
  stepAfterWorld: (bodies: readonly RapierBody[]) => readonly BoosterEvent[];
  reset: (remainingRestart: boolean) => void;
  dispose: () => void;
}>;

export type RaceCourse = Readonly<{
  kind: "builtin" | "custom";
  samples: readonly TrackSample[];
  geometry: TrackGeometry;
  renderGroup: THREE.Group;
  attach: (world: RapierWorld) => unknown;
  createRun: (world: RapierWorld, count: number, seed: number, remainingRestart: boolean) => RaceCourseRun;
  dispose: () => void;
}>;

export type FixedStepPauseState = Readonly<{
  setPaused: (paused: boolean) => void;
  consume: (milliseconds: number) => number;
}>;

export const createFixedStepPauseState = (): FixedStepPauseState => {
  let paused = false;
  return Object.freeze({
    setPaused: (next: boolean) => { paused = next; },
    consume: (milliseconds: number) => paused ? 0 : milliseconds,
  });
};

export type SceneBuiltInTrackResources = Readonly<{ built: BuiltTrack; renderGroup: THREE.Group }>;

export const createBuiltInTrackResources = (debug = false): SceneBuiltInTrackResources => {
  const built = buildValidatedTrack({ features: true });
  return Object.freeze({ built, renderGroup: createTrackRenderGroup(built.geometry, { debug, checkpointNodes: built.spec.nodes }) });
};

const createBuiltInCourse = (debug = false): RaceCourse => {
  const resources = createBuiltInTrackResources(debug);
  let activeWorld: RapierWorld | undefined;
  let activeCollider: unknown;
  let activeObstacle: ObstaclePhysicsResources | undefined;
  let disposed = false;
  const attach = (world: RapierWorld): unknown => {
    if (disposed) throw new Error("Race course has been disposed.");
    if (activeWorld === world && activeCollider !== undefined) return activeCollider;
    activeWorld = world;
    activeCollider = createTrackCollider(world, resources.built.geometry);
    return activeCollider;
  };
  return {
    kind: "builtin",
    samples: resources.built.samples,
    geometry: resources.built.geometry,
    renderGroup: resources.renderGroup,
    attach,
    createRun: (world, count, seed, remainingRestart): RaceCourseRun => {
      attach(world);
      activeObstacle?.dispose();
      const obstacleGeometry = buildObstacleGeometry(resources.built.geometry, resources.built.obstacleLayout);
      const physics = createObstaclePhysics(world, obstacleGeometry);
      activeObstacle = physics;
      const obstacleGroup = createObstacleRenderGroup(obstacleGeometry, physics.controller.initialPose());
      resources.renderGroup.add(obstacleGroup);
      let runDisposed = false;
      let pose = physics.controller.initialPose();
      if (remainingRestart) setDeviceRenderPose(obstacleGroup, physics.reset({ gateOpen: true }));
      return Object.freeze({
        bumperColliders: physics.pegColliders,
        launchPositions: remainingRestart
          ? launchPositionsFor(createLaunchSlots(count), resources.built.geometry, seed)
          : createBowlLaunchPositions(count, resources.built.obstacleLayout.start, seed),
        stepBeforeWorld: () => {
          if (runDisposed) throw new Error("Race course run has been disposed.");
          pose = physics.stepFixed();
          return Object.freeze({ raceClockStarted: pose.raceClockStarted });
        },
        stepAfterWorld: () => { setDeviceRenderPose(obstacleGroup, pose); return []; },
        reset: (restart) => {
          if (runDisposed) throw new Error("Race course run has been disposed.");
          pose = physics.reset(restart ? { gateOpen: true } : {});
          setDeviceRenderPose(obstacleGroup, pose);
        },
        dispose: () => {
          if (runDisposed) return;
          runDisposed = true;
          physics.dispose();
          if (activeObstacle === physics) activeObstacle = undefined;
          obstacleGroup.removeFromParent();
          disposeObstacleRenderGroup(obstacleGroup);
        },
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeObstacle?.dispose();
      activeObstacle = undefined;
      activeWorld = undefined;
      activeCollider = undefined;
      disposeTrackRenderGroup(resources.renderGroup);
    },
  };
};

const createCustomCourse = (track: RaceCourseSelection & { kind: "custom" }, debug = false): RaceCourse => {
  const built: BuiltModularTrack = buildModularTrack(track.track);
  const rendered: ModularRenderResources = createModularTrackRender(built, { debug });
  let activeWorld: RapierWorld | undefined;
  let physics: ModularPhysicsResources | undefined;
  let disposed = false;
  const attach = (world: RapierWorld): unknown => {
    if (disposed) throw new Error("Race course has been disposed.");
    if (activeWorld !== world) {
      physics?.dispose();
      physics = createModularPhysics(world, built);
      activeWorld = world;
    }
    return physics!.trackCollider;
  };
  return {
    kind: "custom",
    samples: built.samples,
    geometry: built.geometry,
    renderGroup: rendered.group,
    attach,
    createRun: (world, count, seed, remainingRestart): RaceCourseRun => {
      attach(world);
      const currentPhysics = physics!;
      let runDisposed = false;
      let pose = currentPhysics.reset(remainingRestart);
      setModularDevicePose(rendered, pose);
      return Object.freeze({
        bumperColliders: currentPhysics.fixedColliders,
        pinwheelBodies: currentPhysics.pinwheelBodies,
        pinwheelColliders: currentPhysics.pinwheelBodies.flatMap(body => Array.from({ length: body.numColliders() }, (_, index) => body.collider(index))),
        launchPositions: createModularLaunchPositions(count, built, seed),
        stepBeforeWorld: () => {
          if (runDisposed) throw new Error("Race course run has been disposed.");
          pose = currentPhysics.stepBeforeWorld();
          return Object.freeze({ raceClockStarted: pose.gateOpen });
        },
        stepAfterWorld: (bodies) => { setModularDevicePose(rendered, pose); return currentPhysics.stepAfterWorld(bodies); },
        reset: (restart) => {
          if (runDisposed) throw new Error("Race course run has been disposed.");
          pose = currentPhysics.reset(restart);
          setModularDevicePose(rendered, pose);
        },
        dispose: () => {
          if (runDisposed) return;
          runDisposed = true;
          currentPhysics.dispose();
          if (physics === currentPhysics) { physics = undefined; activeWorld = undefined; }
        },
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      physics?.dispose();
      physics = undefined;
      activeWorld = undefined;
      disposeModularTrackRender(rendered);
    },
  };
};

export const createRaceCourse = (selection: RaceCourseSelection = { kind: "builtin" }, options: Readonly<{ debug?: boolean }> = {}): RaceCourse =>
  selection.kind === "builtin" ? createBuiltInCourse(options.debug === true) : createCustomCourse(selection, options.debug === true);
