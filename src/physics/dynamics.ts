import { cabinStep } from './hvac';
import { alternatorMechW, electricalLoadW } from './electrical';
import {
  coldFrictionMult,
  fuelRateGs,
  fullLoadTorque,
  motoringTorque,
} from './engine';
import {
  GEARS,
  OVERALL_RATIOS,
  engineRpm,
  meshEfficiency,
  rotatingMassEquivalent,
  spinLossTorque,
} from './drivetrain';
import { G, loadContext, roadForces, type LoadContext } from './roadload';
import { TYPE_APPROVAL, type Scenario } from './scenario';
import { DPF_REGEN_FACTOR } from './steadyState';
import { rollingRadius } from './tyres';
import { ENGINE, FUEL } from './vehicle';

export const SHIFT_TIME_S = 0.5;
const LAUNCH_ENGAGE_RPM = 1000;
const STOP_START_DELAY_S = 1.5;
const RESTART_FUEL_G = 0.25;
const ENGINE_THERMAL_J_PER_K = 40000;
const MAX_BRAKE_DECEL = 0.9 * G;
/** Torque available without boost pressure (Nm, estimate). */
const NA_TORQUE_NM = 105;

export interface SimState {
  t: number;
  x: number;
  v: number;
  /** 0 = neutral. */
  gear: number;
  shiftTimer: number;
  pendingGear: number;
  engineOn: boolean;
  rpm: number;
  oilC: number;
  cabinC: number;
  fuelG: number;
  stoppedFor: number;
  // energy accounting (J)
  eAero: number;
  eRoll: number;
  eGrade: number;
  eBrake: number;
  eDriveline: number;
  eAc: number;
  eAlt: number;
  eFriction: number;
  eFuel: number;
  restarts: number;
  /** VGT boost state 0..1 (turbo lag). */
  boost: number;
}

export interface Controls {
  throttle: number;
  brake: number;
}

export interface StepInfo {
  fuelGs: number;
  rpm: number;
  engineTorqueNm: number;
  accel: number;
  aeroN: number;
  rollN: number;
  gradeN: number;
  brakeN: number;
  driveN: number;
  acW: number;
  clutch: 'locked' | 'slipping' | 'open';
  fuelCut: boolean;
  instLPer100: number;
}

export function initialState(s: Scenario, opts: { coldStart?: boolean; cabinC?: number } = {}): SimState {
  const amb = s.roadLoadMode === 'typeApproval' ? TYPE_APPROVAL.tempC : s.weather.tempC;
  return {
    t: 0, x: 0, v: 0, gear: 0, shiftTimer: 0, pendingGear: 0, engineOn: true, rpm: ENGINE.idleRpm,
    oilC: opts.coldStart ? amb : 90, cabinC: opts.cabinC ?? amb, fuelG: 0, stoppedFor: 0,
    eAero: 0, eRoll: 0, eGrade: 0, eBrake: 0, eDriveline: 0, eAc: 0, eAlt: 0, eFriction: 0, eFuel: 0,
    restarts: 0, boost: 0.2,
  };
}

/** Physics core shared by drive mode and the automated driver. */
export class Vehicle {
  ctx: LoadContext;
  radius: number;
  /** Accessory torque on the crank during the last step (Nm). */
  lastAccTorque = 0;
  lastFrictionMult = 1;
  private fuelScale: number;

  constructor(public scenario: Scenario) {
    this.ctx = loadContext(scenario);
    this.radius = rollingRadius(this.ctx.tyre);
    this.fuelScale = scenario.calibration.fuelScale * (scenario.roadLoadMode === 'real' ? DPF_REGEN_FACTOR : 1);
  }

  requestGear(st: SimState, gear: number) {
    const g = Math.max(0, Math.min(GEARS, gear));
    if (g === st.gear && st.shiftTimer <= 0) return;
    st.pendingGear = g;
    st.shiftTimer = g === 0 ? 0 : SHIFT_TIME_S;
    if (g === 0) st.gear = 0;
  }

