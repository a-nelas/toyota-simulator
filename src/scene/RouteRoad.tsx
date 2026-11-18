import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleProfile, type RouteProfile } from '../physics/routes';

const BACK = 250;
const AHEAD = 900;
const STEP = 5;

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Road and terrain along a route's elevation profile, rebuilt in chunks around the car.
 * Floating origin: the car stays at (0,0,0); the world moves, so precision holds on long routes.
 */
export function RouteRoad({ profile, xRef }: { profile: RouteProfile; xRef: React.MutableRefObject<number> }) {
  const [origin, setOrigin] = useState(0);
  const group = useRef<THREE.Group>(null);

  const geos = useMemo(() => {
    const x0 = Math.max(-BACK, origin - BACK);
    const x1 = Math.min(profile.lengthM + 200, origin + AHEAD);
    const e0 = sampleProfile(profile, origin, profile.elevation);
    const n = Math.floor((x1 - x0) / STEP) + 1;
    const road: number[] = [];
    const roadUv: number[] = [];
    const ground: number[] = [];
    const line: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * STEP;
      const y = sampleProfile(profile, Math.max(0, Math.min(profile.lengthM, x)), profile.elevation) - e0;
      const lx = x - origin;
      road.push(lx, y, -3.6, lx, y, 7.3);
      roadUv.push(0, x / 8, 1, x / 8);
      ground.push(lx, y - 0.25, -80, lx, y - 0.05, -3.6, lx, y - 0.05, 7.3, lx, y - 0.25, 90);
      line.push(lx, y + 0.012, 1.78, lx, y + 0.012, 1.92);
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const mk = (pos: number[], index: number[], uv?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(index);
      g.computeVertexNormals();
      return g;
    };
    const gIdx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = i * 4 + k;
        gIdx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
      }
    }
    // Dashed centre line: only every other 12 m.
    const lIdx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const x = x0 + i * STEP;
      if (Math.floor(x / 12) % 2 === 0) {
        const a = i * 2;
        lIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    // Trees and marker posts.
    const trees: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) {
      const y = sampleProfile(profile, Math.max(0, Math.min(profile.lengthM, x)), profile.elevation) - e0;
      const r = hash(x);
      if (r < 0.55) {
        const side = hash(x + 3) < 0.5 ? -1 : 1;
        const z = side > 0 ? 10 + hash(x + 7) * 40 : -6.5 - hash(x + 9) * 40;
        const sc = 0.7 + hash(x + 11) * 0.9;
        trees.push(new THREE.Matrix4().compose(new THREE.Vector3(x - origin, y + 2.2 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)));
      }
      if (x % 50 === 0) {
        posts.push(new THREE.Matrix4().makeTranslation(x - origin, y + 0.5, -4.4));
        posts.push(new THREE.Matrix4().makeTranslation(x - origin, y + 0.5, 8.1));
      }
    }
    return {
      road: mk(road, idx, roadUv),
      ground: mk(ground, gIdx),
      line: mk(line, lIdx),
      trees,
      posts,
      e0,
    };
  }, [profile, origin]);

  const treeMesh = useRef<THREE.InstancedMesh>(null);
  const postMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const t = treeMesh.current;
    const p = postMesh.current;
    if (t) {
      geos.trees.slice(0, 400).forEach((m, i) => t.setMatrixAt(i, m));
      t.count = Math.min(400, geos.trees.length);
      t.instanceMatrix.needsUpdate = true;
    }
    if (p) {
      geos.posts.slice(0, 80).forEach((m, i) => p.setMatrixAt(i, m));
      p.count = Math.min(80, geos.posts.length);
      p.instanceMatrix.needsUpdate = true;
    }
  }, [geos]);

  useFrame(() => {
    const x = xRef.current;
    if (Math.abs(x - origin) > 200) setOrigin(Math.round(x / 100) * 100);
    const e = sampleProfile(profile, Math.max(0, Math.min(profile.lengthM, x)), profile.elevation);
    group.current?.position.set(origin - x, geos.e0 - e, 0);
  });

  return (
    <group ref={group}>
      <mesh geometry={geos.road} receiveShadow>
        <meshStandardMaterial color="#2d2e30" roughness={0.95} />
      </mesh>
      <mesh geometry={geos.line}>
        <meshStandardMaterial color="#efefe8" />
      </mesh>
      <mesh geometry={geos.ground} receiveShadow>
        <meshStandardMaterial color="#56632f" roughness={1} />
      </mesh>
      <instancedMesh ref={treeMesh} args={[undefined, undefined, 400]} castShadow>
        <coneGeometry args={[1.4, 4.4, 7]} />
        <meshStandardMaterial color="#2f4a22" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={postMesh} args={[undefined, undefined, 80]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color="#f2f2ee" />
      </instancedMesh>
    </group>
  );
}
