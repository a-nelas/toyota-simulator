import { useMemo, useState } from 'react';
import type uPlot from 'uplot';
import { CYCLES } from '../physics/cycles';
import { DRIVERS, type DriverStyle } from '../physics/dynamics';
import { ROUTES, routeFromGpx, type Route } from '../physics/routes';
import { runCycle, runRoute, type RunSummary } from '../physics/simulate';
import { useStore } from '../state/store';
import { UChart, axis, type ChartOpts } from './charts/UChart';
import { C, fmt } from './theme';

function TraceChart({ r, field, label, color, target }: { r: RunSummary; field: 'kmh' | 'rpm' | 'fuelLh' | 'elevation' | 'gear'; label: string; color: string; target?: boolean }) {
  const data = useMemo(() => {
    const t = r.trace.map((p) => p.t / 60);
    const y = r.trace.map((p) => p[field]);
    return (target ? [t, r.trace.map((p) => p.targetKmh), y] : [t, y]) as uPlot.AlignedData;
  }, [r, field, target]);
  const opts: ChartOpts = useMemo(
    () => ({
      legend: { live: true, show: !!target },
      scales: { x: { time: false } },
      axes: [axis('Time (min)'), axis(label)],
      series: [
        { label: 'min', value: (_u, v) => fmt(v, 2) },
        ...(target ? [{ label: 'Target', stroke: C.muted, width: 1, dash: [4, 3], value: (_u: uPlot, v: number) => fmt(v, 1) }] : []),
        { label, stroke: color, width: 1.5, value: (_u: uPlot, v: number) => fmt(v, field === 'fuelLh' ? 2 : 0) },
      ],
    }),
    [label, color, target, field],
  );
  return <UChart opts={opts} data={data} height={150} optsKey={`${field}-${label}`} />;
}

