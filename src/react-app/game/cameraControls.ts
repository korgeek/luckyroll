export type CameraControls = { yaw: number; pitch: number; zoom: number };

export const initialCameraControls: CameraControls = { yaw: 0, pitch: 0, zoom: 1 };

export function applyDrag(controls: CameraControls, deltaX: number, deltaY: number): CameraControls {
	return { ...controls, yaw: controls.yaw + deltaX * 0.006, pitch: Math.max(-0.55, Math.min(0.55, controls.pitch + deltaY * 0.004)) };
}

export function applyZoom(controls: CameraControls, delta: number): CameraControls {
	return { ...controls, zoom: Math.max(0.72, Math.min(1.35, controls.zoom - delta * 0.001)) };
}
