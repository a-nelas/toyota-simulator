import { cycleAt, cycleDuration, type Cycle } from './cycles';
import { Driver, ECO_DRIVER, Vehicle, initialState, type DriverOptions, type SimState } from './dynamics';
import { buildProfile, sampleProfile, type Route, type RouteProfile } from './routes';
import type { Scenario } from './scenario';
import { FUEL } from './vehicle';

export interface TracePoint {
  t: number;
  x: number;
  kmh: number;
  targetKmh: number;
  rpm: number;
  gear: number;
  fuelLh: number;
  elevation: number;
  oilC: number;
  cabinC: number;
}

export interface RunSummary {
  distanceKm: number;
  timeS: number;
  fuelL: number;
  lPer100: number;
  avgKmh: number;
  co2gkm: number;
  costEur: number;
  energyMJ: {
    fuel: number;
    aero: number;
    rolling: number;
    grade: number;
    brakes: number;
    driveline: number;
    ac: number;
    alternator: number;
  };
  restarts: number;
  phases: { name: string; distanceKm: number; fuelL: number; lPer100: number }[];
  trace: TracePoint[];
  maxSpeedError: number;
}

function summarize(s: Scenario, st: SimState, trace: TracePoint[], phases: RunSummary['phases'], maxErr: number): RunSummary {
  const km = st.x / 1000;
  const fuelL = st.fuelG / 1000 / FUEL.densityKgL;
  return {
    distanceKm: km,
    timeS: st.t,
    fuelL,
    lPer100: km > 0 ? (fuelL / km) * 100 : 0,
    avgKmh: st.t > 0 ? (km / st.t) * 3600 : 0,
    co2gkm: km > 0 ? (fuelL * FUEL.co2KgPerL * 1000) / km : 0,
    costEur: fuelL * s.fuelPriceEurL,
    energyMJ: {
      fuel: st.eFuel / 1e6,
      aero: st.eAero / 1e6,
      rolling: st.eRoll / 1e6,
      grade: st.eGrade / 1e6,
      brakes: st.eBrake / 1e6,
      driveline: st.eDriveline / 1e6,
      ac: st.eAc / 1e6,
      alternator: st.eAlt / 1e6,
    },
    restarts: st.restarts,
    phases,
    trace,
    maxSpeedError: maxErr,
  };
}

export interface RunOptions {
  coldStart?: boolean;
  dt?: number;
  driver?: DriverOptions;
}

export function runCycle(s: Scenario, cycle: Cycle, opts: RunOptions = {}): RunSummary {
  const dt = opts.dt ?? 0.1;
  const car = new Vehicle(s);
  const driver = new Driver(car, opts.driver ?? ECO_DRIVER);
  const st = initialState(s, { coldStart: opts.coldStart });
  const dur = cycleDuration(cycle);
  const trace: TracePoint[] = [];
  const phaseMarks = cycle.phases.map(() => ({ x0: 0, f0: 0, x1: 0, f1: 0 }));
  let lastFuelGs = 0;
  let maxErr = 0;
  let nextTrace = 0;
  while (st.t < dur - 1e-9) {
    cycle.phases.forEach((ph, i) => {
      if (Math.abs(st.t - ph.from) < dt / 2) { phaseMarks[i].x0 = st.x; phaseMarks[i].f0 = st.fuelG; }
    });
    const tgt = cycleAt(cycle, st.t + dt);
    const ctl = driver.control(st, tgt.v / 3.6, tgt.a / 3.6, 0, dt);
    const info = car.step(st, ctl, 0, dt);
    lastFuelGs = info.fuelGs;
    maxErr = Math.max(maxErr, Math.abs(st.v * 3.6 - cycleAt(cycle, st.t).v));
    cycle.phases.forEach((ph, i) => {
      if (Math.abs(st.t - ph.to) < dt / 2) { phaseMarks[i].x1 = st.x; phaseMarks[i].f1 = st.fuelG; }
    });
    if (st.t >= nextTrace) {
      trace.push({
        t: st.t, x: st.x, kmh: st.v * 3.6, targetKmh: tgt.v, rpm: info.rpm, gear: st.gear,
        fuelLh: (lastFuelGs * 3.6) / FUEL.densityKgL, elevation: 0, oilC: st.oilC, cabinC: st.cabinC,
      });
      nextTrace += 1;
    }
  }
  const phases = cycle.phases.map((ph, i) => {
    const m = phaseMarks[i];
    const km = (m.x1 - m.x0) / 1000;
    const l = (m.f1 - m.f0) / 1000 / FUEL.densityKgL;
    return { name: ph.name, distanceKm: km, fuelL: l, lPer100: km > 0 ? (l / km) * 100 : 0 };
  });
  return summarize(s, st, trace, phases, maxErr);
}

