import { airDensity } from './atmosphere';
import { aeroDrag, type AccessoryId, type Windows } from './aero';
import { TYPE_APPROVAL, type Scenario } from './scenario';
import { TYRES, rollingCoefficient, type TyreSpec } from './tyres';
import { VEHICLE } from './vehicle';

export const G = 9.80665;

export interface LoadContext {
  massKg: number;
  tyre: TyreSpec;
  pressureBar: number;
  rho: number;
  windows: Windows;
  accessory: AccessoryId;
  headwindMs: number;
  crosswindMs: number;
  crrScale: number;
  cdaScale: number;
  windowScale: number;
}

/** Optional perturbations used for Monte-Carlo uncertainty. */
export interface Perturbation {
  cda?: number;
  crr?: number;
  eff?: number;
  window?: number;
  ac?: number;
}

export function vehicleMass(s: Scenario): number {
  return s.roadLoadMode === 'typeApproval' ? TYPE_APPROVAL.massKg : VEHICLE.kerbMassKg + s.payloadKg;
}

export function loadContext(s: Scenario, p: Perturbation = {}): LoadContext {
  const ta = s.roadLoadMode === 'typeApproval';
  const temp = ta ? TYPE_APPROVAL.tempC : s.weather.tempC;
  const rl = s.calibration.roadLoadScale;
  return {
    massKg: vehicleMass(s),
    tyre: TYRES[s.tyre],
    pressureBar: s.tyrePressureBar,
    rho: airDensity(temp, ta ? 0 : s.weather.altitudeM, ta ? 50 : s.weather.rhPct),
    windows: ta ? [0, 0, 0, 0] : s.windows,
    accessory: ta ? 'none' : s.accessory,
    headwindMs: ta ? 0 : s.weather.headwindKmh / 3.6,
    crosswindMs: ta ? 0 : s.weather.crosswindKmh / 3.6,
    crrScale: (ta ? TYPE_APPROVAL.crrScale : 1) * rl * (p.crr ?? 1),
    cdaScale: (ta ? TYPE_APPROVAL.cdaScale : 1) * rl * (p.cda ?? 1),
    windowScale: p.window ?? 1,
  };
}

export interface RoadForces {
  aeroN: number;
  rollN: number;
  gradeN: number;
  totalN: number;
  cd: number;
  cdA: number;
  windowDeltaCd: number;
  crr: number;
}

export function roadForces(ctx: LoadContext, speedMs: number, gradePct: number): RoadForces {
  const theta = Math.atan(gradePct / 100);
  const crr = rollingCoefficient(ctx.tyre, speedMs, ctx.pressureBar) * ctx.crrScale;
  const rollN = speedMs > 0.05 ? ctx.massKg * G * Math.cos(theta) * crr : 0;
  const gradeN = ctx.massKg * G * Math.sin(theta);
  const aero = aeroDrag({
    speedMs,
    rho: ctx.rho,
    windows: ctx.windows,
    accessory: ctx.accessory,
    headwindMs: ctx.headwindMs,
    crosswindMs: ctx.crosswindMs,
    cdaScale: ctx.cdaScale,
    windowScale: ctx.windowScale,
  });
  const aeroN = speedMs > 0.05 ? aero.forceN : 0;
  return {
    aeroN,
    rollN,
    gradeN,
    totalN: aeroN + rollN + gradeN,
    cd: aero.cd,
    cdA: aero.cdA,
    windowDeltaCd: aero.windowDeltaCd,
    crr,
  };
}
