import * as THREE from "three";
import type { TrackGeometry, TrackSample, Vec3 } from "./trackTypes";

export type TrackRenderOptions = Readonly<{ debug?: boolean }>;

const toVector3 = (value: Vec3): THREE.Vector3 => new THREE.Vector3(value.x, value.y, value.z);

const edgeVertex = (geometry: TrackGeometry, sampleIndex: number, column: number): THREE.Vector3 => {
  const offset = (sampleIndex * (geometry.profileSegments + 1) + column) * 3;
  return new THREE.Vector3(
    geometry.positions[offset],
    geometry.positions[offset + 1],
    geometry.positions[offset + 2],
  );
};

const createRimLines = (geometry: TrackGeometry): THREE.LineSegments => {
  const positions: number[] = [];
  const lastColumn = geometry.profileSegments;

  for (let index = 1; index < geometry.samples.length; index += 1) {
    for (const column of [0, lastColumn]) {
      const previous = edgeVertex(geometry, index - 1, column);
      const current = edgeVertex(geometry, index, column);
      positions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
    }
  }

  const rimGeometry = new THREE.BufferGeometry();
  rimGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const rims = new THREE.LineSegments(
    rimGeometry,
    new THREE.LineBasicMaterial({ color: "#18334a", transparent: true, opacity: 0.95 }),
  );
  rims.name = "u-channel-dark-rims";
  return rims;
};

const createSupports = (samples: readonly TrackSample[]): THREE.InstancedMesh => {
  const supportCount = Math.ceil(samples.length / 15);
  const supports = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.34, 0.54, 1, 12),
    new THREE.MeshStandardMaterial({ color: "#62452d", roughness: 0.72, metalness: 0.08 }),
    supportCount,
  );
  const transform = new THREE.Object3D();

  samples.forEach((sample, index) => {
    if (index % 15 !== 0) return;
    const height = Math.max(2.5, Math.abs(sample.position.y) + sample.channelDepth);
    transform.position.set(sample.position.x, sample.position.y - height / 2, sample.position.z);
    transform.scale.set(1, height, 1);
    transform.updateMatrix();
    supports.setMatrixAt(Math.floor(index / 15), transform.matrix);
  });
  supports.instanceMatrix.needsUpdate = true;
  supports.name = "u-channel-supports";
  return supports;
};

const addSegment = (positions: number[], start: Vec3, end: Vec3): void => {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
};

export const createTrackDebugGroup = (samples: readonly TrackSample[]): THREE.Group => {
  const group = new THREE.Group();
  group.name = "track-debug";
  const centerline = new THREE.BufferGeometry().setFromPoints(samples.map((sample) => toVector3(sample.position)));
  const centerlineLine = new THREE.Line(centerline, new THREE.LineBasicMaterial({ color: "#f8fcff" }));
  centerlineLine.name = "track-debug-centerline";
  group.add(centerlineLine);

  const frameSegments: number[] = [];
  const zoneSegments: number[] = [];
  for (let index = 0; index < samples.length; index += 15) {
    const sample = samples[index];
    addSegment(frameSegments, sample.position, {
      x: sample.position.x + sample.tangent.x * 1.8,
      y: sample.position.y + sample.tangent.y * 1.8,
      z: sample.position.z + sample.tangent.z * 1.8,
    });
    addSegment(frameSegments, sample.position, {
      x: sample.position.x + sample.up.x * 1.8,
      y: sample.position.y + sample.up.y * 1.8,
      z: sample.position.z + sample.up.z * 1.8,
    });
  }
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].zone !== samples[index - 1].zone) {
      const sample = samples[index];
      addSegment(zoneSegments, {
        x: sample.position.x - sample.side.x * sample.width / 2,
        y: sample.position.y - sample.side.y * sample.width / 2,
        z: sample.position.z - sample.side.z * sample.width / 2,
      }, {
        x: sample.position.x + sample.side.x * sample.width / 2,
        y: sample.position.y + sample.side.y * sample.width / 2,
        z: sample.position.z + sample.side.z * sample.width / 2,
      });
    }
  }
  const frames = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(frameSegments, 3)),
    new THREE.LineBasicMaterial({ color: "#ffdb67" }),
  );
  frames.name = "track-debug-frames";
  const zones = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(zoneSegments, 3)),
    new THREE.LineBasicMaterial({ color: "#ff5f9b" }),
  );
  zones.name = "track-debug-zones";
  group.add(frames, zones);
  return group;
};

export const createTrackRenderGroup = (
  geometry: TrackGeometry,
  options: TrackRenderOptions = {},
): THREE.Group => {
  const group = new THREE.Group();
  group.name = "continuous-track";
  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute("position", new THREE.BufferAttribute(geometry.positions, 3));
  surfaceGeometry.setAttribute("normal", new THREE.BufferAttribute(geometry.normals, 3));
  surfaceGeometry.setIndex(new THREE.BufferAttribute(geometry.indices, 1));
  surfaceGeometry.computeBoundingSphere();
  const surface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshStandardMaterial({ color: "#45d8ca", roughness: 0.48, metalness: 0.06, side: THREE.DoubleSide }),
  );
  surface.name = "continuous-u-channel";
  group.add(surface, createRimLines(geometry), createSupports(geometry.samples));
  if (options.debug === true) group.add(createTrackDebugGroup(geometry.samples));
  return group;
};

export const disposeTrackRenderGroup = (group: THREE.Object3D): void => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const renderObject = object as THREE.Mesh | THREE.Line;
    if ("geometry" in renderObject && renderObject.geometry instanceof THREE.BufferGeometry) geometries.add(renderObject.geometry);
    if ("material" in renderObject) {
      const value = renderObject.material;
      (Array.isArray(value) ? value : [value]).forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  group.clear();
};
