import { describe, expect, it } from 'vitest';
import { NEDC } from '../cycles';
import { NORMAL_DRIVER } from '../dynamics';
import { fuelRateGs, gsToLh, bsfc } from '../engine';
import { ROUTES } from '../routes';
import { DEFAULT_SCENARIO, type Scenario } from '../scenario';
import { runAcceleration, runCycle, runRoute } from '../simulate';
import { solve, solveGear } from '../steadyState';
import { SPEC } from '../vehicle';

const TA: Scenario = { ...DEFAULT_SCENARIO, roadLoadMode: 'typeApproval' };
const at = (patch: Partial<Scenario>) => ({ ...DEFAULT_SCENARIO, ...patch });

describe('NEDC against Toyota type approval (205/55 R16)', () => {
  const run = runCycle(TA, NEDC, { coldStart: true });
  const [, extra, combined] = SPEC.nedc16.value;

  it('covers the right distance (≈ 11.0 km) and tracks the trace', () => {
    expect(run.distanceKm).toBeGreaterThan(10.7);
    expect(run.distanceKm).toBeLessThan(11.1);
    expect(run.maxSpeedError).toBeLessThan(4);
  });
  it('extra-urban within ±5 % of 3.7 L/100 km', () => {
    expect(Math.abs(run.phases[1].lPer100 / extra - 1)).toBeLessThan(0.05);
  });
  it('combined (cold start) within ±8 % of 4.1 L/100 km', () => {
    expect(Math.abs(run.lPer100 / combined - 1)).toBeLessThan(0.08);
  });
});

describe('performance', () => {
  const acc = runAcceleration(DEFAULT_SCENARIO, 120);
  it('0–100 km/h in 12.5–13.5 s (Toyota: 13.0 s)', () => {
    expect(acc.t100).not.toBeNull();
    expect(acc.t100!).toBeGreaterThan(12.5);
    expect(acc.t100!).toBeLessThan(13.5);
  });
  it('top speed at least 175 km/h', () => {
    expect(acc.topKmh).toBeGreaterThanOrEqual(175);
  });
});

describe('engine map', () => {
  it('minimum BSFC 210–235 g/kWh', () => {
    let min = Infinity;
    for (let rpm = 1200; rpm <= 3800; rpm += 100) for (let t = 40; t <= 200; t += 5) min = Math.min(min, bsfc(rpm, t));
    expect(min).toBeGreaterThan(210);
    expect(min).toBeLessThan(235);
  });
  it('hot idle 0.25–0.5 L/h with 500 W accessories', () => {
    const lh = gsToLh(fuelRateGs(800, 500 / ((800 * Math.PI) / 30)));
    expect(lh).toBeGreaterThan(0.25);
    expect(lh).toBeLessThan(0.5);
  });
});

describe('steady speed plausibility (6th gear, flat, 20 °C)', () => {
  it('90 km/h ≈ 3.3–4.2 L/100 km', () => {
    const p = solveGear(at({ speedKmh: 90 }), 6);
    expect(p.lPer100).toBeGreaterThan(3.3);
    expect(p.lPer100).toBeLessThan(4.2);
  });
  it('120 km/h ≈ 4.6–5.8 L/100 km', () => {
    const p = solveGear(at({ speedKmh: 120 }), 6);
    expect(p.lPer100).toBeGreaterThan(4.6);
    expect(p.lPer100).toBeLessThan(5.8);
  });
  it('lower gear at the same speed uses more fuel', () => {
    const r = solve(at({ speedKmh: 80 }));
    expect(r.byGear[3].lPer100).toBeGreaterThan(r.byGear[5].lPer100);
  });
});

