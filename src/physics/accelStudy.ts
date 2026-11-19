import { Driver, ECO_DRIVER, Vehicle, initialState, type DriverOptions, type SimState } from './dynamics';
import { GEARS } from './drivetrain';
import type { Scenario } from './scenario';
import { ENGINE, FUEL } from './vehicle';

/**
 * "How hard should I accelerate?" — accelerate from `fromKmh` to `toKmh` with a fixed pedal position and
 * upshift point, then hold the cruising speed with the eco driver until `distanceM` is covered. Every
 * strategy covers the same distance, so the fuel figures are directly comparable (slower strategies also
 * take longer, which is reported separately).
 */
export interface AccelSetup {
  fromKmh: number;
  toKmh: number;
  distanceM: number;
  gradePct: number;
}

export interface AccelCase {
  /** Pedal position 0–1, held constant while accelerating. */
  pedal: number;
  /** Upshift when the engine passes this speed (rpm). */
  shiftRpm: number;
}

export interface AccelResult extends AccelCase {
  /** Reached cruising speed before covering the distance. */
  reached: boolean;
  /** Covered the whole distance (false if the car stalled on a climb or ran out of time). */
  completed: boolean;
  tToCruise: number;
  xToCruise: number;
  fuelAccelMl: number;
  /** Fuel over the whole distance: acceleration + cruise (mL). */
  fuelMl: number;
  /** Time over the whole distance (s). */
  timeS: number;
  lPer100: number;
  trace: { t: number; kmh: number; gear: number }[];
}

export const PEDALS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
export const SHIFT_RPMS = [1500, 1750, 2000, 2250, 2500, 2750, 3000, 3250, 3500, 3750, 4000];

const DT = 0.05;
const MAX_T = 600;
/** Don't upshift into a gear below this engine speed (rpm); downshift when the engine drops under it. */
const UPSHIFT_FLOOR_RPM = 1150;
const DOWNSHIFT_RPM = ENGINE.minInGearRpm + 50;
/** g of diesel per mL. */
const DENSITY_G_PER_ML = FUEL.densityKgL;

/** State rolling at `kmh` in the highest gear that keeps the engine between the floor and `maxRpm`. */
function startState(s: Scenario, car: Vehicle, kmh: number, maxRpm: number): SimState {
  const st = initialState(s);
  st.v = kmh / 3.6;
  if (st.v > 0.1) {
    let gear = 1;
    for (let g = GEARS; g >= 1; g--) {
      const rpm = car.wheelRpm(st, g);
      if (rpm >= UPSHIFT_FLOOR_RPM && rpm <= Math.max(maxRpm, UPSHIFT_FLOOR_RPM + 100)) {
        gear = g;
        break;
      }
    }
    st.gear = gear;
    st.rpm = car.wheelRpm(st, gear);
    st.boost = 0.5;
  }
  return st;
}

function finish(c: AccelCase, st: SimState, setup: AccelSetup, reachedAt: { t: number; x: number; fuelG: number } | null, trace: AccelResult['trace']): AccelResult {
  const completed = st.x >= setup.distanceM;
  const fuelMl = st.fuelG / DENSITY_G_PER_ML;
  return {
    ...c,
    reached: reachedAt !== null,
    completed,
    tToCruise: reachedAt?.t ?? NaN,
    xToCruise: reachedAt?.x ?? NaN,
    fuelAccelMl: reachedAt ? reachedAt.fuelG / DENSITY_G_PER_ML : NaN,
    fuelMl,
    timeS: st.t,
    lPer100: st.x > 0 ? (fuelMl / 1000 / (st.x / 1000)) * 100 : NaN,
    trace,
  };
}

