import * as THREE from 'three';
import { VEHICLE } from '../physics/vehicle';

/**
 * Procedural estate body at the Auris Touring Sports' real dimensions (4595 × 1760 × 1460 mm,
 * wheelbase 2600 mm). The shell is lofted: every cross-section along the car is built from a few
 * profile curves (roof/hood centre line, sill, plan width, beltline), so the nose, windscreen,
 * roof, tailgate and wheel arches all come out of one smooth surface.
 * Frame: x forward (front at +x), y up, z to the car's left; origin on the ground at mid-wheelbase.
 */
export const AXLE_X = VEHICLE.wheelbaseM / 2; // 1.30
export const FRONT_X = AXLE_X + 0.885; // front overhang
export const REAR_X = -(VEHICLE.lengthM - VEHICLE.wheelbaseM - 0.885) - AXLE_X;
export const HALF_W = VEHICLE.widthM / 2;
export const BELT_Y = 0.98;
export const ROOF_Y = 1.44;
export const ARCH_R = 0.39;
/** Wheel-arch centre height (≈ wheel centre on 205/55 R16). */
export const ARCH_Y = 0.305;
/** Side-glass tumblehome: inward run per metre of height. */
export const TUMBLE = 0.42;
/** Tumblehome tilt of the side glass (radians). */
export const GLASS_TILT = Math.atan(TUMBLE);

