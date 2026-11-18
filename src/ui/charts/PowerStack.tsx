import { useMemo } from 'react';
import type uPlot from 'uplot';
import { solve } from '../../physics/steadyState';
import type { Scenario } from '../../physics/scenario';
import { C, fmt } from '../theme';
import { UChart, axis, type ChartOpts } from './UChart';

const SPEEDS = Array.from({ length: 33 }, (_, i) => 10 + i * 5);

export const LAYERS = [
  { key: 'roll', label: 'Rolling resistance', color: C.series[0] },
  { key: 'aero', label: 'Aerodynamic drag', color: C.series[1] },
  { key: 'grade', label: 'Climbing', color: C.series[2] },
  { key: 'driveline', label: 'Gearbox & driveshafts', color: C.series[3] },
  { key: 'ac', label: 'A/C compressor', color: C.series[4] },
  { key: 'alt', label: 'Alternator', color: C.series[5] },
] as const;

/** Stacked engine-output demand (kW) by consumer against speed, best gear. */
export function PowerStack({ s }: { s: Scenario }) {
  const { speedKmh: _a, gear: _b, ...rest } = s;
  const key = JSON.stringify(rest);
  const data = useMemo(() => {
    const raw: number[][] = LAYERS.map(() => []);
    for (const kmh of SPEEDS) {
      const p = solve({ ...s, speedKmh: kmh, gear: 'auto' }).point;
      const vals = [p.rollW, p.aeroW, Math.max(0, p.gradeW), Math.max(0, p.drivelineLossW), p.acW, p.alternatorW];
      vals.forEach((v, i) => raw[i].push(v / 1000));
    }
    // Cumulative for stacking.
    const cum: number[][] = [];
    raw.forEach((r, i) => cum.push(r.map((v, k) => v + (i > 0 ? cum[i - 1][k] : 0))));
    return { cum, raw };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts: ChartOpts = useMemo(
    () => ({
      legend: { live: true },
      scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.ceil(max * 1.05)] } },
      axes: [axis('Speed (km/h)'), axis('kW at the engine')],
      series: [
        { label: 'km/h' },
        ...LAYERS.map((l, i) => ({
          label: l.label,
          stroke: l.color,
          width: 1,
          fill: l.color + 'cc',
          // Show the layer's own value, not the cumulative one.
          value: (_u: uPlot, _v: number, _si: number, idx: number | null) => (idx == null ? '—' : fmt(data.raw[i][idx], 1)),
        })),
      ],
      bands: LAYERS.slice(1).map((_, i) => ({ series: [i + 2, i + 1] as [number, number], fill: LAYERS[i + 1].color + 'cc' })),
    }),
    [data],
  );

  const aligned = useMemo(() => [SPEEDS, ...data.cum] as uPlot.AlignedData, [data]);
  return <UChart opts={opts} data={aligned} height={280} optsKey={key} />;
}
