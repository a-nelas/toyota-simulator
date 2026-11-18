import { SPEC } from '../physics/vehicle';
import { WINDOW_COEFFS, ACCESSORIES } from '../physics/aero';
import { UNCERTAINTY } from '../physics/steadyState';
import { TYPE_APPROVAL } from '../physics/scenario';
import { ETA_I_MAX } from '../physics/engine';
import { OVERALL_RATIOS } from '../physics/drivetrain';

const LABELS: Record<string, string> = {
  displacement: 'Displacement',
  boreStroke: 'Bore × stroke',
  compression: 'Compression ratio',
  maxPower: 'Max power',
  maxTorque: 'Max torque',
  railPressure: 'Common-rail pressure',
  gearing: 'Gearing',
  reverse: 'Reverse gearing',
  cd: 'Drag coefficient',
  frontalArea: 'Frontal area',
  dimensions: 'Dimensions',
  tracks: 'Track',
  kerbMass: 'Kerb mass',
  gvw: 'Gross vehicle weight',
  tank: 'Fuel tank',
  topSpeed: 'Top speed',
  zeroTo100: '0–100 km/h',
  nedc15: 'NEDC (15")',
  nedc16: 'NEDC (15–16")',
  realWorld: 'Real-world average',
};

export function ModelCardPage() {
  return (
    <div className="page">
      <div className="card">
        <h3>Vehicle data and sources</h3>
        <p className="sub">Toyota Auris Touring Sports (E180 facelift) 1.4 D-4D 90 cv, 1ND-TV, 6-speed manual, Euro 6.</p>
        <table className="data">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(SPEC).map(([k, v]) => (
              <tr key={k}>
                <td>{LABELS[k] ?? k}</td>
                <td>
                  {Array.isArray(v.value) ? v.value.join(' / ') : String(v.value)} {v.unit}
                  {'uncertainty' in v && v.uncertainty ? <span className="muted"> ({v.uncertainty})</span> : null}
                </td>
                <td className="small muted">
                  {v.source}
                  {'estimate' in v && v.estimate ? <b style={{ color: 'var(--warning)' }}> · estimate</b> : null}
                </td>
              </tr>
            ))}
            <tr>
              <td>Overall ratios (derived)</td>
              <td>{OVERALL_RATIOS.map((r) => r.toFixed(2)).join(' / ')}</td>
              <td className="small muted">Engine revs per wheel rev, from km77 km/h per 1000 rpm and the 205/55 R16 rolling radius</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>How the model works</h3>
        <ul className="small" style={{ color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Road load:</b> F = m·g·Crr(v, p)·cos θ + m·g·sin θ + ½ρ(Cd + ΔCd<sub>windows</sub>)A·v<sub>air</sub>² + ΔCdA<sub>roof/rack</sub>. Air density
            from temperature, altitude (barometric) and humidity. Crr rises 15 % by 100 km/h and with low tyre pressure. Crosswind raises Cd
            with yaw angle.
          </li>
          <li>
            <b>Drivetrain:</b> per-gear mesh efficiency (95.5–96.2 %) plus speed-dependent spin losses; rotating inertia of engine, flywheel
            and wheels reflected through each gear.
          </li>
          <li>
            <b>Engine:</b> full-load curve through 205 Nm (1400–2800 rpm) and 66 kW (3800 rpm). Fuel = (brake + friction + pumping work) ÷
            indicated efficiency. Friction is Chen–Flynn in mean piston speed. Indicated efficiency falls at light load, near full load and
            away from ~2000 rpm. Peak ηᵢ = {ETA_I_MAX}; minimum BSFC ≈ 220 g/kWh. Overrun fuel cut above 1100 rpm. Cold oil raises friction
            up to 1.8×. Turbo lag is modelled in drive mode.
          </li>
          <li>
            <b>A/C:</b> cabin heat balance (sun through glass, conduction, occupants, engine bay, fresh-air sensible + latent load). The
            compressor draws evaporator load ÷ COP; COP falls with ambient temperature and compressor speed, and at low road speed (condenser
            airflow). Minimum 600 W evaporator load while on (dehumidify + reheat).
          </li>
          <li>
            <b>Open windows:</b> ΔCd = {WINDOW_COEFFS.front} per front and {WINDOW_COEFFS.rear} per rear window (× opening^1.5), +
            {WINDOW_COEFFS.crossFlow} when front and rear are open together. All four open ≈ +0.07 (+25 %).
          </li>
          <li>
            <b>Accessories (ΔCdA, m²):</b>{' '}
            {Object.values(ACCESSORIES)
              .filter((a) => a.deltaCdA > 0)
              .map((a) => `${a.label} ${a.deltaCdA}`)
              .join(' · ')}
            .
          </li>
          <li>
            <b>Type-approval mode:</b> mass {TYPE_APPROVAL.massKg} kg, Crr ×{TYPE_APPROVAL.crrScale}, CdA ×{TYPE_APPROVAL.cdaScale} (ICCT
            “From laboratory to road”), {TYPE_APPROVAL.electricW} W electrical, {TYPE_APPROVAL.tempC} °C, no A/C.
          </li>
          <li>
            <b>Real-world extras:</b> diesel particulate filter regenerations +1.5 % on average. This engine has no Stop &amp; Start, so it idles at every stop.
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>Uncertainty used for the bands (1 σ)</h3>
        <table className="data" style={{ maxWidth: 520 }}>
          <tbody>
            <tr>
              <td>Cd·A</td>
              <td className="num">±{UNCERTAINTY.cda * 100} %</td>
            </tr>
            <tr>
              <td>Rolling resistance</td>
              <td className="num">±{UNCERTAINTY.crr * 100} %</td>
            </tr>
            <tr>
              <td>Engine efficiency</td>
              <td className="num">±{UNCERTAINTY.eff * 100} %</td>
            </tr>
            <tr>
              <td>Open-window ΔCd</td>
              <td className="num">±{UNCERTAINTY.window * 100} %</td>
            </tr>
            <tr>
              <td>A/C compressor load</td>
              <td className="num">±{UNCERTAINTY.ac * 100} %</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
