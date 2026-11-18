import { useEffect, useMemo, useRef, useState } from 'react';
import { solve } from '../../physics/steadyState';
import type { Scenario } from '../../physics/scenario';
import { C, rampColor } from '../theme';
import { niceTicks, setupCanvas, useWidth } from './canvas';

const SPEEDS = Array.from({ length: 29 }, (_, i) => 20 + i * 5);
const GRADES = Array.from({ length: 25 }, (_, i) => -12 + i);
const MAX_L = 16;

interface Cell {
  l: number;
  gear: number | null;
  feasible: boolean;
}

/** Best-gear L/100 km over speed × grade for the current car setup. */
export function GradeHeatmap({ s, onPick }: { s: Scenario; onPick?: (kmh: number, grade: number) => void }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; i: number; j: number } | null>(null);
  const { speedKmh: _a, gradePct: _b, gear: _c, ...rest } = s;
  const key = JSON.stringify(rest);

  const cells = useMemo(() => {
    const out: Cell[][] = [];
    for (const g of GRADES) {
      const row: Cell[] = [];
      for (const v of SPEEDS) {
        const r = solve({ ...s, speedKmh: v, gradePct: g, gear: 'auto' });
        row.push({ l: r.point.lPer100, gear: r.bestGear, feasible: r.bestGear !== null });
      }
      out.push(row);
    }
    return out;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const H = 300;
  const pad = { l: 46, r: 70, t: 8, b: 36 };
  const pw = width - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const cw = pw / SPEEDS.length;
  const ch = ph / GRADES.length;

  useEffect(() => {
    if (!canvas.current) return;
    const ctx = setupCanvas(canvas.current, width, H);
    GRADES.forEach((_, j) => {
      SPEEDS.forEach((__, i) => {
        const c = cells[j][i];
        const x = pad.l + i * cw;
        const y = pad.t + (GRADES.length - 1 - j) * ch;
        if (!c.feasible) {
          ctx.fillStyle = '#2a2a28';
          ctx.fillRect(x, y, cw - 1, ch - 1);
          ctx.strokeStyle = '#3d3d3a';
          ctx.beginPath();
          ctx.moveTo(x, y + ch - 1);
          ctx.lineTo(x + cw - 1, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = c.l <= 0.001 ? '#0f2a1a' : rampColor(Math.sqrt(Math.min(MAX_L, c.l) / MAX_L));
          ctx.fillRect(x, y, cw - 1, ch - 1);
        }
      });
    });
    // Current point.
    const ci = (s.speedKmh - SPEEDS[0]) / 5;
    const cj = (s.gradePct - GRADES[0]) / 1;
    if (ci >= -0.5 && ci <= SPEEDS.length - 0.5 && cj >= -0.5 && cj <= GRADES.length - 0.5) {
      const x = pad.l + (ci + 0.5) * cw;
      const y = pad.t + (GRADES.length - 1 - cj + 0.5) * ch;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = C.surface;
      ctx.stroke();
    }
    // Axes.
    ctx.fillStyle = C.muted;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    for (const v of niceTicks(20, 160, 7)) {
      const x = pad.l + ((v - 20) / 5 + 0.5) * cw;
      ctx.fillText(String(v), x, H - pad.b + 15);
    }
    ctx.fillText('Speed (km/h)', pad.l + pw / 2, H - 4);
    ctx.textAlign = 'right';
    for (const g of [-12, -8, -4, 0, 4, 8, 12]) {
      const y = pad.t + (GRADES.length - 1 - (g + 12) + 0.5) * ch + 4;
      ctx.fillText(`${g > 0 ? '+' : ''}${g}%`, pad.l - 6, y);
    }
    // Colour legend.
    const lx = width - pad.r + 18;
    const lh = ph;
    for (let k = 0; k < lh; k++) {
      ctx.fillStyle = rampColor(Math.sqrt(1 - k / lh));
      ctx.fillRect(lx, pad.t + k, 12, 1);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    for (const l of [0, 2, 4, 8, 16]) {
      const y = pad.t + lh * (1 - Math.sqrt(l / MAX_L));
      ctx.fillText(l === 16 ? '16+' : String(l), lx + 16, y + 4);
    }
    ctx.save();
    ctx.translate(width - 4, pad.t + lh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('L/100 km', 0, 0);
    ctx.restore();
  }, [cells, width, s.speedKmh, s.gradePct]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const i = Math.floor((x - pad.l) / cw);
    const j = GRADES.length - 1 - Math.floor((y - pad.t) / ch);
    if (i < 0 || i >= SPEEDS.length || j < 0 || j >= GRADES.length) setHover(null);
    else setHover({ x, y, i, j });
  };

  const hc = hover ? cells[hover.j][hover.i] : null;
  return (
    <div ref={wrapRef} className="canvas-chart">
      <canvas
        ref={canvas}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover && onPick?.(SPEEDS[hover.i], GRADES[hover.j])}
        style={{ cursor: onPick ? 'pointer' : 'default' }}
      />
      {hover && hc && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 170), top: hover.y + 12 }}>
          {SPEEDS[hover.i]} km/h, {GRADES[hover.j] > 0 ? '+' : ''}
          {GRADES[hover.j]} %<br />
          {hc.feasible ? (
            hc.l <= 0.001 ? (
              <>Fuel cut (0 L/100 km), gear {hc.gear}</>
            ) : (
              <>
                <b>{hc.l.toFixed(2)} L/100 km</b>, gear {hc.gear}
              </>
            )
          ) : (
            <>Can't hold this speed in any gear</>
          )}
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <span className="sw" style={{ background: '#0f2a1a' }} />
          Fuel cut
        </span>
        <span>
          <span className="sw" style={{ background: '#2a2a28', border: '1px solid #3d3d3a' }} />
          Can't hold speed
        </span>
        <span className="muted">Click a cell to set speed and grade.</span>
      </div>
    </div>
  );
}
