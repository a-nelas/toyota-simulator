# Auris Touring Sports 1.4 D-4D — fuel consumption simulator

**Live app: https://a-nelas.github.io/toyota-simulator/**

A physics-based fuel-consumption simulator for the **Toyota Auris Touring Sports (2017, E180 facelift), 1.4 D-4D 90 cv (1ND-TV), 6-speed manual**, as sold in Portugal.

## Run

```bash
npm install
npm run dev      # http://localhost:5183
npm test         # validation suite (model vs published figures)
npm run build    # type-check + production build
```

## Tabs

- **Analyse**: sets speed, gradient, gear, windows, A/C, load, tyres, weather and roof accessories. It shows live L/100 km with a 10–90 % model range, where the fuel goes, and five charts:
  - consumption by gear
  - open windows vs A/C, with the crossover speed
  - speed × gradient map
  - engine BSFC map
  - power demand by speed

  The 3D car beside them has clickable windows, illustrative airflow and to-scale force arrows.
- **Drive**: real-time driving on a free road, built-in Portuguese routes or your own GPX track, with an optional autopilot.
  - Keys: W/S throttle and brake; E/Q shift; M auto-shift; C cruise control; 1–4 windows; X A/C.
- **Routes & cycles**: runs the driver model over NEDC or a route and returns consumption, cost, CO₂, an energy breakdown and traces.
- **Calibrate**: enter trips you know, from fill-ups (best) or the trip computer. The app fits bounded road-load and engine-efficiency factors to them. Data stays in your browser (localStorage).
- **Validation**: model vs published figures, computed live.
- **Model card**: every parameter with its source, plus the method and uncertainties.

## Model in one paragraph

- **Road load**: rolling resistance, which depends on speed and tyre pressure; gradient; and aerodynamic drag ½ρ(Cd + ΔCd)A·v². ΔCd adds per-window and cross-flow terms, roof accessories and crosswind yaw. Air density comes from temperature, altitude and humidity.
- **Drivetrain**: mesh efficiency and spin losses for each gear, plus rotating inertia.
- **Engine**: a Willans-type model. Fuel = (brake + friction work) ÷ indicated efficiency, using a full-load curve through Toyota's 205 Nm / 66 kW points.
  - Friction follows Chen–Flynn, with a cold-oil multiplier.
  - Fuel is cut on overrun.
  - Turbo lag, an auto-clutch launch and Stop & Start are modelled in drive mode.
- **A/C**: a cabin heat balance (sun, conduction, occupants, fresh air) divided by a COP that depends on temperature, compressor speed and road speed.

## Known limits

- **Estimated values**: frontal area (2.18 m²) and the open-window ΔCd are estimates, not measurements. The bands in the UI reflect this.
- **NEDC fit**: extra-urban is within 4 % of Toyota's figure and combined within 5 %. The urban phase is about 16 % high.
- **Real-world range**: about 4.5–5.5 L/100 km is typical. Calibrating with your own fill-ups tightens this.
- **WLTC**: not included. The car was type-approved on NEDC.
- **Airflow**: the 3D airflow is illustrative, not CFD.
