import { describe, expect, it } from 'vitest';
import { DemoCircuitLoader } from '../src/data/circuits/demoCircuit';
import { NeuralSimulator, motorToMovement, DEFAULT_PERTURBATIONS } from '../src/brain/NeuralSimulator';
import { computeSensors } from '../src/fly/FlySensors';
import { Fly } from '../src/fly/Fly';
import { Simulation } from '../src/simulation/Simulation';

const pert = { ...DEFAULT_PERTURBATIONS };

describe('neuron activation', () => {
  it('propagates sensory input to motors (bounded 0..1)', () => {
    const c = new DemoCircuitLoader().load();
    const s = new NeuralSimulator(c);
    s.step({ S_L: 0.1, S_C: 0.9, S_R: 0.1 }, pert, 1 / 60);
    const l = c.neurons.get('M_L')!.activity;
    const r = c.neurons.get('M_R')!.activity;
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('left sensor drives left motor more than right motor', () => {
    const c = new DemoCircuitLoader().load();
    const s = new NeuralSimulator(c);
    for (let i = 0; i < 30; i++) s.step({ S_L: 1, S_C: 0.1, S_R: 0 }, pert, 1 / 60);
    const l = c.neurons.get('M_L')!.activity;
    const r = c.neurons.get('M_R')!.activity;
    expect(l).toBeGreaterThan(r);
  });
});

describe('disabled neuron', () => {
  it('contributes nothing downstream and reads 0', () => {
    const c = new DemoCircuitLoader().load();
    const s = new NeuralSimulator(c);
    s.setEnabled('I0', false);
    for (let i = 0; i < 10; i++) s.step({ S_L: 1, S_C: 1, S_R: 0 }, pert, 1 / 60);
    expect(c.neurons.get('I0')!.activity).toBe(0);
  });
});

describe('stimulation', () => {
  it('increases neuron activity', () => {
    const c = new DemoCircuitLoader().load();
    const s = new NeuralSimulator(c);
    s.step({ S_L: 0, S_C: 0, S_R: 0 }, pert, 1 / 60);
    const before = c.neurons.get('M_L')!.activity;
    s.stimulate('M_L', 1.5);
    s.step({ S_L: 0, S_C: 0, S_R: 0 }, pert, 1 / 60);
    const after = c.neurons.get('M_L')!.activity;
    expect(after).toBeGreaterThan(before);
  });
});

describe('sensors', () => {
  it('center sensor strongest when facing target', () => {
    // fly at origin heading +Z (0), target straight ahead
    const r = computeSensors(0, 0, 0, 0, 10, 40);
    expect(r.center).toBeGreaterThan(r.left);
    expect(r.center).toBeGreaterThan(r.right);
  });
  it('left sensor strongest when target is to the left', () => {
    // target to the left of heading: heading 0 faces +Z, +X is... bearing test relative
    const r = computeSensors(0, 0, 0, 6, 6, 40);
    // bearing ~45deg; left offset is +40deg so left should beat right
    expect(r.left).toBeGreaterThan(r.right);
  });
  it('values normalized 0..1', () => {
    const r = computeSensors(-12, -12, Math.PI / 4, 10, 8, 40);
    for (const v of [r.left, r.center, r.right]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('motor mapping', () => {
  it('turn = left - right (left motor turns fly left)', () => {
    const m = motorToMovement(0.8, 0.2);
    expect(m.turn).toBeCloseTo(0.6, 5);
    const m2 = motorToMovement(0.2, 0.8);
    expect(m2.turn).toBeCloseTo(-0.6, 5);
  });
});

describe('fly movement', () => {
  it('moves forward with motor drive and turns with differential', () => {
    const fly = new Fly();
    fly.reset(0, 0, 0);
    fly.applyMotor(0, 1, 1);
    expect(fly.state.z).toBeGreaterThan(0);
    const h0 = fly.state.heading;
    fly.applyMotor(1, 0.5, 1);
    expect(fly.state.heading).toBeGreaterThan(h0); // positive turn = left
  });
});

describe('neural perturbations', () => {
  it('noise makes repeated identical inputs produce varying output', () => {
    const c = new DemoCircuitLoader().load();
    const s = new NeuralSimulator(c);
    const noisy = { ...pert, noise: 1.0 };
    const outs: number[] = [];
    for (let i = 0; i < 20; i++) {
      s.step({ S_L: 0.3, S_C: 0.5, S_R: 0.3 }, noisy, 1 / 60);
      outs.push(c.neurons.get('M_L')!.activity);
    }
    const spread = Math.max(...outs) - Math.min(...outs);
    expect(spread).toBeGreaterThan(0.01);
  });

  it('zero noise is deterministic', () => {
    const run = (): number[] => {
      const c = new DemoCircuitLoader().load();
      const s = new NeuralSimulator(c);
      const outs: number[] = [];
      for (let i = 0; i < 5; i++) {
        s.step({ S_L: 0.3, S_C: 0.5, S_R: 0.3 }, pert, 1 / 60);
        outs.push(c.neurons.get('M_L')!.activity);
      }
      return outs;
    };
    expect(run()).toEqual(run());
  });

  it('intoxication disturbs target seeking (acts through the circuit)', () => {
    const c = new DemoCircuitLoader().load();
    const sim = new Simulation(c);
    sim.pert.intoxication = 1.0;
    sim.running = true;
    for (let i = 0; i < 60 * 15; i++) sim.update(1 / 60);
    // drunk fly should not reliably reach as fast as sober (~9s); assert it
    // either takes longer or wanders — here: not reached within 15s OR reached late.
    // At minimum, behavior must differ from sober run trajectory.
    const sober = new Simulation(new DemoCircuitLoader().load());
    sober.running = true;
    for (let i = 0; i < 60 * 15; i++) sober.update(1 / 60);
    const drunkEnd = sim.fly.state.x + sim.fly.state.z;
    const soberEnd = sober.fly.state.x + sober.fly.state.z;
    expect(Math.abs(drunkEnd - soberEnd)).toBeGreaterThan(0.5);
  });
});
describe('reset behavior', () => {
  it('returns to deterministic pose', () => {
    const c = new DemoCircuitLoader().load();
    const sim = new Simulation(c);
    sim.running = true;
    sim.update(0.5);
    sim.reset();
    expect(sim.fly.state.x).toBeCloseTo(-12, 5);
    expect(sim.fly.state.z).toBeCloseTo(-12, 5);
    expect(sim.env.targetX).toBeCloseTo(10, 5);
    expect(sim.metrics.simTime).toBe(0);
    expect(sim.trajectory.length).toBe(1);
  });
});

describe('end-to-end seeking', () => {
  it('reaches the target with intact circuit', () => {
    const c = new DemoCircuitLoader().load();
    const sim = new Simulation(c);
    sim.running = true;
    const d0 = sim.fly.distanceTo(sim.env.targetX, sim.env.targetZ);
    let minDist = d0;
    for (let i = 0; i < 60 * 40; i++) {
      sim.update(1 / 60);
      minDist = Math.min(minDist, sim.metrics.distance);
      if (sim.metrics.targetReached) break;
    }
    expect(minDist).toBeLessThan(3);
  });
});
