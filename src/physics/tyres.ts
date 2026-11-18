export type TyreId = '195/65R15' | '205/55R16' | '225/45R17';

export interface TyreSpec {
  id: TyreId;
  widthMm: number;
  aspect: number;
  rimIn: number;
  /** Base rolling-resistance coefficient at low speed, nominal pressure (EU label class B/C range). */
  crr0: number;
  /** Rotational inertia of one wheel + tyre + brake disc (kg·m², estimate). */
  wheelInertia: number;
  nominalBar: number;
}

export const TYRES: Record<TyreId, TyreSpec> = {
  '195/65R15': { id: '195/65R15', widthMm: 195, aspect: 0.65, rimIn: 15, crr0: 0.0083, wheelInertia: 0.8, nominalBar: 2.3 },
  '205/55R16': { id: '205/55R16', widthMm: 205, aspect: 0.55, rimIn: 16, crr0: 0.0087, wheelInertia: 0.85, nominalBar: 2.3 },
  '225/45R17': { id: '225/45R17', widthMm: 225, aspect: 0.45, rimIn: 17, crr0: 0.0095, wheelInertia: 0.95, nominalBar: 2.4 },
};

/** Unloaded radius (m). */
export function freeRadius(t: TyreSpec): number {
  return (t.rimIn * 25.4) / 2000 + (t.widthMm * t.aspect) / 1000;
}

/** Dynamic rolling radius (m): ≈ 96.5 % of free radius for passenger radials. */
export function rollingRadius(t: TyreSpec): number {
  return 0.965 * freeRadius(t);
}

/**
 * Rolling-resistance coefficient. Speed term: +15 % at 100 km/h (SAE J2452-style quadratic).
 * Pressure term: Crr ∝ (p_nom / p)^0.4.
 */
export function rollingCoefficient(t: TyreSpec, speedMs: number, pressureBar: number): number {
  const speedFactor = 1 + 0.15 * (speedMs / 27.78) ** 2;
  const pressureFactor = Math.pow(t.nominalBar / Math.max(1.2, pressureBar), 0.4);
  return t.crr0 * speedFactor * pressureFactor;
}
