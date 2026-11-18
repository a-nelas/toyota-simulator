import { enthalpy, type Weather } from './atmosphere';

export interface AcSettings {
  on: boolean;
  setpointC: number;
  recirculation: boolean;
  /** Blower level 0–4. */
  blower: number;
}

const BLOWER_KGS = [0, 0.03, 0.05, 0.075, 0.1];
export const BLOWER_ELECTRIC_W = [0, 40, 90, 160, 250];

const CABIN_UA_W_PER_K = 95;
const GLASS_SOLAR_AREA_M2 = 1.25;
const GLASS_TRANSMITTANCE = 0.5;
const OCCUPANT_W = 100;
/** Heat from engine bay / floor / exhaust tunnel into the cabin (W). */
const ENGINE_BAY_W = 150;
/** Max compressor cooling capacity at 2000 compressor rpm (W). */
const CAPACITY_AT_2000 = 6000;
const PULLEY_RATIO = 1.15;

export interface AcResult {
  /** Mechanical power drawn from the crank (W). */
  compressorW: number;
  /** Evaporator heat load (W). */
  evaporatorW: number;
  cop: number;
  /** Condenser fan electrical load (W). */
  condenserFanW: number;
  /** Cabin heat gain without A/C (W), for reference. */
  cabinGainW: number;
}

export function cabinHeatGain(weather: Weather, cabinC: number, occupants: number): number {
  const solar = weather.solarWm2 * GLASS_SOLAR_AREA_M2 * GLASS_TRANSMITTANCE;
  const conduction = CABIN_UA_W_PER_K * (weather.tempC - cabinC);
  return solar + conduction + occupants * OCCUPANT_W + ENGINE_BAY_W;
}

/** Coefficient of performance of the R134a/R1234yf loop with a variable-displacement compressor. */
export function acCop(ambientC: number, speedMs: number, engineRpm: number): number {
  const fTemp = Math.max(0.45, 1 - 0.025 * (ambientC - 25));
  const kmh = speedMs * 3.6;
  const fAir = kmh >= 60 ? 1 : 0.85 + (0.15 * kmh) / 60;
  const compRpm = engineRpm * PULLEY_RATIO;
  const fRpm = Math.max(0.75, 1 - 0.06 * ((compRpm - 2000) / 2000));
  return 2.2 * fTemp * fAir * fRpm;
}

/**
 * Steady-state A/C load holding the cabin at the setpoint.
 * Fresh-air mode cools outside air down to cabin conditions (sensible + latent);
 * recirculation leaves only ~20 % fresh air (leakage + minimum ventilation).
 */
export function acSteadyState(
  ac: AcSettings,
  weather: Weather,
  speedMs: number,
  engineRpm: number,
  occupants: number,
): AcResult {
  const cabinC = ac.setpointC;
  const gain = cabinHeatGain(weather, cabinC, occupants);
  if (!ac.on || engineRpm <= 0) {
    return { compressorW: 0, evaporatorW: 0, cop: 0, condenserFanW: 0, cabinGainW: gain };
  }
  const blowerFlow = BLOWER_KGS[Math.max(0, Math.min(4, Math.round(ac.blower)))] || BLOWER_KGS[2];
  const freshFlow = blowerFlow * (ac.recirculation ? 0.2 : 1);
  const hOut = enthalpy(weather.tempC, weather.rhPct, weather.altitudeM);
  const hCabin = enthalpy(cabinC, 50, weather.altitudeM);
  const ventilation = Math.max(0, freshFlow * (hOut - hCabin) * 1000);
  // Evaporator always dehumidifies to ~4 °C and reheats: minimum load while A/C is on.
  const evap = Math.max(600, 1.1 * (Math.max(0, gain) + ventilation));
  const compRpm = engineRpm * PULLEY_RATIO;
  const capacity = CAPACITY_AT_2000 * Math.min(1.3, compRpm / 2000);
  const delivered = Math.min(evap, capacity);
  const cop = acCop(weather.tempC, speedMs, engineRpm);
  const compressorW = Math.min(4000, Math.max(200, delivered / cop));
  const kmh = speedMs * 3.6;
  const condenserFanW = kmh < 50 ? 220 * (1 - kmh / 50) : 0;
  return { compressorW, evaporatorW: delivered, cop, condenserFanW, cabinGainW: gain };
}

/** Cabin thermal capacity (J/K), air + interior surfaces that participate in pull-down. */
export const CABIN_CAPACITY_J_PER_K = 60000;

/**
 * Transient cabin temperature step (drive mode). Returns new cabin temp and the compressor load.
 * With windows open, cabin air exchanges with outside air proportional to speed.
 */
export function cabinStep(
  cabinC: number,
  dt: number,
  ac: AcSettings,
  weather: Weather,
  speedMs: number,
  engineRpm: number,
  occupants: number,
  windowOpenAvg: number,
): { cabinC: number; compressorW: number; condenserFanW: number } {
  const gain = cabinHeatGain(weather, cabinC, occupants);
  const windowExchangeKgS = windowOpenAvg * (0.05 + 0.02 * speedMs);
  const ventFlow = ac.on ? BLOWER_KGS[Math.round(ac.blower)] * (ac.recirculation ? 0.2 : 1) : BLOWER_KGS[Math.round(ac.blower)];
  const exchange = (windowExchangeKgS + ventFlow) * 1006 * (weather.tempC - cabinC);
  let cooling = 0;
  let compressorW = 0;
  let condenserFanW = 0;
  if (ac.on && engineRpm > 0) {
    const compRpm = engineRpm * PULLEY_RATIO;
    const capacity = CAPACITY_AT_2000 * Math.min(1.3, compRpm / 2000);
    // Proportional control: full capacity when > 4 K above setpoint.
    const demand = Math.min(1, Math.max(0, (cabinC - ac.setpointC + 0.5) / 4));
    const steady = Math.max(0, gain + exchange);
    cooling = Math.min(capacity, Math.max(steady * (cabinC > ac.setpointC ? 1 : 0.9), demand * capacity));
    const evap = Math.max(600, cooling * 1.1);
    compressorW = Math.min(4000, Math.max(200, evap / acCop(weather.tempC, speedMs, engineRpm)));
    const kmh = speedMs * 3.6;
    condenserFanW = kmh < 50 ? 220 * (1 - kmh / 50) : 0;
  }
  const dT = ((gain + exchange - cooling) * dt) / CABIN_CAPACITY_J_PER_K;
  return { cabinC: cabinC + dT, compressorW, condenserFanW };
}
