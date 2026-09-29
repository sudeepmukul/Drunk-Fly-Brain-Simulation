# FLYBRAIN LAB — MVP

Interactive 3D artificial-fly neural simulation. A stylized fruit fly moves through a
3D arena toward a glowing food target. Steering comes **only** from a small artificial
rate-based neural circuit (3 sensors → 6 interneurons → 2 motors) fed by virtual
LEFT/CENTER/RIGHT vision sensors. A live brain view lets you click neurons and wires,
disable/stimulate neurons, edit weights, inject noise/delay, and run a
"DRUNK FLY" neural-perturbation experiment.

> **What is simulated vs biological:** everything here is artificial. All neurons are
> labelled `DEMO`. No FlyWire/Codex data is used. No claim is made about real
> Drosophila biology or real alcohol effects — "DRUNK FLY" is just a neural-noise
> experiment that disturbs behavior *through the circuit*, never by teleporting the fly.

## Run

```bash
npm install
npm run dev     # opens http://localhost:5173
npm run build   # typecheck + production build
npm test        # vitest suite
```

## How it works

```
3D WORLD → fly pose + target → virtual sensors (L/C/R in [0,1])
  → NeuralSimulator clamps S_L/S_C/S_R → synchronous sigmoid propagation
  → M_L / M_R motor activities → turn = L−R (positive = left), forward = base + gain·mean
  → Fly.applyMotor() integrates heading + position
```

- **Sensors** (`src/fly/FlySensors.ts`): each sensor samples `max(0,cos(angleDiff))^1.5`
  times a distance falloff `1 − dist/range`. Displayed live in the HUD.
- **Neurons** (`src/brain/Neuron.ts`): rate-based, `activity = sigmoid(gain·(bias + Σw·a + drive + noise))`,
  bounded in [0,1]. Disabled neurons output 0 and are skipped as sources.
- **Demo circuit** (`src/data/circuits/demoCircuit.ts`): Braitenberg-style. LEFT sensor
  excites the left path → LEFT_MOTOR; RIGHT → RIGHT_MOTOR; CENTER → both; cross-inhibition
  sharpens turns. No `if target left, turn left` rule exists in `Fly.ts` — turning emerges
  from motor differentials.
- **Perturbations** (`NeuralSimulator` + Simulation panel): per-step Gaussian noise,
  global stimulation drive, motor transmission delay buffer (0–500 ms), and intoxication
  (extra noise + transient weight jitter + slow sinusoidal drive). All act inside the
  neural system; fly pose is never randomized directly.
- **Metrics**: distance, avg speed, mean neural activity, sim time, FPS, target-reached
  flag, trajectory polyline in 3D, baseline snapshot comparison.

## Manipulating neurons

1. Click a circle in BRAIN → Neuron Inspector shows activity/bias/connections.
2. `[Disable]` sets activity 0 and removes it from downstream sums. `[Enable]` restores.
3. `[Stimulate]` adds a decaying boost. Bias slider edits live.
4. Click a wire → Connection Inspector → weight slider (−3…+3) applies live.
   Positive = excitatory-style (green), negative = inhibitory-style (red dashed).
5. Experiment panel: Noise / Global stimulation / Delay / DRUNK FLY intoxication.
6. `Snapshot baseline`, perturb, and compare Δdistance in the Metrics panel.

## Architecture

```
src/
  main.ts                    # boot, UI wiring, main loop
  style.css
  simulation/Simulation.ts   # orchestration, metrics, trajectory, baseline
  fly/{Fly,FlySensors,FlyController}.ts
  brain/{Neuron,NeuralCircuit,NeuralSimulator}.ts
  data/circuits/demoCircuit.ts
  environment/Environment.ts # deterministic reset pose
  visualization/{WorldView,BrainRenderer}.ts
tests/sim.test.ts
```

## Future FlyWire integration

The fly and visualizers depend only on the `NeuralCircuit` interface
(`neurons: Map`, `connections: []`, `incoming/outgoing`), loaded via a `CircuitLoader`.
Today `DemoCircuitLoader` builds the artificial circuit. Later, a
`FlyWireCircuitLoader` will convert FlyWire/Codex cells (`cellType`, `region`,
`synapseCount → weight`) into the same representation — with `biological: true` —
without changing `Fly`, `FlyController`, `Simulation`, or the renderers.

## Definition-of-done checklist

3D fly + target + sensors → circuit → motor steering → target seeking; live brain viz;
click/inspect/disable/stimulate neurons; live weight editing; noise + drunk mode via
neural perturbation; pause/reset/speed; metrics + trajectory + baseline compare;
`npm run build` clean; `npm test` green.