/** Target speed for a route position with look-ahead braking for slower sections and stops. */
export function routeTarget(p: RouteProfile, x: number, decel = 1.0): number {
  let v = sampleProfile(p, x, p.speed) / 3.6;
  for (let d = 10; d <= 400; d += 10) {
    const ahead = sampleProfile(p, x + d, p.speed) / 3.6;
    v = Math.min(v, Math.sqrt(ahead * ahead + 2 * decel * d));
  }
  for (const s of p.stops) {
    const d = s.x - x;
    if (d > -1 && d < 600) v = Math.min(v, Math.sqrt(2 * decel * Math.max(0, d - 2)));
  }
  if (x >= p.lengthM - 1) v = 0;
  return v;
}

export function runRoute(s: Scenario, route: Route | RouteProfile, opts: RunOptions = {}): RunSummary {
  const p = 'segments' in route ? buildProfile(route) : route;
  const dt = opts.dt ?? 0.2;
  const car = new Vehicle(s);
  const driver = new Driver(car, opts.driver ?? ECO_DRIVER);
  const st = initialState(s, { coldStart: opts.coldStart });
  const trace: TracePoint[] = [];
  let stopIdx = 0;
  let waiting = 0;
  let nextTrace = 0;
  const maxT = (p.lengthM / 3) + 3600;
  while (st.x < p.lengthM - 1 && st.t < maxT) {
    let vT = routeTarget(p, st.x);
    const nextStop = p.stops[stopIdx];
    if (nextStop && st.x > nextStop.x - 4 && st.v < 0.3) {
      waiting += dt;
      vT = 0;
      if (waiting >= nextStop.seconds) { stopIdx++; waiting = 0; }
    } else if (nextStop && st.x > nextStop.x + 5) {
      stopIdx++;
    }
    if (waiting > 0) vT = 0;
    else if (st.v < 0.3 && vT < 0.5 && nextStop && st.x > nextStop.x - 15) vT = 0;
    else if (vT < 1.5 && waiting === 0 && (!nextStop || st.x < nextStop.x - 15)) vT = Math.max(vT, 1.5);
    const grade = sampleProfile(p, st.x, p.grade);
    const ctl = driver.control(st, vT, 0, grade, dt);
    const info = car.step(st, ctl, grade, dt);
    if (st.t >= nextTrace) {
      trace.push({
        t: st.t, x: st.x, kmh: st.v * 3.6, targetKmh: vT * 3.6, rpm: info.rpm, gear: st.gear,
        fuelLh: (info.fuelGs * 3.6) / FUEL.densityKgL, elevation: sampleProfile(p, st.x, p.elevation),
        oilC: st.oilC, cabinC: st.cabinC,
      });
      nextTrace += 1;
    }
  }
  return summarize(s, st, trace, [], 0);
}

/** Full-throttle acceleration from standstill on the flat (performance validation). */
export function runAcceleration(s: Scenario, maxTime = 90, shiftRpm = 4300): { t100: number | null; topKmh: number; trace: { t: number; kmh: number; gear: number }[] } {
  const car = new Vehicle(s);
  const st = initialState(s);
  const dt = 0.02;
  car.requestGear(st, 1);
  let t100: number | null = null;
  const trace: { t: number; kmh: number; gear: number }[] = [];
  let lastSample = -1;
  while (st.t < maxTime) {
    if (st.shiftTimer <= 0 && st.gear > 0 && st.gear < 6 && car.wheelRpm(st) > shiftRpm) car.requestGear(st, st.gear + 1);
    car.step(st, { throttle: 1, brake: 0 }, 0, dt);
    if (t100 === null && st.v * 3.6 >= 100) t100 = st.t;
    if (st.t - lastSample >= 0.5) { trace.push({ t: st.t, kmh: st.v * 3.6, gear: st.gear }); lastSample = st.t; }
  }
  return { t100, topKmh: st.v * 3.6, trace };
}
