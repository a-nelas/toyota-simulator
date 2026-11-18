import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Windows } from '../physics/aero';
import { TYRES, freeRadius, rollingRadius, type TyreId } from '../physics/tyres';
import { VEHICLE } from '../physics/vehicle';
import {
  ARCH_R,
  ARCH_Y,
  AXLE_X,
  BELT_Y,
  FRONT_X,
  GLASS_TILT,
  HALF_W,
  MAT,
  REAR_X,
  WINDOW_HEIGHT,
  WINDOW_SHAPES,
  buildBody,
  buildDecals,
  clipAboveZero,
  halfWidthAt,
  section,
  shapeGeometry,
  shutLine,
  shutLineH,
  surfaceTopAt,
} from './carGeometry';

export const PAINTS: Record<string, string> = {
  'Silver metallic': '#aeb3b8',
  'Pure white': '#e9eaea',
  'Grey metallic': '#5d6166',
  'Tokyo red': '#9b1b1f',
  'Dark blue': '#1d2c4a',
  'Black mica': '#16171a',
};

interface Props {
  paint: string;
  tyre: TyreId;
  windows: Windows;
  /** Wheel angular speed source: returns current speed (m/s). */
  speedRef: React.MutableRefObject<number>;
  brakingRef?: React.MutableRefObject<boolean>;
  onWindowClick?: (index: number) => void;
  roofBox?: boolean;
}

/** Shared materials that don't depend on the paint colour. */
function useMaterials() {
  return useMemo(() => {
    const trim = new THREE.MeshPhysicalMaterial({ color: '#101113', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    return {
      trim,
      trimMatte: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.85 }),
      bodyGlass: new THREE.MeshPhysicalMaterial({ color: '#0c141b', metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
      sideGlass: new THREE.MeshPhysicalMaterial({
        color: '#1b2833',
        metalness: 0.2,
        roughness: 0.04,
        transparent: true,
        opacity: 0.82,
        clearcoat: 1,
        side: THREE.DoubleSide,
      }),
      head: new THREE.MeshPhysicalMaterial({ color: '#27313a', metalness: 0.9, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 }),
      drl: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f2f7ff', emissiveIntensity: 2.2 }),
      tail: new THREE.MeshPhysicalMaterial({ color: '#4a070b', roughness: 0.15, clearcoat: 1, emissive: '#ff1a1a', emissiveIntensity: 0.5 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#d9dde1', metalness: 1, roughness: 0.16 }),
      rim: new THREE.MeshStandardMaterial({ color: '#b8bdc3', metalness: 0.9, roughness: 0.28 }),
      tyre: new THREE.MeshStandardMaterial({ color: '#141415', roughness: 0.92, side: THREE.DoubleSide }),
      disc: new THREE.MeshStandardMaterial({ color: '#6c6e71', metalness: 0.8, roughness: 0.45 }),
      plate: new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 }),
      railMetal: new THREE.MeshStandardMaterial({ color: '#a7adb3', metalness: 0.85, roughness: 0.32 }),
      grilleSlat: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.3, roughness: 0.5 }),
      euBand: new THREE.MeshStandardMaterial({ color: '#1c3f94', roughness: 0.5 }),
    };
  }, []);
}

type Mats = ReturnType<typeof useMaterials>;

const RAIL_Z = 0.585;

/** Roof rail along the roof edge: a flattened tube 4 cm above the roof, sloping to a foot at each end. */
function roofRail(side: 1 | -1): THREE.BufferGeometry {
  const x0 = 0.1;
  const x1 = -2.03;
  const smooth = (e: number, t: number) => {
    const u = Math.min(1, Math.max(0, t / e));
    return u * u * (3 - 2 * u);
  };
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    const x = x0 + (x1 - x0) * u;
    const lift = 0.008 + 0.032 * smooth(0.1, u) * smooth(0.1, 1 - u);
    pts.push(new THREE.Vector3(x, surfaceTopAt(x, RAIL_Z) + lift, side * RAIL_Z));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.013, 10, false);
  // Flatten to an oval section (taller than wide reads better from the side).
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, side * RAIL_Z + (p.getZ(i) - side * RAIL_Z) * 0.75);
  g.computeVertexNormals();
  return g;
}

