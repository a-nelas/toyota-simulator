/** Chart colours (dark surface), from the validated reference palette. */
export const C = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
  surface: '#1a1a19',
  text: '#f0efec',
  text2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  /** Sequential blue ramp 100 → 700. */
  blue: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
};

export function rampColor(t: number, ramp = C.blue): string {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const j = Math.min(ramp.length - 1, i + 1);
  const f = x - i;
  const a = hex(ramp[i]);
  const b = hex(ramp[j]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
