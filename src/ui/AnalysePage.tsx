import { useMemo, useState } from 'react';
import { maxSustainableSpeed, solve, uncertaintyBand } from '../physics/steadyState';
import { useStore } from '../state/store';
import { AnalyseScene, CAMERA_VIEWS, type CameraView, type SceneToggles } from '../scene/AnalyseScene';
import { PAINTS } from '../scene/CarModel';
import { Breakdown } from './Breakdown';
import { Controls } from './Controls';
import { Readout } from './Readout';
import { BsfcMap } from './charts/BsfcMap';
import { GearChart } from './charts/GearChart';
import { GradeHeatmap } from './charts/GradeHeatmap';
import { PowerStack } from './charts/PowerStack';
import { WindowsAcChart } from './charts/WindowsAcChart';

export function AnalysePage() {
  const s = useStore((st) => st.scenario);
  const set = useStore((st) => st.set);
  const setWindow = useStore((st) => st.setWindow);
  const [toggles, setToggles] = useState<SceneToggles>({ airflow: true, forces: true, paint: '#aeb3b8' });

  const result = useMemo(() => solve(s), [s]);
  const p = result.point;
  const band = useMemo(
    () => (p.speedKmh > 0.5 ? uncertaintyBand(s, p.gear, 150) : ([NaN, NaN] as [number, number])),
    [s, p.gear, p.speedKmh],
  );
  const maxKmh = useMemo(() => (s.gear === 'auto' ? null : maxSustainableSpeed(s, p.gear)), [s, p.gear]);
  const scaleKey = JSON.stringify(s.calibration);

  return (
    <div className="analyse">
      <Controls byGear={result.byGear} />
      <div className="content">
        <div className="scene-wrap">
          <AnalyseScene
            s={s}
            p={p}
            toggles={toggles}
            onWindowClick={(i) => setWindow(i, s.windows[i] > 0.5 ? 0 : 1)}
          />
          <div className="scene-toggles">
            <button aria-pressed={toggles.airflow} onClick={() => setToggles({ ...toggles, airflow: !toggles.airflow })}>
              Airflow
            </button>
            <button aria-pressed={toggles.forces} onClick={() => setToggles({ ...toggles, forces: !toggles.forces })}>
              Forces
            </button>
            {(Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => (
              <button key={v} onClick={() => setToggles({ ...toggles, view: { id: v, nonce: Date.now() } })}>
                {CAMERA_VIEWS[v].label}
              </button>
            ))}
            <select
              aria-label="Paint"
              value={toggles.paint}
              onChange={(e) => setToggles({ ...toggles, paint: e.target.value })}
              style={{ fontSize: 12, padding: '2px 4px', background: 'rgba(0,0,0,0.5)' }}
            >
              {Object.entries(PAINTS).map(([k, v]) => (
                <option key={k} value={v}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <Readout p={p} band={band} maxKmh={maxKmh} />
          <div className="scene-hint">Drag to orbit · scroll to zoom · click a side window to open or close it · airflow is illustrative, not CFD</div>
        </div>

        <Breakdown p={p} />

        <div className="grid2">
          <div className="card">
            <h3>Consumption by gear</h3>
            <p className="sub">
              L/100 km at steady speed in each gear, {s.gradePct.toFixed(1)} % grade. Dashed: most economical gear. Dot: current point.
            </p>
            <GearChart s={s} current={{ kmh: s.speedKmh, l: Number.isFinite(p.lPer100) ? p.lPer100 : 0 }} />
          </div>
          <div className="card">
            <h3>Open windows vs air conditioning</h3>
            <p className="sub">
              {s.weather.tempC.toFixed(0)} °C, sun {s.weather.solarWm2} W/m², setpoint {s.ac.setpointC} °C
              {s.ac.recirculation ? ', recirculation' : ', fresh air'}. Shaded: 10–90 % model range for the windows.
            </p>
            <WindowsAcChart s={s} />
          </div>
          <div className="card">
            <h3>Speed × gradient map</h3>
            <p className="sub">L/100 km in the best gear for every speed and slope, current load and weather.</p>
            <GradeHeatmap s={s} onPick={(kmh, g) => set({ speedKmh: kmh, gradePct: g })} />
          </div>
          <div className="card">
            <h3>Engine fuel map, 1ND-TV</h3>
            <p className="sub">Brake-specific fuel consumption (g/kWh). The numbered dots show the engine in each gear at the current speed.</p>
            <BsfcMap points={result.byGear} selectedGear={p.gear} scaleKey={scaleKey} />
          </div>
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>Power demand by speed</h3>
            <p className="sub">Engine output needed to hold each speed (best gear), split by what it is spent on.</p>
            <PowerStack s={s} />
          </div>
        </div>
      </div>
    </div>
  );
}
