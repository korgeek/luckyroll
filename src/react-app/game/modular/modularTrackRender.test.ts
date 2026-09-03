import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { createModularTrackRender, disposeModularTrackRender, setModularDevicePose } from "./modularTrackRender";

describe("modular track rendering", () => {
  it("renders exact board buffers and collider-free booster chevrons", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const rendered = createModularTrackRender(built);
    const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
    expect(surface.geometry.getAttribute("position").array).toBe(built.geometry.positions);
    expect(rendered.group.getObjectByName("booster-chevrons")?.userData.collider).toBe(false);
    disposeModularTrackRender(rendered);
  });

  it("updates the canonical pinwheel pose and disposes idempotently", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
    setModularDevicePose(rendered, { elapsedSeconds: 1, gateOpen: true, agitatorAngle: 0.5, pinwheelAngles: [1] });
    expect(rendered.group.userData.pinwheelAngles).toEqual([1]);
    disposeModularTrackRender(rendered);
    expect(() => disposeModularTrackRender(rendered)).not.toThrow();
  });
});
