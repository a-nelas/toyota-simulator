import type { OperatingPoint, PointStatus } from '../physics/steadyState';
import { C, fmt } from './theme';

const STATUS: Record<PointStatus, { label: string; color: string }> = {
  ok: { label: 'OK', color: C.good },
  fuelCut: { label: 'Fuel cut: engine braking, 0 L/h', color: C.good },
  braking: { label: 'Fuel cut + service brakes needed', color: C.warning },
  lugging: { label: 'Lugging: rpm too low for this gear', color: C.serious },
  overRev: { label: 'Over the rev limit', color: C.critical },
  noTorque: { label: "Can't hold this speed in this gear", color: C.critical },
  idle: { label: 'Standing still, engine idling', color: C.text2 },
};

/** Trip-computer style overlay for the current operating point. */
export function Readout({ p, band, maxKmh }: { p: OperatingPoint; band: [number, number]; maxKmh: number | null }) {
  const st = STATUS[p.status];
  const moving = p.speedKmh > 0.5;
  return (
    <div className="mid" aria-live="polite">
      <div className="big">
        {moving ? fmt(p.lPer100, 1) : fmt(p.fuelLh, 2)}
        <small>{moving ? 'L/100 km' : 'L/h'}</small>
      </div>
      <div className="band">
        {moving && Number.isFinite(band[0]) ? `model range ${fmt(band[0], 1)}–${fmt(band[1], 1)} (10–90 %)` : ' '}
      </div>
      <dl>
        <dt>Fuel flow</dt>
        <dd>{fmt(p.fuelLh, 2)} L/h</dd>
        <dt>Gear · engine</dt>
        <dd>
          {p.status === 'idle' ? 'N' : p.gear} · {fmt(p.rpm, 0)} rpm
        </dd>
        <dt>Torque · load</dt>
        <dd>
          {fmt(p.engineTorqueNm, 0)} Nm · {fmt(p.loadPct, 0)} %
        </dd>
        <dt>Engine efficiency</dt>
        <dd>{p.fuelW > 0 ? `${fmt(p.brakeEfficiency * 100, 1)} %` : '—'}</dd>
        <dt>BSFC</dt>
        <dd>{Number.isFinite(p.bsfc) ? `${fmt(p.bsfc, 0)} g/kWh` : '—'}</dd>
        <dt>Cost</dt>
        <dd>{moving ? `€${fmt(p.eurPer100, 2)} /100 km` : '—'}</dd>
        <dt>CO₂</dt>
        <dd>{moving ? `${fmt(p.co2gkm, 0)} g/km` : '—'}</dd>
        <dt>Range (50 L)</dt>
        <dd>{moving && Number.isFinite(p.rangeKm) ? `${fmt(p.rangeKm, 0)} km` : '—'}</dd>
        {maxKmh !== null && (
          <>
            <dt>Max speed in gear</dt>
            <dd>{maxKmh > 0 ? `${maxKmh} km/h` : '—'}</dd>
          </>
        )}
      </dl>
      <div className="status">
        <span className="dot" style={{ background: st.color }} />
        {st.label}
      </div>
    </div>
  );
}
