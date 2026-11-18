import { useMemo } from 'react';
import type uPlot from 'uplot';
import { solve, uncertaintyBand } from '../../physics/steadyState';
import type { Scenario } from '../../physics/scenario';
import { C, fmt } from '../theme';
import { UChart, axis, type ChartOpts } from './UChart';

const SPEEDS = Array.from({ length: 27 }, (_, i) => 20 + i * 5);

function crossing(xs: number[], a: number[], b: number[]): number | null {
  for (let i = 1; i < xs.length; i++) {
    const d0 = a[i - 1] - b[i - 1];
    const d1 = a[i] - b[i];
    if (d0 <= 0 && d1 > 0) return xs[i - 1] + ((xs[i] - xs[i - 1]) * -d0) / (d1 - d0);
  }
  return null;
}

/**
 * Open windows (A/C off) vs closed windows with A/C on, across speed, in the current weather.
 * The windows curve carries a 10–90 % band from the uncertain window ΔCd and A/C load.
 */
export function WindowsAcChart({ s }: { s: Scenario }) {
  const result = useMemo(() => {
    const anyOpen = s.windows.some((w) => w > 0.05);
    const win: Scenario['windows'] = anyOpen ? s.windows : [1, 1, 1, 1];
    const base: Scenario = { ...s, gear: 'auto', roadLoadMode: 'real' };
    const closedOff: number[] = [];
    const closedAc: number[] = [];
    const open: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    const acLo: number[] = [];
    const acHi: number[] = [];
    for (const kmh of SPEEDS) {
      const off = solve({ ...base, speedKmh: kmh, windows: [0, 0, 0, 0], ac: { ...s.ac, on: false } });
      const acS = { ...base, speedKmh: kmh, windows: [0, 0, 0, 0] as Scenario['windows'], ac: { ...s.ac, on: true } };
      const ac = solve(acS);
      const opS = { ...base, speedKmh: kmh, windows: win, ac: { ...s.ac, on: false } };
      const op = solve(opS);
      closedOff.push(off.point.lPer100);
      closedAc.push(ac.point.lPer100);
      open.push(op.point.lPer100);
      const [l, h] = uncertaintyBand(opS, op.point.gear, 60);
      lo.push(l);
      hi.push(h);
      const [al, ah] = uncertaintyBand(acS, ac.point.gear, 60);
      acLo.push(al);
      acHi.push(ah);
    }
    const x = crossing(SPEEDS, open, closedAc);
    // Earliest / latest plausible crossover from the bands.
    const xEarly = crossing(SPEEDS, hi, acLo);
    const xLate = crossing(SPEEDS, lo, acHi);
    return { data: [SPEEDS, closedOff, closedAc, open, lo, hi] as uPlot.AlignedData, x, xEarly, xLate, anyOpen };
  }, [s]);

  const opts: ChartOpts = useMemo(
    () => ({
      legend: { live: true },
      scales: { x: { time: false }, y: { range: (_u, min, max) => [Math.max(0, Math.floor(min - 0.5)), Math.ceil(max + 0.5)] } },
      axes: [axis('Speed (km/h)'), axis('L/100 km')],
      series: [
        { label: 'km/h' },
        { label: 'Closed, A/C off', stroke: C.muted, width: 2, dash: [4, 4], value: (_u, v) => fmt(v, 2) },
        { label: 'Closed, A/C on', stroke: C.series[0], width: 2, value: (_u, v) => fmt(v, 2) },
        { label: 'Windows open, A/C off', stroke: C.series[1], width: 2, value: (_u, v) => fmt(v, 2) },
        { label: 'open: 10 %', stroke: 'rgba(217,89,38,0.35)', width: 1, value: (_u, v) => fmt(v, 2) },
        { label: 'open: 90 %', stroke: 'rgba(217,89,38,0.35)', width: 1, fill: 'rgba(217,89,38,0.14)', value: (_u, v) => fmt(v, 2) },
      ],
      bands: [{ series: [5, 4], fill: 'rgba(217,89,38,0.14)' }],
    }),
    [],
  );

  return (
    <div>
      <UChart opts={opts} data={result.data} height={280} optsKey="winac" />
      <p className="small" style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
        {result.x !== null ? (
          <>
            Above <b style={{ color: 'var(--text-primary)' }}>≈ {result.x.toFixed(0)} km/h</b> closing the windows and using A/C is cheaper
            {result.xEarly !== null || result.xLate !== null ? (
              <> (plausible range {result.xEarly !== null ? result.xEarly.toFixed(0) : '<20'}–{result.xLate !== null ? result.xLate.toFixed(0) : '>150'} km/h)</>
            ) : null}
            .
          </>
        ) : open(result) ? (
          <>Open windows stay cheaper than A/C across 20–150 km/h in this weather.</>
        ) : (
          <>A/C is cheaper than open windows across the whole range in this weather.</>
        )}{' '}
        {result.anyOpen ? 'Uses your window settings.' : 'Shows all four windows fully open.'} A/C load uses the current temperature, sun and setpoint.
      </p>
    </div>
  );
}

function open(r: { data: uPlot.AlignedData }) {
  const a = r.data[3] as number[];
  const b = r.data[2] as number[];
  return a[a.length - 1] < b[b.length - 1];
}
