import type { OperatingPoint } from '../physics/steadyState';
import { C, fmt } from './theme';

/** Where the fuel's chemical energy goes at the current operating point. */
export function Breakdown({ p }: { p: OperatingPoint }) {
  if (p.fuelW <= 0) {
    return (
      <div className="card">
        <h3>Where the fuel goes</h3>
        <p className="sub">
          No fuel is being injected: the car's momentum drives the engine (fuel cut).{' '}
          {p.gradeW < 0 ? `The slope supplies ${fmt(-p.gradeW / 1000, 1)} kW.` : ''}
        </p>
      </div>
    );
  }
  const items = [
    { label: 'Exhaust & coolant heat', w: p.heatW, color: '#5f5e5a' },
    { label: 'Engine friction & pumping', w: p.frictionW, color: C.series[6] },
    { label: 'Rolling resistance', w: p.rollW, color: C.series[0] },
    { label: 'Aerodynamic drag', w: p.aeroW, color: C.series[1] },
    { label: 'Climbing', w: Math.max(0, p.gradeW), color: C.series[2] },
    { label: 'Gearbox & driveshafts', w: Math.max(0, p.drivelineLossW), color: C.series[3] },
    { label: 'A/C compressor', w: p.acW, color: C.series[4] },
    { label: 'Alternator', w: p.alternatorW, color: C.series[5] },
  ].filter((i) => i.w > 1);
  const total = items.reduce((a, b) => a + b.w, 0);
  return (
    <div className="card">
      <h3>Where the fuel goes</h3>
      <p className="sub">
        {fmt(p.fuelW / 1000, 1)} kW of diesel energy · {fmt(p.brakeEfficiency * 100, 1)} % becomes crank power
        {p.gradeW < 0 ? ` · the slope gives back ${fmt(-p.gradeW / 1000, 1)} kW` : ''}
        {p.windowDeltaCd > 0.001 ? ` · open windows add ΔCd ${p.windowDeltaCd.toFixed(3)} (Cd ${p.cd.toFixed(3)})` : ''}
      </p>
      <div className="stackbar" role="img" aria-label="Fuel energy breakdown">
        {items.map((i) => (
          <div key={i.label} style={{ flex: i.w / total, background: i.color }} title={`${i.label}: ${fmt(i.w / 1000, 2)} kW`} />
        ))}
      </div>
      <div className="legend">
        {items.map((i) => (
          <span key={i.label}>
            <span className="sw" style={{ background: i.color }} />
            {i.label} <b>{fmt(i.w / 1000, 2)} kW</b> <span className="muted">({fmt((100 * i.w) / total, 0)} %)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
