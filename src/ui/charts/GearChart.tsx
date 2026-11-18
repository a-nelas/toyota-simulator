import { useMemo, useRef } from 'react';
import type uPlot from 'uplot';
import { solveGear, isFeasible, ECO_MIN_RPM } from '../../physics/steadyState';
import type { Scenario } from '../../physics/scenario';
import { ENGINE } from '../../physics/vehicle';
import { C } from '../theme';
import { UChart, axis, type ChartOpts } from './UChart';

const SPEEDS = Array.from({ length: 86 }, (_, i) => 10 + i * 2);

/** L/100 km against speed in every gear, plus the best-gear envelope, for the current conditions. */
export function GearChart({ s, current }: { s: Scenario; current: { kmh: number; l: number } }) {
  // Curves do not depend on the selected speed or gear: key them on everything else.
  const { speedKmh: _sp, gear: _g, ...rest } = s;
  const curveKey = JSON.stringify(rest);
  const cur = useRef(current);
  cur.current = current;
  const curves = useMemo(() => {
    const gears: (number | null)[][] = [[], [], [], [], [], []];
    const best: (number | null)[] = [];
    for (const kmh of SPEEDS) {
      let b: number | null = null;
      for (let g = 1; g <= 6; g++) {
        const p = solveGear({ ...s, speedKmh: kmh }, g);
        const ok = isFeasible(p) && p.rpm >= ENGINE.minInGearRpm;
        const v = ok ? Math.min(40, p.lPer100) : null;
        gears[g - 1].push(v);
        if (ok && p.rpm >= ECO_MIN_RPM && v !== null && (b === null || v < b)) b = v;
      }
      best.push(b);
    }
    return [SPEEDS, best, ...gears] as uPlot.AlignedData;
  }, [curveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // New array identity whenever the marker moves, so the wrapper redraws.
  const data = useMemo(() => [...curves] as uPlot.AlignedData, [curves, current.kmh, current.l]);

  const opts: ChartOpts = useMemo(
    () => ({
      cursor: { points: { size: 8 } },
      legend: { live: true },
      scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.min(40, Math.max(8, Math.ceil(max + 0.5)))] } },
      axes: [axis('Speed (km/h)'), axis('L/100 km')],
      series: [
        { label: 'km/h', value: (_u, v) => (v == null ? '—' : `${v}`) },
        { label: 'Best gear', stroke: C.text, width: 2, dash: [6, 4], value: (_u, v) => (v == null ? '—' : v.toFixed(2)) },
        ...[1, 2, 3, 4, 5, 6].map((g) => ({
          label: `${g}${['st', 'nd', 'rd', 'th', 'th', 'th'][g - 1]}`,
          stroke: C.series[g - 1],
          width: 2,
          value: (_u: uPlot, v: number | null) => (v == null ? '—' : v.toFixed(2)),
        })),
      ],
      hooks: {
        draw: [
          (u: uPlot) => {
            const { kmh, l } = cur.current;
            const x = u.valToPos(kmh, 'x', true);
            const y = u.valToPos(Math.min(40, l), 'y', true);
            if (!Number.isFinite(y)) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 6 * devicePixelRatio, 0, Math.PI * 2);
            ctx.fillStyle = C.text;
            ctx.strokeStyle = C.surface;
            ctx.lineWidth = 2 * devicePixelRatio;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          },
        ],
      },
    }),
    [],
  );

  return <UChart opts={opts} data={data} height={300} optsKey="gear" />;
}