function tyreProfile(r: number, rim: number, w: number): THREE.Vector2[] {
  const hw = w / 2;
  const c = Math.min(0.035, (r - rim) * 0.35);
  const bead = rim + 0.012;
  const pts: THREE.Vector2[] = [new THREE.Vector2(bead, -hw * 0.86), new THREE.Vector2(bead + (r - c - bead) * 0.55, -hw * 1.0)];
  for (let i = 0; i <= 6; i++) {
    const f = (Math.PI / 2) * (i / 6);
    pts.push(new THREE.Vector2(r - c + c * Math.sin(f), -hw + c - c * Math.cos(f)));
  }
  for (let i = 0; i <= 6; i++) {
    const f = (Math.PI / 2) * (i / 6);
    pts.push(new THREE.Vector2(r - c + c * Math.cos(f), hw - c + c * Math.sin(f)));
  }
  pts.push(new THREE.Vector2(bead + (r - c - bead) * 0.55, hw * 1.0), new THREE.Vector2(bead, hw * 0.86));
  return pts;
}

function Wheel({ x, z, tyre, speedRef, mats }: { x: number; z: number; tyre: TyreId; speedRef: React.MutableRefObject<number>; mats: Mats }) {
  const spin = useRef<THREE.Group>(null);
  const t = TYRES[tyre];
  const r = freeRadius(t);
  const rr = rollingRadius(t);
  const rim = (t.rimIn * 0.0254) / 2;
  const w = t.widthMm / 1000;
  const side = Math.sign(z);
  const tyreGeo = useMemo(() => new THREE.LatheGeometry(tyreProfile(r, rim, w), 56), [r, rim, w]);
  const face = side * (w / 2 - 0.02);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z -= (speedRef.current / rr) * Math.min(dt, 0.05);
  });
  return (
    <group position={[x, rr, z]}>
      {/* Brake disc and caliper (do not spin). */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * 0.0]} material={mats.disc}>
        <cylinderGeometry args={[rim * 0.8, rim * 0.8, 0.026, 36]} />
      </mesh>
      <mesh position={[-rim * 0.62, rim * 0.32, side * 0.03]} rotation={[0, 0, 0.45]} material={mats.trimMatte}>
        <boxGeometry args={[0.07, 0.15, 0.06]} />
      </mesh>
      <group ref={spin}>
        <mesh geometry={tyreGeo} rotation={[Math.PI / 2, 0, 0]} material={mats.tyre} castShadow />
        {/* Rim barrel (dark) and polished lip. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.trimMatte}>
          <cylinderGeometry args={[rim * 0.99, rim * 0.99, w * 0.85, 36, 1, true]} />
        </mesh>
        <mesh position={[0, 0, face]} material={mats.rim}>
          <torusGeometry args={[rim * 0.97, 0.011, 8, 48]} />
        </mesh>
        {/* Five twin spokes. */}
        {[0, 1, 2, 3, 4].map((k) =>
          [-0.085, 0.085].map((o) => (
            <mesh key={`${k}${o}`} position={[0, 0, face - side * 0.012]} rotation={[0, 0, (k * 2 * Math.PI) / 5 + o]} material={mats.rim}>
              <boxGeometry args={[0.024, rim * 1.9, 0.024]} />
            </mesh>
          )),
        )}
        <mesh position={[0, 0, face - side * 0.008]} rotation={[Math.PI / 2, 0, 0]} material={mats.rim}>
          <cylinderGeometry args={[0.075, 0.085, 0.04, 24]} />
        </mesh>
        <mesh position={[0, 0, face + side * 0.013]} rotation={[Math.PI / 2, 0, 0]} material={mats.trimMatte}>
          <cylinderGeometry args={[0.03, 0.03, 0.006, 16]} />
        </mesh>
      </group>
    </group>
  );
}

