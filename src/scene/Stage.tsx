import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';

/** Lights, sky and a procedural reflection environment (no network assets). */
export function Lighting() {
  return (
    <>
      <Sky sunPosition={[60, 40, 30]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} />
      <hemisphereLight args={['#dbe8ff', '#3b4a2a', 0.55]} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <Environment resolution={256}>
        <Lightformer intensity={1.3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer intensity={1} position={[-8, 2, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} color="#cfe2ff" />
        <Lightformer intensity={0.8} position={[8, 2, -4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} color="#ffe8cc" />
        <Lightformer intensity={0.3} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} color="#55603f" />
      </Environment>
    </>
  );
}

function dashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2c2e';
  g.fillRect(0, 0, 64, 256);
  // asphalt grain
  for (let i = 0; i < 1400; i++) {
    const v = 35 + Math.random() * 25;
    g.fillStyle = `rgb(${v},${v},${v + 2})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Straight road segment that scrolls under a stationary car to show speed.
 * Lies in the car's frame (x forward); the parent group tilts it to the gradient.
 */
export function ScrollingRoad({ speedRef }: { speedRef: React.MutableRefObject<number> }) {
  const tex = useMemo(() => {
    const t = dashTexture();
    t.repeat.set(1, 60);
    return t;
  }, []);
  const grass = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4c5a2e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      const h = 70 + Math.random() * 40;
      g.fillStyle = `hsl(${h}, ${25 + Math.random() * 20}%, ${22 + Math.random() * 14}%)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(80, 80);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const dashes = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const offset = useRef(0);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const LEN = 300;
  const DASH_SP = 12;
  const NDASH = Math.ceil(LEN / DASH_SP);
  const POST_SP = 25;
  const NPOST = Math.ceil(LEN / POST_SP) * 2;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    offset.current += speedRef.current * dt;
    tex.offset.y = offset.current / (LEN / 60);
    grass.offset.x = offset.current / (400 / 80);
    if (dashes.current) {
      for (let i = 0; i < NDASH; i++) {
        const x = ((((i * DASH_SP - offset.current) % LEN) + LEN) % LEN) - LEN / 2;
        m.makeTranslation(x, 0.012, 1.85);
        dashes.current.setMatrixAt(i, m);
      }
      dashes.current.instanceMatrix.needsUpdate = true;
    }
    if (posts.current) {
      for (let i = 0; i < NPOST; i++) {
        const k = Math.floor(i / 2);
        const x = ((((k * POST_SP - offset.current) % LEN) + LEN) % LEN) - LEN / 2;
        m.makeTranslation(x, 0.5, i % 2 ? 5.6 : -5.6);
        posts.current.setMatrixAt(i, m);
      }
      posts.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.005, 1.85]} receiveShadow>
        <planeGeometry args={[11, LEN]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      {/* Edge lines. */}
      {[-3.55, 7.25].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, z]}>
          <planeGeometry args={[LEN, 0.15]} />
          <meshStandardMaterial color="#e8e8e2" roughness={0.7} />
        </mesh>
      ))}
      <instancedMesh ref={dashes} args={[undefined, undefined, NDASH]}>
        <boxGeometry args={[4, 0.004, 0.13]} />
        <meshStandardMaterial color="#efefe8" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, NPOST]} castShadow>
        <boxGeometry args={[0.12, 1.0, 0.12]} />
        <meshStandardMaterial color="#f2f2ee" roughness={0.6} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
    </group>
  );
}
