import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { C } from '../theme';

export type ChartOpts = Omit<uPlot.Options, 'width' | 'height'>;

export function axis(label: string, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    label,
    stroke: C.muted,
    labelSize: 18,
    size: 44,
    font: '12px system-ui',
    labelFont: '12px system-ui',
    grid: { stroke: C.grid, width: 1 },
    ticks: { stroke: C.axis, width: 1, size: 4 },
    ...extra,
  };
}

/** Minimum horizontal drag (px) before it counts as a zoom, so a shaky click doesn't zoom in. */
const ZOOM_MIN_DRAG_PX = 10;

/**
 * Thin React wrapper: creates uPlot once per `optsKey`, then only pushes new data.
 * Drag across the plot to zoom the x axis; double-click or "Reset zoom" restores the full range.
 */
export function UChart({ opts, data, height, optsKey }: { opts: ChartOpts; data: uPlot.AlignedData; height: number; optsKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const [zoomed, setZoomed] = useState(false);

  /** Full x extent of the data (x values are sorted). */
  const extent = (d: uPlot.AlignedData): [number, number] => {
    const xs = d[0] as ArrayLike<number>;
    return xs.length ? [xs[0], xs[xs.length - 1]] : [0, 0];
  };
  const resetZoom = () => {
    const [a, b] = extent(latest.current);
    plot.current?.setScale('x', { min: a, max: b });
  };

  useEffect(() => {
    if (!el.current) return;
    // Lines only: no per-point markers unless a series asks for them.
    const series = opts.series.map((s, i) => (i === 0 ? s : { ...s, points: { show: false, ...s.points } }));
    const onScale = (u: uPlot, key: string) => {
      if (key !== 'x') return;
      const [a, b] = extent(u.data);
      const eps = (b - a) * 1e-6;
      setZoomed((u.scales.x.min ?? a) > a + eps || (u.scales.x.max ?? b) < b - eps);
    };
    const u = new uPlot(
      {
        ...opts,
        series,
        width: el.current.clientWidth || 400,
        height,
        cursor: { ...opts.cursor, drag: { x: true, y: false, setScale: true, dist: ZOOM_MIN_DRAG_PX, ...opts.cursor?.drag } },
        hooks: { ...opts.hooks, setScale: [...(opts.hooks?.setScale ?? []), onScale] },
      },
      latest.current,
      el.current,
    );
    plot.current = u;
    setZoomed(false);
    const ro = new ResizeObserver(() => {
      if (el.current) u.setSize({ width: el.current.clientWidth, height });
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey, height]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ width: '100%' }} />
      <div className="chart-zoom">
        {zoomed ? (
          <button onClick={resetZoom}>Reset zoom</button>
        ) : (
          <span>Drag across the chart to zoom · double-click to reset</span>
        )}
      </div>
    </div>
  );
}