/** Monotone cubic (Fritsch–Carlson) through knots: smooth, never overshoots. */
function monotone(knots: [number, number][]): (x: number) => number {
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const R = REAR_X;
const F = FRONT_X;

/** Centre-line top of the body: bumper, hood, windscreen, roof, tailgate glass. */
export const topY = monotone([
  [R, 0.97], [R + 0.025, 1.0], [R + 0.05, 1.035], [-2.3, 1.15], [-2.2, 1.3], [-2.12, 1.385], [-1.95, 1.425], [-1.2, 1.44],
  [-0.1, 1.44], [0.12, 1.42], [0.3, 1.355], [0.6, 1.19], [0.93, 0.955], [1.05, 0.92], [1.5, 0.885], [1.85, 0.835],
  [2.02, 0.775], [2.12, 0.7], [F, 0.57],
]);

const bottomBase = monotone([
  [R, 0.4], [R + 0.03, 0.3], [R + 0.1, 0.24], [-2.15, 0.21], [-1.9, 0.2], [1.75, 0.2], [2.0, 0.22], [2.12, 0.26], [F, 0.32],
]);

/** Underside of the body, with the wheel arches cut out. */
export function bottomY(x: number): number {
  let b = bottomBase(x);
  for (const ax of [AXLE_X, -AXLE_X]) {
    const dx = x - ax;
    if (Math.abs(dx) < ARCH_R) b = Math.max(b, ARCH_Y + Math.sqrt(ARCH_R * ARCH_R - dx * dx));
  }
  return b;
}

/** Plan-view half-width (widest point of each section). */
const maxHalfW = monotone([
  [R, 0.78], [R + 0.02, 0.82], [R + 0.06, 0.85], [-2.25, 0.865], [-1.9, 0.875], [-1.3, 0.88], [1.3, 0.88], [1.7, 0.872],
  [1.95, 0.84], [2.08, 0.79], [2.15, 0.73], [F, 0.6],
]);

/** Beltline in the cabin; fender top / hood edge further forward. */
const beltBase = monotone([
  [R, 0.95], [R + 0.04, 0.975], [-2.2, 0.98], [0.84, 0.98], [0.97, 0.925], [1.2, 0.875], [1.6, 0.835], [1.9, 0.78],
  [2.05, 0.72], [2.13, 0.655], [F, 0.55],
]);

/** Roof crown height above the top of the side glass. */
const crown = monotone([[R, 0.03], [-2.3, 0.035], [-2.1, 0.05], [0.05, 0.05], [0.2, 0.035], [F, 0.03]]);

export interface Section {
  x: number;
  /** Underside (with arches) and underside without arches. */
  B: number;
  Bb: number;
  /** Widest half-width and the height it occurs at. */
  W: number;
  Ys: number;
  /** Beltline height and half-width there. */
  Yb: number;
  Wb: number;
  /** Top of the side glass / roof edge, and its half-width. */
  Yr: number;
  Wr: number;
  /** Centre-line top. */
  T: number;
}

export function section(x: number): Section {
  const T = topY(x);
  const B = bottomY(x);
  const Bb = bottomBase(x);
  const W = maxHalfW(x);
  const Yb = Math.min(beltBase(x), T - 0.004);
  const Wb = W - 0.035 * Math.min(1, (Yb - Bb) / 0.5);
  const Yr = Math.max(Yb, T - crown(x));
  const Wr = Wb - TUMBLE * (Yr - Yb);
  const Ys = Bb + (Yb - Bb) * 0.74;
  return { x, B, Bb, W, Ys, Yb, Wb, Yr, Wr, T };
}

const CROWN_N = 2.6;

function lowerZ(y: number, s: Section): number {
  if (y <= s.Ys) {
    const u = (s.Ys - y) / Math.max(0.05, s.Ys - s.Bb);
    return s.W - 0.07 * u * u;
  }
  const u = (y - s.Ys) / Math.max(1e-3, s.Yb - s.Ys);
  return s.W - (s.W - s.Wb) * Math.pow(Math.min(1, u), 1.6);
}

/** Outer half-width of the body at height y (on the side of the car), at station x. */
export function halfWidthAt(y: number, x = 0): number {
  const s = section(x);
  if (y <= s.Yb) return lowerZ(Math.max(y, s.B), s);
  if (y <= s.Yr) return s.Wb - TUMBLE * (y - s.Yb);
  const u = Math.min(1, (y - s.Yr) / Math.max(1e-3, s.T - s.Yr));
  return s.Wr * Math.pow(1 - Math.pow(u, CROWN_N), 1 / CROWN_N);
}

/** Height of the top surface at station x and lateral offset |z| (roof, hood). */
export function surfaceTopAt(x: number, z: number): number {
  const s = section(x);
  const a = Math.min(1, Math.abs(z) / s.Wr);
  return s.Yr + (s.T - s.Yr) * Math.pow(1 - Math.pow(a, CROWN_N), 1 / CROWN_N);
}

/** Segments of a half cross-section, bottom centre → top centre. */
export const SEG = { bottom: 0, corner: 1, side: 2, glass: 3, crown: 4 } as const;
const N_BOT = 4;
const N_CORNER = 5;
const N_LOW = 30;
const N_GH = 10;
const N_CROWN = 24;

/** Half cross-section (z ≥ 0) as (y, z) points with a segment id per point. */
export function halfRing(s: Section, res = 1): { pts: [number, number][]; seg: number[]; k: number[] } {
  const nBot = N_BOT * res;
  const nCorner = N_CORNER * res;
  const nLow = N_LOW * res;
  const nGh = N_GH * res;
  const nCrown = N_CROWN * res;
  const pts: [number, number][] = [];
  const seg: number[] = [];
  const k: number[] = [];
  const push = (y: number, z: number, sg: number, i: number) => {
    pts.push([y, z]);
    seg.push(sg);
    k.push(i);
  };
  const rb = Math.max(0.01, Math.min(0.05, (s.Ys - s.B) * 0.4));
  const z0 = lowerZ(s.B + rb, s);
  for (let i = 0; i < nBot; i++) push(s.B, ((z0 - rb) * i) / nBot, SEG.bottom, i);
  for (let i = 0; i < nCorner; i++) {
    const t = (Math.PI / 2) * (i / nCorner);
    push(s.B + rb * (1 - Math.cos(t)), z0 - rb + rb * Math.sin(t), SEG.corner, i);
  }
  for (let i = 0; i < nLow; i++) {
    const y = s.B + rb + ((s.Yb - s.B - rb) * i) / nLow;
    push(y, lowerZ(y, s), SEG.side, i);
  }
  for (let i = 0; i < nGh; i++) {
    const t = i / nGh;
    push(s.Yb + (s.Yr - s.Yb) * t, s.Wb - (s.Wb - s.Wr) * t, SEG.glass, i);
  }
  for (let i = 0; i <= nCrown; i++) {
    const t = (Math.PI / 2) * (i / nCrown);
    const c = Math.pow(Math.cos(t), 2 / CROWN_N);
    const sn = Math.pow(Math.sin(t), 2 / CROWN_N);
    push(s.Yr + (s.T - s.Yr) * sn, i === nCrown ? 0 : s.Wr * c, SEG.crown, i);
  }
  return { pts, seg, k };
}

/** Stations along the car: even spacing, denser at the ends, cosine-spaced through the arches. */
function stations(): number[] {
  const arr: number[] = [];
  for (let x = R; x <= F + 1e-9; x += 0.025) arr.push(x);
  for (let i = 0; i <= 14; i++) {
    arr.push(R + 0.14 * Math.pow(i / 14, 1.6));
    arr.push(F - 0.2 * Math.pow(i / 14, 1.6));
  }
  arr.push(F);
  const out = arr.filter((x) => ![AXLE_X, -AXLE_X].some((a) => Math.abs(x - a) < ARCH_R + 0.012));
  for (const a of [AXLE_X, -AXLE_X]) {
    for (let i = 0; i <= 32; i++) out.push(a - (ARCH_R - 2e-4) * Math.cos((Math.PI * i) / 32));
    out.push(a - ARCH_R - 2e-4, a + ARCH_R + 2e-4);
  }
  out.sort((p, q) => p - q);
  return out.filter((x, i) => i === 0 || x - out[i - 1] > 1e-5);
}

/** Material slots of the body mesh. */
export const MAT = { paint: 0, glass: 1, trim: 2, head: 3, tail: 4, drl: 5, chrome: 6 } as const;

/** Front side-window top edge (world y) — keeps the glass behind the A-pillar. */
export function frontWindowTopY(x: number): number {
  return Math.min(BELT_Y + 0.365, section(x).Yr - 0.05);
}

function classify(x: number, y: number, az: number, sg: number, k: number): number {
  // Grilles, lips and the rear diffuser.
  if (x > 2.08 && y < 0.5 && az < 0.52) return MAT.trim;
  if (sg === SEG.bottom || sg === SEG.corner) return MAT.trim;
  if (sg === SEG.glass) {
    if (x > 0.03 && x < 1.0) return y > frontWindowTopY(x) + 0.018 ? MAT.paint : MAT.trim;
    return x > -2.4 ? MAT.trim : MAT.paint;
  }
  if (sg === SEG.crown) {
    const pillar = k < 2;
    if (x > 0.18 && x < 0.925) return pillar ? MAT.paint : MAT.glass; // windscreen
    if (x > -2.345 && x < -2.13) return pillar ? MAT.trim : MAT.glass; // tailgate glass
  }
  return MAT.paint;
}

/** Decal regions (lights, upper grille, chrome): material slot or -1. */
function decalAt(x: number, y: number, az: number, sg: number): number {
  const s = section(x);
  if (x > 1.8) {
    if (sg === SEG.side && x < 2.13 && az > 0.6) {
      const lo = 0.63 + 0.47 * (2.1 - x);
      if (y > lo && y < s.Yb - 0.008) return y < lo + 0.016 ? MAT.drl : MAT.head;
    }
    if (x > 2.08 && az > 0.44 && az < 0.82) {
      const u = Math.min(1, (az - 0.44) / 0.3);
      const lo = 0.605 + 0.025 * u;
      if (y > lo && y < 0.705) return y < lo + 0.016 ? MAT.drl : MAT.head;
    }
    if (x > 2.08 && az < 0.42) {
      if (y > 0.6 && y < 0.662) return MAT.trim;
      if (y >= 0.662 && y < 0.676) return MAT.chrome;
    }
    return -1;
  }
  if (y < 0.33 && az < 0.7 && x < -2.1 - 1.2 * Math.max(0, y - 0.24)) return MAT.trim; // rear diffuser
  if (sg === SEG.side && az > 0.5 && y > 0.845 && y < Math.min(0.975, s.Yb - 0.006)) {
    const front = -2.16 - 0.25 * Math.max(0, (y - 0.845) / 0.13);
    if (x < front) return MAT.tail;
  }
  return -1;
}

/**
 * Lights and grille details as a fine mesh that follows the body surface 2 mm proud of the paint,
 * so their outlines are crisp regardless of the body's mesh density.
 */
export function buildDecals(): THREE.BufferGeometry {
  const RES = 4;
  const pos: number[] = [];
  const buckets: number[][] = Object.values(MAT).map(() => []);
  const fullIndex: number[] = [];
  const kept: { m: number; tri: number[] }[] = [];
  for (const [x0, x1, step] of [[1.8, FRONT_X, 0.0025], [REAR_X, -2.05, 0.003]] as const) {
    const xs: number[] = [];
    for (let x = x0; x < x1; x += step) xs.push(x);
    xs.push(x1);
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      let H = 0;
      let segs: number[] = [];
      for (const x of xs) {
        const { pts, seg } = halfRing(section(x), RES);
        H = pts.length;
        segs = seg;
        for (const [y, z] of pts) pos.push(x, y, side * z);
      }
      for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < H - 1; j++) {
          const a = base + i * H + j;
          const b = base + (i + 1) * H + j;
          const c = b + 1;
          const d = a + 1;
          const tri = side === 1 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
          fullIndex.push(...tri);
          const p = (v: number) => [pos[v * 3], pos[v * 3 + 1], Math.abs(pos[v * 3 + 2])];
          const pa = p(a);
          const pc = p(c);
          const m = decalAt((pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2, (pa[2] + pc[2]) / 2, segs[j]);
          if (m >= 0) kept.push({ m, tri });
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(fullIndex);
  g.computeVertexNormals();
  // Lift off the paint along the normal, then keep only the decal cells.
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute;
  for (let v = 0; v < P.count; v++) {
    P.setXYZ(v, P.getX(v) + N.getX(v) * 0.002, P.getY(v) + N.getY(v) * 0.002, P.getZ(v) + N.getZ(v) * 0.002);
  }
  for (const { m, tri } of kept) buckets[m].push(...tri);
  const index: number[] = [];
  buckets.forEach((b, m) => {
    g.addGroup(index.length, b.length, m);
    for (const v of b) index.push(v);
  });
  g.setIndex(index);
  return g;
}

export interface BodyGeometry {
  geometry: THREE.BufferGeometry;
  /** Outline of the rear face (z, y), for lights and plate overlays. */
  rearOutline: [number, number][];
}

/** Lofted body shell with material groups (paint, glass, trim, lights) and end caps. */
export function buildBody(): BodyGeometry {
  const xs = stations();
  const pos: number[] = [];
  const buckets: number[][] = Object.values(MAT).map(() => []);
  let ringLen = 0;
  let edgeSeg: number[] = [];
  let edgeK: number[] = [];
  const rings: [number, number, number][][] = [];

  for (const x of xs) {
    const { pts, seg, k } = halfRing(section(x));
    const H = pts.length;
    const ring: [number, number, number][] = [];
    for (let i = 0; i < H; i++) ring.push([x, pts[i][0], pts[i][1]]);
    for (let i = H - 2; i >= 1; i--) ring.push([x, pts[i][0], -pts[i][1]]);
    if (!ringLen) {
      ringLen = ring.length;
      // Segment of each ring edge j → j+1 (left half walks up, right half walks down).
      edgeSeg = [];
      edgeK = [];
      for (let j = 0; j < ringLen; j++) {
        const h = j < H - 1 ? j : 2 * H - 3 - j;
        edgeSeg.push(seg[h]);
        edgeK.push(k[h]);
      }
    }
    rings.push(ring);
    for (const p of ring) pos.push(...p);
  }

  const idx = (i: number, j: number) => i * ringLen + (j % ringLen);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ringLen; j++) {
      const a = rings[i][j];
      const c = rings[i + 1][(j + 1) % ringLen];
      const m = classify((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, Math.abs(a[2] + c[2]) / 2, edgeSeg[j], edgeK[j]);
      const ia = idx(i, j);
      const ib = idx(i + 1, j);
      const ic = idx(i + 1, j + 1);
      const id = idx(i, j + 1);
      buckets[m].push(ia, ib, ic, ia, ic, id);
    }
  }

  // End caps get their own vertices so they shade flat.
  const cap = (ring: [number, number, number][], mat: number, front: boolean) => {
    const base = pos.length / 3;
    let cy = 0;
    for (const p of ring) cy += p[1];
    pos.push(ring[0][0], cy / ring.length, 0);
    for (const p of ring) pos.push(...p);
    for (let j = 0; j < ring.length; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % ring.length);
      if (front) buckets[mat].push(base, b, a);
      else buckets[mat].push(base, a, b);
    }
  };
  cap(rings[0], MAT.paint, false);
  cap(rings[rings.length - 1], MAT.trim, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const index: number[] = [];
  buckets.forEach((b, m) => {
    g.addGroup(index.length, b.length, m);
    for (const v of b) index.push(v);
  });
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, rearOutline: rings[0].map((p) => [p[2], p[1]] as [number, number]) };
}

/** Plane coordinate (height along the tilted glass) for a world height. */
const along = (y: number) => (y - BELT_Y) / Math.cos(GLASS_TILT);

function frontDoorWindow(): [number, number][] {
  const pts: [number, number][] = [];
  let xEnd = 0.03;
  for (let x = 0.03; x < 1.0; x += 0.005) {
    if (frontWindowTopY(x) < BELT_Y + 0.04) break;
    xEnd = x;
  }
  pts.push([xEnd + 0.04, 0.02], [0.03, 0.02]);
  for (let i = 0; i <= 24; i++) {
    const x = 0.03 + ((xEnd - 0.03) * i) / 24;
    pts.push([x, along(frontWindowTopY(x))]);
  }
  return pts;
}

function sideWindow(x0: number, x1: number, rearTaper: boolean): [number, number][] {
  const top = (x: number) => along(Math.min(BELT_Y + 0.365, section(x).Yr - 0.05));
  const pts: [number, number][] = [[x0, 0.02]];
  if (rearTaper) {
    pts.push([x1 + 0.1, 0.02], [x1, 0.09], [x1 + 0.01, 0.2], [x1 + 0.07, top(x1 + 0.07) - 0.035]);
  } else {
    pts.push([x1, 0.02], [x1, top(x1)]);
  }
  for (let i = 0; i <= 12; i++) {
    const x = x1 + (rearTaper ? 0.15 : 0) + ((x0 - x1 - (rearTaper ? 0.15 : 0)) * i) / 12;
    pts.push([x, top(x)]);
  }
  return pts;
}

/** Side window outlines in (x, height along the glass above the beltline). */
export const WINDOW_SHAPES: { id: number | null; pts: [number, number][] }[] = [
  { id: 0, pts: frontDoorWindow() }, // front door (opens)
  { id: 2, pts: sideWindow(-0.075, -0.93, false) }, // rear door (opens)
  { id: null, pts: sideWindow(-1.02, -2.05, true) }, // rear quarter (fixed)
];

export const WINDOW_HEIGHT = 0.42;

/** Sutherland–Hodgman clip of a polygon against y ≥ 0. */
export function clipAboveZero(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ain = a[1] >= 0;
    const bin = b[1] >= 0;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = a[1] / (a[1] - b[1]);
      out.push([a[0] + (b[0] - a[0]) * t, 0]);
    }
  }
  return out;
}

export function shapeGeometry(pts: [number, number][]): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/**
 * Thin strip hugging the body side at station x between two heights (door shut lines).
 * Returns positions for a ribbon 2·hw wide, 1.5 mm proud of the paint, on the left side (z > 0).
 */
export function shutLine(x: number, y0: number, y1: number, hw = 0.0028): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const z = halfWidthAt(y, x) + 0.0015;
    pos.push(x - hw, y, z, x + hw, y, z);
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Horizontal strip along the body side at height y from x0 to x1 (left side). */
export function shutLineH(y: number, x0: number, x1: number, hw = 0.0028): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const z = halfWidthAt(y, x) + 0.0015;
    pos.push(x, y - hw, z, x, y + hw, z);
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
