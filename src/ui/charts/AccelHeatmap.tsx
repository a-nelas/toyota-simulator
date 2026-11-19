import { useEffect, useRef, useState } from 'react';
import { PEDALS, SHIFT_RPMS, isValid, metricValue, type AccelMetric, type AccelResult } from '../../physics/accelStudy';
import { C, fmt, rampColor } from '../theme';
import { setupCanvas, useWidth } from './canvas';

/** Excess over the best (%) that maps to the darkest colour, per metric. */
const MAX_EXTRA: Record<AccelMetric, number> = { total: 20, accel: 40, bsfc: 15 };
const CELL_TEXT: Record<AccelMetric, (r: AccelResult) => string> = {
  total: (r) => `${fmt(r.tToCruise, 0)} s`,
  accel: (r) => `${fmt(r.fuelAccelMl, 0)}`,
  bsfc: (r) => `${fmt(r.bsfcAccel, 0)}`,
};
const CELL_LEGEND: Record<AccelMetric, string> = {
  total: 'Number in each cell = seconds to cruising speed.',
  accel: 'Number in each cell = mL burned while accelerating.',
  bsfc: 'Number in each cell = average g/kWh while accelerating.',
};

/**
 * Pedal % × upshift rpm grid. Colour = how much worse each strategy is on `metric` than the best one
 * that meets the time limit (outlined). Strategies slower than the limit are dimmed; ones that never get
 * there are hatched.
 */
export function AccelHeatmap({ results, best, maxSeconds, metric }: { results: AccelResult[]; best: AccelResult | null; maxSeconds: number; metric: AccelMetric }) {
  const maxExtra = MAX_EXTRA[metric];
  const extraOf = (r: AccelResult) => (best ? (100 * (metricValue(r, metric) - metricValue(best, metric))) / metricValue(best, metric) : NaN);
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
        if (!r || !isValid(r) || !best || !Number.isFinite(metricValue(r, metric))) {
          ctx.fillStyle = '#2a2a28';
          ctx.fillRect(x, y, cw - 2, ch - 2);
          ctx.strokeStyle = '#3d3d3a';
          ctx.beginPath();
          ctx.moveTo(x, y + ch - 2);
          ctx.lineTo(x + cw - 2, y);
          ctx.stroke();
          return;
        }
        const extra = extraOf(r);
        const inTime = r.tToCruise <= maxSeconds;
        ctx.globalAlpha = inTime ? 1 : 0.28;
        ctx.fillStyle = rampColor(Math.sqrt(Math.max(0, Math.min(maxExtra, extra)) / maxExtra));
        ctx.fillRect(x, y, cw - 2, ch - 2);
        ctx.globalAlpha = 1;
        if (cw > 30) {
          const light = extra < maxExtra * 0.3;
          ctx.fillStyle = inTime ? (light ? '#10213a' : '#e8eef5') : C.muted;
          ctx.fillText(CELL_TEXT[metric](r), x + (cw - 2) / 2, y + (ch - 2) / 2 + 1);
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
    for (const f of [0, 0.1, 0.25, 0.5, 1]) {
      const e = Math.round(maxExtra * f);
      const y = pad.t + ph * Math.sqrt(e / maxExtra);
      ctx.fillText(f === 1 ? `+${e}%+` : `+${e}%`, lx + 16, y + 4);
    }
  }, [results, best, maxSeconds, width, metric]); // eslint-disable-line react-hooks/exhaustive-deps

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
              Over the distance: <b>{fmt(hc.fuelMl, 0)} mL</b>
              <br />
              Accelerating: <b>{fmt(hc.fuelAccelMl, 1)} mL</b> at {fmt(hc.bsfcAccel, 0)} g/kWh
              {best && (
                <>
                  <br />
                  {extraOf(hc) >= 0 ? '+' : '−'}
                  {fmt(Math.abs(extraOf(hc)), 1)} % vs. the outlined strategy
                </>
              )}
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
          Best within your time limit
        </span>
        <span>
          <span className="sw" style={{ background: rampColor(0.5), opacity: 0.3 }} />
          Slower than your time limit
        </span>
        <span>
          <span className="sw" style={{ background: '#2a2a28', border: '1px solid #3d3d3a' }} />
          Never gets there
        </span>
        <span className="muted">{CELL_LEGEND[metric]}</span>
      </div>
    </div>
  );
}
