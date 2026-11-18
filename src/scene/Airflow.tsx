import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Windows } from '../physics/aero';
import { BELT_Y, FRONT_X, HALF_W, REAR_X, ROOF_Y, topY } from './carGeometry';

/**
 * Illustrative airflow (not CFD): particles follow displacement streamlines around the body
 * silhouette — y' = √(y₀² + top(x)²), z' = √(z₀² + side(x)²) — with a separated, turbulent, slow
 * wake behind the square estate tail. Each particle draws a fading trail traced back along its own
 * streamline, so the lines bend smoothly over the roof and round the sides. Open windows capture
 * part of the side flow into the cabin.
 */
const N = 800;
/** Segments per trail. */
const K = 14;
const STEP = 0.05;
const X0 = REAR_X - 7;
const X1 = FRONT_X + 4;
const NS = Math.ceil((X1 - X0) / STEP);

function silhouette(): { top: Float32Array; side: Float32Array; wake: Float32Array } {
  const raw = new Float32Array(NS);
  const rawSide = new Float32Array(NS);
  const wake = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const x = X0 + i * STEP;
    let h = 0;
    if (x <= FRONT_X && x >= REAR_X) {
      h = topY(x);
      rawSide[i] = HALF_W;
    } else if (x < REAR_X) {
      // Separated wake: the effective body closes slowly over ~5 m.
      const d = (REAR_X - x) / 5;
      h = 1.36 * Math.max(0, 1 - d * d);
      rawSide[i] = HALF_W * Math.max(0, 1 - d * 1.2);
      wake[i] = Math.max(0, 1 - d * 0.8);
    }
    raw[i] = h;
  }
  // Smooth (streamlines start rising ahead of the nose; turbulence fades in behind the tail).
  const smooth = (a: Float32Array, w: number) => {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0;
      let c = 0;
      for (let j = -w; j <= w; j++) {
        const k = i + j;
        if (k < 0 || k >= a.length) continue;
        const g = Math.exp(-(j * j) / (w * w * 0.35));
        s += a[k] * g;
        c += g;
      }
      out[i] = s / c;
    }
    return out;
  };
  return { top: smooth(raw, 10), side: smooth(rawSide, 10), wake: smooth(wake, 8) };
}

const sample = (a: Float32Array, x: number) => {
  const f = Math.min(NS - 1.001, Math.max(0, (x - X0) / STEP));
  const i = Math.floor(f);
  return a[i] + (a[i + 1] - a[i]) * (f - i);
};

const SLOW = new THREE.Color('#1c5cab');
const MID = new THREE.Color('#6da7ec');
const FAST = new THREE.Color('#e3efff');
const CABIN = new THREE.Color('#d95926');

type Sil = ReturnType<typeof silhouette>;
interface Particles {
  x: Float32Array;
  y0: Float32Array;
  z0: Float32Array;
  phase: Float32Array;
  /** > 0 while captured by an open window (seconds left). */
  cap: Float32Array;
  capZ: Float32Array;
}

/** Position and relative speed on particle i's streamline at station x, time t. */
function flowAt(sil: Sil, p: Particles, i: number, x: number, t: number, out: { y: number; z: number; speed: number }) {
  const top = sample(sil.top, x);
  const side = sample(sil.side, x);
  const wake = sample(sil.wake, x);
  const y0 = p.y0[i];
  const z0 = p.z0[i];
  const sg = Math.sign(z0) || 1;
  const az = Math.abs(z0);
  let y: number;
  let z: number;
  let speed: number;
  if (az < HALF_W - 0.05 && y0 > 0.22) {
    y = Math.sqrt(y0 * y0 + top * top);
    z = z0 * (1 + 0.15 * (top / ROOF_Y));
    speed = 1 + 0.4 * (top / ROOF_Y) * Math.exp(-(y - top) / 0.6);
  } else if (y0 <= 0.22 && az < HALF_W - 0.05) {
    y = y0; // underbody
    z = z0;
    speed = 0.8 + 0.2 * (1 - Math.min(1, top / 0.5));
  } else {
    y = y0 + 0.15 * top * Math.exp(-(az - HALF_W) / 0.8);
    z = sg * Math.sqrt(az * az + side * side);
    speed = 1 + 0.25 * (side / HALF_W) * Math.exp(-(Math.abs(z) - side) / 0.6);
  }
  // Wake: slow, turbulent, partly recirculating. It varies along the trail, so wake lines curl.
  if (wake > 0.01 && y < 1.7 && Math.abs(z) < HALF_W + 0.4) {
    const turb = wake * 0.17;
    const ph = p.phase[i] + x * 1.3;
    y += Math.sin(t * 5 + ph) * turb + Math.sin(t * 9 + 2 * ph) * turb * 0.4;
    z += Math.cos(t * 4 + ph * 1.7) * turb;
    speed = speed * (1 - 0.7 * wake) + 0.05;
  }
  out.y = y;
  out.z = z;
  out.speed = speed;
}

const smoothstep = (a: number, b: number, v: number) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

