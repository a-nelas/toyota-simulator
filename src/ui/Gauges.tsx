/** SVG round gauge in the style of the Auris cluster. */
export function Gauge({
  value,
  max,
  label,
  unit,
  major,
  red,
  size = 132,
  digits = 0,
  scale = 1,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  major: number;
  red?: number;
  size?: number;
  digits?: number;
  /** Tick label divisor (e.g. 1000 for ×1000 rpm). */
  scale?: number;
}) {
  const r = size / 2 - 8;
  const c = size / 2;
  const a0 = (-220 * Math.PI) / 180;
  const a1 = (40 * Math.PI) / 180;
  const ang = (v: number) => a0 + ((a1 - a0) * Math.min(max, Math.max(0, v))) / max;
  const pt = (a: number, rr: number) => [c + rr * Math.cos(a), c + rr * Math.sin(a)];
  const arc = (from: number, to: number, rr: number) => {
    const [x0, y0] = pt(ang(from), rr);
    const [x1, y1] = pt(ang(to), rr);
    const large = ang(to) - ang(from) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1}`;
  };
  const ticks = [];
  for (let v = 0; v <= max + 1e-6; v += major) {
    const [x0, y0] = pt(ang(v), r);
    const [x1, y1] = pt(ang(v), r - 8);
    const [tx, ty] = pt(ang(v), r - 18);
    ticks.push(
      <g key={v}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#9fc9e6" strokeWidth={1.5} />
        <text x={tx} y={ty + 3.5} fontSize={9} textAnchor="middle" fill="#9fc9e6">
          {v / scale}
        </text>
      </g>,
    );
  }
  const [nx, ny] = pt(ang(value), r - 6);
  return (
    <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} role="img" aria-label={`${label} ${value.toFixed(digits)} ${unit}`}>
      <path d={arc(0, max, r)} stroke="rgba(143,211,255,0.25)" strokeWidth={3} fill="none" />
      {red !== undefined && <path d={arc(red, max, r)} stroke="#d03b3b" strokeWidth={4} fill="none" />}
      <path d={arc(0, value, r)} stroke="#3987e5" strokeWidth={3} fill="none" />
      {ticks}
      <line x1={c} y1={c} x2={nx} y2={ny} stroke="#ff6a3d" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={c} cy={c} r={5} fill="#ddd" />
      <text x={c} y={c + 24} fontSize={17} textAnchor="middle" fill="#fff" fontWeight={600}>
        {value.toFixed(digits)}
      </text>
      <text x={c} y={c + 36} fontSize={9} textAnchor="middle" fill="#9fc9e6">
        {unit}
      </text>
    </svg>
  );
}
