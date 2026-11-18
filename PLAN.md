# Auris Touring Sports 1.4 D-4D — fuel consumption simulator

## Context
You want a physically accurate simulator for your own car: **Toyota Auris Touring Sports ("Combi") 2017, 1.4 D-4D diesel (90 cv, 1ND-TV, 6-speed manual), Portugal**. It should show fuel use at any speed, gradient and gear, the drag cost of open windows compared with air conditioning, and a 3D car you can interact with and drive. The target folder `C:\Users\andre\Downloads\Projects\toyota-simulator` is empty, so this is a new project. You chose: diesel, analysis + 3D + drive mode, calibration from trip-computer / fill-up figures plus published data, English UI.

## Sourced vehicle data (encoded in `src/physics/vehicle.ts` with a source for each value)
| Parameter | Value | Source |
|---|---|---|
| Engine | 1364 cc, bore × stroke 73 × 81.5 mm, CR 16.5:1, 66 kW @ 3800, 205 Nm @ 1400–2800 rpm, VGT, 1800 bar common rail, NSR + DPF, Euro 6 | Toyota TS spec sheet (BE/FR, 2015+) and 2017 FR press kit |
| Gearing, km/h per 1000 rpm on 205/55 R16 | 8.3 / 15.3 / 23.8 / 32.0 / 43.4 / 49.7, R 8.8 (120 km/h in 6th ≈ 2415 rpm) | km77 Auris TS 90D datasheets (2013–2018) |
| Cd | 0.28 | Toyota TS spec sheet, km77 2015 |
| Size | 4595 × 1760 × 1485 mm (1460 without rails), wheelbase 2600, track 1525/1520 | Toyota TS spec sheet |
| Frontal area | ≈ 2.18 m² (0.85 × W × H) | **estimate**, flagged in the UI |
| Mass | 1300 kg kerb incl. 75 kg driver, 1850 kg GVW | Toyota TS spec sheet |
| Tyres offered | 195/65 R15, 205/55 R16 (default), 225/45 R17 | Toyota TS spec sheet |
| Tank / fuel | 50 L; EN 590 diesel 0.835 kg/L, 43 MJ/kg, 2.64 kg CO₂/L | Toyota; EN 590 |
| NEDC (TS 1.4 D-4D) | 15": urban 4.4 / extra-urban 3.5 / combined 3.9; 16": 4.8 / 3.7 / 4.1 L/100 km | Toyota TS spec sheet |
| Performance | 175 km/h, 0–100 km/h in 13.0 s | Toyota, km77 |
| Real-world average | ≈ 5.2 L/100 km (Honest John, 53.9 mpg); Spritmonitor 1.4 D-4D owners 4.3–5.1 | owner data |
| Air-conditioning load | 0.4–3.4 kW mechanical (IPCC SROC ch. 6); diesel ≈ +1.13 L/100 km per kW (TNO report for the European Commission) | literature |
| Open windows | No published ΔCd for the Auris. SAE 2013-01-0551 (Corolla): windows down beat max A/C below ~40–70 mph | modelled, with an uncertainty band |

## Approach
A pure TypeScript physics core (no UI dependencies, unit-tested) drives three front-ends: an analysis dashboard, a 3D scene, and a real-time drive mode.

**Stack:** Vite + React 18 + TypeScript, `@react-three/fiber` + `drei` (Three.js) for 3D, uPlot for line charts, a custom canvas with `d3-contour` for heatmaps and the BSFC map, zustand for state, Vitest for tests.

### 1. Physics core — `src/physics/`
- `atmosphere.ts`: air density from temperature, altitude and humidity. Presets: Lisbon spring (20 °C, sea level), Alentejo summer (35 °C), Serra da Estrela (1500 m).
- `tyres.ts`: dynamic rolling radius per size, rolling-resistance coefficient with speed dependence (`Crr0·(1 + v²/k)`, EU label class C ≈ 0.0085), pressure correction.
- `aero.ts`: `F = ½ρ(Cd + ΔCd)A(v + headwind)²`, plus yaw/crosswind correction.
  - Windows: four windows, each 0–100 % open. ΔCd grows with opening; rear windows weigh more than front, and front + rear open together add a cross-flow term. Default with all four fully open ≈ +0.07. Shown with a ±50 % band because this parameter is uncertain.
  - Accessories, as ΔCdA presets: roof bars, roof box, bikes on the roof, rear bike rack.
- `engine.ts`:
  - Full-load torque curve through the published points: 205 Nm flat 1400–2800 rpm, 166 Nm at 3800 rpm (= 66 kW), low-rpm turbo-lag rolloff, cutoff around 4800 rpm.
  - Fuel model is Willans-type: fuel power = (brake + friction + pumping) / indicated efficiency(rpm, load). Friction mean pressure uses Chen–Flynn with mean piston speed from the 81.5 mm stroke.
  - Shape targets: minimum BSFC ≈ 210 g/kWh around 1800–2200 rpm at about 70 % load; hot idle (≈ 800 rpm) ≈ 0.45 L/h.
  - Overrun fuel cut when torque demand is below motoring torque and rpm > 1100. Optional cold-start warm-up model (oil-temperature ODE, friction multiplier).
  - Generates the BSFC map shown in the UI.