export function Airflow({ speedRef, windows }: { speedRef: React.MutableRefObject<number>; windows: Windows }) {
  const sil = useMemo(silhouette, []);
  const state = useMemo(() => {
    const p: Particles = {
      x: new Float32Array(N),
      y0: new Float32Array(N),
      z0: new Float32Array(N),
      phase: new Float32Array(N),
      cap: new Float32Array(N),
      capZ: new Float32Array(N),
    };
    for (let i = 0; i < N; i++) respawn(p, i, X0 + Math.random() * (X1 - X0));
    return p;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * K * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * K * 8), 4));
    return g;
  }, []);
  const winRef = useRef(windows);
  winRef.current = windows;
  const lines = useRef<THREE.LineSegments>(null);
  const tmp = useMemo(() => new THREE.Color(), []);
  const pt = useMemo(() => ({ y: 0, z: 0, speed: 1 }), []);
  const ys = useMemo(() => new Float32Array(K + 1), []);
  const zs = useMemo(() => new Float32Array(K + 1), []);
  const sp = useMemo(() => new Float32Array(K + 1), []);

  useFrame((clock, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const v = speedRef.current;
    if (lines.current) lines.current.visible = v > 0.5;
    if (v <= 0.5) return;
    const vis = 2 + v * 0.22; // visual speed (m/s in scene)
    const trail = 0.5 + vis * 0.14; // trail length (m): ~1.5 m at 90 km/h
    const t = clock.clock.elapsedTime;
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    const w = winRef.current;
    for (let i = 0; i < N; i++) {
      const x = state.x[i];
      flowAt(sil, state, i, x, t, pt);
      let speed = pt.speed;
      const sg = Math.sign(state.z0[i]) || 1;

      // Window capture (decided at the head of the trail).
      let captured = state.cap[i] > 0;
      if (!captured && Math.abs(pt.z) < HALF_W + 0.3 && pt.y > BELT_Y && pt.y < BELT_Y + 0.4) {
        const front = x < 0.85 && x > 0.05;
        const rear = x < -0.05 && x > -0.95;
        const idx = front ? (sg > 0 ? 0 : 1) : rear ? (sg > 0 ? 2 : 3) : -1;
        if (idx >= 0) {
          const open = w[idx as 0 | 1 | 2 | 3];
          if (open > 0.02 && pt.y < BELT_Y + 0.38 * open + 0.02 && Math.random() < open * 0.06) {
            state.cap[i] = 0.9;
            state.capZ[i] = pt.z;
            captured = true;
          }
        }
      }

      if (captured) {
        // Swirl into the cabin: a short orange trail that curls inwards.
        state.cap[i] -= dt;
        const k = 1 - state.cap[i] / 0.9;
        for (let j = 0; j <= K; j++) {
          const f = j / K;
          zs[j] = state.capZ[i] * (1 - 0.9 * k) + Math.sin(t * 9 + state.phase[i] - f * 2) * 0.08 * k;
          ys[j] = BELT_Y + 0.15 + Math.cos(t * 9 + state.phase[i] - f * 2) * 0.12 * k;
          sp[j] = -1;
        }
        speed = 0.25;
        if (state.cap[i] <= 0) respawn(state, i, X1 - Math.random());
      } else {
        ys[0] = pt.y;
        zs[0] = pt.z;
        sp[0] = pt.speed;
        for (let j = 1; j <= K; j++) {
          flowAt(sil, state, i, x + (trail * j) / K, t, pt);
          ys[j] = pt.y;
          zs[j] = pt.z;
          sp[j] = pt.speed;
        }
      }
      state.x[i] -= vis * speed * dt;
      if (state.x[i] < X0) respawn(state, i, X1 - Math.random() * 0.5);

      // Fade in after spawning upstream and out before leaving the scene; fade along the trail.
      const life = smoothstep(X1, X1 - 1.5, x) * smoothstep(X0, X0 + 2, x);
      const step = captured ? 0.03 : trail / K;
      for (let j = 0; j < K; j++) {
        const o = (i * K + j) * 6;
        pos[o] = x + step * j;
        pos[o + 1] = ys[j];
        pos[o + 2] = zs[j];
        pos[o + 3] = x + step * (j + 1);
        pos[o + 4] = ys[j + 1];
        pos[o + 5] = zs[j + 1];
        const c = (i * K + j) * 8;
        for (let e = 0; e < 2; e++) {
          const jj = j + e;
          const s = sp[jj];
          if (s < 0) tmp.copy(CABIN);
          else if (s < 1) tmp.copy(SLOW).lerp(MID, Math.max(0, Math.min(1, (s - 0.3) / 0.7)));
          else tmp.copy(MID).lerp(FAST, Math.min(1, (s - 1) / 0.35));
          col[c + e * 4] = tmp.r;
          col[c + e * 4 + 1] = tmp.g;
          col[c + e * 4 + 2] = tmp.b;
          col[c + e * 4 + 3] = 0.85 * life * Math.pow(1 - jj / K, 1.6);
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <lineSegments ref={lines} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent depthWrite={false} />
    </lineSegments>
  );
}

function respawn(p: Particles, i: number, x: number) {
  p.x[i] = x;
  const r = Math.random();
  if (r < 0.5) {
    // over the car
    p.y0[i] = 0.25 + Math.random() * 1.6;
    p.z0[i] = (Math.random() * 2 - 1) * (HALF_W - 0.1);
  } else if (r < 0.9) {
    // around the sides
    p.y0[i] = 0.25 + Math.random() * 1.3;
    p.z0[i] = (Math.random() < 0.5 ? -1 : 1) * (HALF_W + Math.random() * 1.6);
  } else {
    p.y0[i] = 0.08 + Math.random() * 0.1;
    p.z0[i] = (Math.random() * 2 - 1) * (HALF_W - 0.1);
  }
  p.phase[i] = Math.random() * Math.PI * 2;
  p.cap[i] = 0;
}
