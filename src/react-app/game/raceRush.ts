import { alongRouteDistance } from "./cameraPlan";
import type { TrackSample, Vec3 } from "./track/trackTypes";
type RushBall = Readonly<{ id: number; done: boolean; eliminated: boolean; position: Vec3; sampleIndex: number; body: Readonly<{ linvel: () => Vec3; setLinvel: (velocity: Vec3, wakeUp?: boolean) => void }> }>;

export const shouldStartRaceRush = (liveCount: number, originalCount: number): boolean =>
  Number.isInteger(originalCount) && originalCount > 0 && liveCount > 0 && liveCount <= originalCount * 0.5;

export const applyRaceRushPulse = (balls: readonly RushBall[], samples: readonly Pick<TrackSample, "distance" | "position" | "tangent">[]): void => {
  const live = balls.filter((ball) => !ball.done && !ball.eliminated).sort((left, right) => alongRouteDistance(left.position, left.sampleIndex, samples) - alongRouteDistance(right.position, right.sampleIndex, samples) || left.id - right.id);
  const lastRank = live.length - 1;
  live.forEach((ball, rank) => {
    const velocity = ball.body.linvel(); const tangent = samples[ball.sampleIndex]?.tangent;
    if (!tangent || ![velocity.x, velocity.y, velocity.z, tangent.x, tangent.y, tangent.z].every(Number.isFinite)) return;
    const forward = velocity.x * tangent.x + velocity.y * tangent.y + velocity.z * tangent.z;
    const pulse = lastRank === 0 ? 3 : 3 - 2.5 * rank / lastRank;
    const delta = Math.min(pulse, Math.max(0, 42 - forward));
    if (delta > 0) ball.body.setLinvel({ x: velocity.x + tangent.x * delta, y: velocity.y + tangent.y * delta, z: velocity.z + tangent.z * delta }, true);
  });
};
