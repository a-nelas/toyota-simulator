import { create } from 'zustand';
import type { Weather } from '../physics/atmosphere';
import type { AcSettings } from '../physics/hvac';
import { DEFAULT_SCENARIO, type Calibration, type Scenario } from '../physics/scenario';
import { DEFAULT_TRIP_COMPUTER_OPTIMISM, type TripEntry } from '../physics/calibration';
import type { DriverStyle } from '../physics/dynamics';

export type Tab = 'analyse' | 'drive' | 'routes' | 'calibration' | 'validation' | 'model';

interface Persisted {
  scenario: Scenario;
  trips: TripEntry[];
  optimism: number;
  driverStyle: DriverStyle;
}

const KEY = 'auris-sim-v1';

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Persisted>;
  } catch {
    return {};
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: fine, state stays in memory */
  }
}

const saved = load();
// Older saves: the old €1.60 default becomes the current Portuguese price; Stop & Start no longer exists.
if (saved.scenario) {
  const sc = saved.scenario as Partial<Scenario> & { stopStart?: unknown };
  if (sc.fuelPriceEurL === 1.6) sc.fuelPriceEurL = DEFAULT_SCENARIO.fuelPriceEurL;
  delete sc.stopStart;
}

export interface AppState extends Persisted {
  tab: Tab;
  setTab: (t: Tab) => void;
  set: (patch: Partial<Scenario>) => void;
  setWeather: (patch: Partial<Weather>) => void;
  setAc: (patch: Partial<AcSettings>) => void;
  setWindow: (i: number, v: number) => void;
  setCalibration: (c: Calibration) => void;
  setTrips: (t: TripEntry[]) => void;
  setOptimism: (v: number) => void;
  setDriverStyle: (d: DriverStyle) => void;
  reset: () => void;
}

export const useStore = create<AppState>((setState, get) => {
  const persist = () => {
    const s = get();
    save({ scenario: s.scenario, trips: s.trips, optimism: s.optimism, driverStyle: s.driverStyle });
  };
  const update = (fn: (s: AppState) => Partial<AppState>) => {
    setState(fn);
    persist();
  };
  return {
    tab: 'analyse',
    scenario: { ...DEFAULT_SCENARIO, ...(saved.scenario ?? {}) },
    trips: saved.trips ?? [],
    optimism: saved.optimism ?? DEFAULT_TRIP_COMPUTER_OPTIMISM,
    driverStyle: saved.driverStyle ?? 'normal',
    setTab: (tab) => setState({ tab }),
    set: (patch) => update((s) => ({ scenario: { ...s.scenario, ...patch } })),
    setWeather: (patch) => update((s) => ({ scenario: { ...s.scenario, weather: { ...s.scenario.weather, ...patch } } })),
    setAc: (patch) => update((s) => ({ scenario: { ...s.scenario, ac: { ...s.scenario.ac, ...patch } } })),
    setWindow: (i, v) =>
      update((s) => {
        const w = [...s.scenario.windows] as Scenario['windows'];
        w[i] = Math.min(1, Math.max(0, v));
        return { scenario: { ...s.scenario, windows: w } };
      }),
    setCalibration: (c) => update((s) => ({ scenario: { ...s.scenario, calibration: c } })),
    setTrips: (trips) => update(() => ({ trips })),
    setOptimism: (optimism) => update(() => ({ optimism })),
    setDriverStyle: (driverStyle) => update(() => ({ driverStyle })),
    reset: () => update((s) => ({ scenario: { ...DEFAULT_SCENARIO, calibration: s.scenario.calibration } })),
  };
});
