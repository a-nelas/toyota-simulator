import { useMemo } from 'react';
import { NEDC } from '../physics/cycles';
import { NORMAL_DRIVER } from '../physics/dynamics';
import { ROUTES } from '../physics/routes';
import { DEFAULT_SCENARIO, type Scenario } from '../physics/scenario';
import { runAcceleration, runCycle, runRoute } from '../physics/simulate';
import { solveGear } from '../physics/steadyState';
import { SPEC } from '../physics/vehicle';
import { useStore } from '../state/store';
import { C, fmt } from './theme';

interface Row {
  item: string;
  published: string;
  model: number;
  unit: string;
  ref?: number;
  tol?: number;
  note: string;
  calibrated?: number;
}

function compute(cal: Scenario['calibration']): Row[] {
  const base: Scenario = { ...DEFAULT_SCENARIO };
  const ta: Scenario = { ...base, roadLoadMode: 'typeApproval' };
  const nedc = runCycle(ta, NEDC, { coldStart: true });
  const [u16, e16, c16] = SPEC.nedc16.value;
  const acc = runAcceleration(base, 120);
  const commute = ROUTES.find((r) => r.id === 'commute')!;
  const real = runRoute(base, commute, { coldStart: true, driver: NORMAL_DRIVER });
  const calibrated = cal.fuelScale !== 1 || cal.roadLoadScale !== 1;
  const realCal = calibrated ? runRoute({ ...base, calibration: cal }, commute, { coldStart: true, driver: NORMAL_DRIVER }).lPer100 : undefined;
  const steady = (kmh: number, s: Scenario = base) => solveGear({ ...s, speedKmh: kmh }, 6).lPer100;
  return [
    { item: 'NEDC urban (cold start)', published: `${u16}`, model: nedc.phases[0].lPer100, unit: 'L/100 km', ref: u16, tol: 0.15, note: 'Toyota TS spec, 15–16" wheels. Lab road load, inertia class 1360 kg.' },
    { item: 'NEDC extra-urban', published: `${e16}`, model: nedc.phases[1].lPer100, unit: 'L/100 km', ref: e16, tol: 0.05, note: 'The engine model is calibrated on this figure.' },
    { item: 'NEDC combined', published: `${c16}`, model: nedc.lPer100, unit: 'L/100 km', ref: c16, tol: 0.08, note: '' },
    { item: '0–100 km/h', published: `${SPEC.zeroTo100.value}`, model: acc.t100 ?? NaN, unit: 's', ref: SPEC.zeroTo100.value, tol: 0.05, note: 'Full throttle, shifts at 4300 rpm (0.5 s), turbo lag modelled.' },
    { item: 'Top speed', published: `${SPEC.topSpeed.value}`, model: acc.topKmh, unit: 'km/h', ref: SPEC.topSpeed.value, tol: 0.06, note: '66 kW against Cd·A 0.61 m²; Toyota quotes a conservative figure.' },
    {
      item: 'Real-world mixed commute',
      published: `${SPEC.realWorld.value}`,
      model: real.lPer100,
      calibrated: realCal,
      unit: 'L/100 km',
      ref: SPEC.realWorld.value,
      tol: 0.12,
      note: 'Owner average (Honest John). Model: 40 km city + 90 + 120 km/h, cold start, everyday driver, 20 °C. Owner averages also include winter, short trips and faster motorway driving.',
    },
    { item: 'Steady 90 km/h, 6th', published: '—', model: steady(90), unit: 'L/100 km', note: 'Flat, 20 °C, driver only, no A/C.', calibrated: calibrated ? steady(90, { ...base, calibration: cal }) : undefined },
    { item: 'Steady 120 km/h, 6th', published: '—', model: steady(120), unit: 'L/100 km', note: '', calibrated: calibrated ? steady(120, { ...base, calibration: cal }) : undefined },
  ];
}

export function ValidationPage() {
  const cal = useStore((s) => s.scenario.calibration);
  const rows = useMemo(() => compute(cal), [cal]);
  const calibrated = rows.some((r) => r.calibrated !== undefined);
  return (
    <div className="page">
      <div className="card">
        <h3>Model vs published figures</h3>
        <p className="sub">
          Computed live from the same physics the rest of the app uses, uncalibrated, at the default 205/55 R16 setup. Green = within the
          stated tolerance; amber = outside it.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Check</th>
              <th className="num">Published</th>
              <th className="num">Model</th>
              {calibrated && <th className="num">Your calibration</th>}
              <th className="num">Difference</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.ref ? r.model / r.ref - 1 : NaN;
              const ok = r.tol !== undefined && Number.isFinite(diff) ? Math.abs(diff) <= r.tol : null;
              return (
                <tr key={r.item}>
                  <td>{r.item}</td>
                  <td className="num">
                    {r.published} {r.published !== '—' ? r.unit : ''}
                  </td>
                  <td className="num">
                    <b>{fmt(r.model, r.unit === 'km/h' ? 0 : 2)}</b> {r.unit}
                  </td>
                  {calibrated && <td className="num">{r.calibrated !== undefined ? `${fmt(r.calibrated, 2)} ${r.unit}` : ''}</td>}
                  <td className="num">
                    {Number.isFinite(diff) ? (
                      <span className="pill">
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: ok ? C.good : C.warning, display: 'inline-block' }} />
                        {diff > 0 ? '+' : ''}
                        {(diff * 100).toFixed(1)} %{ok ? '' : ' (outside ±' + ((r.tol ?? 0) * 100).toFixed(0) + ' %)'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="small muted">{r.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Reading this honestly</h3>
        <ul className="small" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
          <li>
            Toyota publishes no engine fuel map, so the 1ND-TV map is a physics-based (Willans / Chen–Flynn) model whose peak efficiency is
            fitted so that the simulated NEDC extra-urban phase matches Toyota's 3.7 L/100 km. Everything else is a prediction.
          </li>
          <li>
            The NEDC urban phase runs high (about +15 %). Type approval used test-cell tricks (battery discharge, optimised cold-start
            calibrations, gear-shift tolerances) that this model only partly reproduces.
          </li>
          <li>
            The two least certain inputs are the open-window drag increase (no published Auris data; ±50 %) and the A/C load (±25 %). Both
            carry visible uncertainty bands in the charts.
          </li>
          <li>The frontal area (2.18 m²) is estimated from the car's width and height; it moves highway figures roughly 1:1 with aero share.</li>
          <li>Use the Calibrate tab with your own fill-ups to pull the model onto your car.</li>
        </ul>
      </div>
    </div>
  );
}
