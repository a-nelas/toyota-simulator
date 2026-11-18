/**
 * Toyota Auris Touring Sports (E180 facelift, 2015–2018) 1.4 D-4D, 6-speed manual.
 * Every constant carries the source it came from; `estimate: true` marks values not published by Toyota.
 */

export interface SourcedValue<T> {
  value: T;
  unit: string;
  source: string;
  estimate?: boolean;
  uncertainty?: string;
}

const TOYOTA_TS = 'Toyota Auris Touring Sports technical specifications (BE/FR, 2015+)';
const TOYOTA_PRESS = 'Toyota Auris 2017 press kit (FR)';
const KM77 = 'km77.com Auris Touring Sports 90D datasheets (2014–2018)';

export const SPEC = {
  displacement: { value: 1364, unit: 'cm³', source: TOYOTA_TS },
  boreStroke: { value: [73, 81.5], unit: 'mm', source: TOYOTA_TS },
  compression: { value: 16.5, unit: ':1', source: TOYOTA_TS },
  maxPower: { value: [66, 3800], unit: 'kW @ rpm', source: TOYOTA_TS },
  maxTorque: { value: [205, 1400, 2800], unit: 'Nm @ rpm range', source: TOYOTA_PRESS },
  railPressure: { value: 180, unit: 'MPa', source: TOYOTA_PRESS },
  gearing: {
    value: [8.3, 15.3, 23.8, 32.0, 43.4, 49.7],
    unit: 'km/h per 1000 rpm (205/55 R16)',
    source: KM77,
  },
  reverse: { value: 8.8, unit: 'km/h per 1000 rpm', source: KM77 },
  cd: { value: 0.28, unit: '', source: `${TOYOTA_TS}; km77 2015` },
  frontalArea: {
    value: 2.18,
    unit: 'm²',
    source: '0.85 × width 1.760 m × height 1.460 m (without rails)',
    estimate: true,
    uncertainty: '±5 %',
  },
  dimensions: { value: [4595, 1760, 1485, 2600], unit: 'mm L × W × H × wheelbase', source: TOYOTA_TS },
  tracks: { value: [1525, 1520], unit: 'mm front / rear (205/55 R16)', source: TOYOTA_TS },
  kerbMass: { value: 1300, unit: 'kg incl. 75 kg driver', source: TOYOTA_TS },
  gvw: { value: 1850, unit: 'kg', source: TOYOTA_TS },
  tank: { value: 50, unit: 'L', source: TOYOTA_TS },
  topSpeed: { value: 175, unit: 'km/h', source: `${TOYOTA_TS}; km77` },
  zeroTo100: { value: 13.0, unit: 's', source: `${TOYOTA_TS}; km77` },
  nedc15: { value: [4.4, 3.5, 3.9], unit: 'L/100 km urban / extra / combined (15")', source: TOYOTA_TS },
  nedc16: { value: [4.8, 3.7, 4.1], unit: 'L/100 km urban / extra / combined (15–16")', source: TOYOTA_TS },
  realWorld: {
    value: 5.2,
    unit: 'L/100 km',
    source: 'Honest John Real MPG, Auris TS 1.4 D-4D (53.9 mpg); Spritmonitor owners 4.3–5.1',
    uncertainty: 'driver/route dependent, ±0.5',
  },
} satisfies Record<string, SourcedValue<unknown>>;

export const VEHICLE = {
  name: 'Toyota Auris Touring Sports 1.4 D-4D (2017, 6-speed manual)',
  kerbMassKg: 1300,
  gvwKg: 1850,
  driverKg: 75,
  cd: 0.28,
  frontalAreaM2: 2.18,
  lengthM: 4.595,
  widthM: 1.76,
  heightM: 1.485,
  wheelbaseM: 2.6,
  trackFrontM: 1.525,
  trackRearM: 1.52,
  tankL: 50,
  /** Approximate weight distribution, front share (FWD estate, diesel). */
  frontAxleShare: 0.6,
} as const;

export const ENGINE = {
  code: '1ND-TV',
  displacementM3: 1.364e-3,
  boreM: 0.073,
  strokeM: 0.0815,
  cylinders: 4,
  idleRpm: 800,
  /** In-gear fuel cut is active above this speed when the driver lifts off. */
  fuelCutRpm: 1100,
  /** Below this the engine lugs / judders in gear. */
  minInGearRpm: 1000,
  /** Rev limiter. */
  maxRpm: 4800,
  /** Rotational inertia of crank + dual-mass flywheel + clutch (estimate). */
  inertiaKgM2: 0.13,
} as const;

export const FUEL = {
  /** EN 590 diesel at 15 °C. */
  densityKgL: 0.835,
  lhvJPerG: 42900,
  co2KgPerL: 2.64,
} as const;
