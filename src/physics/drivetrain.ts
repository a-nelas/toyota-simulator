import { SPEC, ENGINE } from './vehicle';
import { TYRES, rollingRadius, type TyreSpec } from './tyres';

export const GEARS = 6;
const REF_RADIUS = rollingRadius(TYRES['205/55R16']);

/** Overall ratio (engine rev per wheel rev) per gear, from km77's km/h per 1000 rpm on 205/55 R16. */
export const OVERALL_RATIOS: number[] = SPEC.gearing.value.map(
  (kmhPer1000) => (1000 * 2 * Math.PI * REF_RADIUS * 3.6) / 60 / kmhPer1000,
);

export function engineRpm(speedMs: number, gear: number, tyre: TyreSpec): number {
  const r = rollingRadius(tyre);
  return ((speedMs / r) * OVERALL_RATIOS[gear - 1] * 60) / (2 * Math.PI);
}

export function speedAtRpm(rpm: number, gear: number, tyre: TyreSpec): number {
  const r = rollingRadius(tyre);
  return ((rpm * 2 * Math.PI) / 60 / OVERALL_RATIOS[gear - 1]) * r;
}

/** Gear-mesh efficiency (gearbox + final drive + CV joints) per gear. */
export function meshEfficiency(gear: number): number {
  return gear <= 2 ? 0.955 : 0.962;
}

/** Load-independent spin losses (oil churning, bearings, seals) as torque at the engine side (Nm). */
export function spinLossTorque(rpm: number): number {
  return 0.8 + 0.0003 * rpm;
}

/** Equivalent mass (kg) of rotating parts reflected to the vehicle in a given gear (0 = clutch open). */
export function rotatingMassEquivalent(gear: number, tyre: TyreSpec): number {
  const r = rollingRadius(tyre);
  const wheels = (4 * tyre.wheelInertia) / (r * r);
  if (gear <= 0) return wheels;
  const i = OVERALL_RATIOS[gear - 1];
  return wheels + (ENGINE.inertiaKgM2 * i * i * meshEfficiency(gear)) / (r * r);
}
