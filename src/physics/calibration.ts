import { NORMAL_DRIVER } from './dynamics';
import type { Route, RouteSegment } from './routes';
import type { Calibration, Scenario } from './scenario';
import { runRoute } from './simulate';

export type TripType = 'city' | 'mixed' | 'highway';

export interface TripEntry {
  id: string;
  label: string;
  distanceKm: number;
  avgSpeedKmh: number;
  type: TripType;
  acOn: boolean;
  tempC: number;
  /** L/100 km shown by the trip computer, or computed from litres filled ÷ km. */
  lPer100: number;
  source: 'tripComputer' | 'fillUp';
  coldStart: boolean;
}

/**
 * Toyota multi-information displays typically under-read real consumption by a few percent.
 * Fill-ups are treated as ground truth. Adjustable in the UI.
 */
export const DEFAULT_TRIP_COMPUTER_OPTIMISM = 0.04;

export function trueConsumption(e: TripEntry, optimism: number): number {
  return e.source === 'tripComputer' ? e.lPer100 * (1 + optimism) : e.lPer100;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

/** Build a representative synthetic route for a trip of a given type and average speed. */
export function syntheticRoute(e: TripEntry): Route {
  const r = rng(Math.round(e.distanceKm * 100 + e.avgSpeedKmh));
  const km = Math.min(60, Math.max(3, e.distanceKm));
  const segs: RouteSegment[] = [];
  const add = (lenKm: number, speed: number, stopEveryM: number, amp: number) => {
    let left = lenKm * 1000;
    while (left > 0) {
      const len = Math.min(left, stopEveryM > 0 ? stopEveryM * (0.5 + r()) : 1500 + r() * 1500);
      segs.push({
        lengthM: len,
        gradePct: (r() * 2 - 1) * amp,
        speedKmh: speed,
        stop: stopEveryM > 0 && r() < 0.6 ? 8 + r() * 30 : undefined,
      });
      left -= len;
    }
  };
  if (e.type === 'city') {
    // Lower average speed → more frequent stops.
    const stopEvery = Math.max(150, Math.min(900, e.avgSpeedKmh * 18));
    add(km, 50, stopEvery, 4);
  } else if (e.type === 'highway') {
    add(km, Math.min(140, Math.max(70, e.avgSpeedKmh * 1.04)), 0, 2.5);
  } else {
    add(km * 0.3, 50, 400, 4);
    add(km * 0.3, 90, 0, 2.5);
    add(km * 0.4, Math.min(130, Math.max(80, e.avgSpeedKmh * 1.6)), 0, 2);
  }
  const total = segs.reduce((a, s) => a + s.lengthM, 0);
  const mean = segs.reduce((a, s) => a + s.lengthM * s.gradePct, 0) / total;
  for (const s of segs) s.gradePct -= mean;
  return { id: `trip-${e.id}`, label: e.label, description: 'synthetic', segments: segs };
}

export function predictTrip(base: Scenario, e: TripEntry, roadLoadScale: number): number {
  const s: Scenario = {
    ...base,
    roadLoadMode: 'real',
    calibration: { fuelScale: 1, roadLoadScale },
    weather: { ...base.weather, tempC: e.tempC },
    ac: { ...base.ac, on: e.acOn },
    windows: [0, 0, 0, 0],
    accessory: 'none',
  };
  return runRoute(s, syntheticRoute(e), { coldStart: e.coldStart, driver: NORMAL_DRIVER }).lPer100;
}

export interface FitResult extends Calibration {
  residuals: { id: string; measured: number; predicted: number; calibrated: number }[];
  rmsBeforePct: number;
  rmsAfterPct: number;
  fittedRoadLoad: boolean;
}

/**
 * Fit bounded correction factors. With trips of one type only the fuel scale is fitted;
 * when city and highway trips are both present, road load is fitted as well (it moves
 * highway consumption more than city consumption, so the two become separable).
 */
export function fitCalibration(base: Scenario, trips: TripEntry[], optimism: number): FitResult | null {
  if (!trips.length) return null;
  const types = new Set(trips.map((t) => t.type));
  const fitRoad = types.has('highway') && (types.has('city') || types.has('mixed')) && trips.length >= 3;
  const roadGrid = fitRoad ? [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2] : [1];
  const measured = trips.map((t) => trueConsumption(t, optimism));
  let best: { k: number; f: number; err: number; preds: number[] } | null = null;
  let basePreds: number[] = [];
  for (const k of roadGrid) {
    const preds = trips.map((t) => predictTrip(base, t, k));
    if (k === 1) basePreds = preds;
    const logs = measured.map((m, i) => Math.log(m / preds[i]));
    const f = Math.min(1.25, Math.max(0.85, Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length)));
    const err = measured.reduce((a, m, i) => a + Math.log(m / (f * preds[i])) ** 2, 0);
    if (!best || err < best.err) best = { k, f, err, preds };
  }
  if (!best) return null;
  const rms = (pred: number[], f: number) =>
    100 * Math.sqrt(measured.reduce((a, m, i) => a + ((f * pred[i]) / m - 1) ** 2, 0) / measured.length);
  return {
    fuelScale: best.f,
    roadLoadScale: best.k,
    fittedRoadLoad: fitRoad,
    residuals: trips.map((t, i) => ({ id: t.id, measured: measured[i], predicted: basePreds[i], calibrated: best!.f * best!.preds[i] })),
    rmsBeforePct: rms(basePreds, 1),
    rmsAfterPct: rms(best.preds, best.f),
  };
}
