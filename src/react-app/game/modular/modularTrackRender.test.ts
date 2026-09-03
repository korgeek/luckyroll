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
    const chevrons = rendered.group.getObjectByName("booster-chevrons");
    expect(chevrons?.children.every((child) => child instanceof THREE.Mesh && child.geometry.type === "PlaneGeometry")).toBe(true);
    const booster = rendered.devices.boosters[0];
    const boosterChildren = chevrons?.children.slice(0, 3) ?? [];
    if (booster) for (const child of boosterChildren) {
      const localNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(child.quaternion);
      expect(localNormal.dot(new THREE.Vector3(booster.up.x, booster.up.y, booster.up.z))).toBeCloseTo(1, 5);
      expect(child.position.distanceTo(new THREE.Vector3(booster.center.x, booster.center.y, booster.center.z))).toBeLessThanOrEqual((booster.endDistance - booster.startDistance) / 2 + 2);
    }
    const rim = rendered.group.getObjectByName("modular-neon-rims") as THREE.InstancedMesh;
    const rimScale = new THREE.Vector3(); const rimMatrix = new THREE.Matrix4(); rim.getMatrixAt(0, rimMatrix);
    rimMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), rimScale);
    expect(rimScale.z).toBeGreaterThan(1);
    disposeModularTrackRender(rendered);
  });

  it("updates the canonical pinwheel pose and disposes idempotently", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
    const arms = rendered.group.getObjectByName("pinwheel-arms") as THREE.InstancedMesh;
    expect(arms).toBeInstanceOf(THREE.InstancedMesh);
    expect(arms.count).toBe(3);
    expect(arms.geometry.type).toBe("CapsuleGeometry");
    setModularDevicePose(rendered, { elapsedSeconds: 1, gateOpen: true, agitatorAngle: 0.5, pinwheelAngles: [1] });
    expect(rendered.group.userData.pinwheelAngles).toEqual([1]);
    disposeModularTrackRender(rendered);
    expect(() => disposeModularTrackRender(rendered)).not.toThrow();
  });
});
