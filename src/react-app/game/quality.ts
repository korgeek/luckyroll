export type QualityProfile = { pixelRatioCap: number; shadows: boolean; particles: number };
export const selectQualityProfile = ({ width, devicePixelRatio }: { width: number; devicePixelRatio: number }): QualityProfile => width <= 520 || devicePixelRatio >= 2.5 ? { pixelRatioCap: 1.5, shadows: false, particles: 20 } : { pixelRatioCap: 2, shadows: true, particles: 64 };
