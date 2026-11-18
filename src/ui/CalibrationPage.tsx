import { useState } from 'react';
import { fitCalibration, type FitResult, type TripEntry, type TripType } from '../physics/calibration';
import { useStore } from '../state/store';
import { fmt } from './theme';

const EMPTY: Omit<TripEntry, 'id'> = {
  label: '',
  distanceKm: 50,
  avgSpeedKmh: 70,
  type: 'mixed',
  acOn: false,
  tempC: 20,
  lPer100: 5.0,
  source: 'tripComputer',
  coldStart: true,
};

export function CalibrationPage() {
  const s = useStore((st) => st.scenario);
  const trips = useStore((st) => st.trips);
  const setTrips = useStore((st) => st.setTrips);
  const optimism = useStore((st) => st.optimism);
  const setOptimism = useStore((st) => st.setOptimism);
  const setCalibration = useStore((st) => st.setCalibration);
  const [draft, setDraft] = useState(EMPTY);
  const [litres, setLitres] = useState('');
  const [fit, setFit] = useState<FitResult | null>(null);
  const [busy, setBusy] = useState(false);

  const add = () => {
    let l = draft.lPer100;
    if (draft.source === 'fillUp' && litres) l = (parseFloat(litres) / draft.distanceKm) * 100;
    setTrips([...trips, { ...draft, lPer100: l, id: crypto.randomUUID(), label: draft.label || `Trip ${trips.length + 1}` }]);
    setFit(null);
  };

  const runFit = () => {
    setBusy(true);
    setTimeout(() => {
      setFit(fitCalibration({ ...s, calibration: { fuelScale: 1, roadLoadScale: 1 } }, trips, optimism));
      setBusy(false);
    }, 10);
  };

  const num = (k: keyof typeof draft, step = 1) => (
    <input
      type="number"
      step={step}
      value={draft[k] as number}
      onChange={(e) => setDraft({ ...draft, [k]: parseFloat(e.target.value) || 0 })}
      style={{ width: 90 }}
    />
  );

  return (
    <div className="page">
      <div className="card">
        <h3>Calibrate to your Auris</h3>
        <p className="sub">
          Enter trips you know: the average shown by the trip computer, or (better) litres filled ÷ km since the last full tank. Each trip
          is simulated on a representative route of the same type and speed. The fit corrects engine efficiency, and, when you give both
          city and motorway trips, road load as well. Corrections are bounded (fuel 0.85–1.25×, road load 0.85–1.2×).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label className="small">
            Name
            <br />
            <input type="text" value={draft.label} placeholder="Lisbon → Porto" onChange={(e) => setDraft({ ...draft, label: e.target.value })} style={{ width: '100%' }} />
          </label>
          <label className="small">
            Type
            <br />
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TripType })}>
              <option value="city">City</option>
              <option value="mixed">Mixed</option>
              <option value="highway">Motorway</option>
            </select>
          </label>
          <label className="small">
            Distance (km)
            <br />
            {num('distanceKm')}
          </label>
          <label className="small">
            Average speed (km/h)
            <br />
            {num('avgSpeedKmh')}
          </label>
          <label className="small">
            Outside temp (°C)
            <br />
            {num('tempC')}
          </label>
          <label className="small">
            Source
            <br />
            <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as TripEntry['source'] })}>
              <option value="tripComputer">Trip computer</option>
              <option value="fillUp">Fill-up (litres)</option>
            </select>
          </label>
          {draft.source === 'fillUp' ? (
            <label className="small">
              Litres filled
              <br />
              <input type="number" step={0.01} value={litres} onChange={(e) => setLitres(e.target.value)} style={{ width: 90 }} />
            </label>
          ) : (
            <label className="small">
              Displayed L/100 km
              <br />
              {num('lPer100', 0.1)}
            </label>
          )}
          <label className="check small" style={{ margin: 0 }}>
            <input type="checkbox" checked={draft.acOn} onChange={(e) => setDraft({ ...draft, acOn: e.target.checked })} /> A/C on
          </label>
          <label className="check small" style={{ margin: 0 }}>
            <input type="checkbox" checked={draft.coldStart} onChange={(e) => setDraft({ ...draft, coldStart: e.target.checked })} /> Started cold
          </label>
          <button className="btn" onClick={add}>
            Add trip
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Your trips</h3>
        {trips.length === 0 ? (
          <p className="sub">No trips yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Type</th>
                <th className="num">km</th>
                <th className="num">avg km/h</th>
                <th className="num">°C</th>
                <th>A/C</th>
                <th>Source</th>
                <th className="num">L/100 km</th>
                {fit && <th className="num">Model before</th>}
                {fit && <th className="num">Model after</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const r = fit?.residuals.find((x) => x.id === t.id);
                return (
                  <tr key={t.id}>
                    <td>{t.label}</td>
                    <td>{t.type}</td>
                    <td className="num">{fmt(t.distanceKm, 0)}</td>
                    <td className="num">{fmt(t.avgSpeedKmh, 0)}</td>
                    <td className="num">{fmt(t.tempC, 0)}</td>
                    <td>{t.acOn ? 'on' : 'off'}</td>
                    <td>{t.source === 'fillUp' ? 'fill-up' : 'trip computer'}</td>
                    <td className="num">
                      {fmt(t.lPer100, 2)}
                      {r && t.source === 'tripComputer' ? <span className="muted"> → {fmt(r.measured, 2)}</span> : null}
                    </td>
                    {fit && <td className="num">{r ? fmt(r.predicted, 2) : ''}</td>}
                    {fit && <td className="num">{r ? fmt(r.calibrated, 2) : ''}</td>}
                    <td>
                      <button className="btn" onClick={() => setTrips(trips.filter((x) => x.id !== t.id))} aria-label={`Remove ${t.label}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="row" style={{ maxWidth: 420, marginTop: 12 }}>
          <label htmlFor="opt">Trip computer reads low by</label>
          <output>{(optimism * 100).toFixed(0)} %</output>
          <input id="opt" type="range" min={0} max={10} step={1} value={optimism * 100} onChange={(e) => setOptimism(parseFloat(e.target.value) / 100)} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!trips.length || busy} onClick={runFit}>
            {busy ? 'Fitting…' : 'Fit model'}
          </button>
          {fit && (
            <button className="btn" onClick={() => setCalibration({ fuelScale: fit.fuelScale, roadLoadScale: fit.roadLoadScale })}>
              Apply calibration
            </button>
          )}
          <button className="btn" onClick={() => setCalibration({ fuelScale: 1, roadLoadScale: 1 })}>
            Clear calibration
          </button>
        </div>
        {fit && (
          <p className="small" style={{ color: 'var(--text-secondary)' }}>
            Fuel ×<b>{fit.fuelScale.toFixed(3)}</b>, road load ×<b>{fit.roadLoadScale.toFixed(2)}</b>
            {fit.fittedRoadLoad ? '' : ' (not fitted: needs ≥ 3 trips including motorway and city/mixed)'}. Error {fmt(fit.rmsBeforePct, 1)} % →{' '}
            {fmt(fit.rmsAfterPct, 1)} % RMS.
            {(fit.fuelScale >= 1.249 || fit.fuelScale <= 0.851) && ' ⚠ Hit the correction limit: check the entries (units, full-tank fill-ups).'}
          </p>
        )}
      </div>
    </div>
  );
}
