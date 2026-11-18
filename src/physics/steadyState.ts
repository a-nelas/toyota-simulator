import { acSteadyState } from './hvac';
import { alternatorMechW, electricalLoadW } from './electrical';
import {
  fmep,
  fuelRateGs,
  fullLoadTorque,
  gsToLh,
  motoringTorque,
  torqueToBmep,
  bmepToTorque,
} from './engine';
import { GEARS, engineRpm, meshEfficiency, spinLossTorque } from './drivetrain';
import { loadContext, roadForces, type Perturbation } from './roadload';
import { TYPE_APPROVAL, type Scenario } from './scenario';
import { ENGINE, FUEL, VEHICLE } from './vehicle';

export type PointStatus =
  | 'ok'
  | 'fuelCut' // lifting off downhill, injection off
  | 'braking' // grade steeper than engine braking can hold
  | 'lugging' // rpm too low for this gear
  | 'overRev'
  | 'noTorque' // cannot hold this speed in this gear
  | 'idle';

export interface OperatingPoint {
  gear: number;
  speedKmh: number;
  rpm: number;
  status: PointStatus;
  // Forces & powers (W)
  aeroN: number;
  rollN: number;
  gradeN: number;
  aeroW: number;
  rollW: number;
  gradeW: number;
  wheelW: number;
  drivelineLossW: number;
  acW: number;
  alternatorW: number;
  brakeW: number;
  frictionW: number;
  /** Fuel chemical power (W). */
  fuelW: number;
  /** Heat to exhaust + coolant (fuel − indicated work) (W). */
  heatW: number;
  engineTorqueNm: number;
  maxTorqueNm: number;
  loadPct: number;
  bsfc: number;
  brakeEfficiency: number;
  fuelGs: number;
  fuelLh: number;
  lPer100: number;
  eurPer100: number;
  co2gkm: number;
  rangeKm: number;
  cd: number;
  cdA: number;
  windowDeltaCd: number;
  crr: number;
  massKg: number;
  rho: number;
  acCop: number;
  electricalW: number;
}

/** Real-world-only extra: average cost of DPF regenerations (~every 600 km for ~15 min). */
export const DPF_REGEN_FACTOR = 1.015;

function emptyPoint(gear: number, speedKmh: number): OperatingPoint {
  return {
    gear, speedKmh, rpm: 0, status: 'ok',
    aeroN: 0, rollN: 0, gradeN: 0, aeroW: 0, rollW: 0, gradeW: 0, wheelW: 0, drivelineLossW: 0,
    acW: 0, alternatorW: 0, brakeW: 0, frictionW: 0, fuelW: 0, heatW: 0, engineTorqueNm: 0,
    maxTorqueNm: 0, loadPct: 0, bsfc: Infinity, brakeEfficiency: 0, fuelGs: 0, fuelLh: 0,
    lPer100: 0, eurPer100: 0, co2gkm: 0, rangeKm: Infinity, cd: 0, cdA: 0, windowDeltaCd: 0, crr: 0,
    massKg: 0, rho: 0, acCop: 0, electricalW: 0,
  };
}

export interface SolveOptions {
  perturb?: Perturbation;
  frictionMult?: number;
}

/** Accessory loads (mechanical W at the crank) at a given operating condition. */
export function accessoryLoads(s: Scenario, speedMs: number, rpm: number, p: Perturbation = {}) {
  const ta = s.roadLoadMode === 'typeApproval';
  if (ta) {
    const electricW = TYPE_APPROVAL.electricW;
    return { acW: 0, acCop: 0, electricW, alternatorW: alternatorMechW(electricW) };
  }
  const ac = acSteadyState(s.ac, s.weather, speedMs, rpm, s.occupants);
  const electricW = electricalLoadW(
    { headlights: s.headlights, rearDefrost: s.rearDefrost, blower: s.ac.on ? s.ac.blower : Math.min(s.ac.blower, 1) },
    ac.condenserFanW,
  );
  return {
    acW: ac.compressorW * (p.ac ?? 1),
    acCop: ac.cop,
    electricW,
    alternatorW: alternatorMechW(electricW),
  };
}

