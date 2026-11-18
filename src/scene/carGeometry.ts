import * as THREE from 'three';
import { VEHICLE } from '../physics/vehicle';

/**
 * Procedural estate body at the Auris Touring Sports' real dimensions.
 * Frame: x forward (front at +x), y up, z to the car's left; origin on the ground at mid-wheelbase.
 */
export const AXLE_X = VEHICLE.wheelbaseM / 2; // 1.30
export const FRONT_X = AXLE_X + 0.885; // front overhang
export const REAR_X = -(VEHICLE.lengthM - VEHICLE.wheelbaseM - 0.885) - AXLE_X;
export const HALF_W = VEHICLE.widthM / 2;
export const BELT_Y = 0.98;
export const ROOF_Y = 1.44;
export const ARCH_R = 0.38;

/** Half-width of the body at height y (tumblehome above the beltline). */
export function halfWidthAt(y: number, x = 0): number {
  let w = HALF_W - 0.035;
  if (y > BELT_Y - 0.03) w *= 1 - 0.2 * Math.pow(Math.max(0, (y - BELT_Y + 0.03) / 0.5), 1.2);
  // Plan-view rounding at the nose and tail.
  if (x > FRONT_X - 0.5) w *= 1 - 0.13 * Math.pow((x - (FRONT_X - 0.5)) / 0.5, 2);
  if (x < REAR_X + 0.25) w *= 1 - 0.05 * Math.pow((REAR_X + 0.25 - x) / 0.25, 2);
  return w;
}

function sideProfile(): THREE.Shape {
  const s = new THREE.Shape();
  const bot = 0.2;
  s.moveTo(FRONT_X - 0.05, bot);
  s.bezierCurveTo(FRONT_X + 0.02, 0.3, FRONT_X + 0.03, 0.5, FRONT_X - 0.01, 0.62);
  s.bezierCurveTo(FRONT_X - 0.05, 0.7, FRONT_X - 0.15, 0.74, FRONT_X - 0.3, 0.77);
  s.lineTo(1.05, 0.88); // hood to cowl
  s.lineTo(0.95, 0.92);
  s.bezierCurveTo(0.6, 1.12, 0.35, 1.3, 0.12, 1.41); // windscreen
  s.bezierCurveTo(-0.1, 1.445, -0.6, ROOF_Y, -1.2, ROOF_Y); // roof
  s.bezierCurveTo(-1.7, ROOF_Y, -1.95, 1.43, -2.12, 1.37); // roof spoiler
  s.bezierCurveTo(-2.25, 1.3, -2.33, 1.15, -2.37, 1.0); // tailgate glass
  s.bezierCurveTo(REAR_X - 0.01, 0.9, REAR_X, 0.6, REAR_X + 0.02, 0.4);
  s.bezierCurveTo(REAR_X + 0.03, 0.3, REAR_X + 0.08, 0.24, REAR_X + 0.14, bot);
  // Underside with wheel arches.
  s.lineTo(-AXLE_X - ARCH_R - 0.02, bot);
  s.absarc(-AXLE_X, 0.3, ARCH_R + 0.02, Math.PI + 0.27, -0.27, true);
  s.lineTo(AXLE_X - ARCH_R - 0.02, bot);
  s.absarc(AXLE_X, 0.3, ARCH_R + 0.02, Math.PI + 0.27, -0.27, true);
  s.lineTo(FRONT_X - 0.05, bot);
  return s;
}

/** Body shell: extruded side profile, then tapered for tumblehome and rounded in plan view. */
export function buildBody(): THREE.BufferGeometry {
  const depth = VEHICLE.widthM - 0.08;
  const g = new THREE.ExtrudeGeometry(sideProfile(), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 4,
    curveSegments: 18,
    steps: 6,
  });
  g.translate(0, 0, -depth / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const full = depth / 2 + 0.04;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const scale = halfWidthAt(y, x) / (HALF_W - 0.035);
    pos.setZ(i, (z / full) * (HALF_W - 0.035) * scale);
  }
  g.computeVertexNormals();
  return g;
}

/** Side window outlines in (x, y above beltline) coordinates. */
export const WINDOW_SHAPES: { id: number | null; pts: [number, number][] }[] = [
  // Front door (opens).
  { id: 0, pts: [[0.84, 0.02], [0.03, 0.02], [0.03, 0.38], [0.27, 0.38], [0.5, 0.25]] },
  // Rear door (opens).
  { id: 2, pts: [[-0.07, 0.02], [-0.92, 0.02], [-0.92, 0.36], [-0.07, 0.38]] },
  // Rear quarter (fixed).
  { id: null, pts: [[-1.02, 0.02], [-1.98, 0.04], [-1.98, 0.22], [-1.85, 0.33], [-1.02, 0.36]] },
];

export const WINDOW_HEIGHT = 0.4;

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

/** Tumblehome tilt of the side glass (radians). */
export const GLASS_TILT = Math.atan((halfWidthAt(BELT_Y) - halfWidthAt(BELT_Y + 0.4)) / 0.4);

/** A quad between four 3D points (for screens). */
export function quad(a: number[], b: number[], c: number[], d: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}