  wheelRpm(st: SimState, gear = st.gear): number {
    return gear > 0 ? engineRpm(st.v, gear, this.ctx.tyre) : 0;
  }

  /** Tractive force at full throttle and on overrun for the current gear (N). */
  forceLimits(v: number, gear: number, frictionMult = 1): { max: number; overrun: number } {
    if (gear <= 0) return { max: 0, overrun: 0 };
    const rpm = Math.max(LAUNCH_ENGAGE_RPM, engineRpm(v, gear, this.ctx.tyre));
    const i = OVERALL_RATIOS[gear - 1];
    const eta = meshEfficiency(gear);
    const tMax = fullLoadTorque(rpm) - spinLossTorque(rpm);
    const tMotor = motoringTorque(rpm, frictionMult) + spinLossTorque(rpm);
    return { max: (tMax * i * eta) / this.radius, overrun: (-tMotor * i) / eta / this.radius };
  }

  step(st: SimState, c: Controls, gradePct: number, dt: number): StepInfo {
    const s = this.scenario;
    const ta = s.roadLoadMode === 'typeApproval';
    const throttle = Math.min(1, Math.max(0, c.throttle));
    const brake = Math.min(1, Math.max(0, c.brake));

    // Gear change in progress: clutch open.
    if (st.shiftTimer > 0) {
      st.shiftTimer -= dt;
      if (st.shiftTimer <= 0) st.gear = st.pendingGear;
    }
    const shifting = st.shiftTimer > 0;
    const frictionMult = coldFrictionMult(st.oilC);

    const forces = roadForces(this.ctx, st.v, gradePct);
    const gear = st.gear;
    const wheelRpm = this.wheelRpm(st);
    let clutch: StepInfo['clutch'] = 'open';
    if (!shifting && gear > 0) {
      if (wheelRpm >= ENGINE.minInGearRpm) clutch = 'locked';
      else if (throttle > 0.01) clutch = 'slipping';
    }

    // Stop & Start.
    if (st.v < 0.1 && throttle < 0.01) st.stoppedFor += dt;
    else st.stoppedFor = 0;
    const wantsOff = s.stopStart && !ta && st.stoppedFor > STOP_START_DELAY_S && st.oilC > 30 && !s.rearDefrost;
    if (wantsOff && st.engineOn) st.engineOn = false;
    if (!st.engineOn && (throttle > 0.01 || (!wantsOff && st.stoppedFor === 0))) {
      st.engineOn = true;
      st.restarts++;
      st.fuelG += RESTART_FUEL_G;
    }

    // Engine speed.
    let rpm: number;
    if (!st.engineOn) rpm = 0;
    else if (clutch === 'locked') rpm = wheelRpm;
    else if (clutch === 'slipping') rpm = Math.max(wheelRpm, LAUNCH_ENGAGE_RPM + 500 * throttle);
    else rpm = ENGINE.idleRpm + (throttle > 0.01 ? 2500 * throttle : 0);
    rpm = Math.min(rpm, ENGINE.maxRpm + 200);
    st.rpm = rpm;

    // Accessories.
    const amb = ta ? TYPE_APPROVAL.tempC : s.weather.tempC;
    let acW = 0;
    let condFanW = 0;
    if (!ta) {
      const avgWin = (s.windows[0] + s.windows[1] + s.windows[2] + s.windows[3]) / 4;
      const cab = cabinStep(st.cabinC, dt, s.ac, s.weather, st.v, rpm, s.occupants, avgWin);
      st.cabinC = cab.cabinC;
      acW = cab.compressorW;
      condFanW = cab.condenserFanW;
    } else {
      st.cabinC = amb;
    }
    const electricW = ta
      ? TYPE_APPROVAL.electricW
      : electricalLoadW({ headlights: s.headlights, rearDefrost: s.rearDefrost, blower: s.ac.on ? s.ac.blower : Math.min(1, s.ac.blower) }, condFanW);
    const altW = st.engineOn ? alternatorMechW(electricW) : 0;
    if (!st.engineOn) acW = 0;
    // Turbo lag: torque above the naturally-aspirated level needs boost, which builds with a lag
    // that is long at low rpm (little exhaust energy) and short at high rpm.
    const boostTarget = shifting ? 0.3 : clutch === 'open' ? Math.min(throttle, 0.3) : throttle;
    const tau = Math.max(0.35, 1.6 - rpm / 2500);
    st.boost += (boostTarget - st.boost) * Math.min(1, dt / tau);
    const omega = (rpm * Math.PI) / 30;
    const accTorque = omega > 0 ? (acW + altW) / omega : 0;
    this.lastAccTorque = accTorque;
    this.lastFrictionMult = frictionMult;

    // Engine torque at the flywheel and drive force at the wheels.
    let engineTorque = 0; // brake torque delivered to clutch (after accessories)
    let fuelGs = 0;
    let fuelCut = false;
    let driveN = 0;
    let drivelineW = 0;
    if (st.engineOn) {
      const tFull = fullLoadTorque(rpm);
      const tNa = Math.min(tFull, NA_TORQUE_NM);
      const tMax = tNa + (tFull - tNa) * Math.min(1, Math.max(0, st.boost));
      if (clutch === 'locked') {
        const i = OVERALL_RATIOS[gear - 1];
        const eta = meshEfficiency(gear);
        const spin = spinLossTorque(rpm);
        if (throttle > 0.01) {
          const gross = throttle * tMax; // indicated-ish brake torque request incl. accessories
          engineTorque = gross - accTorque;
          fuelGs = fuelRateGs(rpm, gross, { frictionMult, effScale: 1 / this.fuelScale });
        } else if (rpm >= ENGINE.fuelCutRpm) {
          fuelCut = true;
          engineTorque = -motoringTorque(rpm, frictionMult) - accTorque;
        } else {
          // Idle governor holds ~idle torque; treat as small positive torque at low rpm.
          engineTorque = 0;
          fuelGs = fuelRateGs(rpm, accTorque, { frictionMult, effScale: 1 / this.fuelScale });
        }
        const clutchT = engineTorque - spin;
        driveN = clutchT >= 0 ? (clutchT * i * eta) / this.radius : (clutchT * i) / eta / this.radius;
        drivelineW = Math.abs(engineTorque * omega - driveN * st.v);
      } else if (clutch === 'slipping') {
        const i = OVERALL_RATIOS[gear - 1];
        const eta = meshEfficiency(gear);
        const gross = throttle * tMax;
        engineTorque = gross - accTorque;
        fuelGs = fuelRateGs(rpm, gross, { frictionMult, effScale: 1 / this.fuelScale });
        driveN = (Math.max(0, engineTorque - spinLossTorque(rpm)) * i * eta) / this.radius;
        drivelineW = Math.max(0, engineTorque * omega - driveN * st.v);
      } else {
        // Clutch open: engine idles (or revs freely) carrying accessories.
        const freeT = throttle > 0.01 ? accTorque + 10 * throttle : accTorque;
        fuelGs = fuelRateGs(rpm, freeT, { frictionMult, effScale: 1 / this.fuelScale });
      }
    }

    // Brakes (also hold the car at standstill).
    const mEff = this.ctx.massKg + rotatingMassEquivalent(clutch === 'locked' ? gear : 0, this.ctx.tyre);
    let brakeN = brake * MAX_BRAKE_DECEL * this.ctx.massKg;
    const netNoBrake = driveN - forces.totalN;
    if (st.v < 0.05 && netNoBrake <= 0) {
      // Standing still: static friction / brakes hold.
      brakeN = Math.max(brakeN, -netNoBrake);
      if (brake > 0 || throttle < 0.01) brakeN = Math.abs(netNoBrake);
    }
    let accel = (driveN - forces.totalN - (st.v > 0.05 || netNoBrake > 0 ? brakeN : 0)) / mEff;
    if (st.v < 0.05 && driveN - forces.totalN - brakeN <= 0 && throttle < 0.01) accel = Math.max(0, accel);
    let vNew = st.v + accel * dt;
    if (vNew < 0) {
      vNew = 0;
      accel = -st.v / dt;
    }
    const vAvg = (st.v + vNew) / 2;
    const ds = vAvg * dt;

    // Energy bookkeeping.
    st.eAero += forces.aeroN * ds;
    st.eRoll += forces.rollN * ds;
    st.eGrade += forces.gradeN * ds;
    st.eBrake += brakeN * ds;
    st.eDriveline += drivelineW * dt;
    st.eAc += acW * dt;
    st.eAlt += altW * dt;
    st.eFriction += (fuelCut ? motoringTorque(rpm, frictionMult) * omega : 0) * dt;
    st.eFuel += fuelGs * FUEL.lhvJPerG * dt;

    // Oil / engine warm-up.
    const heatIn = 0.3 * fuelGs * FUEL.lhvJPerG + (fuelCut ? 0.3 * motoringTorque(rpm, frictionMult) * omega : 0);
    const heatOut = (12 + 1.2 * st.v) * (st.oilC - amb) + (st.oilC > 90 ? 4000 * (st.oilC - 90) : 0);
    st.oilC += ((heatIn - heatOut) * dt) / ENGINE_THERMAL_J_PER_K;

    st.v = vNew;
    st.x += ds;
    st.t += dt;
    st.fuelG += fuelGs * dt;

    const kmh = st.v * 3.6;
    const lh = (fuelGs * 3.6) / FUEL.densityKgL;
    return {
      fuelGs,
      rpm,
      engineTorqueNm: engineTorque,
      accel,
      aeroN: forces.aeroN,
      rollN: forces.rollN,
      gradeN: forces.gradeN,
      brakeN,
      driveN,
      acW,
      clutch,
      fuelCut,
      instLPer100: kmh > 3 ? (lh / kmh) * 100 : lh,
    };
  }
}