function SideWindow({
  pts,
  open,
  side,
  onClick,
  glass,
  hover,
  setHover,
}: {
  pts: [number, number][];
  open: number;
  side: 1 | -1;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  glass: THREE.Material;
  hover: boolean;
  setHover?: (h: boolean) => void;
}) {
  const shift = open * WINDOW_HEIGHT;
  const glassGeo = useMemo(() => {
    const moved = pts.map(([x, y]) => [x, y - shift] as [number, number]);
    const clipped = clipAboveZero(moved);
    return clipped.length >= 3 ? shapeGeometry(clipped) : null;
  }, [pts, shift]);
  const openingGeo = useMemo(() => shapeGeometry(pts), [pts]);
  const z = side * (halfWidthAt(BELT_Y) + 0.012);
  const top = Math.max(...pts.map((p) => p[1]));
  const handlers = onClick
    ? {
        onClick,
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover?.(true);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHover?.(false);
          document.body.style.cursor = '';
        },
      }
    : {};
  return (
    <group position={[0, BELT_Y, z]} rotation={[-side * GLASS_TILT, 0, 0]}>
      {/* Dark cabin behind the glass. */}
      <mesh geometry={openingGeo} position={[0, 0, -side * 0.003]} {...handlers}>
        <meshStandardMaterial color={hover ? '#3a4a5c' : '#2a2e34'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {glassGeo && <mesh geometry={glassGeo} material={glass} position={[0, 0, side * 0.004]} {...handlers} />}
      {/* Top edge of a lowered pane. */}
      {open > 0.02 && open < 0.98 && glassGeo && (
        <mesh position={[(pts[0][0] + pts[1][0]) / 2, Math.min(top, WINDOW_HEIGHT) - shift - 0.003, side * 0.006]}>
          <boxGeometry args={[Math.abs(pts[0][0] - pts[1][0]) * 0.9, 0.006, 0.004]} />
          <meshStandardMaterial color="#9fb5c4" />
        </mesh>
      )}
    </group>
  );
}

/** Flat shape on the rear face (normal −x), given in (z, y). */
function RearDecal({ pts, material, dx = 0.003 }: { pts: [number, number][]; material: THREE.Material; dx?: number }) {
  const geo = useMemo(() => shapeGeometry(pts), [pts]);
  return <mesh geometry={geo} material={material} position={[REAR_X - dx, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />;
}

/** Shut lines, handles and belt chrome on one side (built for the left side, mirrored for the right). */
function SideDetails({ mats }: { mats: Mats }) {
  const lines = useMemo(() => {
    const b = (x: number) => section(x).B + 0.03;
    return [
      shutLine(0.86, b(0.86), BELT_Y - 0.004), // front door, front edge
      shutLine(-0.035, b(-0.035), BELT_Y - 0.004), // between the doors
      shutLine(-0.96, b(-0.96), BELT_Y - 0.004), // rear door, rear edge
      shutLineH(0.265, 0.86, -0.96), // door bottoms
      shutLine(-2.2, 0.8, 0.975), // tailgate edge
    ];
  }, []);
  const handleZ = (x: number) => halfWidthAt(0.9, x) + 0.008;
  return (
    <group>
      {lines.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.trimMatte} />
      ))}
      {[0.18, -0.78].map((x) => (
        <mesh key={x} position={[x, 0.9, handleZ(x)]} material={mats.chrome}>
          <boxGeometry args={[0.15, 0.028, 0.018]} />
        </mesh>
      ))}
      {/* Chrome belt moulding. */}
      <mesh position={[(0.72 - 2.04) / 2, BELT_Y + 0.004, halfWidthAt(BELT_Y) + 0.012]} material={mats.chrome}>
        <boxGeometry args={[0.72 + 2.04, 0.011, 0.006]} />
      </mesh>
    </group>
  );
}