/** Solve the steady operating point for one gear. */
export function solveGear(s: Scenario, gear: number, opts: SolveOptions = {}): OperatingPoint {
  const p = opts.perturb ?? {};
  const fm = opts.frictionMult ?? 1;
  const ctx = loadContext(s, p);
  const v = Math.max(0, s.speedKmh / 3.6);
  const pt = emptyPoint(gear, s.speedKmh);
  pt.massKg = ctx.massKg;
  pt.rho = ctx.rho;
  const fuelScale = s.calibration.fuelScale * (s.roadLoadMode === 'real' ? DPF_REGEN_FACTOR : 1);
  const effScale = (p.eff ?? 1) / fuelScale;

  const f = roadForces(ctx, v, s.gradePct);
  Object.assign(pt, {
    aeroN: f.aeroN, rollN: f.rollN, gradeN: f.gradeN,
    aeroW: f.aeroN * v, rollW: f.rollN * v, gradeW: f.gradeN * v,
    cd: f.cd, cdA: f.cdA, windowDeltaCd: f.windowDeltaCd, crr: f.crr,
  });
  pt.wheelW = f.totalN * v;

  const rpm = v < 0.3 ? ENGINE.idleRpm : engineRpm(v, gear, ctx.tyre);
  pt.rpm = rpm;
  const acc = accessoryLoads(s, v, rpm, p);
  pt.acW = acc.acW;
  pt.acCop = acc.acCop;
  pt.alternatorW = acc.alternatorW;
  pt.electricalW = acc.electricW;
  const omega = (rpm * Math.PI) / 30;

  if (v < 0.3) {
    pt.status = 'idle';
    const t = (acc.acW + acc.alternatorW) / omega;
    finishFuel(pt, s, rpm, t, fm, effScale, v);
    return pt;
  }

  // Driveline: losses depend on direction of power flow.
  const eta = meshEfficiency(gear);
  const spinW = spinLossTorque(rpm) * omega;
  const clutchW = pt.wheelW >= 0 ? pt.wheelW / eta + spinW : pt.wheelW * eta + spinW;
  pt.drivelineLossW = clutchW - pt.wheelW;
  const brakeW = clutchW + acc.acW + acc.alternatorW;
  const torque = brakeW / omega;
  pt.engineTorqueNm = torque;
  pt.maxTorqueNm = fullLoadTorque(rpm);
  pt.loadPct = Math.max(0, (100 * torque) / Math.max(1, pt.maxTorqueNm));

  if (rpm > ENGINE.maxRpm) pt.status = 'overRev';
  else if (rpm < ENGINE.minInGearRpm) pt.status = 'lugging';
  else if (torque > pt.maxTorqueNm) pt.status = 'noTorque';

  if (torque < 0 && rpm >= ENGINE.fuelCutRpm) {
    // Overrun: no injection. Engine friction absorbs up to motoring torque; brakes do the rest.
    const motor = motoringTorque(rpm, fm);
    pt.frictionW = Math.min(-torque, motor) * omega;
    pt.brakeW = brakeW;
    if (pt.status === 'ok') pt.status = -torque > motor ? 'braking' : 'fuelCut';
    finishZeroFuel(pt, s, v);
    return pt;
  }
  finishFuel(pt, s, rpm, Math.max(0, torque), fm, effScale, v);
  pt.brakeW = brakeW;
  return pt;
}

function finishFuel(
  pt: OperatingPoint,
  s: Scenario,
  rpm: number,
  torque: number,
  fm: number,
  effScale: number,
  v: number,
) {
  const gs = fuelRateGs(rpm, torque, { frictionMult: fm, effScale });
  const bmep = torqueToBmep(torque);
  const frictionT = bmepToTorque(fmep(rpm, bmep, fm));
  const omega = (rpm * Math.PI) / 30;
  pt.frictionW = frictionT * omega;
  pt.fuelGs = gs;
  pt.fuelW = gs * FUEL.lhvJPerG;
  pt.heatW = pt.fuelW - (torque * omega + pt.frictionW);
  pt.fuelLh = gsToLh(gs);
  const brakeKw = (torque * omega) / 1000;
  pt.bsfc = brakeKw > 0.01 ? (gs * 3600) / brakeKw : Infinity;
  pt.brakeEfficiency = pt.fuelW > 0 ? (torque * omega) / pt.fuelW : 0;
  finishConsumption(pt, s, v);
}

