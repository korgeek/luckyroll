import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { type TrackCell } from "../../designer/trackDesign";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import type { ModulePathSample } from "./modularTypes";
import { createModularTrackRender, disposeModularTrackRender, setModularDevicePose } from "./modularTrackRender";
import { createWaveVertices } from "./moduleDevices";

describe("modular track rendering", () => {
  it("renders each wave semicircle from the shared collision vertices", () => {
    const rendered = createModularTrackRender(buildModularTrack(createValidTrackDesign()));
    for (const wave of rendered.devices.waves) {
      const mesh = rendered.group.getObjectByName(`wave-semicircle-${wave.cellIndex}-${wave.localU}`) as THREE.Mesh;
      expect(mesh).toBeDefined();
      const expected = new THREE.Box3().setFromArray(createWaveVertices(wave));
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.min.distanceTo(expected.min)).toBeLessThan(1e-6);
      expect(mesh.geometry.boundingBox!.max.distanceTo(expected.max)).toBeLessThan(1e-6);
    }
    expect(rendered.devices.waves.length).toBeGreaterThan(0);
    rendered.dispose();
  });
  it("gives every module a closed, thick exterior visible from its floor and both sides without moving the interior", () => {
    const seen = new Set<string>();
    const track = createValidTrackDesign();
    const built = buildModularTrack(track); const original = built.geometry.positions.slice();
    const rendered = createModularTrackRender(built); rendered.group.updateMatrixWorld(true);
    const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
    const shell = rendered.group.getObjectByName("modular-channel-shell") as THREE.Mesh;
    const rims = rendered.group.getObjectByName("modular-channel-rims") as THREE.Mesh;
    expect(shell.userData.collider).toBe(false); expect(rims.userData.collider).toBe(false);
    expect((shell.material as THREE.Material).side).toBe(THREE.FrontSide);
    const outer = shell.geometry.getAttribute("position");
    let maxThicknessError = 0; let maxNormalDot = -Infinity;
    for (let vertex = 0; vertex < outer.count; vertex++) {
      const delta = new THREE.Vector3().fromBufferAttribute(outer, vertex).sub(new THREE.Vector3().fromArray(original, vertex * 3));
      maxThicknessError = Math.max(maxThicknessError, Math.abs(delta.length() - 0.26));
      maxNormalDot = Math.max(maxNormalDot, delta.dot(new THREE.Vector3().fromArray(built.geometry.normals, vertex * 3)));
    }
    expect(maxThicknessError).toBeLessThan(0.00005); expect(maxNormalDot).toBeLessThan(-0.2599);
    const perimeterEdges = 2 * (built.geometry.samples.length - 1 + built.geometry.profileSegments);
    expect(rims.geometry.getAttribute("position").count).toBe(perimeterEdges * 6);
    for (const mesh of [shell, rims]) {
      const positions = mesh.geometry.getAttribute("position"); const indices = mesh.geometry.getIndex();
      let minimumArea = Infinity;
      for (let offset = 0; offset < (indices?.count ?? positions.count); offset += 3) {
        const [a, b, c] = [0, 1, 2].map(delta => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(offset + delta) : offset + delta));
        minimumArea = Math.min(minimumArea, b.sub(a).cross(c.sub(a)).lengthSq());
      }
      expect(minimumArea).toBeGreaterThan(1e-12);
    }
    const representativeRows = new Map<string, number>();
    const samples: readonly ModulePathSample[] = built.geometry.samples;
    samples.forEach((sample, row) => {
      const kind = track.cells[sample.cellIndex]?.kind;
      if (!kind || seen.has(kind) || row === samples.length - 1) return;
      const previous = representativeRows.get(kind);
      if (previous === undefined || Math.abs(sample.localU - 0.5) < Math.abs(samples[previous].localU - 0.5)) representativeRows.set(kind, row);
    });
    for (const [kind, row] of representativeRows) {
      seen.add(kind);
      for (const column of [1, Math.floor(built.geometry.profileSegments / 2), built.geometry.profileSegments - 2]) {
        const triangle = (row * built.geometry.profileSegments + column) * 6;
        for (const mesh of [surface, shell]) {
          const positions = mesh.geometry.getAttribute("position"); const indices = mesh.geometry.getIndex()!;
          const [a, b, c] = [0, 1, 2].map(delta => new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle + delta)));
          const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
          const center = a.add(b).add(c).divideScalar(3);
          const ray = new THREE.Raycaster(center.clone().addScaledVector(normal, 0.05), normal.clone().negate(), 0, 0.1);
          mesh.geometry.setDrawRange(triangle, 3);
          expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(0.05, 4);
          mesh.geometry.setDrawRange(0, Infinity);
        }
      }
    }
    expect(built.geometry.positions.every((value, index) => value === original[index])).toBe(true);
    const shellDispose = vi.spyOn(shell.geometry, "dispose"); const rimDispose = vi.spyOn(rims.geometry, "dispose");
    rendered.dispose(); rendered.dispose(); expect(shellDispose).toHaveBeenCalledOnce(); expect(rimDispose).toHaveBeenCalledOnce();
    expect([...seen].sort()).toEqual(["booster", "bumper", "curve", "finish", "funnel", "pinwheel", "start", "straight", "wave"]);
  });
  it("renders the centered bumper as a distinct round cylinder", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
    const mesh = rendered.group.getObjectByName("round-bumpers") as THREE.InstancedMesh;
    const bumpers = rendered.devices.bumpers.filter((bumper) => bumper.shape === "round");
    expect(bumpers).toHaveLength(rendered.devices.bumpers.length);
    expect(bumpers.length).toBe(new Set(bumpers.map((bumper) => bumper.cellIndex)).size * 6);
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(bumpers.length);
    expect((mesh.geometry as THREE.CylinderGeometry).parameters).toMatchObject({ radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 16 });
    const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3();
    bumpers.forEach((bumper, index) => {
      mesh.getMatrixAt(index, matrix); matrix.decompose(position, quaternion, scale);
      expect(position.distanceTo(new THREE.Vector3(bumper.center.x, bumper.center.y, bumper.center.z))).toBeLessThan(1e-5);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(new THREE.Vector3(bumper.up.x, bumper.up.y, bumper.up.z))).toBeCloseTo(1, 5);
      expect(scale.x).toBeCloseTo(bumper.radius, 6); expect(scale.y).toBeCloseTo(bumper.height, 6); expect(scale.z).toBeCloseTo(bumper.radius, 6);
    });
    disposeModularTrackRender(rendered);
  });

	it("adds collider-free finish dressing", () => {
		const built = buildModularTrack(createValidTrackDesign());
		const rendered = createModularTrackRender(built);
		const finish = rendered.group.getObjectByName("modular-finish-decoration")!;
		expect(finish.userData.collider).toBe(false);
		const checker = finish.getObjectByName("finish-checker-strip") as THREE.Mesh;
		const frame = built.samples[built.samples.length - 1];
		const position = checker.geometry.getAttribute("position");
		const offsets = Array.from({ length: position.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(position, index).sub(new THREE.Vector3().copy(frame.position)));
		expect(Math.max(...offsets.map(point => point.dot(new THREE.Vector3().copy(frame.side))))).toBeCloseTo(frame.width / 2, 4);
		expect(Math.min(...offsets.map(point => point.dot(new THREE.Vector3().copy(frame.side))))).toBeCloseTo(-frame.width / 2, 4);
		expect(Math.max(...offsets.map(point => point.dot(new THREE.Vector3().copy(frame.up))))).toBeCloseTo(12, 4);
		expect(checker.geometry.getAttribute("color")).toBeDefined();
		expect(finish.getObjectByName("finish-neon-arch")).toBeUndefined();
		disposeModularTrackRender(rendered);
	});
  it("renders exact board buffers and collider-free booster chevrons", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const rendered = createModularTrackRender(built);
    const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
    expect(surface.geometry.getAttribute("position").array).toBe(built.geometry.positions);
    expect(surface.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const channelMaterial = surface.material as THREE.MeshStandardMaterial;
    expect(channelMaterial.color.getHexString()).toBe("3f4650"); expect(channelMaterial.roughness).toBe(0.34); expect(channelMaterial.metalness).toBe(0.62);
    expect(rendered.group.getObjectByName("modular-channel-shell")).toBeInstanceOf(THREE.Mesh);
    expect(rendered.group.getObjectByName("curve-inner-infill")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-start-bowl")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-start-ramp-bridge")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-start-agitator")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-start-enclosure")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-release-gate")).toBeInstanceOf(THREE.Mesh);
    expect(rendered.group.getObjectByName("modular-start-pusher")).toBeInstanceOf(THREE.Mesh);
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
    expect(rendered.group.getObjectByName("bumper-shafts")).toBeUndefined();
    expect(rendered.group.getObjectByName("bumper-caps")).toBeUndefined();
    expect(rendered.group.getObjectByName("modular-neon-rims")).toBeUndefined();
    disposeModularTrackRender(rendered);
  });

  it("marks every curve's central safety zone with collider-free forward chevrons", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const rendered = createModularTrackRender(built);
    const curveCells = new Set(built.samples.filter((sample) => built.track.cells[sample.cellIndex]?.kind === "curve").map((sample) => sample.cellIndex));
    const chevrons = rendered.group.getObjectByName("curve-safety-chevrons")!;
    expect(curveCells.size).toBeGreaterThan(0);
    expect(chevrons.userData.collider).toBe(false);
    expect(chevrons.children).toHaveLength(curveCells.size * 3);
    expect(chevrons.children.every((child) => child instanceof THREE.Mesh && child.geometry.type === "ShapeGeometry")).toBe(true);
    disposeModularTrackRender(rendered);
  });

  it("keeps corner arrow tips facing forward and every vertex above the curved floor", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const rendered = createModularTrackRender(built); rendered.group.updateMatrixWorld(true);
    const surface = rendered.group.getObjectByName("modular-channel") as THREE.Mesh;
    const arrows = rendered.group.getObjectByName("curve-safety-chevrons")!;
    for (const arrow of arrows.children as THREE.Mesh[]) {
      const frame = built.samples.reduce((nearest, sample) => arrow.position.distanceToSquared(new THREE.Vector3(sample.position.x, sample.position.y, sample.position.z)) < arrow.position.distanceToSquared(new THREE.Vector3(nearest.position.x, nearest.position.y, nearest.position.z)) ? sample : nearest);
      const forward = new THREE.Vector3(frame.tangent.x, frame.tangent.y, frame.tangent.z);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).dot(forward)).toBeCloseTo(1, 3);
    }
    // Raycast one complete three-arrow group against the actual indexed racing mesh.
    for (const arrow of arrows.children.slice(0, 3) as THREE.Mesh[]) {
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(arrow.quaternion);
      const vertices = arrow.geometry.getAttribute("position");
      for (let index = 0; index < vertices.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(arrow.matrixWorld);
        const ray = new THREE.Raycaster(point.clone().addScaledVector(up, 1), up.clone().negate(), 0, 2);
        const hit = ray.intersectObject(surface)[0];
        expect(hit).toBeDefined();
        expect(hit.distance).toBeGreaterThan(1);
        expect(hit.distance).toBeLessThan(1.2);
      }
    }
    rendered.dispose();
  });

  it("updates the canonical pinwheel pose and disposes idempotently", () => {
    const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
    const arms = rendered.group.getObjectByName("pinwheel-arms") as THREE.InstancedMesh;
    expect(arms).toBeInstanceOf(THREE.InstancedMesh);
    expect(arms.count).toBe(2);
    expect(arms.geometry.type).toBe("CapsuleGeometry");
    const pinwheelLayout = rendered.devices.pinwheels[0]!;
    const armGeometry = arms.geometry as THREE.CapsuleGeometry;
    expect(armGeometry.parameters.radius).toBe(pinwheelLayout.armThickness / 2);
    expect(armGeometry.parameters.length).toBe(pinwheelLayout.radius - pinwheelLayout.armThickness);
    const gate = rendered.group.getObjectByName("modular-release-gate") as THREE.Mesh;
    const pusher = rendered.group.getObjectByName("modular-start-pusher") as THREE.Mesh;
    expect(gate.position.toArray()).toEqual([rendered.devices.start.gate.center.x, rendered.devices.start.gate.center.y, rendered.devices.start.gate.center.z]);
    const startTangent = new THREE.Vector3(rendered.devices.start.gate.tangent.x, rendered.devices.start.gate.tangent.y, rendered.devices.start.gate.tangent.z);
    const gateX = new THREE.Vector3(1, 0, 0).applyQuaternion(gate.quaternion); const gateY = new THREE.Vector3(0, 1, 0).applyQuaternion(gate.quaternion); const gateZ = new THREE.Vector3(0, 0, 1).applyQuaternion(gate.quaternion);
    expect(gateX.dot(new THREE.Vector3(rendered.devices.start.gate.side.x, rendered.devices.start.gate.side.y, rendered.devices.start.gate.side.z))).toBeCloseTo(1, 5);
    expect(gateY.dot(new THREE.Vector3(rendered.devices.start.gate.up.x, rendered.devices.start.gate.up.y, rendered.devices.start.gate.up.z))).toBeCloseTo(1, 5);
    expect(gateZ.dot(startTangent)).toBeCloseTo(-1, 5); expect(gateX.clone().cross(gateY).dot(gateZ)).toBeCloseTo(1, 5);
    expect((gate.geometry as THREE.BoxGeometry).parameters.width).toBe(rendered.devices.start.gate.width); expect((gate.geometry as THREE.BoxGeometry).parameters.height).toBe(rendered.devices.start.gate.height); expect((gate.geometry as THREE.BoxGeometry).parameters.depth).toBe(rendered.devices.start.gate.depth);
    expect(pusher.position.toArray()).toEqual([rendered.devices.start.pusher.center.x, rendered.devices.start.pusher.center.y, rendered.devices.start.pusher.center.z]);
    pusher.geometry.computeBoundingBox();
    const size = pusher.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(rendered.devices.start.pusher.width, 5); expect(size.y).toBeCloseTo(rendered.devices.start.pusher.height, 5); expect(size.z).toBeCloseTo(rendered.devices.start.pusher.depth, 5);
    const pinwheel = rendered.group.getObjectByName(`pinwheel-${pinwheelLayout.cellIndex}`)!;
    setModularDevicePose(rendered, { elapsedSeconds: 0, gateOpen: false, pusherCenter: rendered.devices.start.pusher.center, pinwheelAngles: [0] });
    expect(gate.visible).toBe(true);
    expect(pusher.position.toArray()).toEqual([rendered.devices.start.pusher.center.x, rendered.devices.start.pusher.center.y, rendered.devices.start.pusher.center.z]);
    rendered.group.updateMatrixWorld(true);
    const pinwheelBeforePose = pinwheel.getWorldQuaternion(new THREE.Quaternion());
    setModularDevicePose(rendered, { elapsedSeconds: 1, gateOpen: true, pusherCenter: rendered.devices.start.pusher.endCenter, pinwheelAngles: [1] });
    expect(gate.visible).toBe(false);
    expect(pusher.position.toArray()).toEqual([rendered.devices.start.pusher.endCenter.x, rendered.devices.start.pusher.endCenter.y, rendered.devices.start.pusher.endCenter.z]);
    expect(rendered.group.userData.pinwheelAngles).toEqual([1]);
    rendered.group.updateMatrixWorld(true);
    const pinwheelAfterPose = pinwheel.getWorldQuaternion(new THREE.Quaternion());
    expect(pinwheelAfterPose.equals(pinwheelBeforePose)).toBe(false);
    expect(Math.abs(pinwheelAfterPose.dot(pinwheelBeforePose.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1))))).toBeCloseTo(1, 8);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(pinwheelAfterPose).dot(new THREE.Vector3(pinwheelLayout.axis.x, pinwheelLayout.axis.y, pinwheelLayout.axis.z))).toBeCloseTo(1, 5);
    const pusherGeometryDispose = vi.spyOn(pusher.geometry, "dispose");
    disposeModularTrackRender(rendered);
    expect(pusherGeometryDispose).toHaveBeenCalledOnce();
    expect(() => disposeModularTrackRender(rendered)).not.toThrow();
  });

  it("does not allocate device meshes for a track with no devices and disposes once", () => {
    const cells = [...createValidTrackDesign().cells] as TrackCell[];
    for (const cellIndex of [2, 7, 12, 17, 22, 27, 36, 37, 38]) cells[cellIndex] = { kind: "straight", rotation: 0 };
    const zeroDevice = createModularTrackRender(buildModularTrack({ ...createValidTrackDesign(), cells }));
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
