import { DemoCircuitLoader } from './data/circuits/demoCircuit';
import { Simulation } from './simulation/Simulation';
import { BrainRenderer } from './visualization/BrainRenderer';
import { WorldView } from './visualization/WorldView';
import './style.css';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function toast(msg: string): void {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  window.clearTimeout((toast as unknown as { _h?: number })._h);
  (toast as unknown as { _h?: number })._h = window.setTimeout(() => {
    t.style.display = 'none';
  }, 2200);
}

// ---- boot ----
const circuit = new DemoCircuitLoader().load();
const sim = new Simulation(circuit);
const world = new WorldView($('scene3d') as HTMLCanvasElement);
const brain = new BrainRenderer($('brain2d') as HTMLCanvasElement, circuit);

world.setTarget(sim.env.targetX, sim.env.targetZ);
world.updateTrajectory(sim.trajectory);

// ---- top controls ----
const btnStart = $('btn-start');
const btnPause = $('btn-pause');
const btnReset = $('btn-reset');
const btnFollow = $('btn-follow');
const selSpeed = $('sel-speed') as HTMLSelectElement;
const statusEl = $('status');

function refreshStatus(): void {
  statusEl.textContent = sim.running ? `running · ${sim.speedMultiplier}x` : 'paused';
  btnStart.classList.toggle('active', sim.running);
  btnPause.classList.toggle('active', !sim.running);
  btnFollow.textContent = `Follow Fly: ${world.followFly ? 'ON' : 'OFF'}`;
  btnFollow.classList.toggle('active', world.followFly);
}

btnStart.addEventListener('click', () => { sim.running = true; refreshStatus(); });
btnPause.addEventListener('click', () => { sim.running = false; refreshStatus(); });
btnReset.addEventListener('click', () => {
  sim.reset();
  world.setTarget(sim.env.targetX, sim.env.targetZ);
  world.updateTrajectory(sim.trajectory);
  toast('Experiment reset to deterministic pose.');
});
selSpeed.addEventListener('change', () => {
  sim.speedMultiplier = parseFloat(selSpeed.value);
  refreshStatus();
});
btnFollow.addEventListener('click', () => {
  world.followFly = !world.followFly;
  refreshStatus();
});
($('btn-clear-traj') as HTMLElement).addEventListener('click', () => {
  sim.clearTrajectory();
  world.updateTrajectory(sim.trajectory);
});
($('btn-baseline') as HTMLElement).addEventListener('click', () => {
  sim.snapshotBaseline();
  renderBaseline();
  toast('Baseline snapshot saved — perturb neurons, then compare.');
});

// ---- perturbation sliders ----
function bindSlider(id: string, valId: string, fmt: (v: number) => string, fn: (v: number) => void): void {
  const s = $(id) as HTMLInputElement;
  const v = $(valId);
  const update = () => {
    const n = parseFloat(s.value);
    v.textContent = fmt(n);
    fn(n);
  };
  s.addEventListener('input', update);
  update();
}
bindSlider('sld-noise', 'val-noise', (v) => v.toFixed(2), (v) => { sim.pert.noise = v; });
bindSlider('sld-global', 'val-global', (v) => v.toFixed(2), (v) => { sim.pert.globalStimulation = v; });
bindSlider('sld-delay', 'val-delay', (v) => `${v.toFixed(0)} ms`, (v) => { sim.pert.delayMs = v; });
bindSlider('sld-drunk', 'val-drunk', (v) => v.toFixed(2), (v) => { sim.pert.intoxication = v; });

// ---- brain selection + inspectors ----
const neuronInfo = $('neuron-info');
const neuronControls = $('neuron-controls');
const biasSlider = $('neuron-bias') as HTMLInputElement;
const biasVal = $('neuron-bias-val');
const connInfo = $('conn-info');
const connControls = $('conn-controls');
const connSlider = $('conn-weight') as HTMLInputElement;
const connVal = $('conn-weight-val');

function currentNeuron() {
  return brain.selection.neuronId ? circuit.neurons.get(brain.selection.neuronId) : undefined;
}
function currentConn() {
  return circuit.connections.find((c: { id: string }) => c.id === brain.selection.connectionId);
}

($('brain2d') as HTMLCanvasElement).addEventListener('brain-select', () => {
  renderInspectors();
});

function renderInspectors(): void {
  const n = currentNeuron();
  if (n) {
    const incoming = circuit.incoming(n.id).length;
    const outgoing = circuit.outgoing(n.id).length;
    neuronInfo.textContent =
      `Neuron ${n.id}\n${n.name}\nActivity ${n.activity.toFixed(3)}\nBias ${n.bias.toFixed(2)}\nEnabled ${n.enabled ? 'YES' : 'NO'}\nIncoming ${incoming} · Outgoing ${outgoing}\n(DEMO NEURON — artificial, not biological)`;
    neuronControls.style.display = 'block';
    biasSlider.value = String(n.bias);
    biasVal.textContent = n.bias.toFixed(2);
  } else {
    neuronInfo.textContent = 'No neuron selected. Click one in the brain view.';
    neuronControls.style.display = 'none';
  }
  const c = currentConn();
  if (c) {
    connInfo.textContent = `Source ${c.sourceId}\nTarget ${c.targetId}\nWeight ${c.weight.toFixed(3)}\n${c.weight >= 0 ? 'excitatory-style' : 'inhibitory-style'} (sign of demo weight)`;
    connControls.style.display = 'block';
    connSlider.value = String(c.weight);
    connVal.textContent = c.weight.toFixed(2);
  } else {
    connInfo.textContent = 'No connection selected. Click a wire.';
    connControls.style.display = 'none';
  }
}