function Mirror({ side, paintMat, mats }: { side: 1 | -1; paintMat: THREE.Material; mats: Mats }) {
  const zb = halfWidthAt(1.0, 0.78);
  return (
    <group position={[0.76, 1.04, side * (zb + 0.13)]}>
      <RoundedBox args={[0.13, 0.115, 0.21]} radius={0.04} smoothness={4} material={paintMat} castShadow />
      <mesh position={[-0.066, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.bodyGlass}>
        <planeGeometry args={[0.17, 0.085]} />
      </mesh>
      {/* Indicator strip and arm. */}
      <mesh position={[0.02, -0.035, side * 0.09]} material={mats.tail}>
        <boxGeometry args={[0.08, 0.012, 0.03]} />
      </mesh>
      <mesh position={[0.0, -0.045, -side * 0.12]} material={mats.trim}>
        <boxGeometry args={[0.08, 0.04, 0.09]} />
      </mesh>
    </group>
  );
}

export function CarModel({ paint, tyre, windows, speedRef, brakingRef, onWindowClick, roofBox }: Props) {
  const body = useMemo(() => buildBody(), []);
  const decals = useMemo(() => buildDecals(), []);
  const [hovered, setHovered] = useState<number | null>(null);
  const mats = useMaterials();
  const paintMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    [paint],
  );
  const bodyMats = useMemo(() => {
    const m: THREE.Material[] = [];
    m[MAT.paint] = paintMat;
    m[MAT.glass] = mats.bodyGlass;
    m[MAT.trim] = mats.trim;
    m[MAT.head] = mats.head;
    m[MAT.tail] = mats.tail;
    m[MAT.drl] = mats.drl;
    m[MAT.chrome] = mats.chrome;
    m[MAT.grey] = mats.grilleSlat;
    m[MAT.grille] = mats.trimMatte;
    return m;
  }, [paintMat, mats]);
  useFrame(() => {
    mats.tail.emissiveIntensity = brakingRef?.current ? 3 : 0.5;
  });

  const track = VEHICLE.trackFrontM / 2;
  const windowFor = (shapeId: number | null, side: 1 | -1) => {
    if (shapeId === null) return { open: 0, idx: null as number | null };
    // Window index: 0 FL, 1 FR, 2 RL, 3 RR. z>0 is the car's left.
    const idx = shapeId === 0 ? (side === 1 ? 0 : 1) : side === 1 ? 2 : 3;
    return { open: windows[idx], idx };
  };

  // Rear-face decals: tail lights (wrap from the corners), plate, bumper reflectors.
  const rearW = (y: number) => halfWidthAt(y, REAR_X) - 0.01;
  const tailPts = (s: 1 | -1): [number, number][] =>
    [
      [0.42, 0.955],
      [rearW(0.955), 0.955],
      [rearW(0.85), 0.85],
      [0.6, 0.835],
      [0.42, 0.88],
    ].map(([z, y]) => [s * z, y] as [number, number]);
  const railGeos = useMemo(() => ([1, -1] as const).map((side) => roofRail(side)), []);
  const railY = surfaceTopAt(-0.8, RAIL_Z) + 0.04;

  return (
    <group>
      <mesh geometry={body.geometry} material={bodyMats} castShadow receiveShadow />
      <mesh geometry={decals} material={bodyMats} />

      {/* Wheel-arch liners (seen through the arches). */}
      {[AXLE_X, -AXLE_X].map((x) => (
        <mesh key={x} position={[x, ARCH_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.trimMatte}>
          <cylinderGeometry args={[ARCH_R + 0.012, ARCH_R + 0.012, 2 * HALF_W - 0.06, 32, 1, true, Math.PI / 2, Math.PI]} />
        </mesh>
      ))}

      {/* Side glass: both sides. */}
      {([1, -1] as const).map((side) =>
        WINDOW_SHAPES.map((w, k) => {
          const { open, idx } = windowFor(w.id, side);
          return (
            <SideWindow
              key={`${side}-${k}`}
              pts={w.pts}
              open={open}
              side={side}
              glass={mats.sideGlass}
              hover={idx !== null && hovered === idx}
              setHover={idx !== null ? (h) => setHovered(h ? idx : null) : undefined}
              onClick={
                idx !== null && onWindowClick
                  ? (e) => {
                      e.stopPropagation();
                      onWindowClick(idx);
                    }
                  : undefined
              }
            />
          );
        }),
      )}

      <SideDetails mats={mats} />
      <group scale={[1, 1, -1]}>
        <SideDetails mats={mats} />
      </group>
      <Mirror side={1} paintMat={paintMat} mats={mats} />
      <Mirror side={-1} paintMat={paintMat} mats={mats} />

      {/* Roof rails: satin aluminium, following the roof and dipping into a foot at each end. */}
      {railGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.railMetal} castShadow />
      ))}
      {/* Roof spoiler over the tailgate and a shark-fin antenna. */}
      <mesh position={[-2.15, surfaceTopAt(-2.1, 0) - 0.012, 0]} rotation={[0, 0, 0.1]} material={paintMat} castShadow>
        <boxGeometry args={[0.13, 0.02, 1.16]} />
      </mesh>
      <mesh position={[-1.85, surfaceTopAt(-1.85, 0) + 0.025, 0]} scale={[0.14, 0.05, 0.045]} material={mats.trim}>
        <sphereGeometry args={[1, 16, 10]} />
      </mesh>
      {roofBox && (
        <mesh position={[-0.75, railY + 0.24, 0]} castShadow>
          <capsuleGeometry args={[0.2, 1.4, 6, 16]} />
          <meshStandardMaterial color="#202224" roughness={0.4} metalness={0.2} />
        </mesh>
      )}

      {/* Wipers at the base of the windscreen. */}
      {[0.32, -0.28].map((z) => (
        <mesh key={z} position={[0.86, 0.985, z]} rotation={[0, 0.15, 0.5]} material={mats.trimMatte}>
          <boxGeometry args={[0.03, 0.012, 0.55]} />
        </mesh>
      ))}

      {/* Rear face: tail lights, plate, reflectors, tailgate shut line. */}
      <RearDecal pts={tailPts(1)} material={mats.tail} />
      <RearDecal pts={tailPts(-1)} material={mats.tail} />
      <RearDecal pts={[[-0.26, 0.67], [0.26, 0.67], [0.26, 0.78], [-0.26, 0.78]]} material={mats.plate} />
      <RearDecal pts={[[-0.26, 0.67], [-0.215, 0.67], [-0.215, 0.78], [-0.26, 0.78]]} material={mats.euBand} dx={0.004} />
      <RearDecal pts={[[-0.33, 0.8], [0.33, 0.8], [0.33, 0.815], [-0.33, 0.815]]} material={mats.chrome} />
      <RearDecal pts={[[-0.72, 0.6], [0.72, 0.6], [0.72, 0.606], [-0.72, 0.606]]} material={mats.trimMatte} />
      {[1, -1].map((s) => (
        <RearDecal key={s} pts={[[s * 0.55, 0.45], [s * 0.7, 0.45], [s * 0.7, 0.475], [s * 0.55, 0.475]]} material={mats.tail} />
      ))}

      {/* Front plate on the lower grille. */}
      <mesh position={[FRONT_X + 0.004, 0.43, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.plate}>
        <planeGeometry args={[0.52, 0.11]} />
      </mesh>
      <mesh position={[FRONT_X + 0.005, 0.43, 0.235]} rotation={[0, Math.PI / 2, 0]} material={mats.euBand}>
        <planeGeometry args={[0.045, 0.11]} />
      </mesh>

      {/* Wheels. */}
      {[AXLE_X, -AXLE_X].map((x) =>
        [track, -track].map((z) => <Wheel key={`${x}${z}`} x={x} z={z} tyre={tyre} speedRef={speedRef} mats={mats} />),
      )}
    </group>
  );
}
