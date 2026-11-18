/** Saturation vapour pressure (Pa), Tetens formula. */
export function saturationPressure(tempC: number): number {
  return 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** ISA barometric pressure (Pa) at altitude (m). */
export function pressureAtAltitude(altitudeM: number): number {
  return 101325 * Math.pow(1 - 2.25577e-5 * altitudeM, 5.25588);
}

/** Moist-air density (kg/m³). */
export function airDensity(tempC: number, altitudeM: number, rhPct: number): number {
  const T = tempC + 273.15;
  const p = pressureAtAltitude(altitudeM);
  const pv = Math.min(1, Math.max(0, rhPct / 100)) * saturationPressure(tempC);
  const pd = p - pv;
  return pd / (287.058 * T) + pv / (461.495 * T);
}

/** Humidity ratio (kg water / kg dry air). */
export function humidityRatio(tempC: number, rhPct: number, altitudeM = 0): number {
  const pv = (rhPct / 100) * saturationPressure(tempC);
  return (0.622 * pv) / (pressureAtAltitude(altitudeM) - pv);
}

/** Moist-air specific enthalpy (kJ/kg dry air). */
export function enthalpy(tempC: number, rhPct: number, altitudeM = 0): number {
  const w = humidityRatio(tempC, rhPct, altitudeM);
  return 1.006 * tempC + w * (2501 + 1.86 * tempC);
}

export interface Weather {
  tempC: number;
  altitudeM: number;
  rhPct: number;
  /** Solar irradiance on the car (W/m²); 0 at night, ~900 midday Portuguese summer. */
  solarWm2: number;
  /** Positive = headwind. */
  headwindKmh: number;
  crosswindKmh: number;
}

export const WEATHER_PRESETS: Record<string, { label: string; weather: Weather }> = {
  lisbonSpring: {
    label: 'Lisbon spring (20 °C, sea level)',
    weather: { tempC: 20, altitudeM: 50, rhPct: 65, solarWm2: 600, headwindKmh: 0, crosswindKmh: 0 },
  },
  lisbonSummer: {
    label: 'Lisbon summer (30 °C)',
    weather: { tempC: 30, altitudeM: 50, rhPct: 45, solarWm2: 850, headwindKmh: 0, crosswindKmh: 0 },
  },
  alentejoSummer: {
    label: 'Alentejo heatwave (38 °C)',
    weather: { tempC: 38, altitudeM: 200, rhPct: 25, solarWm2: 950, headwindKmh: 0, crosswindKmh: 0 },
  },
  serraEstrela: {
    label: 'Serra da Estrela (1500 m, 12 °C)',
    weather: { tempC: 12, altitudeM: 1500, rhPct: 60, solarWm2: 700, headwindKmh: 0, crosswindKmh: 0 },
  },
  portoWinter: {
    label: 'Porto winter (9 °C, rain)',
    weather: { tempC: 9, altitudeM: 80, rhPct: 90, solarWm2: 100, headwindKmh: 15, crosswindKmh: 0 },
  },
};
