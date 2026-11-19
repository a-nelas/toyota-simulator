import { useEffect, useRef, useState } from 'react';
import { PEDALS, SHIFT_RPMS, isValid, type AccelResult } from '../../physics/accelStudy';
import { C, fmt, rampColor } from '../theme';
import { setupCanvas, useWidth } from './canvas';

/** Extra fuel (%) that maps to the darkest colour. */
const MAX_EXTRA = 20;

/**
 * Pedal % × upshift rpm grid. Colour = extra fuel over the distance compared with the most economical
 * strategy that meets the time limit; the number in each cell is the time to cruising speed.
 * Strategies slower than the time limit are dimmed; ones that never get there are hatched.
 */
export function AccelHeatmap({ results, best, maxSeconds }: { results: AccelResult[]; best: AccelResult | null; maxSeconds: number }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; i: number; j: number } | null>(null);
  const cell = (i: number, j: number) => results.find((r) => r.shiftRpm === SHIFT_RPMS[i] && r.pedal === PEDALS[j]);

  const H = 330;
  const pad = { l: 52, r: 74, t: 8, b: 38 };
  const pw = Math.max(10, width - pad.l - pad.r);
  const ph = H - pad.t - pad.b;
  const cw = pw / SHIFT_RPMS.length;
  const ch = ph / PEDALS.length;

  useEffect(() => {
    if (!canvas.current || width === 0) return;
    const ctx = setupCanvas(canvas.current, width, H);
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    SHIFT_RPMS.forEach((_, i) =>
      PEDALS.forEach((__, j) => {
        const r = cell(i, j);
        const x = pad.l + i * cw;
        const y = pad.t + (PEDALS.length - 1 - j) * ch;
        if (!r || !isValid(r) || !best) {
          ctx.fillStyle = '#2a2a28';
          ctx.fillRect(x, y, cw - 2, ch - 2);
          ctx.strokeStyle = '#3d3d3a';
          ctx.beginPath();
          ctx.moveTo(x, y + ch - 2);
          ctx.lineTo(x + cw - 2, y);
          ctx.stroke();
          return;
        }
        const extra = (100 * (r.fuelMl - best.fuelMl)) / best.fuelMl;
        const inTime = r.tToCruise <= maxSeconds;
        ctx.globalAlpha = inTime ? 1 : 0.28;
        ctx.fillStyle = rampColor(Math.sqrt(Math.max(0, Math.min(MAX_EXTRA, extra)) / MAX_EXTRA));
        ctx.fillRect(x, y, cw - 2, ch - 2);
        ctx.globalAlpha = 1;
        if (cw > 30) {
          const light = extra < MAX_EXTRA * 0.3;
          ctx.fillStyle = inTime ? (light ? '#10213a' : '#e8eef5') : C.muted;
          ctx.fillText(`${fmt(r.tToCruise, 0)} s`, x + (cw - 2) / 2, y + (ch - 2) / 2 + 1);
        }
      }),
    );
    // Best strategy within the time limit.
    if (best) {
      const i = SHIFT_RPMS.indexOf(best.shiftRpm);
      const j = PEDALS.indexOf(best.pedal);
      const x = pad.l + i * cw;
      const y = pad.t + (PEDALS.length - 1 - j) * ch;
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.surface;
      ctx.strokeRect(x - 2, y - 2, cw + 2, ch + 2);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x - 0.5, y - 0.5, cw - 1, ch - 1);
    }
    // Axes.
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted;
    ctx.font = '12px system-ui';
    SHIFT_RPMS.forEach((r, i) => {
      if (i % 2 === 0) ctx.fillText(String(r), pad.l + (i + 0.5) * cw, H - pad.b + 16);
    });
    ctx.fillText('Upshift at (rpm)', pad.l + pw / 2, H - 4);
    ctx.textAlign = 'right';
    PEDALS.forEach((p, j) => ctx.fillText(`${Math.round(p * 100)} %`, pad.l - 6, pad.t + (PEDALS.length - 1 - j + 0.5) * ch + 4));
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Accelerator pedal', 0, 0);
    ctx.restore();
    // Colour legend.
    const lx = width - pad.r + 16;
    for (let k = 0; k < ph; k++) {
      ctx.fillStyle = rampColor(Math.sqrt(k / ph));
      ctx.fillRect(lx, pad.t + k, 12, 1);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    for (const e of [0, 2, 5, 10, 20]) {
      const y = pad.t + ph * Math.sqrt(e / MAX_EXTRA);
      ctx.fillText(e === MAX_EXTRA ? `+${e}%+` : `+${e}%`, lx + 16, y + 4);
    }
  }, [results, best, maxSeconds, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const i = Math.floor((x - pad.l) / cw);
    const j = PEDALS.length - 1 - Math.floor((y - pad.t) / ch);
    if (i < 0 || i >= SHIFT_RPMS.length || j < 0 || j >= PEDALS.length) setHover(null);
    else setHover({ x, y, i, j });
  };

  const hc = hover ? cell(hover.i, hover.j) : undefined;
  return (
    <div ref={wrapRef} className="canvas-chart">
      <canvas ref={canvas} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && hc && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 200), top: hover.y + 12 }}>
          Pedal {Math.round(hc.pedal * 100)} %, upshift at {hc.shiftRpm} rpm
          <br />
          {isValid(hc) ? (
            <>
              <b>{fmt(hc.fuelMl, 0)} mL</b>
              {best ? ` (${hc.fuelMl >= best.fuelMl ? '+' : ''}${fmt((100 * (hc.fuelMl - best.fuelMl)) / best.fuelMl, 1)} %)` : ''}
              <br />
              Cruise speed after {fmt(hc.tToCruise, 1)} s · {fmt(hc.xToCruise, 0)} m
              <br />
              Whole distance: {fmt(hc.timeS, 0)} s
              {hc.tToCruise > maxSeconds && (
                <>
                  <br />
                  <span className="muted">Slower than your time limit</span>
                </>
              )}
            </>
          ) : (
            <>Never reaches cruising speed{hc.completed ? ' within the distance' : ' (stalls or runs out of time)'}</>
          )}
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <span className="sw" style={{ background: '#fff' }} />
          Most economical within your time limit
        </span>
        <span>
          <span className="sw" style={{ background: rampColor(0.5), opacity: 0.3 }} />
          Slower than your time limit
        </span>
        <span>
          <span className="sw" style={{ background: '#2a2a28', border: '1px solid #3d3d3a' }} />
          Never gets there
        </span>
        <span className="muted">Number in each cell = seconds to cruising speed.</span>
      </div>
    </div>
  );
}
