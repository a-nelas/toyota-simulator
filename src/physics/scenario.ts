import type { Weather } from './atmosphere';
import { WEATHER_PRESETS } from './atmosphere';
import type { AccessoryId, Windows } from './aero';
import type { AcSettings } from './hvac';
import type { TyreId } from './tyres';

export type RoadLoadMode = 'real' | 'typeApproval';

export interface Calibration {
  /** Multiplies all fuel use (engine efficiency correction). 1 = uncalibrated. */
  fuelScale: number;
  /** Multiplies CdA and Crr. 1 = uncalibrated. */
  roadLoadScale: number;
}

export interface Scenario {
  speedKmh: number;
  gradePct: number;
  /** 1–6, or 'auto' for the most economical feasible gear. */
  gear: number | 'auto';
  /** Passengers + luggage on top of the 75 kg driver. */
  payloadKg: number;
  occupants: number;
  tyre: TyreId;
  tyrePressureBar: number;
  windows: Windows;
  accessory: AccessoryId;
  ac: AcSettings;
  headlights: boolean;
  rearDefrost: boolean;
  weather: Weather;
  roadLoadMode: RoadLoadMode;
  calibration: Calibration;
  fuelPriceEurL: number;
  stopStart: boolean;
}

export const DEFAULT_SCENARIO: Scenario = {
  speedKmh: 90,
  gradePct: 0,
  gear: 'auto',
  payloadKg: 0,
  occupants: 1,
  tyre: '205/55R16',
  tyrePressureBar: 2.3,
  windows: [0, 0, 0, 0],
  accessory: 'none',
  ac: { on: false, setpointC: 22, recirculation: false, blower: 2 },
  headlights: false,
  rearDefrost: false,
  weather: { ...WEATHER_PRESETS.lisbonSpring.weather },
  roadLoadMode: 'real',
  calibration: { fuelScale: 1, roadLoadScale: 1 },
  fuelPriceEurL: 1.6,
  stopStart: true,
};

/**
 * Type-approval (NEDC lab) conditions: dyno road load from an optimised coast-down,
 * inertia class 1360 kg, A/C off, minimum electrical load. This is how the 3.7/4.1 L/100 km
 * figures were produced, and why real-world consumption is ~25 % higher.
 */
export const TYPE_APPROVAL = {
  massKg: 1360,
  /** ICCT "From laboratory to road": NEDC coast-down road loads ran ~15–25 % below real roads. */
  crrScale: 0.78,
  cdaScale: 0.88,
  /** NEDC allowed the battery to discharge during the test, so the alternator barely charges. */
  electricW: 120,
  tempC: 25,
};
