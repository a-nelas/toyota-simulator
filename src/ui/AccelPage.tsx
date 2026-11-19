import { useEffect, useMemo, useState } from 'react';
import type uPlot from 'uplot';
import {
  PEDALS,
  SHIFT_RPMS,
  bestOf,
  bestWithin,
  isValid,
  paretoFront,
  runAccelCase,
  runAccelDriver,
  type AccelMetric,
  type AccelResult,
  type AccelSetup,
} from '../physics/accelStudy';
import { ECO_DRIVER, NORMAL_DRIVER } from '../physics/dynamics';
import { useStore } from '../state/store';
import { AccelHeatmap } from './charts/AccelHeatmap';
import { UChart, axis, type ChartOpts } from './charts/UChart';
import { Slider } from './Controls';
import { C, fmt, fmtGrade } from './theme';

interface Study {
  key: string;
  setup: AccelSetup;
  grid: AccelResult[];
  eco: AccelResult;
  everyday: AccelResult;
}

const METRICS: { id: AccelMetric; label: string; sub: string }[] = [
  {
    id: 'total',
    label: 'Over the distance',
    sub: 'Colour shows extra fuel over the whole distance compared with the most economical strategy that meets your time limit (outlined).',
  },
  {
    id: 'accel',
    label: 'While accelerating',
    sub: 'Colour shows extra fuel burned between the start and cruising speed only, compared with the thriftiest acceleration that meets your time limit (outlined). Quicker accelerations cover less distance, so this flatters them a little.',
  },
  {
    id: 'bsfc',
    label: 'Engine efficiency',
    sub: 'Colour shows how far the average BSFC (grams of diesel per kWh of engine work) while accelerating is above the most efficient strategy that meets your time limit (outlined). This is the fuel-map view: it ignores how the work is used.',
  },
];

const CASES = PEDALS.flatMap((pedal) => SHIFT_RPMS.map((shiftRpm) => ({ pedal, shiftRpm })));
const CHUNK = 11;

function StrategyCard({ title, r, best, toKmh, km, note }: { title: string; r: AccelResult | null; best: AccelResult | null; toKmh: number; km: number; note?: string }) {
  const valid = r && isValid(r);
  const extra = valid && best ? (100 * (r.fuelMl - best.fuelMl)) / best.fuelMl : NaN;
  const dt = valid && best ? r.timeS - best.timeS : NaN;
  return (
    <div className="card accel-card">
      <div className="small muted">{title}</div>
      {valid ? (
        <>
          <div className="accel-how">{Number.isFinite(r.pedal) ? `${Math.round(r.pedal * 100)} % pedal · upshift at ${r.shiftRpm} rpm` : note}</div>
          <div className="accel-big">
            {fmt(r.fuelMl, 0)} mL
            {best && r !== best && (
              <span className="accel-delta" style={{ color: extra > 0.05 ? C.serious : C.good }}>
                {extra >= 0 ? '+' : '−'}
                {fmt(Math.abs(extra), 1)} %
              </span>
            )}
          </div>
          <div className="small">
            {toKmh} km/h after {fmt(r.tToCruise, 1)} s · {fmt(km, 1)} km in {fmt(r.timeS, 0)} s
            {best && r !== best && Math.abs(dt) >= 0.5 ? ` (${dt > 0 ? '+' : '−'}${fmt(Math.abs(dt), 0)} s)` : ''}
          </div>
          <div className="small muted">
            Accelerating: {fmt(r.fuelAccelMl, 1)} mL · {fmt(r.bsfcAccel, 0)} g/kWh
          </div>
        </>
      ) : (
        <div className="small muted" style={{ marginTop: 6 }}>
          No strategy gets there{title.startsWith('Most') ? ' within your time limit' : ''}.
        </div>
      )}
    </div>
  );
}

