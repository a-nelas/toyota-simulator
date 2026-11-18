import { BLOWER_ELECTRIC_W } from './hvac';

export interface ElectricalSettings {
  headlights: boolean;
  rearDefrost: boolean;
  /** Blower level 0–4 (shared with A/C). */
  blower: number;
}

/** ECU, injectors, fuel/EGR actuators, EPS standby, LED DRL, instruments, infotainment (W). */
export const BASE_ELECTRIC_W = 300;
export const ALTERNATOR_EFFICIENCY = 0.6;

export function electricalLoadW(e: ElectricalSettings, extraW = 0): number {
  return (
    BASE_ELECTRIC_W +
    (e.headlights ? 150 : 0) +
    (e.rearDefrost ? 160 : 0) +
    BLOWER_ELECTRIC_W[Math.max(0, Math.min(4, Math.round(e.blower)))] +
    extraW
  );
}

/** Mechanical power the alternator takes from the crank (W). */
export function alternatorMechW(electricW: number): number {
  return electricW / ALTERNATOR_EFFICIENCY;
}
