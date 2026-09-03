import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
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
    expect(chevrons?.children.every((child) => child instanceof THREE.Mesh && child.geometry.type === "ShapeGeometry")).toBe(true);
    const booster = rendered.devices.boosters[0];
    const boosterChildren = chevrons?.children.slice(0, 3) ?? [];
    rendered.group.updateMatrixWorld(true);
    if (booster) for (const [index, child] of boosterChildren.entries()) {
      const localNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(child.quaternion);
      expect(localNormal.dot(new THREE.Vector3(booster.up.x, booster.up.y, booster.up.z))).toBeCloseTo(1, 5);
      const projected = child.position.clone().sub(new THREE.Vector3(booster.center.x, booster.center.y, booster.center.z)).dot(new THREE.Vector3(booster.forward.x, booster.forward.y, booster.forward.z));
      expect(projected).toBeCloseTo((booster.endDistance - booster.startDistance) * ((index + 1) / 4 - 0.5), 5);
    }
    const shafts = rendered.group.getObjectByName("bumper-shafts") as THREE.InstancedMesh;
    const caps = rendered.group.getObjectByName("bumper-caps") as THREE.InstancedMesh;
    const scale = new THREE.Vector3(); const matrix = new THREE.Matrix4(); shafts.getMatrixAt(0, matrix); matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.y).toBeCloseTo(rendered.devices.bumpers[0].length - rendered.devices.bumpers[0].thickness, 6);
    const capPosition = new THREE.Vector3(); caps.getMatrixAt(0, matrix); matrix.decompose(capPosition, new THREE.Quaternion(), scale);
    expect(capPosition.distanceTo(new THREE.Vector3(rendered.devices.bumpers[0].center.x, rendered.devices.bumpers[0].center.y, rendered.devices.bumpers[0].center.z))).toBeCloseTo((rendered.devices.bumpers[0].length - rendered.devices.bumpers[0].thickness) / 2, 6);
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
    const gate = rendered.group.getObjectByName("modular-release-gate")!;
    expect(gate.position.toArray()).toEqual([rendered.devices.start.gate.center.x, rendered.devices.start.gate.center.y, rendered.devices.start.gate.center.z]);
    const startTangent = new THREE.Vector3(rendered.devices.start.gate.tangent.x, rendered.devices.start.gate.tangent.y, rendered.devices.start.gate.tangent.z);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(gate.quaternion).dot(startTangent)).toBeCloseTo(-1, 5);
    const agitatorBase = rendered.group.getObjectByName("modular-start-agitator")!;
    const agitatorSpin = rendered.group.getObjectByName("modular-start-agitator-spin")!;
    const baseQuaternion = agitatorBase.quaternion.clone();
    setModularDevicePose(rendered, { elapsedSeconds: 1, gateOpen: true, agitatorAngle: 0.5, pinwheelAngles: [1] });
    expect(rendered.group.userData.pinwheelAngles).toEqual([1]);
    expect(agitatorBase.quaternion.equals(baseQuaternion)).toBe(true);
    expect(agitatorSpin.rotation.y).toBeCloseTo(0.5, 8);
    disposeModularTrackRender(rendered);
    expect(() => disposeModularTrackRender(rendered)).not.toThrow();
  });

  it("does not allocate device meshes for a track with no devices and disposes once", () => {
    const zeroDevice = createModularTrackRender(buildModularTrack(createValidTrackDesign()));
    expect(zeroDevice.group.getObjectByName("bumper-shafts")).toBeUndefined();
    expect(zeroDevice.group.getObjectByName("pinwheel-arms")).toBeUndefined();
    expect(zeroDevice.group.getObjectByName("booster-chevrons")).toBeUndefined();
    const geometries = zeroDevice.group.children.flatMap((child) => { const geometry = (child as THREE.Mesh).geometry; return geometry === undefined ? [] : [geometry]; });
    const spies = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
    disposeModularTrackRender(zeroDevice); disposeModularTrackRender(zeroDevice);
    expect(spies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
