import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OperatingPoint } from '../physics/steadyState';
import type { Scenario } from '../physics/scenario';
import { Airflow } from './Airflow';
import { CarModel } from './CarModel';
import { ForceArrows } from './ForceArrows';
import { Lighting, ScrollingRoad } from './Stage';

export interface SceneToggles {
  airflow: boolean;
  forces: boolean;
  paint: string;
  /** Camera preset; `nonce` re-triggers the same preset. */
  view?: { id: CameraView; nonce: number };
}

export type CameraView = 'front34' | 'side' | 'rear34' | 'top';

export const CAMERA_VIEWS: Record<CameraView, { label: string; pos: [number, number, number] }> = {
  front34: { label: '¾ front', pos: [5.2, 2.4, 5.6] },
  side: { label: 'Side', pos: [0, 1.2, 8.5] },
  rear34: { label: '¾ rear', pos: [-6, 2.2, 4.8] },
  top: { label: 'Top', pos: [0.01, 10, 0.01] },
};

function CameraRig({ view }: { view?: { id: CameraView; nonce: number } }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    if (!view) return;
    camera.position.set(...CAMERA_VIEWS[view.id].pos);
    controls?.target.set(0, 0.8, 0);
    controls?.update();
  }, [view, camera, controls]);
  return null;
}

/** 3D view for the analysis tab: the car on a road tilted to the current gradient. */
export function AnalyseScene({
  s,
  p,
  toggles,
  onWindowClick,
}: {
  s: Scenario;
  p: OperatingPoint;
  toggles: SceneToggles;
  onWindowClick: (i: number) => void;
}) {
  const speedRef = useRef(s.speedKmh / 3.6);
  const braking = useRef(false);
  useEffect(() => {
    speedRef.current = s.speedKmh / 3.6;
    braking.current = p.status === 'braking';
  }, [s.speedKmh, p.status]);
  const tilt = Math.atan(s.gradePct / 100);
  return (
    <Canvas shadows camera={{ position: [5.2, 2.4, 5.6], fov: 40, near: 0.1, far: 800 }} dpr={[1, 2]}>
      <Lighting />
      <group rotation={[0, 0, tilt]}>
        <ScrollingRoad speedRef={speedRef} />
        <CarModel
          paint={toggles.paint}
          tyre={s.tyre}
          windows={s.windows}
          speedRef={speedRef}
          brakingRef={braking}
          onWindowClick={onWindowClick}
          roofBox={s.accessory === 'roofBox'}
        />
        {toggles.airflow && <Airflow speedRef={speedRef} windows={s.windows} />}
        {toggles.forces && <ForceArrows p={p} />}
      </group>
      <OrbitControls makeDefault target={[0, 0.8, 0]} minDistance={3} maxDistance={25} maxPolarAngle={Math.PI / 2 - 0.05} enablePan={false} />
      <CameraRig view={toggles.view} />
    </Canvas>
  );
}