// ---------------------------------------------------------------------------
// Automated driver: tracks a target speed with an eco shift strategy.
// ---------------------------------------------------------------------------

export interface DriverOptions {
  /** Lowest cruising rpm the driver accepts after an upshift. */
  minCruiseRpm: number;
  /** Lowest rpm while accelerating. */
  minAccelRpm: number;
  /** Fraction of full-load force the driver is willing to use before downshifting. */
  maxLoad: number;
  maxAccel: number;
  maxDecel: number;
}

export const ECO_DRIVER: DriverOptions = {
  minCruiseRpm: 1250,
  minAccelRpm: 1500,
  maxLoad: 0.85,
  maxAccel: 1.6,
  maxDecel: 3,
};

/** Typical everyday driver: shifts later, accelerates harder. */
export const NORMAL_DRIVER: DriverOptions = {
  minCruiseRpm: 1500,
  minAccelRpm: 2000,
  maxLoad: 0.75,
  maxAccel: 2.0,
  maxDecel: 3.5,
};

export const DRIVERS = { eco: ECO_DRIVER, normal: NORMAL_DRIVER } as const;
export type DriverStyle = keyof typeof DRIVERS;

export class Driver {
  private shiftCooldown = 0;
  constructor(public car: Vehicle, public opts: DriverOptions = ECO_DRIVER) {}

