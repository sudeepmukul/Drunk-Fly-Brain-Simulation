import { DEFAULT_PERTURBATIONS, NeuralSimulator, type PerturbationSettings } from '../brain/NeuralSimulator';
import type { NeuralCircuit } from '../brain/NeuralCircuit';
import { DEFAULT_POSE, Environment } from '../environment/Environment';
import { Fly } from '../fly/Fly';
import { FlyController } from '../fly/FlyController';
import type { SensorReading } from '../fly/FlySensors';

export interface SimMetrics {
  simTime: number;
  distance: number;
  avgSpeed: number;
  targetReached: boolean;
  neuralActivity: number;
  lastSensors: SensorReading;
  lastMotors: { left: number; right: number };
  lastTurn: number;
  speedSum: number;
  steps: number;
}

export interface BaselineSnapshot {
  simTime: number;
  distance: number;
  avgSpeed: number;
  reached: boolean;
  trajectory: Array<[number, number]>;
}

/** Orchestrates fly + circuit + environment + metrics + trajectory. */
export class Simulation {
  fly = new Fly();
  env = new Environment();
  controller: FlyController;
  sim: NeuralSimulator;
  pert: PerturbationSettings = { ...DEFAULT_PERTURBATIONS };
  running = false;
  speedMultiplier = 1;
  metrics: SimMetrics = {
    simTime: 0,
    distance: 0,
    avgSpeed: 0,
    targetReached: false,
    neuralActivity: 0,
    lastSensors: { left: 0, center: 0, right: 0 },
    lastMotors: { left: 0, right: 0 },
    lastTurn: 0,
    speedSum: 0,
    steps: 0
  };
  trajectory: Array<[number, number]> = [];
  baseline: BaselineSnapshot | null = null;
  private trajAccum = 0;

  constructor(public circuit: NeuralCircuit) {
    this.sim = new NeuralSimulator(circuit);
    this.controller = new FlyController(this.fly, circuit, this.sim);
    this.reset();
  }

  reset(): void {
    this.fly.reset(DEFAULT_POSE.flyX, DEFAULT_POSE.flyZ, DEFAULT_POSE.heading);
    this.env.reset(DEFAULT_POSE);
    this.sim.reset();
    this.metrics = {
      simTime: 0,
      distance: this.fly.distanceTo(this.env.targetX, this.env.targetZ),
      avgSpeed: 0,
      targetReached: false,
      neuralActivity: 0,
      lastSensors: { left: 0, center: 0, right: 0 },
      lastMotors: { left: 0, right: 0 },
      lastTurn: 0,
      speedSum: 0,
      steps: 0
    };
    this.trajectory = [[this.fly.state.x, this.fly.state.z]];
    this.trajAccum = 0;
  }

  clearTrajectory(): void {
    this.trajectory = [[this.fly.state.x, this.fly.state.z]];
  }

  snapshotBaseline(): void {
    this.baseline = {
      simTime: this.metrics.simTime,
      distance: this.metrics.distance,
      avgSpeed: this.metrics.avgSpeed,
      reached: this.metrics.targetReached,
      trajectory: [...this.trajectory]
    };
  }

  /** Advance by real dt (seconds) * speedMultiplier, subdivided for stability. */
  update(rawDt: number): void {
    if (!this.running) return;
    const scaled = Math.min(rawDt, 0.05) * this.speedMultiplier;
    const sub = Math.max(1, Math.ceil(scaled / (1 / 60)));
    const dt = scaled / sub;
    for (let i = 0; i < sub; i++) this.stepOnce(dt);
  }

  private stepOnce(dt: number): void {
    const r = this.controller.step(this.env.targetX, this.env.targetZ, this.pert, dt);
    const m = this.metrics;
    m.simTime += dt;
    m.steps++;
    m.speedSum += this.fly.state.speed;
    m.avgSpeed = m.speedSum / m.steps;
    m.distance = this.fly.distanceTo(this.env.targetX, this.env.targetZ);
    m.lastSensors = r.sensors;
    m.lastMotors = r.motors;
    m.lastTurn = r.movement.turn;
    m.neuralActivity = this.sim.meanActivity();
    if (m.distance < 1.5) {
      m.targetReached = true;
      this.env.reached = true;
    }
    this.trajAccum += dt;
    const last = this.trajectory[this.trajectory.length - 1];
    const moved = Math.hypot(this.fly.state.x - last[0], this.fly.state.z - last[1]);
    if (this.trajAccum > 0.12 || moved > 0.4) {
      this.trajectory.push([this.fly.state.x, this.fly.state.z]);
      this.trajAccum = 0;
      if (this.trajectory.length > 2000) this.trajectory.shift();
    }
  }
}