/** One pedal/shift-point strategy. */
export function runAccelCase(s: Scenario, setup: AccelSetup, c: AccelCase): AccelResult {
  const car = new Vehicle(s);
  const cruise = new Driver(car, ECO_DRIVER);
  const st = startState(s, car, setup.fromKmh, c.shiftRpm);
  if (st.gear === 0) car.requestGear(st, 1);
  const vTo = setup.toKmh / 3.6;
  const trace: AccelResult['trace'] = [];
  let reachedAt: { t: number; x: number; fuelG: number } | null = null;
  let nextSample = 0;
  while (st.x < setup.distanceM && st.t < MAX_T) {
    if (!reachedAt && st.v >= vTo) reachedAt = { t: st.t, x: st.x, fuelG: st.fuelG };
    let ctl;
    if (reachedAt) {
      ctl = cruise.control(st, vTo, 0, setup.gradePct, DT);
    } else {
      if (st.shiftTimer <= 0 && st.gear > 0) {
        const rpm = car.wheelRpm(st);
        if (st.gear < GEARS && rpm > c.shiftRpm && car.wheelRpm(st, st.gear + 1) >= UPSHIFT_FLOOR_RPM) car.requestGear(st, st.gear + 1);
        else if (st.gear > 1 && rpm < DOWNSHIFT_RPM) car.requestGear(st, st.gear - 1);
      }
      ctl = { throttle: c.pedal, brake: 0 };
    }
    car.step(st, ctl, setup.gradePct, DT);
    if (st.t >= nextSample) {
      trace.push({ t: st.t, kmh: st.v * 3.6, gear: st.gear });
      nextSample += 0.5;
    }
    // Stalled on a climb: give up.
    if (!reachedAt && st.t > 20 && st.v < 0.2) break;
  }
  return finish(c, st, setup, reachedAt, trace);
}

/** Baseline: the automated eco/everyday driver accelerating its own way to the same cruising speed. */
export function runAccelDriver(s: Scenario, setup: AccelSetup, opts: DriverOptions): AccelResult {
  const car = new Vehicle(s);
  const driver = new Driver(car, opts);
  const st = startState(s, car, setup.fromKmh, opts.minAccelRpm + 800);
  const vTo = setup.toKmh / 3.6;
  const trace: AccelResult['trace'] = [];
  let reachedAt: { t: number; x: number; fuelG: number } | null = null;
  let nextSample = 0;
  while (st.x < setup.distanceM && st.t < MAX_T) {
    // The driver closes in on the target exponentially; count "there" within 1 km/h.
    if (!reachedAt && st.v >= vTo - 1 / 3.6) reachedAt = { t: st.t, x: st.x, fuelG: st.fuelG };
    const ctl = driver.control(st, vTo, 0, setup.gradePct, DT);
    car.step(st, ctl, setup.gradePct, DT);
    if (st.t >= nextSample) {
      trace.push({ t: st.t, kmh: st.v * 3.6, gear: st.gear });
      nextSample += 0.5;
    }
  }
  return finish({ pedal: NaN, shiftRpm: NaN }, st, setup, reachedAt, trace);
}

/** A usable strategy: reached cruise speed and covered the distance. */
export const isValid = (r: AccelResult) => r.reached && r.completed;

/** Lowest-fuel valid result. */
export function bestOf(results: AccelResult[]): AccelResult | null {
  let best: AccelResult | null = null;
  for (const r of results) if (isValid(r) && (!best || r.fuelMl < best.fuelMl)) best = r;
  return best;
}

/** Lowest-fuel valid result that reaches cruising speed within `maxSeconds`. */
export function bestWithin(results: AccelResult[], maxSeconds: number): AccelResult | null {
  return bestOf(results.filter((r) => r.tToCruise <= maxSeconds));
}

/**
 * Trade-off curve: for each time to cruising speed, the least fuel any strategy needs to be there that
 * quickly (sorted by time; each point uses less fuel than every quicker one).
 */
export function paretoFront(results: AccelResult[]): AccelResult[] {
  const sorted = results.filter(isValid).sort((a, b) => a.tToCruise - b.tToCruise);
  const front: AccelResult[] = [];
  let min = Infinity;
  for (const r of sorted) {
    if (r.fuelMl < min - 1e-9) {
      min = r.fuelMl;
      front.push(r);
    }
  }
  return front;
}