  /**
   * Choose controls to reach `vTarget` (m/s) at the next step, with target acceleration `aTarget`.
   * Returns throttle/brake and performs gear requests on the state.
   */
  control(st: SimState, vTarget: number, aTarget: number, gradePct: number, dt: number): Controls {
    const car = this.car;
    this.shiftCooldown -= dt;
    const aDes = Math.max(-this.opts.maxDecel, Math.min(this.opts.maxAccel, aTarget + (vTarget - st.v) / 1.0));
    const forces = roadForces(car.ctx, st.v, gradePct);
    const stopping = vTarget < 0.3 && st.v < 0.5;

    // Gear choice.
    if (st.shiftTimer <= 0) {
      let want = st.gear;
      if (stopping || (st.v < 2.0 && aDes <= 0)) want = 0;
      else if (st.gear === 0 || this.wheelRpm(st, st.gear) < ENGINE.minInGearRpm) {
        want = st.v < 4 ? 1 : this.pickGear(st, aDes, forces.totalN, true);
      } else {
        want = this.pickGear(st, aDes, forces.totalN, false);
      }
      if (want !== st.gear && (this.shiftCooldown <= 0 || want === 0 || st.gear === 0)) {
        car.requestGear(st, want);
        this.shiftCooldown = 1.5;
      }
    }

    if (stopping) return { throttle: 0, brake: 0.3 };
    const gear = st.shiftTimer > 0 ? st.pendingGear : st.gear;
    const mEff = car.ctx.massKg + rotatingMassEquivalent(gear, car.ctx.tyre);
    const fReq = mEff * aDes + forces.totalN;
    if (gear <= 0) {
      return fReq < 0 ? { throttle: 0, brake: Math.min(1, -fReq / (MAX_BRAKE_DECEL * car.ctx.massKg)) } : { throttle: 0, brake: 0 };
    }
    const rpm = Math.max(LAUNCH_ENGAGE_RPM, engineRpm(st.v, gear, car.ctx.tyre));
    const i = OVERALL_RATIOS[gear - 1];
    const eta = meshEfficiency(gear);
    const clutchT = fReq >= 0 ? (fReq * car.radius) / (i * eta) : (fReq * car.radius * eta) / i;
    const need = clutchT + spinLossTorque(rpm) + car.lastAccTorque;
    if (need > 0) return { throttle: Math.min(1, need / fullLoadTorque(rpm)), brake: 0 };
    const motor = motoringTorque(rpm, car.lastFrictionMult);
    if (need >= -motor) return { throttle: 0, brake: 0 };
    const lim = car.forceLimits(st.v, gear, car.lastFrictionMult);
    return { throttle: 0, brake: Math.min(1, Math.max(0, (lim.overrun - fReq) / (MAX_BRAKE_DECEL * car.ctx.massKg))) };
  }

