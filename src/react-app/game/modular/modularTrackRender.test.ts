import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { createModularTrackRender, disposeModularTrackRender, setModularDevicePose } from "./modularTrackRender";
import { buildStartThroat } from "../track/obstacleGeometry";

describe("modular track rendering", () => {
  it("renders exact board buffers and collider-free booster chevrons", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const rendered = createModularTrackRender(built);
    const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
    expect(surface.geometry.getAttribute("position").array).toBe(built.geometry.positions);
    const throat = rendered.group.getObjectByName("modular-start-throat") as THREE.Mesh;
    expect(throat).toBeInstanceOf(THREE.Mesh);
    expect(throat.geometry.getAttribute("position").array).toEqual(buildStartThroat(rendered.devices.start.frame, 6).positions);
    expect(rendered.group.getObjectByName("booster-chevrons")?.userData.collider).toBe(false);
    const chevrons = rendered.group.getObjectByName("booster-chevrons");
    expect(chevrons?.children.every((child) => child instanceof THREE.Mesh && child.geometry.type === "ShapeGeometry")).toBe(true);
    expect(rendered.devices.boosters.length).toBeGreaterThan(0);
    expect(chevrons?.children.length).toBe(rendered.devices.boosters.length * 3);
    expect(chevrons?.children.length).toBeGreaterThan(0);
    const booster = rendered.devices.boosters[0]!;
    const boosterChildren = chevrons!.children.slice(0, 3);
    rendered.group.updateMatrixWorld(true);
    for (const [index, child] of boosterChildren.entries()) {
      const localNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(child.quaternion);
      expect(localNormal.dot(new THREE.Vector3(booster.up.x, booster.up.y, booster.up.z))).toBeCloseTo(1, 5);
      const projected = child.position.clone().sub(new THREE.Vector3(booster.center.x, booster.center.y, booster.center.z)).dot(new THREE.Vector3(booster.forward.x, booster.forward.y, booster.forward.z));
      expect(projected).toBeCloseTo((booster.endDistance - booster.startDistance) * ((index + 1) / 4 - 0.5), 5);
    }
    const shafts = rendered.group.getObjectByName("bumper-shafts") as THREE.InstancedMesh;
    const caps = rendered.group.getObjectByName("bumper-caps") as THREE.InstancedMesh;
    const scale = new THREE.Vector3(); const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const shaftQuaternion = new THREE.Quaternion();
    rendered.devices.bumpers.forEach((bar, index) => {
      shafts.getMatrixAt(index, matrix); matrix.decompose(position, shaftQuaternion, scale);
      const center = new THREE.Vector3(bar.center.x, bar.center.y, bar.center.z); const axis = new THREE.Vector3(bar.axis.x, bar.axis.y, bar.axis.z);
      const up = new THREE.Vector3(bar.up.x, bar.up.y, bar.up.z); const rightHanded = up.clone().cross(axis);
      expect(position.distanceTo(center)).toBeLessThan(1e-5); expect(new THREE.Vector3(1, 0, 0).applyQuaternion(shaftQuaternion).dot(up)).toBeCloseTo(1, 5); expect(new THREE.Vector3(0, 1, 0).applyQuaternion(shaftQuaternion).dot(axis)).toBeCloseTo(1, 5); expect(new THREE.Vector3(0, 0, 1).applyQuaternion(shaftQuaternion).dot(rightHanded)).toBeCloseTo(1, 5);
      expect(scale.x).toBeCloseTo(bar.height, 6); expect(scale.y).toBeCloseTo(bar.length - bar.thickness, 6); expect(scale.z).toBeCloseTo(bar.thickness, 6);
      for (const [capIndex, sign] of [-1, 1].entries()) {
        caps.getMatrixAt(index * 2 + capIndex, matrix); matrix.decompose(position, new THREE.Quaternion(), scale);
        const expected = new THREE.Vector3(bar.center.x, bar.center.y, bar.center.z).addScaledVector(new THREE.Vector3(bar.axis.x, bar.axis.y, bar.axis.z), sign * (bar.length - bar.thickness) / 2);
        expect(position.distanceTo(expected)).toBeLessThan(1e-5); expect(scale.x).toBeCloseTo(bar.height, 6); expect(scale.y).toBeCloseTo(bar.thickness, 6); expect(scale.z).toBeCloseTo(bar.thickness, 6);
      }
    });
    const rim = rendered.group.getObjectByName("modular-neon-rims") as THREE.InstancedMesh;
    const rimScale = new THREE.Vector3(); const rimMatrix = new THREE.Matrix4(); let rimIndex = 0; const row = built.geometry.profileSegments + 1;
    for (let index = 1; index < built.samples.length; index += 1) for (const column of [0, built.geometry.profileSegments]) {
      const previousOffset = ((index - 1) * row + column) * 3; const currentOffset = (index * row + column) * 3;
      const edgeLength = Math.hypot(built.geometry.positions[currentOffset] - built.geometry.positions[previousOffset], built.geometry.positions[currentOffset + 1] - built.geometry.positions[previousOffset + 1], built.geometry.positions[currentOffset + 2] - built.geometry.positions[previousOffset + 2]);
      rim.getMatrixAt(rimIndex++, rimMatrix); rimMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), rimScale); expect(rimScale.z).toBeCloseTo(edgeLength, 5);
    }
    disposeModularTrackRender(rendered);
  });

  it("updates the canonical pinwheel pose and disposes idempotently", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
    const arms = rendered.group.getObjectByName("pinwheel-arms") as THREE.InstancedMesh;
    expect(arms).toBeInstanceOf(THREE.InstancedMesh);
    expect(arms.count).toBe(3);
    expect(arms.geometry.type).toBe("CapsuleGeometry");
    const gate = rendered.group.getObjectByName("modular-release-gate") as THREE.Mesh;
    expect(gate.position.toArray()).toEqual([rendered.devices.start.gate.center.x, rendered.devices.start.gate.center.y, rendered.devices.start.gate.center.z]);
    const startTangent = new THREE.Vector3(rendered.devices.start.gate.tangent.x, rendered.devices.start.gate.tangent.y, rendered.devices.start.gate.tangent.z);
    const gateX = new THREE.Vector3(1, 0, 0).applyQuaternion(gate.quaternion); const gateY = new THREE.Vector3(0, 1, 0).applyQuaternion(gate.quaternion); const gateZ = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.quaternion);
    expect(gateX.dot(new THREE.Vector3(rendered.devices.start.gate.side.x, rendered.devices.start.gate.side.y, rendered.devices.start.gate.side.z))).toBeCloseTo(1, 5);
    expect(gateY.dot(new THREE.Vector3(rendered.devices.start.gate.up.x, rendered.devices.start.gate.up.y, rendered.devices.start.gate.up.z))).toBeCloseTo(1, 5);
    expect(gateZ.dot(startTangent)).toBeCloseTo(-1, 5); expect(gateX.clone().cross(gateY).dot(gateZ)).toBeCloseTo(1, 5);
    expect((gate.geometry as THREE.BoxGeometry).parameters.width).toBe(rendered.devices.start.gate.width); expect((gate.geometry as THREE.BoxGeometry).parameters.height).toBe(rendered.devices.start.gate.height); expect((gate.geometry as THREE.BoxGeometry).parameters.depth).toBe(rendered.devices.start.gate.depth);
    const agitatorBase = rendered.group.getObjectByName("modular-start-agitator")!;
    const agitatorSpin = rendered.group.getObjectByName("modular-start-agitator-spin")!;
    const pinwheelLayout = rendered.devices.pinwheels[0]!;
    const pinwheel = rendered.group.getObjectByName(`pinwheel-${pinwheelLayout.cellIndex}`)!;
    const baseQuaternion = agitatorBase.quaternion.clone();
    const agitatorX = new THREE.Vector3(1, 0, 0).applyQuaternion(agitatorBase.quaternion); const agitatorY = new THREE.Vector3(0, 1, 0).applyQuaternion(agitatorBase.quaternion); const agitatorZ = new THREE.Vector3(0, 0, 1).applyQuaternion(agitatorBase.quaternion);
    expect(agitatorBase.position.toArray()).toEqual([rendered.devices.start.agitator.center.x, rendered.devices.start.agitator.center.y, rendered.devices.start.agitator.center.z]);
    expect(agitatorX.dot(new THREE.Vector3(rendered.devices.start.agitator.side.x, rendered.devices.start.agitator.side.y, rendered.devices.start.agitator.side.z))).toBeCloseTo(1, 5); expect(agitatorY.dot(new THREE.Vector3(rendered.devices.start.agitator.up.x, rendered.devices.start.agitator.up.y, rendered.devices.start.agitator.up.z))).toBeCloseTo(1, 5); expect(agitatorX.clone().cross(agitatorY).dot(agitatorZ)).toBeCloseTo(1, 5);
    const armParameters = (agitatorSpin.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry;
    expect(armParameters.parameters.width).toBe(rendered.devices.start.agitator.width); expect(armParameters.parameters.height).toBe(rendered.devices.start.agitator.height); expect(armParameters.parameters.depth).toBe(rendered.devices.start.agitator.depth);
    setModularDevicePose(rendered, { elapsedSeconds: 0, gateOpen: false, agitatorAngle: 0, pinwheelAngles: [0] });
    expect(gate.visible).toBe(true);
    rendered.group.updateMatrixWorld(true);
    const agitatorBeforePose = agitatorSpin.getWorldQuaternion(new THREE.Quaternion()); const pinwheelBeforePose = pinwheel.getWorldQuaternion(new THREE.Quaternion());
    setModularDevicePose(rendered, { elapsedSeconds: 1, gateOpen: true, agitatorAngle: 0.5, pinwheelAngles: [1] });
    expect(gate.visible).toBe(false);
    expect(rendered.group.userData.pinwheelAngles).toEqual([1]);
    expect(pinwheel.rotation.y).toBeCloseTo(1, 8);
    expect(agitatorBase.quaternion.equals(baseQuaternion)).toBe(true);
    expect(agitatorSpin.rotation.y).toBeCloseTo(0.5, 8);
    rendered.group.updateMatrixWorld(true);
    const agitatorAfterPose = agitatorSpin.getWorldQuaternion(new THREE.Quaternion()); const pinwheelAfterPose = pinwheel.getWorldQuaternion(new THREE.Quaternion());
    expect(agitatorAfterPose.equals(agitatorBeforePose)).toBe(false); expect(pinwheelAfterPose.equals(pinwheelBeforePose)).toBe(false);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(agitatorAfterPose).dot(new THREE.Vector3(rendered.devices.start.agitator.up.x, rendered.devices.start.agitator.up.y, rendered.devices.start.agitator.up.z))).toBeCloseTo(1, 5);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(pinwheelAfterPose).dot(new THREE.Vector3(pinwheelLayout.axis.x, pinwheelLayout.axis.y, pinwheelLayout.axis.z))).toBeCloseTo(1, 5);
    disposeModularTrackRender(rendered);
    expect(() => disposeModularTrackRender(rendered)).not.toThrow();
  });

  it("does not allocate device meshes for a track with no devices and disposes once", () => {
    const zeroDevice = createModularTrackRender(buildModularTrack(createValidTrackDesign()));
    expect(zeroDevice.group.getObjectByName("bumper-shafts")).toBeUndefined();
    expect(zeroDevice.group.getObjectByName("pinwheel-arms")).toBeUndefined();
    expect(zeroDevice.group.getObjectByName("booster-chevrons")).toBeUndefined();
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); zeroDevice.group.traverse((object) => { const renderable = object as THREE.Mesh; if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry); if (renderable.material instanceof THREE.Material) materials.add(renderable.material); });
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose")); const materialSpies = [...materials].map((material) => vi.spyOn(material, "dispose"));
    disposeModularTrackRender(zeroDevice);
    const geometryDisposeCounts = geometrySpies.map((spy) => spy.mock.calls.length); const materialDisposeCounts = materialSpies.map((spy) => spy.mock.calls.length);
    disposeModularTrackRender(zeroDevice);
    expect(geometrySpies.map((spy) => spy.mock.calls.length)).toEqual(geometryDisposeCounts); expect(materialSpies.map((spy) => spy.mock.calls.length)).toEqual(materialDisposeCounts);
    expect(geometryDisposeCounts.every((count) => count === 1)).toBe(true); expect(materialDisposeCounts.every((count) => count === 1)).toBe(true);
  });

  it("keeps every chevron vertex inside its trigger band and flat on the channel", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign())); rendered.group.updateMatrixWorld(true);
    const chevrons = rendered.group.getObjectByName("booster-chevrons")!;
    expect(rendered.devices.boosters.length).toBeGreaterThan(0); expect(chevrons.children.length).toBe(rendered.devices.boosters.length * 3); expect(chevrons.children.length).toBeGreaterThan(0);
    rendered.devices.boosters.forEach((booster, boosterIndex) => {
      const children = chevrons.children.slice(boosterIndex * 3, boosterIndex * 3 + 3); const up = new THREE.Vector3(booster.up.x, booster.up.y, booster.up.z); const forward = new THREE.Vector3(booster.forward.x, booster.forward.y, booster.forward.z); const center = new THREE.Vector3(booster.center.x, booster.center.y, booster.center.z); const midpoint = (booster.startDistance + booster.endDistance) / 2;
      children.forEach((child) => { const positions = child instanceof THREE.Mesh ? child.geometry.getAttribute("position") : undefined; expect(positions).toBeDefined(); if (positions) for (let vertex = 0; vertex < positions.count; vertex += 1) { const world = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(child.matrixWorld); const relative = world.clone().sub(center); const along = midpoint + relative.dot(forward); expect(along).toBeGreaterThanOrEqual(booster.startDistance - 1e-5); expect(along).toBeLessThanOrEqual(booster.endDistance + 1e-5); expect(relative.dot(up)).toBeCloseTo(0.03, 5); } });
    });
    disposeModularTrackRender(rendered);
  });

  it("disposes every unique nested geometry and material once", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign())); const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); rendered.group.traverse((object) => { const renderable = object as THREE.Mesh; if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry); if (renderable.material instanceof THREE.Material) materials.add(renderable.material); });
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose")); const materialSpies = [...materials].map((material) => vi.spyOn(material, "dispose"));
    disposeModularTrackRender(rendered);
    const geometryDisposeCounts = geometrySpies.map((spy) => spy.mock.calls.length); const materialDisposeCounts = materialSpies.map((spy) => spy.mock.calls.length);
    disposeModularTrackRender(rendered);
    expect(geometrySpies.map((spy) => spy.mock.calls.length)).toEqual(geometryDisposeCounts); expect(materialSpies.map((spy) => spy.mock.calls.length)).toEqual(materialDisposeCounts);
    expect(geometryDisposeCounts.every((count) => count === 1)).toBe(true); expect(materialDisposeCounts.every((count) => count === 1)).toBe(true);
  });
});