- `drivetrain.ts`: overall ratios derived from km77's km/h per 1000 rpm, rescaled by tyre circumference. Per-gear efficiency (constant + load-proportional losses). Equivalent rotating mass per gear (engine/flywheel, wheels).
- `hvac.ts`: cabin heat load from solar, conduction, fresh-air or recirculation (sensible + latent), and occupants. Compressor power = load / COP, where COP depends on ambient temperature, compressor rpm and condenser airflow (vehicle speed, with the electric fan at low speed). Clamped to 0.2–4 kW mechanical. Cabin temperature ODE for pull-down in drive mode; with windows open, the cabin tends to ambient.
- `electrical.ts`: base electrical load, headlights, blower, rear defroster and radiator fan, converted to mechanical load through alternator efficiency.
- `steadyState.ts`, the core solver: given speed, grade, gear, payload, windows, A/C and weather, it returns:
  - rpm, torque, load %, BSFC
  - fuel L/h, L/100 km, €/100 km, CO₂ g/km
  - a full power breakdown (aero / rolling / grade / drivetrain loss / A/C / electrical / friction)
  - feasibility: lugging below 1100 rpm, over-rev, and "can't hold this speed in this gear" with the maximum sustainable speed
  - best gear
  - an uncertainty band from Monte-Carlo sampling of CdA, Crr, BSFC and window ΔCd
- `dynamics.ts` + `driver.ts`: fixed-step integrator for drive mode and route/cycle runs; driver model with speed tracking and an eco shift strategy similar to Toyota's shift indicator.
- `cycles.ts`: NEDC (defined in segments; used to calibrate against Toyota's figures) and WLTC class 3b (speed trace from UNECE GTR 15, fetched during the build).
- `routes.ts`: built-in Portuguese-style profiles (A1-like rolling motorway, the Covilhã → Torre climb at about +1300 m, Lisbon stop-go), plus GPX import with elevation so you can replay your own trips.
- `calibration.ts`: you enter trips (distance, type, average speed, A/C, displayed L/100 km or litres actually filled). It fits bounded correction factors (engine-efficiency scale; road-load scale when trips span highway and city). Trip-computer entries get an optional optimism correction; fill-ups count as ground truth. Saved in localStorage.

### 2. Analysis dashboard — `src/ui/`
- Controls: speed, grade (−12 to +12 %), gear or auto-best, passengers and luggage, tyres and pressure, four window sliders, A/C (setpoint, recirculation), weather and altitude, accessories, diesel price (default ≈ €1.60/L, editable).
- Live readouts styled like the Auris trip computer: instant L/100 km, L/h, rpm, range on 50 L, cost, plus the power-breakdown bar.
- Charts:
  - L/100 km vs speed for gears 1–6, with the best-gear envelope
  - speed × grade heatmap
  - BSFC map with the full-load curve and the live operating point
  - windows open vs A/C on, with the crossover speed marked and its uncertainty band
  - stacked power vs speed
- Tabs: **Calibration** (trip entry and fit), **Validation** (model vs published figures, table), **Model card** (every parameter, value, source and uncertainty).

### 3. 3D scene and drive mode — `src/scene/`
- `CarModel.tsx`: procedural estate body built at true dimensions (lofted side profile and cross-sections). Separate glass meshes per window animate down by opening fraction; wheels spin at the real angular speed; brake lights. No Toyota badges. `GltfCar.tsx` can swap in a glTF model you supply, mapping window and wheel nodes by name.
- `Road.tsx`: road and terrain tilted to the current grade, sky with the sun at Portugal's latitude.
- `Airflow.tsx`: particle streamlines from an analytic flow approximation around the body, coloured by local speed. Open windows draw turbulent flow into the cabin, and there is a wake behind the tailgate. Labelled "illustrative, not CFD".
- `ForceArrows.tsx`: aero, rolling and grade forces drawn to scale in newtons, with tooltips.
- Interactions: orbit camera; click or drag a window to open it; an A/C button and gear lever on a dashboard overlay.
- `DriveMode.tsx`: real-time driving with W/S (throttle/brake), shift keys, auto-clutch and cruise control, on built-in or GPX routes. Tachometer, speedometer and a trip-computer HUD. The trip summary can be sent straight to Calibration.

### Files
`toyota-simulator/`: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `README.md` (how to run, model assumptions), `.claude/launch.json` (Vite dev server, for preview); `src/physics/*` (above) with `src/physics/__tests__/`; `src/ui/*`; `src/scene/*`; `src/state/store.ts`.

## Verification
1. `npm test` — the Vitest validation suite must pass:
   - NEDC extra-urban (warm, type-approval road load) within ±5 % of 3.7 L/100 km; combined with cold start within ±8 % of 4.1
   - simulated 0–100 km/h in 12.5–13.5 s with shift time; top speed ≥ 175 km/h. The model will likely exceed 175, because Toyota's figure looks conservative for 66 kW at Cd 0.28.
   - plausibility bands at constant speed in 6th: 90 km/h ≈ 3.5–4.2, 120 km/h ≈ 5.0–5.8 L/100 km
   - energy balance: the breakdown sums to engine power
   - zero fuel on overrun downhill; A/C-on > A/C-off; windows open > closed above 50 km/h
   - a real-world mixed route lands at about 4.8–5.5 L/100 km
2. `npm run build` passes type-checking.
3. Open the dev server in the browser pane:
   - no console errors
   - change speed, grade and gear and check the readouts and charts update
   - click windows on the 3D car and confirm the glass moves and the fuel figure rises
   - toggle A/C
   - drive a built-in route in drive mode
   - screenshot the dashboard and the 3D scene as proof
4. The Validation tab shows the model-vs-published table, so you can see exactly where it agrees and where it doesn't.
