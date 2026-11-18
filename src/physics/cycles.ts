/** Speed–time driving cycles as piecewise-linear [time s, speed km/h] knots. */
export interface Cycle {
  id: string;
  label: string;
  knots: [number, number][];
  /** Index ranges (s) of named phases for reporting. */
  phases: { name: string; from: number; to: number }[];
}

/** UNECE R83/R101 ECE-15 elementary urban cycle (195 s). */
const ECE15: [number, number][] = [
  [0, 0], [11, 0], [15, 15], [23, 15], [28, 0], [49, 0], [61, 32], [85, 32], [96, 0], [117, 0],
  [143, 50], [155, 50], [163, 35], [176, 35], [188, 0], [195, 0],
];

/** Extra-urban driving cycle (400 s), 120 km/h top for vehicles > 30 kW. */
const EUDC: [number, number][] = [
  [0, 0], [20, 0], [61, 70], [111, 70], [119, 50], [188, 50], [201, 70], [251, 70], [286, 100],
  [316, 100], [336, 120], [346, 120], [362, 80], [370, 50], [380, 0], [400, 0],
];

function buildNedc(): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 4; k++) for (const [t, v] of ECE15) if (!(k > 0 && t === 0)) out.push([t + 195 * k, v]);
  for (const [t, v] of EUDC) if (t > 0) out.push([t + 780, v]);
  return out;
}

export const NEDC: Cycle = {
  id: 'nedc',
  label: 'NEDC (type approval until 2018)',
  knots: buildNedc(),
  phases: [
    { name: 'Urban (UDC)', from: 0, to: 780 },
    { name: 'Extra-urban (EUDC)', from: 780, to: 1180 },
  ],
};

export const CYCLES: Cycle[] = [NEDC];

export function cycleDuration(c: Cycle): number {
  return c.knots[c.knots.length - 1][0];
}

/** Target speed (km/h) and acceleration (km/h per s) at time t. */
export function cycleAt(c: Cycle, t: number): { v: number; a: number } {
  const k = c.knots;
  if (t <= k[0][0]) return { v: k[0][1], a: 0 };
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      const a = (v1 - v0) / (t1 - t0);
      return { v: v0 + a * (t - t0), a };
    }
  }
  return { v: k[k.length - 1][1], a: 0 };
}
