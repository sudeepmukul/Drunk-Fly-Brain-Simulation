import { sigmoid, type Neuron } from './Neuron';
import type { NeuralCircuit } from './NeuralCircuit';

export interface PerturbationSettings {
  /** 0..1 gaussian noise injected per neuron per step */
  noise: number;
  /** 0..1 global excitatory drive added to every non-sensory neuron */
  globalStimulation: number;
  /** transmission delay in ms applied to motor outputs */
  delayMs: number;
  /** 0..1 drunk-fly intoxication: extra noise + transient weight jitter, applied through neural system */
  intoxication: number;
}

export const DEFAULT_PERTURBATIONS: PerturbationSettings = {
  noise: 0,
  globalStimulation: 0,
  delayMs: 0,
  intoxication: 0
};

function randn(): number {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SENSORY_IDS = ['S_L', 'S_C', 'S_R'];

/**
 * Rate-based synchronous simulator.
 * Sensory neurons are clamped to inputs each step; others integrate weighted sums.
 */
export class NeuralSimulator {
  /** Manual stimulation added on top of computed activity, decays over time */
  stimBoost = new Map<string, number>();
  private motorDelayBuffer: Array<{ left: number; right: number }> = [];

  constructor(public circuit: NeuralCircuit) {}

  reset(): void {
    for (const n of this.circuit.neurons.values()) n.activity = 0;
    this.stimBoost.clear();
    this.motorDelayBuffer = [];
  }

  stimulate(id: string, amount = 1.0): void {
    const n = this.circuit.neurons.get(id);
    if (!n || !n.enabled) return;
    this.stimBoost.set(id, Math.min(2, (this.stimBoost.get(id) ?? 0) + amount));
  }

  setEnabled(id: string, enabled: boolean): void {
    const n = this.circuit.neurons.get(id);
    if (!n) return;
    n.enabled = enabled;
    if (!enabled) {
      n.activity = 0;
      this.stimBoost.delete(id);
    }
  }

  /** One synchronous update. inputs keys: S_L, S_C, S_R in [0,1]. dt in seconds. */
  step(inputs: Record<string, number>, pert: PerturbationSettings, dt: number): void {
    const neurons = this.circuit.neurons;

    // 1. clamp sensory neurons
    for (const id of SENSORY_IDS) {
      const n = neurons.get(id);
      if (!n) continue;
      n.activity = n.enabled ? clamp01(inputs[id] ?? 0) : 0;
    }

    const noiseLevel = clamp01(pert.noise + pert.intoxication * 0.9);
    const jitter = pert.intoxication; // weight jitter magnitude

    // 2. compute next activities for inter + motor (synchronous)
    const next = new Map<string, number>();
    for (const n of neurons.values()) {
      if (n.layer === 'sensory') continue;
      if (!n.enabled) {
        next.set(n.id, 0);
        continue;
      }
      let sum = n.bias;
      for (const conn of this.circuit.incoming(n.id)) {
        const src = neurons.get(conn.sourceId);
        if (!src || !src.enabled) continue;
        let w = conn.weight;
        if (jitter > 0) {
          w = w * (1 + randn() * 0.35 * jitter);
        }
        sum += w * src.activity;
      }
      sum += pert.globalStimulation * 1.5;
      sum += (this.stimBoost.get(n.id) ?? 0) * 1.5;
      // drunk wobble: slow sinusoidal drive with per-neuron phase
      if (pert.intoxication > 0) {
        const phase = hashPhase(n.id);
        sum += Math.sin(performance.now() / 700 + phase) * 0.8 * pert.intoxication;
      }
      if (noiseLevel > 0) {
        sum += randn() * noiseLevel * 1.2;
      }
      let act = sigmoid(n.gain * sum);
      next.set(n.id, clamp01(act));
    }
    for (const [id, v] of next) {
      const n = neurons.get(id);
      if (n) n.activity = v;
    }

    // 3. decay stim boosts
    for (const [id, b] of this.stimBoost) {
      const decayed = b - dt * 1.5;
      if (decayed <= 0.01) this.stimBoost.delete(id);
      else this.stimBoost.set(id, decayed);
    }
  }

  /** Motor readout with optional transmission delay. Returns activities in [0,1]. */
  readMotors(pert: PerturbationSettings, dt: number): { left: number; right: number } {
    const l = this.circuit.neurons.get('M_L')?.activity ?? 0;
    const r = this.circuit.neurons.get('M_R')?.activity ?? 0;
    const steps = Math.round(pert.delayMs / Math.max(1, dt * 1000));
    if (steps <= 0) return { left: l, right: r };
    this.motorDelayBuffer.push({ left: l, right: r });
    while (this.motorDelayBuffer.length > steps + 1) this.motorDelayBuffer.shift();
    if (this.motorDelayBuffer.length <= steps) {
      return this.motorDelayBuffer[0];
    }
    return this.motorDelayBuffer[this.motorDelayBuffer.length - 1 - steps];
  }

  meanActivity(): number {
    let s = 0;
    let n = 0;
    for (const neuron of this.circuit.neurons.values()) {
      if (!neuron.enabled) continue;
      s += neuron.activity;
      n++;
    }
    return n === 0 ? 0 : s / n;
  }
}

export function motorToMovement(
  left: number,
  right: number,
  opts: { turnGain?: number; forwardBase?: number; forwardGain?: number } = {}
): { turn: number; forward: number } {
  const turnGain = opts.turnGain ?? 1.0;
  const forwardBase = opts.forwardBase ?? 0.35;
  const forwardGain = opts.forwardGain ?? 0.65;
  // Positive turn increases heading, which rotates the fly toward its own
  // left side — so LEFT_MOTOR dominance turns the fly left. (Ipsilateral
  // wiring: LEFT_SENSOR -> left path -> LEFT_MOTOR, a pursuit circuit.)
  const turn = (left - right) * turnGain; // >0 turns left
  const forward = clamp01(forwardBase + forwardGain * ((left + right) / 2));
  return { turn, forward };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (h / 1000) * Math.PI * 2;
}

export type { Neuron };