export function RoutesPage() {
  const s = useStore((st) => st.scenario);
  const driverStyle = useStore((st) => st.driverStyle);
  const setDriverStyle = useStore((st) => st.setDriverStyle);
  const [source, setSource] = useState('commute');
  const [cold, setCold] = useState(true);
  const [gpx, setGpx] = useState<Route | null>(null);
  const [result, setResult] = useState<{ r: RunSummary; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const cyc = CYCLES.find((c) => c.id === source);
      const opts = { coldStart: cold, driver: DRIVERS[driverStyle] };
      let r: RunSummary;
      let name: string;
      if (cyc) {
        r = runCycle(s, cyc, opts);
        name = cyc.label;
      } else {
        const route = source === 'gpx' && gpx ? gpx : ROUTES.find((x) => x.id === source)!;
        r = runRoute(s, route, opts);
        name = route.label;
      }
      setResult({ r, name });
      setBusy(false);
    }, 10);
  };

  const e = result?.r.energyMJ;
  const items = e
    ? [
        { label: 'Aerodynamic drag', v: e.aero, color: C.series[1] },
        { label: 'Rolling resistance', v: e.rolling, color: C.series[0] },
        { label: 'Climbing (net)', v: Math.max(0, e.grade), color: C.series[2] },
        { label: 'Brakes', v: e.brakes, color: C.series[7] },
        { label: 'Gearbox & driveshafts', v: e.driveline, color: C.series[3] },
        { label: 'A/C', v: e.ac, color: C.series[4] },
        { label: 'Alternator', v: e.alternator, color: C.series[5] },
      ].filter((i) => i.v > 0.005)
    : [];
  const total = items.reduce((a, b) => a + b.v, 0);

  return (
    <div className="page">
      <div className="card">
        <h3>Simulate a trip</h3>
        <p className="sub">
          A driver model follows a speed trace or a route's limits, stops and gradients, shifting like a real driver. It uses all your
          Analyse settings (windows, A/C, weather, load, tyres, calibration).
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <optgroup label="Driving cycles">
              {CYCLES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Portuguese roads">
              {ROUTES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </optgroup>
            {gpx && (
              <optgroup label="Your track">
                <option value="gpx">{gpx.label}</option>
              </optgroup>
            )}
          </select>
          <div className="seg" style={{ width: 180 }}>
            {(['eco', 'normal'] as DriverStyle[]).map((d) => (
              <button key={d} aria-pressed={driverStyle === d} onClick={() => setDriverStyle(d)}>
                {d === 'eco' ? 'Eco driver' : 'Everyday driver'}
              </button>
            ))}
          </div>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={cold} onChange={(e) => setCold(e.target.checked)} /> Cold start
          </label>
          <label className="small muted">
            GPX:{' '}
            <input
              type="file"
              accept=".gpx"
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                if (!f) return;
                try {
                  setGpx(routeFromGpx(await f.text(), f.name.replace(/\.gpx$/i, '')));
                  setSource('gpx');
                } catch (err) {
                  alert(String(err));
                }
              }}
            />
          </label>
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          {CYCLES.find((c) => c.id === source)
            ? 'Tip: switch the model to “NEDC lab” in Analyse to reproduce the type-approval test.'
            : (source === 'gpx' ? gpx?.description : ROUTES.find((r) => r.id === source)?.description) ?? ''}
        </p>
      </div>

      {result && (
        <>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {[
              ['Consumption', `${fmt(result.r.lPer100, 2)} L/100 km`],
              ['Fuel used', `${fmt(result.r.fuelL, 2)} L`],
              ['Distance', `${fmt(result.r.distanceKm, 1)} km`],
              ['Time · average', `${fmt(result.r.timeS / 60, 1)} min · ${fmt(result.r.avgKmh, 0)} km/h`],
              ['Cost', `€${fmt(result.r.costEur, 2)}`],
              ['CO₂', `${fmt(result.r.co2gkm, 0)} g/km`],
            ].map(([k, v]) => (
              <div className="card" key={k}>
                <div className="small muted">{k}</div>
                <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          {result.r.phases.length > 0 && (
            <div className="card">
              <h3>Phases</h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th className="num">Distance</th>
                    <th className="num">Fuel</th>
                    <th className="num">L/100 km</th>
                  </tr>
                </thead>
                <tbody>
                  {result.r.phases.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{fmt(p.distanceKm, 2)} km</td>
                      <td className="num">{fmt(p.fuelL, 3)} L</td>
                      <td className="num">{fmt(p.lPer100, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card">
            <h3>Where the energy at the wheels and accessories went</h3>
            <p className="sub">
              {fmt(e!.fuel, 1)} MJ of diesel burned · {fmt((100 * total) / e!.fuel, 0)} % reached the wheels and accessories · Stop &amp; Start
              restarts: {result.r.restarts}
            </p>
            <div className="stackbar">
              {items.map((i) => (
                <div key={i.label} style={{ flex: i.v, background: i.color }} title={`${i.label}: ${fmt(i.v, 2)} MJ`} />
              ))}
            </div>
            <div className="legend">
              {items.map((i) => (
                <span key={i.label}>
                  <span className="sw" style={{ background: i.color }} />
                  {i.label} <b>{fmt(i.v, 2)} MJ</b>
                </span>
              ))}
            </div>
          </div>
          <div className="grid2">
            <div className="card">
              <h3>Speed</h3>
              <TraceChart r={result.r} field="kmh" label="km/h" color={C.series[0]} target />
            </div>
            <div className="card">
              <h3>Fuel flow</h3>
              <TraceChart r={result.r} field="fuelLh" label="L/h" color={C.series[1]} />
            </div>
            <div className="card">
              <h3>Engine speed</h3>
              <TraceChart r={result.r} field="rpm" label="rpm" color={C.series[6]} />
            </div>
            <div className="card">
              <h3>{CYCLES.find((c) => c.id === source) ? 'Gear' : 'Elevation'}</h3>
              <TraceChart
                r={result.r}
                field={CYCLES.find((c) => c.id === source) ? 'gear' : 'elevation'}
                label={CYCLES.find((c) => c.id === source) ? 'gear' : 'm (relative)'}
                color={C.series[2]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
