import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Windows } from '../physics/aero';
import { TYRES, freeRadius, rollingRadius, type TyreId } from '../physics/tyres';
import { VEHICLE } from '../physics/vehicle';
import {
  AXLE_X,
  BELT_Y,
  FRONT_X,
  GLASS_TILT,
  REAR_X,
  WINDOW_HEIGHT,
  WINDOW_SHAPES,
  buildBody,
  clipAboveZero,
  halfWidthAt,
  quad,
  shapeGeometry,
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

function Wheel({ x, z, tyre, speedRef }: { x: number; z: number; tyre: TyreId; speedRef: React.MutableRefObject<number> }) {
  const spin = useRef<THREE.Group>(null);
  const t = TYRES[tyre];
  const r = freeRadius(t);
  const rr = rollingRadius(t);
  const rim = (t.rimIn * 0.0254) / 2;
  const w = t.widthMm / 1000;
  const side = Math.sign(z);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z -= (speedRef.current / rr) * Math.min(dt, 0.05);
  });
  return (
    <group position={[x, rr, z]}>
      <group ref={spin}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r, r, w, 40, 1]} />
          <meshStandardMaterial color="#141414" roughness={0.9} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * (w / 2 - 0.012)]}>
          <cylinderGeometry args={[rim * 0.98, rim * 0.98, 0.03, 40]} />
          <meshStandardMaterial color="#9aa0a6" metalness={0.85} roughness={0.3} />
        </mesh>
        {[0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[0, 0, side * (w / 2 + 0.004)]} rotation={[0, 0, (k * 2 * Math.PI) / 5]}>
            <boxGeometry args={[0.05, rim * 1.75, 0.02]} />
            <meshStandardMaterial color="#c9cdd2" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}
        <mesh position={[0, 0, side * (w / 2 + 0.012)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
          <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
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
  const z = side * (halfWidthAt(BELT_Y) + 0.014);
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
        <meshStandardMaterial color={hover ? '#1d2b3a' : '#07090b'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {glassGeo && <mesh geometry={glassGeo} material={glass} position={[0, 0, side * 0.004]} {...handlers} />}
      {/* Top edge of a lowered pane. */}
      {open > 0.02 && open < 0.98 && glassGeo && (
        <mesh position={[(pts[0][0] + pts[1][0]) / 2, (1 - open) * WINDOW_HEIGHT - 0.003, side * 0.006]}>
          <boxGeometry args={[Math.abs(pts[0][0] - pts[1][0]) * 0.9, 0.006, 0.004]} />
          <meshStandardMaterial color="#9fb5c4" />
        </mesh>
      )}
    </group>
  );
}

export function CarModel({ paint, tyre, windows, speedRef, brakingRef, onWindowClick, roofBox }: Props) {
  const body = useMemo(() => buildBody(), []);
  const [hovered, setHovered] = useState<number | null>(null);
  const paintMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    [paint],
  );
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#1b2833',
        metalness: 0.2,
        roughness: 0.04,
        transparent: true,
        opacity: 0.82,
        clearcoat: 1,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.5 }), []);
  const tailRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (tailRef.current) tailRef.current.emissiveIntensity = brakingRef?.current ? 3 : 0.6;
  });

  const ws = useMemo(() => {
    const yb = 0.93;
    const yt = 1.39;
    const wb = halfWidthAt(yb) - 0.07;
    const wt = halfWidthAt(yt) - 0.1;
    return quad([0.93, yb + 0.012, -wb], [0.93, yb + 0.012, wb], [0.17, yt + 0.012, wt], [0.17, yt + 0.012, -wt]);
  }, []);
  const rearGlass = useMemo(() => {
    const yt = 1.36;
    const yb = 1.03;
    const wt = halfWidthAt(yt) - 0.1;
    const wb = halfWidthAt(yb) - 0.12;
    return quad([-2.13, yt + 0.01, wt], [-2.13, yt + 0.01, -wt], [-2.38, yb, -wb], [-2.38, yb, wb]);
  }, []);
  const track = VEHICLE.trackFrontM / 2;

  const windowFor = (shapeId: number | null, side: 1 | -1) => {
    if (shapeId === null) return { open: 0, idx: null as number | null };
    // Window index: 0 FL, 1 FR, 2 RL, 3 RR. z>0 is the car's left.
    const idx = shapeId === 0 ? (side === 1 ? 0 : 1) : side === 1 ? 2 : 3;
    return { open: windows[idx], idx };
  };

  return (
    <group>
      <mesh geometry={body} material={paintMat} castShadow receiveShadow />
      {/* Black lower cladding & bumpers. */}
      <mesh position={[(FRONT_X + REAR_X) / 2, 0.24, 0]} material={trim}>
        <boxGeometry args={[VEHICLE.lengthM - 0.5, 0.06, VEHICLE.widthM - 0.12]} />
      </mesh>
      {/* Windscreen and tailgate glass. */}
      <mesh geometry={ws} material={glass} />
      <mesh geometry={rearGlass} material={glass} />
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
              glass={glass}
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
      {/* B-pillars. */}
      {([1, -1] as const).map((side) => (
        <mesh key={side} position={[-0.02, BELT_Y + 0.2, side * (halfWidthAt(BELT_Y + 0.2) + 0.006)]} rotation={[side * -GLASS_TILT, 0, 0]}>
          <boxGeometry args={[0.09, 0.4, 0.004]} />
          <meshStandardMaterial color="#0b0b0c" roughness={0.3} />
        </mesh>
      ))}
      {/* Roof rails. */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[-0.75, 1.475, side * 0.56]} castShadow>
          <boxGeometry args={[2.3, 0.035, 0.035]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {roofBox && (
        <mesh position={[-0.7, 1.68, 0]} castShadow>
          <capsuleGeometry args={[0.2, 1.4, 6, 16]} />
          <meshStandardMaterial color="#202224" roughness={0.4} metalness={0.2} />
        </mesh>
      )}
      {/* Mirrors. */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0.78, 1.04, side * 0.98]}>
          <boxGeometry args={[0.16, 0.11, 0.18]} />
          <meshPhysicalMaterial color={paint} metalness={0.5} roughness={0.3} clearcoat={1} />
        </mesh>
      ))}
      {/* Headlights (LED DRL strip + lens). */}
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh position={[FRONT_X - 0.16, 0.7, side * 0.6]} rotation={[0, side * 0.35, 0]}>
            <boxGeometry args={[0.14, 0.09, 0.36]} />
            <meshStandardMaterial color="#cfd8e0" emissive="#e8f2ff" emissiveIntensity={0.9} metalness={0.3} roughness={0.1} />
          </mesh>
          <mesh position={[REAR_X + 0.04, 0.95, side * 0.68]}>
            <boxGeometry args={[0.06, 0.12, 0.2]} />
            <meshStandardMaterial ref={side === 1 ? tailRef : undefined} color="#5a0a0a" emissive="#ff1a1a" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      {/* Grille & lower intake. */}
      <mesh position={[FRONT_X + 0.005, 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.05, 0.2]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Wheels. */}
      {[AXLE_X, -AXLE_X].map((x) =>
        [track, -track].map((z) => <Wheel key={`${x}${z}`} x={x} z={z} tyre={tyre} speedRef={speedRef} />),
      )}
    </group>
  );
}
