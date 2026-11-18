import { useEffect, useMemo, useRef, useState } from 'react';
import { contours } from 'd3-contour';
import { bsfc, fullLoadTorque } from '../../physics/engine';
import type { OperatingPoint } from '../../physics/steadyState';
import { C, rampColor } from '../theme';
import { setupCanvas, useWidth } from './canvas';
import { FUEL } from '../../physics/vehicle';

const RPM0 = 800;
const RPM1 = 4800;
const T0 = 0;
const T1 = 220;
const NX = 81;
const NY = 56;
const LEVELS = [220, 225, 230, 240, 250, 265, 285, 320, 380, 480, 650];

/** Engine fuel map (BSFC contours) with the full-load curve and the operating point in each gear. */
export function BsfcMap({ points, selectedGear, scaleKey }: { points: OperatingPoint[]; selectedGear: number; scaleKey: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; rpm: number; t: number } | null>(null);

  const grid = useMemo(() => {
    const vals = new Array<number>(NX * NY);
    for (let j = 0; j < NY; j++) {
      const t = T0 + ((T1 - T0) * j) / (NY - 1);
      for (let i = 0; i < NX; i++) {
        const rpm = RPM0 + ((RPM1 - RPM0) * i) / (NX - 1);
        const b = t > fullLoadTorque(rpm) + 3 ? 2000 : bsfc(rpm, Math.max(2, t));
        vals[j * NX + i] = Math.min(2000, b);
      }
    }
    return vals;
  }, [scaleKey]);

  const H = 320;
  const pad = { l: 50, r: 16, t: 10, b: 38 };
  const pw = width - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const xOf = (rpm: number) => pad.l + ((rpm - RPM0) / (RPM1 - RPM0)) * pw;
  const yOf = (t: number) => pad.t + ph - ((t - T0) / (T1 - T0)) * ph;

  useEffect(() => {
    if (!canvas.current) return;
    const ctx = setupCanvas(canvas.current, width, H);
    // Filled bands: lower BSFC = stronger colour.
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    ctx.fillStyle = '#20201f';
    ctx.fillRect(pad.l, pad.t, pw, ph);
    // contours() returns regions where value >= threshold. Negate BSFC so each polygon is the
    // region with BSFC <= level; d3 returns them largest-first, so efficient islands land on top.
    const inv = grid.map((v) => -v);
    const polysInv = contours().size([NX, NY]).thresholds(LEVELS.map((l) => -l).sort((a, b) => a - b))(inv);
    for (const p of polysInv) {
      const level = -p.value;
      const k = LEVELS.indexOf(level);
      const tcol = 1 - k / (LEVELS.length - 1);
      ctx.fillStyle = rampColor(0.15 + 0.85 * tcol);
      ctx.globalAlpha = 0.95;
      for (const poly of p.coordinates) {
        ctx.beginPath();
        for (const ring of poly) {
          ring.forEach(([gx, gy], idx) => {
            const x = pad.l + (gx / (NX - 1)) * pw;
            const y = pad.t + ph - (gy / (NY - 1)) * ph;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
      // Level label on the contour's first ring.
      const ring = p.coordinates[0]?.[0];
      if (ring && ring.length > 8) {
        const [gx, gy] = ring[Math.floor(ring.length * 0.15)];
        ctx.globalAlpha = 1;
        ctx.fillStyle = k < 4 ? '#ffffff' : '#0b0b0b';
        ctx.font = '10px system-ui';
        const lx = pad.l + (gx / (NX - 1)) * pw;
        const ly = pad.t + ph - (gy / (NY - 1)) * ph;
        if (lx > pad.l + 10 && lx < pad.l + pw - 20 && ly > pad.t + 8 && ly < pad.t + ph - 4) ctx.fillText(String(level), lx, ly);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Full-load curve.
    ctx.beginPath();
    for (let rpm = RPM0; rpm <= RPM1; rpm += 25) {
      const x = xOf(rpm);
      const y = yOf(fullLoadTorque(rpm));
      if (rpm === RPM0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Axes.
    ctx.fillStyle = C.muted;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    for (let r = 1000; r <= 4500; r += 500) ctx.fillText(String(r), xOf(r), H - pad.b + 15);
    ctx.fillText('Engine speed (rpm)', pad.l + pw / 2, H - 4);
    ctx.textAlign = 'right';
    for (let t = 0; t <= 200; t += 50) ctx.fillText(String(t), pad.l - 6, yOf(t) + 4);
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Torque (Nm)', 0, 0);
    ctx.restore();

    // Operating points per gear.
    for (const p of points) {
      if (p.rpm < RPM0 || p.rpm > RPM1 || p.engineTorqueNm < -5) continue;
      const x = xOf(p.rpm);
      const y = yOf(Math.min(T1, Math.max(0, p.engineTorqueNm)));
      const sel = p.gear === selectedGear;
      ctx.beginPath();
      ctx.arc(x, y, sel ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = C.series[p.gear - 1];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = sel ? '#ffffff' : C.surface;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(p.gear), x, y + 3.5);
    }
  }, [grid, width, points, selectedGear]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const rpm = RPM0 + ((x - pad.l) / pw) * (RPM1 - RPM0);
    const t = T0 + ((pad.t + ph - y) / ph) * (T1 - T0);
    if (rpm < RPM0 || rpm > RPM1 || t < 0 || t > T1) setHover(null);
    else setHover({ x, y, rpm, t });
  };

  const hb = hover && hover.t <= fullLoadTorque(hover.rpm) ? bsfc(hover.rpm, Math.max(1, hover.t)) : null;
  return (
    <div ref={wrapRef} className="canvas-chart">
      <canvas ref={canvas} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 190), top: hover.y + 12 }}>
          {hover.rpm.toFixed(0)} rpm, {hover.t.toFixed(0)} Nm ({((hover.t * hover.rpm * Math.PI) / 30000).toFixed(1)} kW)
          <br />
          {hb !== null ? (
            <>
              BSFC <b>{hb.toFixed(0)} g/kWh</b> · efficiency {((3.6e6 / (hb * FUEL.lhvJPerG)) * 100).toFixed(1)} %
            </>
          ) : (
            'Above full-load torque'
          )}
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <span className="sw" style={{ background: rampColor(1) }} />
          Most efficient (≈ 220 g/kWh)
        </span>
        <span>
          <span className="sw" style={{ background: rampColor(0.2) }} />
          Least efficient
        </span>
        <span>
          <span className="sw" style={{ background: C.text, height: 2, verticalAlign: 3 }} />
          Full-load torque
        </span>
        <span>Dots: the operating point in each gear</span>
      </div>
    </div>
  );
}
