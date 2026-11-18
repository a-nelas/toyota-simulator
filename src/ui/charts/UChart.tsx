import { useEffect, useRef } from 'react';
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

/** Thin React wrapper: creates uPlot once per `optsKey`, then only pushes new data. */
export function UChart({ opts, data, height, optsKey }: { opts: ChartOpts; data: uPlot.AlignedData; height: number; optsKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    if (!el.current) return;
    // Lines only: no per-point markers unless a series asks for them.
    const series = opts.series.map((s, i) => (i === 0 ? s : { ...s, points: { show: false, ...s.points } }));
    const u = new uPlot({ ...opts, series, width: el.current.clientWidth || 400, height }, latest.current, el.current);
    plot.current = u;
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

  return <div ref={el} style={{ width: '100%' }} />;
}
