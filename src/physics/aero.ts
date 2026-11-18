import { VEHICLE } from './vehicle';

/** Window opening fractions 0..1: front-left, front-right, rear-left, rear-right. */
export type Windows = [number, number, number, number];

export const WINDOW_LABELS = ['Front left', 'Front right', 'Rear left', 'Rear right'] as const;

/**
 * Drag increment from open side windows.
 * No published ΔCd exists for the Auris; these coefficients are chosen so that all four fully
 * open ≈ +0.07 (+25 %), consistent with SAE 2013-01-0551 (Corolla) where windows-down beat
 * max A/C below roughly highway speed. Treat as ±50 % uncertain.
 */
export const WINDOW_COEFFS = {
  front: 0.012,
  rear: 0.016,
  /** Extra when front and rear are open together (air flows through the cabin). */
  crossFlow: 0.014,
};

export function windowDeltaCd(w: Windows, scale = 1): number {
  const f = (x: number) => Math.pow(Math.min(1, Math.max(0, x)), 1.5);
  const front = WINDOW_COEFFS.front * (f(w[0]) + f(w[1]));
  const rear = WINDOW_COEFFS.rear * (f(w[2]) + f(w[3]));
  const frontOpen = Math.max(w[0], w[1]);
  const rearOpen = Math.max(w[2], w[3]);
  const cross = WINDOW_COEFFS.crossFlow * f(Math.min(frontOpen, rearOpen));
  return (front + rear + cross) * scale;
}

/**
 * A single open rear window between ~40 and ~110 km/h excites the cabin Helmholtz resonance
 * (low-frequency "wub-wub" buffeting). Comfort only; no fuel effect beyond ΔCd.
 */
export function buffetingRisk(w: Windows, speedKmh: number): boolean {
  const rearOpen = [w[2], w[3]].filter((x) => x > 0.15).length;
  const frontOpen = [w[0], w[1]].filter((x) => x > 0.15).length;
  return rearOpen === 1 && frontOpen === 0 && speedKmh > 40 && speedKmh < 110;
}

export type AccessoryId = 'none' | 'roofBars' | 'roofBox' | 'roofBikes' | 'rearRack';

export const ACCESSORIES: Record<AccessoryId, { label: string; deltaCdA: number }> = {
  none: { label: 'None', deltaCdA: 0 },
  roofBars: { label: 'Roof cross-bars', deltaCdA: 0.03 },
  roofBox: { label: 'Roof box (on bars)', deltaCdA: 0.12 },
  roofBikes: { label: '2 bikes on roof', deltaCdA: 0.28 },
  rearRack: { label: '2 bikes on tow-bar rack', deltaCdA: 0.1 },
};

export interface AeroInput {
  speedMs: number;
  rho: number;
  windows: Windows;
  accessory: AccessoryId;
  headwindMs: number;
  crosswindMs: number;
  cdaScale?: number;
  windowScale?: number;
}

export interface AeroResult {
  forceN: number;
  cd: number;
  cdA: number;
  windowDeltaCd: number;
  yawDeg: number;
}

export function aeroDrag(a: AeroInput): AeroResult {
  const vx = a.speedMs + a.headwindMs;
  const vy = a.crosswindMs;
  const apparent2 = vx * vx + vy * vy;
  const yaw = Math.atan2(Math.abs(vy), Math.max(0.1, vx));
  const dCdW = windowDeltaCd(a.windows, a.windowScale ?? 1);
  // Drag coefficient rises with yaw angle (typical estate: ≈ +2 per rad² near zero yaw).
  const yawFactor = 1 + 2 * yaw * yaw;
  const cd = (VEHICLE.cd + dCdW) * yawFactor;
  const cdA = (cd * VEHICLE.frontalAreaM2 + ACCESSORIES[a.accessory].deltaCdA) * (a.cdaScale ?? 1);
  // Force along the direction of travel (drag acts along the apparent wind; take its x component).
  const force = 0.5 * a.rho * cdA * apparent2 * (apparent2 > 0 ? vx / Math.sqrt(apparent2) : 0);
  return { forceN: force, cd, cdA, windowDeltaCd: dCdW, yawDeg: (yaw * 180) / Math.PI };
}
