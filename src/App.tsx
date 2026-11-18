import { lazy, Suspense } from 'react';
import { useStore, type Tab } from './state/store';
import { AnalysePage } from './ui/AnalysePage';

const DrivePage = lazy(() => import('./ui/DrivePage').then((m) => ({ default: m.DrivePage })));
const RoutesPage = lazy(() => import('./ui/RoutesPage').then((m) => ({ default: m.RoutesPage })));
const CalibrationPage = lazy(() => import('./ui/CalibrationPage').then((m) => ({ default: m.CalibrationPage })));
const ValidationPage = lazy(() => import('./ui/ValidationPage').then((m) => ({ default: m.ValidationPage })));
const ModelCardPage = lazy(() => import('./ui/ModelCardPage').then((m) => ({ default: m.ModelCardPage })));

const TABS: { id: Tab; label: string }[] = [
  { id: 'analyse', label: 'Analyse' },
  { id: 'drive', label: 'Drive' },
  { id: 'routes', label: 'Routes & cycles' },
  { id: 'calibration', label: 'Calibrate' },
  { id: 'validation', label: 'Validation' },
  { id: 'model', label: 'Model card' },
];

export function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const cal = useStore((s) => s.scenario.calibration);
  const calibrated = Math.abs(cal.fuelScale - 1) > 1e-6 || Math.abs(cal.roadLoadScale - 1) > 1e-6;
  return (
    <div className="app">
      <header className="top">
        <h1>
          Auris Touring Sports 1.4 D-4D
          <small>2017 · 90 cv · 6-speed manual · fuel consumption simulator</small>
        </h1>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="calib-badge">
          {calibrated
            ? `Calibrated to your trips: fuel ×${cal.fuelScale.toFixed(3)}, road load ×${cal.roadLoadScale.toFixed(2)}`
            : 'Uncalibrated (published data)'}
        </span>
      </header>
      <main>
        <Suspense fallback={<div className="page muted">Loading…</div>}>
          {tab === 'analyse' && <AnalysePage />}
          {tab === 'drive' && <DrivePage />}
          {tab === 'routes' && <RoutesPage />}
          {tab === 'calibration' && <CalibrationPage />}
          {tab === 'validation' && <ValidationPage />}
          {tab === 'model' && <ModelCardPage />}
        </Suspense>
      </main>
    </div>
  );
}
