import { WEATHER_PRESETS } from '../physics/atmosphere';
import { ACCESSORIES, WINDOW_LABELS, buffetingRisk, type AccessoryId } from '../physics/aero';
import { TYRES, type TyreId } from '../physics/tyres';
import type { OperatingPoint } from '../physics/steadyState';
import { isFeasible } from '../physics/steadyState';
import { useStore } from '../state/store';

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  onChange: (v: number) => void;
}) {
  const id = `s-${props.label.replace(/\W+/g, '-')}`;
  return (
    <div className="row">
      <label htmlFor={id}>{props.label}</label>
      <output htmlFor={id}>
        {props.value.toFixed(props.digits ?? 0)}
        {props.unit ? ` ${props.unit}` : ''}
      </output>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Controls({ byGear }: { byGear: OperatingPoint[] }) {
  const s = useStore((st) => st.scenario);
  const set = useStore((st) => st.set);
  const setWeather = useStore((st) => st.setWeather);
  const setAc = useStore((st) => st.setAc);
  const setWindow = useStore((st) => st.setWindow);
  const reset = useStore((st) => st.reset);
  const luggage = Math.max(0, s.payloadKg - (s.occupants - 1) * 75);
  const buffet = buffetingRisk(s.windows, s.speedKmh);

  return (
    <aside className="sidebar">
      <fieldset>
        <legend>Driving</legend>
        <Slider label="Speed" value={s.speedKmh} min={0} max={185} step={1} unit="km/h" onChange={(v) => set({ speedKmh: v })} />
        <Slider label="Gradient" value={s.gradePct} min={-12} max={12} step={0.5} unit="%" digits={1} onChange={(v) => set({ gradePct: v })} />
        <div className="section-title" style={{ marginTop: 4 }}>
          Gear
        </div>
        <div className="seg" role="group" aria-label="Gear">
          <button aria-pressed={s.gear === 'auto'} onClick={() => set({ gear: 'auto' })} title="Most economical gear that can hold the speed">
            Auto
          </button>
          {[1, 2, 3, 4, 5, 6].map((g) => {
            const p = byGear[g - 1];
            const ok = p && isFeasible(p);
            return (
              <button
                key={g}
                aria-pressed={s.gear === g}
                onClick={() => set({ gear: g })}
                title={p ? `${p.rpm.toFixed(0)} rpm${ok ? '' : ' (not possible: ' + p.status + ')'}` : ''}
                style={!ok ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
              >
                {g}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Windows</legend>
        {WINDOW_LABELS.map((l, i) => (
          <Slider key={l} label={l} value={s.windows[i] * 100} min={0} max={100} step={5} unit="%" onChange={(v) => setWindow(i, v / 100)} />
        ))}
        <div className="seg">
          <button onClick={() => set({ windows: [0, 0, 0, 0] })}>Close all</button>
          <button onClick={() => set({ windows: [0.5, 0.5, 0, 0] })}>Fronts ½</button>
          <button onClick={() => set({ windows: [1, 1, 1, 1] })}>All open</button>
        </div>
        {buffet && (
          <p className="small" style={{ color: 'var(--warning)' }}>
            ⚠ One rear window open alone at this speed causes low-frequency buffeting (cabin resonance). Open a front window too.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Air conditioning</legend>
        <label className="check">
          <input type="checkbox" checked={s.ac.on} onChange={(e) => setAc({ on: e.target.checked })} /> A/C on
        </label>
        <Slider label="Setpoint" value={s.ac.setpointC} min={16} max={28} step={0.5} unit="°C" digits={1} onChange={(v) => setAc({ setpointC: v })} />
        <label className="check">
          <input type="checkbox" checked={s.ac.recirculation} onChange={(e) => setAc({ recirculation: e.target.checked })} /> Recirculation
        </label>
        <div className="section-title">Blower</div>
        <div className="seg">
          {[0, 1, 2, 3, 4].map((b) => (
            <button key={b} aria-pressed={s.ac.blower === b} onClick={() => setAc({ blower: b })}>
              {b}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Weather &amp; place</legend>
        <div className="row">
          <label htmlFor="preset">Preset</label>
          <select
            id="preset"
            value=""
            onChange={(e) => e.target.value && setWeather(WEATHER_PRESETS[e.target.value].weather)}
            style={{ gridColumn: '1 / -1' }}
          >
            <option value="">Choose a Portuguese preset…</option>
            {Object.entries(WEATHER_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <Slider label="Temperature" value={s.weather.tempC} min={-5} max={45} step={1} unit="°C" onChange={(v) => setWeather({ tempC: v })} />
        <Slider label="Sun" value={s.weather.solarWm2} min={0} max={1000} step={50} unit="W/m²" onChange={(v) => setWeather({ solarWm2: v })} />
        <Slider label="Humidity" value={s.weather.rhPct} min={5} max={100} step={5} unit="%" onChange={(v) => setWeather({ rhPct: v })} />
        <Slider label="Altitude" value={s.weather.altitudeM} min={0} max={2000} step={50} unit="m" onChange={(v) => setWeather({ altitudeM: v })} />
        <Slider label="Headwind" value={s.weather.headwindKmh} min={-40} max={60} step={5} unit="km/h" onChange={(v) => setWeather({ headwindKmh: v })} />
        <Slider label="Crosswind" value={s.weather.crosswindKmh} min={0} max={60} step={5} unit="km/h" onChange={(v) => setWeather({ crosswindKmh: v })} />
      </fieldset>

      <fieldset>
        <legend>Load &amp; car</legend>
        <Slider
          label="People (incl. driver)"
          value={s.occupants}
          min={1}
          max={5}
          step={1}
          onChange={(v) => set({ occupants: v, payloadKg: (v - 1) * 75 + luggage })}
        />
        <Slider label="Luggage" value={luggage} min={0} max={300} step={10} unit="kg" onChange={(v) => set({ payloadKg: (s.occupants - 1) * 75 + v })} />
        <div className="row">
          <label htmlFor="tyre">Tyres</label>
          <select id="tyre" value={s.tyre} onChange={(e) => set({ tyre: e.target.value as TyreId, tyrePressureBar: TYRES[e.target.value as TyreId].nominalBar })}>
            {Object.keys(TYRES).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <Slider label="Tyre pressure" value={s.tyrePressureBar} min={1.6} max={3.0} step={0.1} unit="bar" digits={1} onChange={(v) => set({ tyrePressureBar: v })} />
        <div className="row">
          <label htmlFor="acc">On the roof / back</label>
          <select id="acc" value={s.accessory} onChange={(e) => set({ accessory: e.target.value as AccessoryId })}>
            {Object.entries(ACCESSORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.headlights} onChange={(e) => set({ headlights: e.target.checked })} /> Headlights
        </label>
        <label className="check">
          <input type="checkbox" checked={s.rearDefrost} onChange={(e) => set({ rearDefrost: e.target.checked })} /> Rear window heater
        </label>
        <label className="check">
          <input type="checkbox" checked={s.stopStart} onChange={(e) => set({ stopStart: e.target.checked })} /> Stop &amp; Start (drive / routes)
        </label>
      </fieldset>

      <fieldset>
        <legend>Model</legend>
        <div className="seg" style={{ marginBottom: 8 }}>
          <button aria-pressed={s.roadLoadMode === 'real'} onClick={() => set({ roadLoadMode: 'real' })}>
            Real road
          </button>
          <button aria-pressed={s.roadLoadMode === 'typeApproval'} onClick={() => set({ roadLoadMode: 'typeApproval' })}>
            NEDC lab
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          “NEDC lab” reproduces the optimistic test-bench conditions behind Toyota's 4.1 L/100 km.
        </p>
        <div className="row">
          <label htmlFor="price">Diesel price</label>
          <input
            id="price"
            type="number"
            step={0.01}
            min={0.5}
            max={3}
            value={s.fuelPriceEurL}
            onChange={(e) => set({ fuelPriceEurL: parseFloat(e.target.value) || 0 })}
            style={{ width: 80 }}
          />
        </div>
        <button className="btn" onClick={reset} style={{ width: '100%' }}>
          Reset scenario
        </button>
      </fieldset>
    </aside>
  );
}
