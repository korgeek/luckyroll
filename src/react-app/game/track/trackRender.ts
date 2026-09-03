import * as THREE from "three";
import { buildTrackShell } from "./obstacleGeometry";
import { projectToTrack } from "./trackSampler";
import type { TrackGeometry, TrackNode, TrackSample, Vec3 } from "./trackTypes";

export type TrackRenderOptions = Readonly<{ debug?: boolean; checkpointNodes?: readonly TrackNode[] }>;

const toVector3 = (value: Vec3): THREE.Vector3 => new THREE.Vector3(value.x, value.y, value.z);

const edgeVertex = (geometry: TrackGeometry, sampleIndex: number, column: number): THREE.Vector3 => {
  const offset = (sampleIndex * (geometry.profileSegments + 1) + column) * 3;
  return new THREE.Vector3(
    geometry.positions[offset],
    geometry.positions[offset + 1],
    geometry.positions[offset + 2],
  );
};

const createRimLines = (geometry: TrackGeometry): THREE.Group => {
  const lastColumn = geometry.profileSegments;
  const segments = (geometry.samples.length - 1) * 2;
  const rimGeometry = new THREE.BoxGeometry(0.2, 0.18, 1);
  const cyan = new THREE.MeshStandardMaterial({ color: "#16d7e8", emissive: "#075460", roughness: 0.38, metalness: 0.35 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#ffe25a", emissive: "#6d5900", roughness: 0.38, metalness: 0.3 });
  const cyanRims = new THREE.InstancedMesh(rimGeometry, cyan, Math.ceil(segments / 2)); cyanRims.name = "u-channel-cyan-rims";
  const yellowRims = new THREE.InstancedMesh(rimGeometry, yellow, Math.floor(segments / 2)); yellowRims.name = "u-channel-yellow-rims";
  const transform = new THREE.Object3D(); let cyanIndex = 0; let yellowIndex = 0;
  for (let index = 1; index < geometry.samples.length; index += 1) for (const column of [0, lastColumn]) {
    const previous = edgeVertex(geometry, index - 1, column); const current = edgeVertex(geometry, index, column); const direction = current.clone().sub(previous); const length = direction.length();
    transform.position.copy(previous).add(current).multiplyScalar(0.5); transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize()); transform.scale.set(1, 1, length); transform.updateMatrix();
    if ((index + column) % 2 === 0) cyanRims.setMatrixAt(cyanIndex++, transform.matrix); else yellowRims.setMatrixAt(yellowIndex++, transform.matrix);
  }
  cyanRims.instanceMatrix.needsUpdate = true; yellowRims.instanceMatrix.needsUpdate = true; const group = new THREE.Group(); group.name = "u-channel-neon-rims"; group.add(cyanRims, yellowRims); return group;
};

const createShell = (track: TrackGeometry): THREE.Mesh => {
  const resource = buildTrackShell(track);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(resource.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(resource.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(resource.indices, 1));
  const shell = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#090b12", roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide }));
  shell.name = "continuous-track-shell";
  return shell;
};

const createDividerMesh = (geometry: TrackGeometry): THREE.Mesh | undefined => {
  if (geometry.featureIndices.length === 0) return undefined;
  const dividerGeometry = new THREE.BufferGeometry();
  dividerGeometry.setAttribute("position", new THREE.BufferAttribute(geometry.featurePositions, 3));
  dividerGeometry.setAttribute("normal", new THREE.BufferAttribute(geometry.featureNormals, 3));
  dividerGeometry.setIndex(new THREE.BufferAttribute(geometry.featureIndices, 1));
  dividerGeometry.computeBoundingSphere();
  const divider = new THREE.Mesh(
    dividerGeometry,
    new THREE.MeshStandardMaterial({ color: "#f6c24d", roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide }),
  );
  divider.name = "rounded-mixing-divider";
  return divider;
};

const addSegment = (positions: number[], start: Vec3, end: Vec3): void => {
  positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
};

const createCheckpointHelpers = (samples: readonly TrackSample[], nodes: readonly TrackNode[] = []): THREE.Group => {
  const checkpoints = nodes.filter((node): node is TrackNode & { checkpoint: NonNullable<TrackNode["checkpoint"]> } => node.checkpoint !== undefined);
  const markers = new THREE.Group();
  markers.name = "track-debug-checkpoint-markers";
  const labels = new THREE.Group();
  labels.name = "track-debug-checkpoint-labels";
  checkpoints.forEach((node) => {
    const sampleIndex = projectToTrack(node.position, samples).sampleIndex;
    const sample = samples[sampleIndex];
    if (!sample) return;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff5f9b" }));
    marker.position.set(sample.position.x, sample.position.y + 1.2, sample.position.z);
    marker.name = `track-debug-checkpoint-${node.checkpoint}`;
    marker.userData.checkpoint = node.checkpoint;
    marker.userData.sampleIndex = sampleIndex;
    markers.add(marker);
    const labelMaterial = new THREE.SpriteMaterial({ color: "#ffffff", depthTest: false, depthWrite: false });
    if (!navigator.userAgent.includes("jsdom")) {
      const canvas = document.createElement("canvas");
      canvas.width = 160; canvas.height = 72;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#153c4a"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff"; context.font = "bold 46px system-ui"; context.textAlign = "center"; context.textBaseline = "middle";
        context.fillText(node.checkpoint, canvas.width / 2, canvas.height / 2);
        labelMaterial.map = new THREE.CanvasTexture(canvas);
      }
    }
    const label = new THREE.Sprite(labelMaterial);
    label.position.set(sample.position.x, sample.position.y + 2.15, sample.position.z);
    label.scale.set(2.1, 0.95, 1);
    label.name = `track-debug-checkpoint-label-${node.checkpoint}`;
    label.userData.label = node.checkpoint;
    label.userData.sampleIndex = sampleIndex;
    labels.add(label);
  });
  const group = new THREE.Group();
  group.add(markers, labels);
  return group;
};

const createSplitterClearanceHelper = (samples: readonly TrackSample[]): THREE.LineSegments => {
  const positions: number[] = [];
  const splitter = samples.filter((sample) => sample.zone === "splitter");
  const focus = splitter[Math.floor(splitter.length / 2)];
  if (focus) {
    addSegment(positions, {
      x: focus.position.x - focus.side.x * focus.width / 2,
      y: focus.position.y - focus.side.y * focus.width / 2 + 0.25,
      z: focus.position.z - focus.side.z * focus.width / 2,
    }, {
      x: focus.position.x + focus.side.x * focus.width / 2,
      y: focus.position.y + focus.side.y * focus.width / 2 + 0.25,
      z: focus.position.z + focus.side.z * focus.width / 2,
    });
  }
  const helper = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
    new THREE.LineBasicMaterial({ color: "#8f6bff", depthTest: false }),
  );
  helper.name = "track-debug-splitter-clearance";
  return helper;
};

export const createTrackDebugGroup = (samples: readonly TrackSample[], checkpointNodes: readonly TrackNode[] = []): THREE.Group => {
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
  group.add(frames, zones, createCheckpointHelpers(samples, checkpointNodes), createSplitterClearanceHelper(samples));
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
    new THREE.MeshStandardMaterial({ color: "#171b25", roughness: 0.58, metalness: 0.3, side: THREE.DoubleSide }),
  );
  surface.name = "continuous-u-channel";
  surface.userData.surfaceColor = "#171b25";
  const divider = createDividerMesh(geometry);
  group.add(createShell(geometry), surface, createRimLines(geometry));
  if (divider !== undefined) group.add(divider);
  if (options.debug === true) group.add(createTrackDebugGroup(geometry.samples, options.checkpointNodes));
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
      (Array.isArray(value) ? value : [value]).forEach((material) => {
        materials.add(material);
        (material as THREE.Material & { map?: THREE.Texture }).map?.dispose();
      });
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  group.clear();
};
