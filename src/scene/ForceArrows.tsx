import { Html } from '@react-three/drei';
import type { OperatingPoint } from '../physics/steadyState';
import { AXLE_X, REAR_X } from './carGeometry';
import { C } from '../ui/theme';

/** Scale: metres of arrow per newton. */
const M_PER_N = 1 / 450;

function Arrow({ from, dir, n, color, label }: { from: [number, number, number]; dir: 1 | -1; n: number; color: string; label: string }) {
  const len = Math.max(0.12, Math.min(4, Math.abs(n) * M_PER_N));
  const head = Math.min(0.18, len * 0.4);
  const shaft = len - head;
  const sgn = dir * Math.sign(n || 1);
  return (
    <group position={from}>
      <mesh position={[(sgn * shaft) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, shaft, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[sgn * (shaft + head / 2), 0, 0]} rotation={[0, 0, -sgn * (Math.PI / 2)]}>
        <coneGeometry args={[0.07, head, 14]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={[sgn * (len + 0.1), 0.12, 0]} center style={{ pointerEvents: 'none' }}>
        <div
          style={{
            whiteSpace: 'nowrap',
            fontSize: 11,
            background: 'rgba(0,0,0,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
            color: '#fff',
            borderLeft: `3px solid ${color}`,
          }}
        >
          {label} {Math.abs(n).toFixed(0)} N
        </div>
      </Html>
    </group>
  );
}

/** Forces on the car, drawn to scale along the road (car frame: +x is forward). */
export function ForceArrows({ p }: { p: OperatingPoint }) {
  const drive = p.aeroN + p.rollN + p.gradeN;
  return (
    <group>
      {p.aeroN > 1 && <Arrow from={[REAR_X - 0.05, 1.0, 0]} dir={-1} n={p.aeroN} color={C.series[1]} label="Air drag" />}
      {p.rollN > 1 && <Arrow from={[-AXLE_X, 0.05, 1.05]} dir={-1} n={p.rollN} color={C.series[0]} label="Rolling" />}
      {Math.abs(p.gradeN) > 5 && (
        <Arrow from={[0, 0.55, -1.15]} dir={-1} n={p.gradeN} color={C.series[2]} label={p.gradeN > 0 ? 'Gravity (uphill)' : 'Gravity (downhill)'} />
      )}
      {Math.abs(drive) > 5 && (
        <Arrow from={[AXLE_X, 0.05, 1.05]} dir={1} n={drive} color={drive > 0 ? '#e3efff' : C.serious} label={drive > 0 ? 'Drive' : 'Engine braking'} />
      )}
    </group>
  );
}
