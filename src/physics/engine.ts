import { ENGINE, FUEL } from './vehicle';

/**
 * 1ND-TV full-load torque curve (Nm). Anchored on the published 205 Nm plateau (1400–2800 rpm)
 * and 66 kW at 3800 rpm (= 166 Nm). Below 1400 rpm the VGT has not built full boost.
 */
const FULL_LOAD: [number, number][] = [
  [700, 80],
  [800, 95],
  [1000, 125],
  [1200, 165],
  [1400, 205],
  [2800, 205],
  [3200, 192],
  [3800, 166],
  [4200, 137],
  [4500, 105],
  [4800, 60],
  [5000, 0],
];

function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export function fullLoadTorque(rpm: number): number {
  return interp(FULL_LOAD, rpm);
}

export function fullLoadPowerKw(rpm: number): number {
  return (fullLoadTorque(rpm) * rpm * Math.PI) / 30 / 1000;
}

export const FULL_LOAD_CURVE = FULL_LOAD;

/** Convert brake torque (Nm) to brake mean effective pressure (bar). */
export function torqueToBmep(torqueNm: number): number {
  return (torqueNm * 4 * Math.PI) / ENGINE.displacementM3 / 1e5;
}

export function bmepToTorque(bmepBar: number): number {
  return (bmepBar * 1e5 * ENGINE.displacementM3) / (4 * Math.PI);
}

export interface EngineModifiers {
  /** Friction multiplier (cold engine > 1). */
  frictionMult?: number;
  /** Indicated-efficiency scale (calibration). */
  effScale?: number;
}

/** Mean piston speed (m/s). */
export function pistonSpeed(rpm: number): number {
  return (2 * ENGINE.strokeM * rpm) / 60;
}

/**
 * Friction + pumping mean effective pressure (bar), Chen–Flynn form:
 * FMEP = A + B·Sp + C·Sp² + D·BMEP (the last term stands in for peak-pressure dependence).
 */
export function fmep(rpm: number, bmepBar: number, frictionMult = 1): number {
  const sp = pistonSpeed(rpm);
  return (0.62 + 0.09 * sp + 0.0045 * sp * sp + 0.02 * Math.max(0, bmepBar)) * frictionMult;
}

/** Torque needed to motor the engine (positive Nm) — engine braking when fuel is cut. */
export function motoringTorque(rpm: number, frictionMult = 1): number {
  return bmepToTorque(fmep(rpm, 0, frictionMult));
}

/** Peak gross indicated efficiency, calibrated so the simulated NEDC EUDC matches Toyota’s 3.7 L/100 km (min BSFC ≈ 220 g/kWh). */
export const ETA_I_MAX = 0.41;

/** Gross indicated efficiency as a function of operating point. */
export function indicatedEfficiency(rpm: number, bmepBar: number, imepBar: number): number {
  // Low load: combustion and heat-loss penalties dominate (lean, cold chamber walls).
  const fLoad = 1 - 0.4 * Math.exp(-Math.max(0, imepBar) / 1.5);
  // Near the smoke limit: retarded injection / richer mixture.
  const maxBmep = torqueToBmep(Math.max(1, fullLoadTorque(rpm)));
  const r = bmepBar / maxBmep;
  const fHigh = 1 - 0.06 * Math.max(0, (r - 0.75) / 0.25) ** 2;
  // Speed: heat losses at low rpm, combustion duration at high rpm.
  const n = (rpm - 2000) / 2000;
  const fSpeed = 1 - 0.035 * n * n - (rpm < 1300 ? 0.02 * ((1300 - rpm) / 500) : 0);
  return ETA_I_MAX * fLoad * fHigh * fSpeed;
}

/**
 * Fuel mass flow (g/s) for a positive or zero brake torque at given rpm.
 * Willans-type: fuel power = indicated power / indicated efficiency,
 * indicated power = brake + friction + pumping.
 */
export function fuelRateGs(rpm: number, brakeTorqueNm: number, mods: EngineModifiers = {}): number {
  if (rpm <= 0) return 0;
  const bmep = torqueToBmep(Math.max(0, brakeTorqueNm));
  const imep = bmep + fmep(rpm, bmep, mods.frictionMult ?? 1);
  const eta = indicatedEfficiency(rpm, bmep, imep) * (mods.effScale ?? 1);
  const pInd = (imep * 1e5 * ENGINE.displacementM3 * rpm) / 120; // W (4-stroke)
  return pInd / (eta * FUEL.lhvJPerG);
}

/** Brake-specific fuel consumption (g/kWh); Infinity at zero load. */
export function bsfc(rpm: number, brakeTorqueNm: number, mods: EngineModifiers = {}): number {
  const pKw = (brakeTorqueNm * rpm * Math.PI) / 30 / 1000;
  if (pKw <= 0.01) return Infinity;
  return (fuelRateGs(rpm, brakeTorqueNm, mods) * 3600) / pKw;
}

export function gsToLh(gs: number): number {
  return (gs * 3.6) / FUEL.densityKgL;
}

/**
 * Cold-engine friction multiplier as a function of oil temperature (°C).
 * ≈ 1.75 at 20 °C, 1.0 at ≥ 90 °C (oil viscosity, piston-ring and bearing friction).
 */
export function coldFrictionMult(oilTempC: number): number {
  const x = Math.min(1, Math.max(0, (90 - oilTempC) / 70));
  return 1 + 0.8 * Math.pow(x, 1.3);
}