biasSlider.addEventListener('input', () => {
  const n = currentNeuron();
  if (!n) return;
  n.bias = parseFloat(biasSlider.value);
  biasVal.textContent = n.bias.toFixed(2);
  renderInspectors();
});
connSlider.addEventListener('input', () => {
  const c = currentConn();
  if (!c) return;
  c.weight = parseFloat(connSlider.value);
  connVal.textContent = c.weight.toFixed(2);
  renderInspectors();
});
$('btn-disable').addEventListener('click', () => {
  const n = currentNeuron();
  if (n) { sim.sim.setEnabled(n.id, false); renderInspectors(); toast(`${n.id} disabled (activity=0).`); }
});
$('btn-enable').addEventListener('click', () => {
  const n = currentNeuron();
  if (n) { sim.sim.setEnabled(n.id, true); renderInspectors(); toast(`${n.id} enabled.`); }
});
$('btn-stim').addEventListener('click', () => {
  const n = currentNeuron();
  if (n) { sim.sim.setEnabled(n.id, true); sim.sim.stimulate(n.id, 1.2); toast(`${n.id} stimulated.`); }
});
$('btn-reset-act').addEventListener('click', () => {
  const n = currentNeuron();
  if (n) { n.activity = 0; renderInspectors(); }
});

// ---- metrics ----
function fmt(n: number, d = 1): string {
  return Number.isFinite(n) ? n.toFixed(d) : '–';
}

function renderBaseline(): void {
  const b = sim.baseline;
  const el = $('baseline-info');
  if (!b) { el.textContent = 'No baseline snapshot yet.'; return; }
  const m = sim.metrics;
  el.textContent =
    `Baseline: t=${fmt(b.simTime)}s dist=${fmt(b.distance, 1)} avgV=${fmt(b.avgSpeed, 2)} reached=${b.reached ? 'YES' : 'NO'}\n` +
    `Now:      t=${fmt(m.simTime)}s dist=${fmt(m.distance, 1)} avgV=${fmt(m.avgSpeed, 2)} reached=${m.targetReached ? 'YES' : 'NO'}\n` +
    `Δdist=${fmt(m.distance - b.distance, 1)} (negative = closer than baseline)`;
}

let fpsAccum = 0;
let fpsCount = 0;
let fpsShown = 0;
let uiAccum = 0;

function renderMetrics(dt: number): void {
  const m = sim.metrics;
  ($('sensor-l') as HTMLElement).textContent = m.lastSensors.left.toFixed(2);
  ($('sensor-c') as HTMLElement).textContent = m.lastSensors.center.toFixed(2);
  ($('sensor-r') as HTMLElement).textContent = m.lastSensors.right.toFixed(2);
  ($('meter-l') as HTMLElement).style.width = `${m.lastSensors.left * 100}%`;
  ($('meter-c') as HTMLElement).style.width = `${m.lastSensors.center * 100}%`;
  ($('meter-r') as HTMLElement).style.width = `${m.lastSensors.right * 100}%`;
  ($('metric-dist') as HTMLElement).textContent = fmt(m.distance, 1);
  ($('m-dist') as HTMLElement).textContent = fmt(m.distance, 2);
  ($('m-speed') as HTMLElement).textContent = fmt(m.avgSpeed, 2);
  ($('m-neural') as HTMLElement).textContent = fmt(m.neuralActivity, 3);
  ($('m-time') as HTMLElement).textContent = `${fmt(m.simTime, 1)}s`;
  ($('m-fps') as HTMLElement).textContent = String(fpsShown);
  ($('m-reached') as HTMLElement).textContent = m.targetReached ? 'YES 🎯' : 'NO';
  ($('m-fly-speed') as HTMLElement).textContent = fmt(sim.fly.state.speed, 2);
  ($('m-turn') as HTMLElement).textContent = fmt(m.lastTurn, 3);
  ($('m-motor-l') as HTMLElement).textContent = fmt(m.lastMotors.left, 3);
  ($('m-motor-r') as HTMLElement).textContent = fmt(m.lastMotors.right, 3);
  // live-update inspector activity numbers without rebuilding controls
  if (uiAccum > 0.25) {
    renderInspectors();
    if (sim.baseline) renderBaseline();
    uiAccum = 0;
  }
}

// ---- main loop ----
let last = performance.now();
function frame(now: number): void {
  const rawDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAccum += rawDt;
  fpsCount++;
  if (fpsAccum >= 0.5) {
    fpsShown = Math.round(fpsCount / fpsAccum);
    fpsAccum = 0;
    fpsCount = 0;
  }
  uiAccum += rawDt;

  sim.update(rawDt);
  const f = sim.fly.state;
  world.setFly(f.x, f.y, f.z, f.heading);
  world.updateTrajectory(sim.trajectory);
  world.render(rawDt, { x: f.x, z: f.z });
  brain.render(rawDt);
  renderMetrics(rawDt);

  if (sim.metrics.targetReached && sim.running) {
    // keep running so user can observe; show one-time toast
    if (!(frame as unknown as { _c?: boolean })._c) {
      (frame as unknown as { _c?: boolean })._c = true;
      toast(`Target reached in ${sim.metrics.simTime.toFixed(1)}s 🎯 — press RESET to run again.`);
    }
  } else if (!sim.metrics.targetReached) {
    (frame as unknown as { _c?: boolean })._c = false;
  }

  requestAnimationFrame(frame);
}

refreshStatus();
renderInspectors();
sim.running = true; // autostart so the MVP "actually runs" on load
refreshStatus();
requestAnimationFrame(frame);
