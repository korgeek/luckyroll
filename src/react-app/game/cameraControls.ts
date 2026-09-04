export type CameraControls = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };

export const initialCameraControls: CameraControls = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };

const PAN_LIMIT = 24;
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));

export function applyDrag(controls: CameraControls, deltaX: number, deltaY: number): CameraControls {
	return { ...controls, yaw: controls.yaw + deltaX * 0.006, pitch: Math.max(-0.55, Math.min(0.55, controls.pitch + deltaY * 0.004)) };
}

export function applyZoom(controls: CameraControls, delta: number): CameraControls {
	return { ...controls, zoom: Math.max(0.72, Math.min(1.35, controls.zoom - delta * 0.001)) };
}

export function applyPan(controls: CameraControls, deltaX: number, deltaY: number): CameraControls {
	return { ...controls, panX: clamp(controls.panX + (Number.isFinite(deltaX) ? deltaX * 0.04 : 0), -PAN_LIMIT, PAN_LIMIT), panY: clamp(controls.panY + (Number.isFinite(deltaY) ? deltaY * 0.04 : 0), -PAN_LIMIT, PAN_LIMIT) };
}

export function relaxControls(controls: CameraControls, amount: number): CameraControls {
	const factor = clamp(amount, 0, 1);
	if (factor === 1) return initialCameraControls;
	return {
		yaw: controls.yaw * (1 - factor), pitch: controls.pitch * (1 - factor), zoom: controls.zoom + (1 - controls.zoom) * factor,
		panX: controls.panX * (1 - factor), panY: controls.panY * (1 - factor),
	};
}

export function isCameraAtRest(controls: CameraControls): boolean {
	return controls.yaw === 0 && controls.pitch === 0 && controls.zoom === 1 && controls.panX === 0 && controls.panY === 0;
}
