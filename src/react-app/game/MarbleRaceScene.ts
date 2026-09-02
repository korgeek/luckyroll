import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Marble } from "../domain/types";
import { selectQualityProfile } from "./quality";
import { applyDrag, applyZoom, initialCameraControls } from "./cameraControls";
import { createColorBatches } from "./marbleBatches";
import { RACE_TIMEOUT_MS } from "./raceTiming";
import { getCameraShot } from "./cameraPlan";
import { createRailOffsets, createSafetyRail, createStartGrid, createTrackLayout, getDownhillGuide, type TrackPoint, type TrackSegment } from "./trackLayout";

export type SceneEvent =
	| { type: "tick"; elapsedMs: number; finishedCount: number; remaining: Marble[]; leader?: Marble; trailer?: Marble }
	| { type: "finish"; marble: Marble }
	| { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; reset: () => void; dispose: () => void };
type Ball = { marble: Marble; body: any; stalled: number; done: boolean; progress: number; mesh: THREE.InstancedMesh; renderIndex: number };

const GRAVITY = { x: 0, y: -16, z: 0 };

const vector = (point: TrackPoint) => new THREE.Vector3(point.x, point.y, point.z);

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void): RaceScene {
	const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
	renderer.shadowMap.enabled = profile.shadows;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.NoToneMapping;
	const scene = new THREE.Scene();
	scene.background = new THREE.Color("#05071a");
	scene.fog = new THREE.Fog("#05071a", 115, 280);
	const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
	const cameraLook = new THREE.Vector3(0, 10, 4);
	camera.position.set(24, 58, 105); camera.lookAt(cameraLook);
	scene.add(new THREE.AmbientLight("#bcdcff", 3.7));
	scene.add(new THREE.HemisphereLight("#e8fcff", "#260a39", 3.6));
	const key = new THREE.DirectionalLight("#ffffff", 3.5); key.position.set(12, 42, 36); scene.add(key);
	const cyan = new THREE.PointLight("#3df5ff", 120, 105, 1.7); cyan.position.set(0, 27, 38); scene.add(cyan);
	const pink = new THREE.PointLight("#ff4f9a", 100, 95, 1.6); pink.position.set(-9, 18, -21); scene.add(pink);
	const gold = new THREE.PointLight("#ffcb54", 92, 80, 1.5); gold.position.set(4, 8, -58); scene.add(gold);
	const track = new THREE.Group(); const marbleGroup = new THREE.Group(); scene.add(track, marbleGroup);
	let rapier: typeof RAPIER_TYPE; let world: any; let balls: Ball[] = []; let renderMeshes: THREE.InstancedMesh[] = []; let startSlots: TrackPoint[] = []; let finishPoint = createTrackLayout().finish;
	let running = false; let timedOut = false; let startedAt = 0; let last = performance.now(); let disposed = false;
	let requested: { marbles: Marble[]; seed: number } | undefined;
	let controls = initialCameraControls; let activePointer: number | undefined; let pointerX = 0; let pointerY = 0;
	const dummy = new THREE.Object3D();
	const resize = () => { const width = canvas.clientWidth || window.innerWidth; const height = canvas.clientHeight || window.innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
	window.addEventListener("resize", resize); canvas.style.touchAction = "none"; resize();
	const onPointerDown = (event: PointerEvent) => { activePointer = event.pointerId; pointerX = event.clientX; pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); };
	const onPointerMove = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; controls = applyDrag(controls, event.clientX - pointerX, event.clientY - pointerY); pointerX = event.clientX; pointerY = event.clientY; };
	const onPointerUp = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; activePointer = undefined; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
	const onWheel = (event: WheelEvent) => { event.preventDefault(); controls = applyZoom(controls, event.deltaY); };
	canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp); canvas.addEventListener("wheel", onWheel, { passive: false });
	const clear = (group: THREE.Group) => group.clear();
	const createWorld = () => new rapier.World(GRAVITY);

	const addColliderBox = (position: THREE.Vector3, half: [number, number, number], quaternion = new THREE.Quaternion()) => {
		const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
		body.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, true);
		world.createCollider(rapier.ColliderDesc.cuboid(...half).setFriction(0.7), body);
	};
	const addContinuousDeck = (segments: TrackSegment[]) => {
		const points = [vector(segments[0].from), ...segments.map((segment) => vector(segment.to))];
		const vertices: number[] = []; const indices: number[] = [];
		points.forEach((point, index) => {
			const before = points[Math.max(0, index - 1)]; const after = points[Math.min(points.length - 1, index + 1)]; const tangent = after.clone().sub(before); tangent.y = 0; tangent.normalize();
			const side = new THREE.Vector3(-tangent.z, 0, tangent.x); const left = point.clone().addScaledVector(side, segments[Math.min(index, segments.length - 1)].width / 2); const right = point.clone().addScaledVector(side, -segments[Math.min(index, segments.length - 1)].width / 2);
			vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
			if (index < points.length - 1) indices.push(index * 2, index * 2 + 1, index * 2 + 2, index * 2 + 1, index * 2 + 3, index * 2 + 2);
		});
		const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
		world.createCollider(rapier.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)).setFriction(0.72), body);
	};

	const addTrackSegment = (segment: TrackSegment) => {
		const start = vector(segment.from); const end = vector(segment.to); const direction = end.clone().sub(start); const length = direction.length();
		const midpoint = start.clone().add(end).multiplyScalar(0.5); const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
		const side = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
		const railDimensions = createSafetyRail();
		createRailOffsets(segment.width).forEach((offset) => {
			const railPosition = midpoint.clone().add(side.clone().multiplyScalar(offset)).add(new THREE.Vector3(0, railDimensions.collisionHalfHeight + 0.26, 0));
			addColliderBox(railPosition, [0.12, railDimensions.collisionHalfHeight, (length + 2.8) / 2], quaternion);
		});
	};

	const renderContinuousCourse = (segments: TrackSegment[]) => {
		const samples = [vector(segments[0].from), ...segments.map((segment) => vector(segment.to))];
		const width = segments[0].width;
		const vertices: number[] = []; const indices: number[] = []; const leftRail: THREE.Vector3[] = []; const rightRail: THREE.Vector3[] = [];
		samples.forEach((point, index) => {
			const before = samples[Math.max(0, index - 1)]; const after = samples[Math.min(samples.length - 1, index + 1)]; const tangent = after.clone().sub(before); tangent.y = 0; tangent.normalize();
			const side = new THREE.Vector3(-tangent.z, 0, tangent.x); const left = point.clone().addScaledVector(side, width / 2); const right = point.clone().addScaledVector(side, -width / 2);
			vertices.push(left.x, left.y, left.z, right.x, right.y, right.z); leftRail.push(left.add(new THREE.Vector3(0, 0.68, 0))); rightRail.push(right.add(new THREE.Vector3(0, 0.68, 0)));
			if (index < samples.length - 1) indices.push(index * 2, index * 2 + 1, index * 2 + 2, index * 2 + 1, index * 2 + 3, index * 2 + 2);
		});
		const deckGeometry = new THREE.BufferGeometry(); deckGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); deckGeometry.setIndex(indices); deckGeometry.computeVertexNormals();
		track.add(new THREE.Mesh(deckGeometry, new THREE.MeshStandardMaterial({ color: "#17347d", emissive: "#102457", emissiveIntensity: 1.15, metalness: 0.72, roughness: 0.27, side: THREE.DoubleSide })));
		const railMaterial = new THREE.LineBasicMaterial({ color: "#38f3ff", transparent: true, opacity: 0.95 });
		[leftRail, rightRail].forEach((points) => {
			track.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), railMaterial));
			const wallVertices: number[] = []; const wallIndices: number[] = [];
			points.forEach((top, index) => { wallVertices.push(top.x, top.y - createSafetyRail().visualHeight, top.z, top.x, top.y, top.z); if (index < points.length - 1) wallIndices.push(index * 2, index * 2 + 1, index * 2 + 2, index * 2 + 1, index * 2 + 3, index * 2 + 2); });
			const wallGeometry = new THREE.BufferGeometry(); wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wallVertices, 3)); wallGeometry.setIndex(wallIndices);
			track.add(new THREE.Mesh(wallGeometry, new THREE.MeshBasicMaterial({ color: "#286ad4", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })));
		});
		samples.filter((_, index) => index % 10 === 0).forEach((point) => { const support = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, Math.max(2.5, point.y), 12), new THREE.MeshStandardMaterial({ color: "#39425f", metalness: 0.9, roughness: 0.35 })); support.position.set(point.x, Math.max(2.5, point.y) / 2 - 0.2, point.z); track.add(support); });
	};

	const buildTrack = (seed: number) => {
		clear(track);
		const layout = createTrackLayout(); finishPoint = layout.finish; addContinuousDeck(layout.segments); layout.segments.forEach(addTrackSegment); renderContinuousCourse(layout.segments);
		const finish = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.16, 10, 48), new THREE.MeshBasicMaterial({ color: "#ffe267" })); finish.position.set(finishPoint.x, finishPoint.y + 0.55, finishPoint.z); finish.rotation.x = Math.PI / 2; track.add(finish);
		const title = new THREE.Mesh(new THREE.TorusGeometry(3, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: seed % 2 ? "#64f5ff" : "#ff67a7" })); title.position.set(layout.start.x, layout.start.y + 0.62, layout.start.z); title.rotation.x = Math.PI / 2; track.add(title);
	};

	const begin = (marbles: Marble[], seed: number) => {
		if (!world) return; world.free(); world = createWorld(); buildTrack(seed); clear(marbleGroup);
		const renderBindings = new Map<number, { mesh: THREE.InstancedMesh; renderIndex: number }>(); renderMeshes = [];
		createColorBatches(marbles).forEach((batch) => {
			const colorMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshBasicMaterial({ color: batch.color, fog: false, toneMapped: false }), batch.sourceIndexes.length);
			colorMesh.frustumCulled = false; colorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(colorMesh); renderMeshes.push(colorMesh);
			batch.sourceIndexes.forEach((sourceIndex, renderIndex) => renderBindings.set(sourceIndex, { mesh: colorMesh, renderIndex }));
		});
		startSlots = createStartGrid(marbles.length);
		balls = marbles.map((marble, index) => {
			const slot = startSlots[index]; const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(slot.x, slot.y, slot.z).setLinearDamping(0.025).setAngularDamping(0.05));
			world.createCollider(rapier.ColliderDesc.ball(0.34).setRestitution(0.12).setFriction(0.32), body); const binding = renderBindings.get(index)!;
			return { marble, body, stalled: 0, done: false, progress: 0, ...binding };
		});
		running = true; timedOut = false; startedAt = performance.now(); camera.position.set(50, 72, 125); cameraLook.set(0, 12, 18);
	};

	const updateCamera = (elapsedMs: number) => {
		const shot = getCameraShot(Math.min(1, elapsedMs / RACE_TIMEOUT_MS)); const focus = new THREE.Vector3(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z);
		const offset = new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z).sub(focus).applyAxisAngle(new THREE.Vector3(0, 1, 0), controls.yaw).multiplyScalar(controls.zoom); offset.y += controls.pitch * 25;
		camera.position.lerp(focus.add(offset), 0.042); cameraLook.lerp(new THREE.Vector3(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z), 0.05); camera.lookAt(cameraLook);
	};

	const loop = (now: number) => {
		if (disposed) return; requestAnimationFrame(loop); const delta = Math.min(33, now - last); last = now;
		if (running && world && renderMeshes.length) {
			world.timestep = delta / 1000; world.step(); const active = balls.filter((ball) => !ball.done); const elapsedMs = now - startedAt;
			active.forEach((ball, index) => {
				const pos = ball.body.translation(); const speed = ball.body.linvel(); const guide = getDownhillGuide(pos); ball.progress = guide.segmentIndex; ball.body.addForce({ x: guide.direction.x * guide.strength, y: guide.direction.y * guide.strength, z: guide.direction.z * guide.strength }, true); ball.stalled = Math.hypot(speed.x, speed.y, speed.z) < 0.18 ? ball.stalled + delta : 0;
				if (ball.stalled > 1500) { ball.body.applyImpulse({ x: guide.direction.x * 0.8 + (Math.random() - 0.5) * 0.24, y: 0.03, z: guide.direction.z * 0.8 + (Math.random() - 0.5) * 0.24 }, true); ball.stalled = 0; }
				if (pos.y < -3 || Math.abs(pos.x) > 45 || Math.abs(pos.z) > 78) { const slot = startSlots[index % startSlots.length]; ball.body.setTranslation({ x: slot.x, y: slot.y, z: slot.z }, true); ball.body.setLinvel({ x: 0, y: 0, z: -0.5 }, true); }
				if (Math.hypot(pos.x - finishPoint.x, pos.z - finishPoint.z) < 4.2 && pos.y < finishPoint.y + 2.2) { ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble }); }
			});
			balls.forEach((ball) => { const pos = ball.body.translation(); dummy.position.set(pos.x, pos.y, pos.z); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); }); renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
			const live = balls.filter((ball) => !ball.done); const leader = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress > best.progress ? ball : best, undefined); const trailer = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress < best.progress ? ball : best, undefined);
			updateCamera(elapsedMs); emit({ type: "tick", elapsedMs, finishedCount: balls.length - live.length, remaining: live.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble });
			if (elapsedMs >= RACE_TIMEOUT_MS && !timedOut && live.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: live.map((ball) => ball.marble) }); }
			if (!live.length) running = false;
		}
		renderer.render(scene, camera);
	};

	void import("@dimforge/rapier3d-compat").then(({ default: loaded }) => loaded.init().then(() => { rapier = loaded; if (disposed) return; world = createWorld(); if (requested) { begin(requested.marbles, requested.seed); requested = undefined; } })); requestAnimationFrame(loop);
	return { start: (marbles, seed) => world ? begin(marbles, seed) : (requested = { marbles, seed }), restartRemaining: (marbles) => begin(marbles, Date.now()), reset: () => { running = false; balls = []; renderMeshes = []; clear(track); clear(marbleGroup); }, dispose: () => { disposed = true; running = false; world?.free(); renderer.dispose(); window.removeEventListener("resize", resize); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel); } };
}