describe('energy balance', () => {
  for (const sc of [at({ speedKmh: 100 }), at({ speedKmh: 60, gradePct: 5, ac: { ...DEFAULT_SCENARIO.ac, on: true } })]) {
    it(`brake power = wheel + driveline + accessories @ ${sc.speedKmh} km/h, ${sc.gradePct} %`, () => {
      const p = solve(sc).point;
      expect(p.brakeW).toBeCloseTo(p.wheelW + p.drivelineLossW + p.acW + p.alternatorW, 6);
      expect(p.wheelW).toBeCloseTo(p.aeroW + p.rollW + p.gradeW, 6);
      // Fuel energy = brake + friction + heat
      expect(p.fuelW).toBeCloseTo(p.brakeW + p.frictionW + p.heatW, 3);
    });
  }
});

describe('effects', () => {
  it('fuel cut: zero fuel coasting in gear down a 6 % grade at 80 km/h', () => {
    const p = solveGear(at({ speedKmh: 80, gradePct: -6 }), 5);
    expect(p.fuelGs).toBe(0);
    expect(['fuelCut', 'braking']).toContain(p.status);
  });
  it('A/C on uses more fuel than off', () => {
    const w = { ...DEFAULT_SCENARIO.weather, tempC: 30, solarWm2: 850 };
    const off = solve(at({ speedKmh: 90, weather: w })).point;
    const on = solve(at({ speedKmh: 90, weather: w, ac: { ...DEFAULT_SCENARIO.ac, on: true } })).point;
    expect(on.lPer100).toBeGreaterThan(off.lPer100);
    expect(on.acW).toBeGreaterThan(400);
    expect(on.acW).toBeLessThan(3400);
  });
  it('open windows use more fuel than closed above 50 km/h', () => {
    for (const kmh of [50, 90, 130]) {
      const closed = solveGear(at({ speedKmh: kmh }), 5);
      const open = solveGear(at({ speedKmh: kmh, windows: [1, 1, 1, 1] }), 5);
      expect(open.lPer100).toBeGreaterThan(closed.lPer100);
    }
  });
  it('windows-vs-A/C crossover falls between 50 and 120 km/h on a hot day', () => {
    const w = { ...DEFAULT_SCENARIO.weather, tempC: 30, solarWm2: 850, rhPct: 45 };
    const slow = solve(at({ speedKmh: 50, weather: w, windows: [1, 1, 1, 1] })).point.lPer100;
    const slowAc = solve(at({ speedKmh: 50, weather: w, ac: { ...DEFAULT_SCENARIO.ac, on: true } })).point.lPer100;
    const fast = solve(at({ speedKmh: 120, weather: w, windows: [1, 1, 1, 1] })).point.lPer100;
    const fastAc = solve(at({ speedKmh: 120, weather: w, ac: { ...DEFAULT_SCENARIO.ac, on: true } })).point.lPer100;
    expect(slow).toBeLessThan(slowAc);
    expect(fast).toBeGreaterThan(fastAc);
  });
  it('steeper climbs need more fuel and eventually a downshift', () => {
    const flat = solve(at({ speedKmh: 90 })).point;
    const hill = solve(at({ speedKmh: 90, gradePct: 6 })).point;
    expect(hill.lPer100).toBeGreaterThan(flat.lPer100 * 2);
    expect(solveGear(at({ speedKmh: 90, gradePct: 10 }), 6).status).toBe('noTorque');
  });
});

describe('real-world', () => {
  it('mixed commute, cold start, everyday driver: 4.4–5.5 L/100 km (owners ≈ 5.2)', () => {
    const r = runRoute(DEFAULT_SCENARIO, ROUTES.find((x) => x.id === 'commute')!, { coldStart: true, driver: NORMAL_DRIVER });
    expect(r.lPer100).toBeGreaterThan(4.4);
    expect(r.lPer100).toBeLessThan(5.5);
  });
  it('Serra da Estrela descent is almost entirely fuel cut', () => {
    const r = runRoute(DEFAULT_SCENARIO, ROUTES.find((x) => x.id === 'estrela-down')!);
    expect(r.lPer100).toBeLessThan(0.6);
  });
});