  private wheelRpm(st: SimState, gear: number) {
    return engineRpm(st.v, gear, this.car.ctx.tyre);
  }

  private pickGear(st: SimState, aDes: number, roadN: number, fromLow: boolean): number {
    const accelerating = aDes > 0.25;
    const minRpm = accelerating ? this.opts.minAccelRpm : this.opts.minCruiseRpm;
    let strongest = 1;
    let strongestF = -Infinity;
    for (let g = GEARS; g >= 1; g--) {
      const rpm = this.wheelRpm(st, g);
      if (rpm > ENGINE.maxRpm - 300) continue;
      const lim = this.car.forceLimits(st.v, g);
      if (rpm >= ENGINE.minInGearRpm && lim.max > strongestF) {
        strongestF = lim.max;
        strongest = g;
      }
      if (rpm < minRpm && g !== 1) continue;
      const mEff = this.car.ctx.massKg + rotatingMassEquivalent(g, this.car.ctx.tyre);
      const fReq = mEff * aDes + roadN;
      if (fReq <= lim.max * this.opts.maxLoad) {
        // Hysteresis: avoid upshifting by more than one gear when coming from low.
        if (!fromLow && g > st.gear + 1 && st.gear > 0) return st.gear + 1;
        return g;
      }
    }
    // Nothing can deliver the requested acceleration: use the gear with the most tractive force.
    return strongestF > -Infinity ? strongest : 1;
  }
}