function finishZeroFuel(pt: OperatingPoint, s: Scenario, v: number) {
  pt.fuelGs = 0;
  pt.fuelW = 0;
  pt.heatW = 0;
  pt.fuelLh = 0;
  finishConsumption(pt, s, v);
}

function finishConsumption(pt: OperatingPoint, s: Scenario, v: number) {
  const kmh = v * 3.6;
  pt.lPer100 = kmh > 0.5 ? (pt.fuelLh / kmh) * 100 : Infinity;
  pt.eurPer100 = pt.lPer100 * s.fuelPriceEurL;
  pt.co2gkm = kmh > 0.5 ? (pt.fuelLh * FUEL.co2KgPerL * 1000) / kmh : Infinity;
  pt.rangeKm = pt.lPer100 > 0 ? (VEHICLE.tankL / pt.lPer100) * 100 : Infinity;
}

export function isFeasible(p: OperatingPoint): boolean {
  return p.status === 'ok' || p.status === 'fuelCut' || p.status === 'braking' || p.status === 'idle';
}

/** Lowest rpm at which the eco strategy is willing to run in gear. */
export const ECO_MIN_RPM = 1150;

export interface SolveResult {
  point: OperatingPoint;
  byGear: OperatingPoint[];
  bestGear: number | null;
}

export function solve(s: Scenario, opts: SolveOptions = {}): SolveResult {
  const byGear: OperatingPoint[] = [];
  for (let g = 1; g <= GEARS; g++) byGear.push(solveGear(s, g, opts));
  let best: OperatingPoint | null = null;
  for (const p of byGear) {
    if (!isFeasible(p) || p.rpm < ECO_MIN_RPM) continue;
    if (!best || p.fuelGs < best.fuelGs - 1e-9 || (Math.abs(p.fuelGs - best.fuelGs) < 1e-9 && p.gear > best.gear)) best = p;
  }
  const bestGear = best?.gear ?? null;
  let point: OperatingPoint;
  if (s.gear === 'auto') {
    point = best ?? byGear.reduce((a, b) => (Math.abs(b.rpm - 2000) < Math.abs(a.rpm - 2000) ? b : a));
  } else {
    point = byGear[s.gear - 1];
  }
  return { point, byGear, bestGear };
}

/** Highest steady speed (km/h) the car can hold in a gear on the scenario's grade. */
export function maxSustainableSpeed(s: Scenario, gear: number): number {
  let best = 0;
  for (let kmh = 5; kmh <= 230; kmh += 1) {
    const p = solveGear({ ...s, speedKmh: kmh }, gear);
    if (p.rpm > ENGINE.maxRpm) break;
    if (p.rpm >= ENGINE.minInGearRpm && p.engineTorqueNm <= p.maxTorqueNm) best = kmh;
  }
  return best;
}

/** Gaussian sample (Box–Muller). */
function gauss(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic PRNG so bands do not flicker between renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1-σ relative uncertainties of the main model parameters. */
export const UNCERTAINTY = { cda: 0.05, crr: 0.12, eff: 0.03, window: 0.35, ac: 0.25 };

export function samplePerturbation(rand: () => number): Perturbation {
  return {
    cda: 1 + UNCERTAINTY.cda * gauss(rand),
    crr: 1 + UNCERTAINTY.crr * gauss(rand),
    eff: 1 + UNCERTAINTY.eff * gauss(rand),
    window: Math.max(0, 1 + UNCERTAINTY.window * gauss(rand)),
    ac: Math.max(0.3, 1 + UNCERTAINTY.ac * gauss(rand)),
  };
}

/** 10th / 90th percentile of L/100 km for one gear, by Monte-Carlo over model parameters. */
export function uncertaintyBand(s: Scenario, gear: number, n = 150, seed = 7): [number, number] {
  const rand = mulberry32(seed);
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    const pt = solveGear(s, gear, { perturb: samplePerturbation(rand) });
    vals.push(pt.speedKmh > 0.5 ? pt.lPer100 : pt.fuelLh);
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(n * 0.1)], vals[Math.floor(n * 0.9)]];
}
