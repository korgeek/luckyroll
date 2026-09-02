export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number } };

export function getCameraShot(progress: number): CameraShot {
	if (progress < 0.34) return { position: { x: 50, y: 72, z: 125 }, lookAt: { x: 0, y: 12, z: 18 } };
	if (progress < 0.7) return { position: { x: 54, y: 64, z: 78 }, lookAt: { x: 0, y: 13, z: 20 } };
	return { position: { x: -30, y: 27, z: 82 }, lookAt: { x: 0, y: 5, z: 49 } };
}
