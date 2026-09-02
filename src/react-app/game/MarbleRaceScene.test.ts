import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { attachSceneTrackCollider, createSceneTrackResources, hasFinishedTrack, projectRaceBody } from "./MarbleRaceScene";
import { insideFinishVolume } from "./track/trackPhysics";

describe("continuous-track scene seams", () => {
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

  it("projects runtime body progress without applying a guide force", () => {
    const resources = createSceneTrackResources();
    const body = {
      translation: () => resources.built.samples[0].position,
      addForce: () => { throw new Error("legacy guide force must not run"); },
    };

    expect(projectRaceBody(body, resources.built.samples).progress).toBe(0);
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
