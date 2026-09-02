import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Marble } from "../domain/types";
import { selectQualityProfile } from "./quality";

export type SceneEvent =
	| { type: "tick"; elapsedMs: number; finishedCount: number; remaining: Marble[]; leader?: Marble; trailer?: Marble }
	| { type: "finish"; marble: Marble }
	| { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; reset: () => void; dispose: () => void };
type Ball = { marble: Marble; body: any; stalled: number; done: boolean };

const START_Z = 15;
// Keep the line safely before the end cap so a marble cannot stop on it.
const FINISH_Z = -28.5;
const SLOPE = 0.18;
const heightAt = (z: number) => 4 + Math.sin(SLOPE) * z;

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void): RaceScene {
	const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
	renderer.shadowMap.enabled = profile.shadows;
	const scene = new THREE.Scene(); scene.background = new THREE.Color("#060817"); scene.fog = new THREE.Fog("#060817", 18, 70);
	const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100); camera.position.set(9, 12, 22);
	scene.add(new THREE.HemisphereLight("#90e8ff", "#2c0735", 1.5));
	const cyan = new THREE.PointLight("#58e7ff", 42, 35, 2); cyan.position.set(0, 15, 4); scene.add(cyan);
	const pink = new THREE.PointLight("#ff4f8f", 34, 30, 2); pink.position.set(-6, 5, -16); scene.add(pink);
	const track = new THREE.Group(); const marbleGroup = new THREE.Group(); scene.add(track, marbleGroup);
	let rapier: typeof RAPIER_TYPE; let world: any; let balls: Ball[] = []; let mesh: THREE.InstancedMesh | undefined; let running = false; let timedOut = false; let startedAt = 0; let last = performance.now(); let disposed = false; let requested: { marbles: Marble[]; seed: number } | undefined;
	const dummy = new THREE.Object3D();
	const resize = () => { const width = canvas.clientWidth || window.innerWidth; const height = canvas.clientHeight || window.innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
	window.addEventListener("resize", resize); resize();
	const clear = (group: THREE.Group) => group.clear();
	const addBox = (x: number, y: number, z: number, half: [number, number, number], rotate = 0) => { const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(x, y, z)); if (rotate) body.setRotation({ x: Math.sin(rotate / 2), y: 0, z: 0, w: Math.cos(rotate / 2) }, true); world.createCollider(rapier.ColliderDesc.cuboid(...half), body); };
	const buildTrack = (seed: number) => {
		clear(track);
		const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.55, 48), new THREE.MeshStandardMaterial({ color: "#15296a", emissive: "#10195c", emissiveIntensity: 1, metalness: 0.7, roughness: 0.3 })); floor.rotation.x = -SLOPE; floor.position.set(0, 4, -7); track.add(floor); addBox(0, 4, -7, [6, 0.28, 24], -SLOPE);
		[-6.3, 6.3].forEach((x) => { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 48), new THREE.MeshStandardMaterial({ color: "#22e7f3", emissive: "#08717f", emissiveIntensity: 1.7 })); rail.rotation.x = -SLOPE; rail.position.set(x, heightAt(-7) + 0.85, -7); track.add(rail); addBox(x, heightAt(-7) + 0.85, -7, [0.18, 0.75, 24], -SLOPE); });
		const hazardPositions = [5, -4, -13, -22];
		hazardPositions.forEach((z, index) => { const x = ((seed >> (index * 3)) % 2 ? 1 : -1) * (index % 2 ? 2.8 : 1.9); const y = heightAt(z) + 0.6; const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.72, 20), new THREE.MeshStandardMaterial({ color: index % 2 ? "#ffcf58" : "#ff4f8f", emissive: index % 2 ? "#b07d00" : "#bd0756", emissiveIntensity: 2 })); bumper.position.set(x, y, z); track.add(bumper); const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(x, y, z)); world.createCollider(rapier.ColliderDesc.cylinder(0.36, 0.68).setRestitution(1.15), body); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.055, 8, 32), new THREE.MeshBasicMaterial({ color: "#71f6ff" })); ring.position.set(x, y + 0.42, z); ring.rotation.x = Math.PI / 2; track.add(ring); });
		const finish = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.12, 10, 48), new THREE.MeshBasicMaterial({ color: "#ffe267" })); finish.position.set(0, heightAt(FINISH_Z) + 2.7, FINISH_Z); finish.rotation.x = Math.PI / 2; track.add(finish);
	};
	const begin = (marbles: Marble[], seed: number) => {
		if (!world) return; world.free(); world = new rapier.World({ x: 0, y: -12, z: -1.45 }); buildTrack(seed); clear(marbleGroup);
		mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.18, vertexColors: true }), marbles.length); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(mesh);
		balls = marbles.map((marble, index) => { const column = index % 10; const row = Math.floor(index / 10); const z = START_Z + (row % 4) * 0.67; const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation((column - 4.5) * 0.9, heightAt(z) + 2.1 + Math.floor(row / 4) * 0.72, z).setLinearDamping(0.12)); world.createCollider(rapier.ColliderDesc.ball(0.34).setRestitution(0.5).setFriction(0.6), body); mesh!.setColorAt(index, new THREE.Color(marble.color)); return { marble, body, stalled: 0, done: false }; }); mesh.instanceColor!.needsUpdate = true; running = true; timedOut = false; startedAt = performance.now();
	};
	const loop = (now: number) => { if (disposed) return; requestAnimationFrame(loop); const delta = Math.min(33, now - last); last = now; if (running && world && mesh) { world.timestep = delta / 1000; world.step(); const active = balls.filter((ball) => !ball.done); active.forEach((ball, index) => { const pos = ball.body.translation(); const speed = ball.body.linvel(); ball.stalled = Math.hypot(speed.x, speed.y, speed.z) < 0.18 ? ball.stalled + delta : 0; if (ball.stalled > 1500) { ball.body.applyImpulse({ x: (Math.random() - 0.5) * 1.8, y: 1.5, z: -2.3 }, true); ball.stalled = 0; } if (pos.y < -8 || Math.abs(pos.x) > 12) { ball.body.setTranslation({ x: (index % 7 - 3) * 0.75, y: heightAt(START_Z) + 2.5, z: START_Z }, true); ball.body.setLinvel({ x: 0, y: 0, z: -0.5 }, true); } if (pos.z < FINISH_Z) { ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble }); } }); balls.forEach((ball, index) => { const pos = ball.body.translation(); dummy.position.set(pos.x, pos.y, pos.z); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); mesh!.setMatrixAt(index, dummy.matrix); }); mesh.instanceMatrix.needsUpdate = true; const live = balls.filter((ball) => !ball.done); const leader = live.reduce<Ball | undefined>((best, ball) => !best || ball.body.translation().z < best.body.translation().z ? ball : best, undefined); const trailer = live.reduce<Ball | undefined>((best, ball) => !best || ball.body.translation().z > best.body.translation().z ? ball : best, undefined); if (leader) { const pos = leader.body.translation(); camera.position.lerp(new THREE.Vector3(pos.x + 8, pos.y + 7, pos.z + 12), 0.035); camera.lookAt(pos.x, pos.y, pos.z - 2); } const elapsedMs = now - startedAt; emit({ type: "tick", elapsedMs, finishedCount: balls.length - live.length, remaining: live.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble }); if (elapsedMs >= 20_000 && !timedOut && live.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: live.map((ball) => ball.marble) }); } if (!live.length) running = false; } renderer.render(scene, camera); };
	void import("@dimforge/rapier3d-compat").then(({ default: loaded }) => loaded.init().then(() => { rapier = loaded; if (disposed) return; world = new rapier.World({ x: 0, y: -12, z: -1.45 }); if (requested) { begin(requested.marbles, requested.seed); requested = undefined; } })); requestAnimationFrame(loop);
	return { start: (marbles, seed) => world ? begin(marbles, seed) : (requested = { marbles, seed }), restartRemaining: (marbles) => begin(marbles, Date.now()), reset: () => { running = false; balls = []; clear(track); clear(marbleGroup); }, dispose: () => { disposed = true; running = false; world?.free(); renderer.dispose(); window.removeEventListener("resize", resize); } };
}