export function AccelPage() {
  const s = useStore((st) => st.scenario);
  const set = useStore((st) => st.set);
  const [fromKmh, setFromKmh] = useState(0);
  const [toKmh, setToKmh] = useState(90);
  const [km, setKm] = useState(2);
  const [limit, setLimit] = useState(20);
  const [metric, setMetric] = useState<AccelMetric>('total');
  const [study, setStudy] = useState<Study | null>(null);
  const [progress, setProgress] = useState(0);

  const setup: AccelSetup = useMemo(
    () => ({ fromKmh, toKmh: Math.max(toKmh, fromKmh + 10), distanceM: km * 1000, gradePct: s.gradePct }),
    [fromKmh, toKmh, km, s.gradePct],
  );
  const { speedKmh: _a, gear: _b, ...rest } = s;
  const key = JSON.stringify([setup, rest]);

  // Re-run the whole grid (in chunks, so the page stays responsive) whenever the inputs change.
  useEffect(() => {
    let cancelled = false;
    const scenario = useStore.getState().scenario;
    const grid: AccelResult[] = [];
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      for (const c of CASES.slice(i, i + CHUNK)) grid.push(runAccelCase(scenario, setup, c));
      i += CHUNK;
      setProgress(Math.min(1, i / CASES.length));
      if (i < CASES.length) {
        timer = window.setTimeout(tick, 0);
        return;
      }
      setStudy({ key, setup, grid, eco: runAccelDriver(scenario, setup, ECO_DRIVER), everyday: runAccelDriver(scenario, setup, NORMAL_DRIVER) });
    };
    let timer = window.setTimeout(tick, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = !study || study.key !== key;
  const grid = study?.grid ?? [];
  const best = useMemo(() => bestWithin(grid, limit), [grid, limit]);
  const cheapest = useMemo(() => bestOf(grid), [grid]);
  const quickest = useMemo(() => grid.filter(isValid).sort((a, b) => a.tToCruise - b.tToCruise)[0] ?? null, [grid]);
  const front = useMemo(() => paretoFront(grid), [grid]);
  const bestByMetric = useMemo(() => bestWithin(grid, limit, metric), [grid, limit, metric]);
  const bestBsfc = useMemo(() => bestWithin(grid, limit, 'bsfc'), [grid, limit]);
  const sv = study?.setup ?? setup;

  // Same pedal as the best, but revving to 3500 rpm before each shift: what late shifting costs.
  const lateShift = best ? grid.find((r) => r.pedal === best.pedal && r.shiftRpm === 3500) : undefined;

  const tradeData = useMemo(() => {
    const pts = grid.filter(isValid).sort((a, b) => a.tToCruise - b.tToCruise);
    const onFront = new Set(front);
    return [pts.map((r) => r.tToCruise), pts.map((r) => r.fuelMl), pts.map((r) => (onFront.has(r) ? r.fuelMl : null))] as uPlot.AlignedData;
  }, [grid, front]);
  const tradeOpts: ChartOpts = useMemo(
    () => ({
      legend: { live: true },
      scales: { x: { time: false } },
      axes: [axis('Seconds to cruising speed'), axis(`Fuel over ${fmt(sv.distanceM / 1000, 1)} km (mL)`)],
      series: [
        { label: 's', value: (_u, v) => fmt(v, 1) },
        {
          label: 'Strategy',
          stroke: C.series[0],
          paths: () => null,
          points: { show: true, size: 6, fill: C.series[0], stroke: C.surface, width: 1 },
          value: (_u, v) => (v == null ? '—' : `${fmt(v, 0)} mL`),
        },
        { label: 'Least fuel for that time', stroke: C.series[3], width: 2, spanGaps: true, value: (_u, v) => (v == null ? '—' : `${fmt(v, 0)} mL`) },
      ],
      hooks: {
        draw: [
          (u: uPlot) => {
            const x = u.valToPos(limit, 'x', true);
            if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return;
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = C.text2;
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, u.bbox.top);
            ctx.lineTo(x, u.bbox.top + u.bbox.height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.text2;
            ctx.font = `${12 * devicePixelRatio}px system-ui`;
            ctx.fillText(`your limit: ${limit} s`, x + 6, u.bbox.top + 14 * devicePixelRatio);
            ctx.restore();
          },
        ],
      },
    }),
    [limit, sv.distanceM],
  );

  const speedSeries = useMemo(() => {
    const list: { label: string; r: AccelResult | null; color: string; dash?: number[] }[] = [
      { label: 'Most economical in time', r: best, color: C.series[0] },
      { label: 'Quickest', r: quickest, color: C.series[1] },
      { label: 'Eco driver', r: study?.eco ?? null, color: C.series[2], dash: [6, 4] },
    ];
    return list.filter((l) => l.r && isValid(l.r)) as { label: string; r: AccelResult; color: string; dash?: number[] }[];
  }, [best, quickest, study]);
  const speedData = useMemo(() => {
    if (speedSeries.length === 0) return [[]] as unknown as uPlot.AlignedData;
    const tEnd = Math.min(Math.max(...speedSeries.map((l) => l.r.tToCruise)) + 10, Math.max(...speedSeries.map((l) => l.r.timeS)));
    const n = Math.ceil(tEnd / 0.5) + 1;
    const xs = Array.from({ length: n }, (_, k) => k * 0.5);
    return [xs, ...speedSeries.map((l) => xs.map((_, k) => l.r.trace[k]?.kmh ?? null))] as uPlot.AlignedData;
  }, [speedSeries]);
  const speedOpts: ChartOpts = useMemo(
    () => ({
      legend: { live: true },
      scales: { x: { time: false } },
      axes: [axis('Time (s)'), axis('km/h')],
      series: [
        { label: 's', value: (_u, v) => fmt(v, 1) },
        ...speedSeries.map((l) => ({ label: l.label, stroke: l.color, width: 2, dash: l.dash, value: (_u: uPlot, v: number | null) => (v == null ? '—' : fmt(v, 0)) })),
      ],
    }),
    [speedSeries],
  );

  return (
    <div className="page">
      <div className="card">
        <h3>How hard should I accelerate?</h3>
        <p className="sub">
          Every combination of pedal position and upshift point is simulated from your start speed up to cruising speed, then held at
          cruising speed until the same distance is covered, so the fuel figures compare like with like. Load, windows, A/C, tyres,
          weather and calibration come from Analyse.
        </p>
        <div className="accel-controls">
          <div>
            <div className="section-title">Start from</div>
            <div className="seg" role="group" aria-label="Start speed">
              {[0, 30, 50].map((v) => (
                <button key={v} aria-pressed={fromKmh === v} onClick={() => setFromKmh(v)}>
                  {v === 0 ? 'Standstill' : `${v} km/h`}
                </button>
              ))}
            </div>
          </div>
          <Slider label="Cruising speed" value={toKmh} min={30} max={130} step={5} unit="km/h" onChange={setToKmh} />
          <Slider label="Distance compared" value={km} min={1} max={5} step={0.5} unit="km" digits={1} onChange={setKm} />
          <Slider label="Gradient" value={s.gradePct} min={-20} max={20} step={0.5} format={fmtGrade} onChange={(v) => set({ gradePct: v })} />
          <Slider label="Reach cruising speed within" value={limit} min={5} max={90} step={1} unit="s" onChange={setLimit} />
        </div>
        <div className="accel-progress" aria-hidden={!running}>
          {running && <div style={{ width: `${Math.round(progress * 100)}%` }} />}
        </div>
      </div>

      {study && (
        <>
          <div className="card accel-answer">
            {best ? (
              <>
                To reach <b>{sv.toKmh} km/h</b> within <b>{limit} s</b>, press the pedal to about <b>{Math.round(best.pedal * 100)} %</b> and{' '}
                <b>upshift at {best.shiftRpm} rpm</b>. You'll be there in {fmt(best.tToCruise, 1)} s, using {fmt(best.fuelMl, 0)} mL over{' '}
                {fmt(sv.distanceM / 1000, 1)} km, {fmt(best.fuelAccelMl, 0)} mL of it while accelerating, at an average {fmt(best.bsfcAccel, 0)} g/kWh.
                {bestBsfc && bestBsfc !== best && (
                  <>
                    {' '}
                    The engine itself runs most efficiently within your limit at {Math.round(bestBsfc.pedal * 100)} % and {bestBsfc.shiftRpm} rpm (
                    {fmt(bestBsfc.bsfcAccel, 0)} g/kWh), but that strategy uses {fmt(bestBsfc.fuelMl - best.fuelMl, 0)} mL more over the distance.
                  </>
                )}
                {lateShift && isValid(lateShift) && lateShift !== best && (
                  <> Revving to 3500 rpm at the same pedal costs {fmt((100 * (lateShift.fuelMl - best.fuelMl)) / best.fuelMl, 1)} % more.</>
                )}
                {cheapest && cheapest !== best && (
                  <>
                    {' '}
                    Taking it slower saves at most another {fmt((100 * (best.fuelMl - cheapest.fuelMl)) / best.fuelMl, 1)} % ({fmt(cheapest.tToCruise, 0)} s to
                    cruising speed).
                  </>
                )}
              </>
            ) : (
              <>No strategy reaches {sv.toKmh} km/h within {limit} s on this gradient. Raise the time limit or lower the cruising speed.</>
            )}
          </div>

          <div className="accel-cards">
            <StrategyCard title={`Most economical within ${limit} s`} r={best} best={best} toKmh={sv.toKmh} km={sv.distanceM / 1000} />
            <StrategyCard title="Quickest (floored)" r={quickest} best={best} toKmh={sv.toKmh} km={sv.distanceM / 1000} />
            <StrategyCard title="Least fuel, no time limit" r={cheapest} best={best} toKmh={sv.toKmh} km={sv.distanceM / 1000} />
            <StrategyCard title="Eco driver model" r={study.eco} best={best} toKmh={sv.toKmh} km={sv.distanceM / 1000} note="Smooth, early shifts" />
            <StrategyCard title="Everyday driver model" r={study.everyday} best={best} toKmh={sv.toKmh} km={sv.distanceM / 1000} note="Later shifts" />
          </div>

          <div className="card">
            <div className="accel-heat-head">
              <h3>Every strategy</h3>
              <div className="seg" role="group" aria-label="Compare by">
                {METRICS.map((m) => (
                  <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="sub">{METRICS.find((m) => m.id === metric)!.sub}</p>
            <AccelHeatmap results={grid} best={bestByMetric} maxSeconds={limit} metric={metric} />
          </div>

          <div className="grid2">
            <div className="card">
              <h3>Fuel vs. how quickly you get there</h3>
              <p className="sub">Accelerating more slowly always saves some fuel, because more of the distance is driven slowly. The line shows how much each extra second buys.</p>
              <UChart opts={tradeOpts} data={tradeData} height={240} optsKey={`trade-${limit}-${sv.distanceM}`} />
            </div>
            <div className="card">
              <h3>Speed</h3>
              <p className="sub">The most economical strategy within your limit, the quickest one and the eco driver model.</p>
              <UChart opts={speedOpts} data={speedData} height={240} optsKey={`speed-${speedSeries.map((l) => l.label).join()}`} />
            </div>
          </div>

          <p className="small muted">
            Model-based, not measured. The result follows the engine's fuel map: a diesel is most efficient at high load and low rpm, so a firm
            pedal with early upshifts usually beats a feather-light pedal (very low load is inefficient) and beats revving out each gear.
          </p>
        </>
      )}
    </div>
  );
}
