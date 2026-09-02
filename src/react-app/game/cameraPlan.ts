export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number } };

export function getCameraShot(progress: number): CameraShot {
	if (progress < 0.34) return { position: { x: 24, y: 58, z: 105 }, lookAt: { x: 0, y: 10, z: 4 } };
	if (progress < 0.7) return { position: { x: 22, y: 42, z: 52 }, lookAt: { x: 0, y: 8, z: -12 } };
	return { position: { x: 18, y: 30, z: -8 }, lookAt: { x: 0, y: 3, z: -56 } };
}
