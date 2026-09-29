import type { Connection } from '../brain/Neuron';
import type { NeuralCircuit } from '../brain/NeuralCircuit';

export interface BrainSelection {
  neuronId: string | null;
  connectionId: string | null;
}

interface NodePos { x: number; y: number; id: string; }

/** 2D live circuit visualization on a canvas with click hit-testing. */
export class BrainRenderer {
  selection: BrainSelection = { neuronId: null, connectionId: null };
  private pos = new Map<string, NodePos>();
  private t = 0;

  constructor(private canvas: HTMLCanvasElement, private circuit: NeuralCircuit) {
    this.layout();
    canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  setCircuit(c: NeuralCircuit): void {
    this.circuit = c;
    this.layout();
  }

  private layout(): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.pos.clear();
    const layers: Array<[string, number]> = [];
    const byLayer = new Map<string, string[]>();
    for (const n of this.circuit.neurons.values()) {
      if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
      byLayer.get(n.layer)!.push(n.id);
    }
    const order: Array<[string, number]> = [['sensory', H * 0.16], ['inter', H * 0.52], ['motor', H * 0.86]];
    for (const [layer, y] of order) {
      const ids = (byLayer.get(layer) ?? []).sort();
      ids.forEach((id, i) => {
        const x = W * ((i + 1) / (ids.length + 1));
        this.pos.set(id, { x, y, id });
        layers.push([id, y]);
      });
    }
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;
    // neuron hit first
    let best: string | null = null;
    for (const p of this.pos.values()) {
      if (Math.hypot(p.x - mx, p.y - my) < 20) { best = p.id; break; }
    }
    if (best) {
      this.selection = { neuronId: best, connectionId: null };
      this.canvas.dispatchEvent(new CustomEvent('brain-select', { detail: { ...this.selection } }));
      return;
    }
    // connection hit: distance point-to-segment < 8
    let bestC: Connection | null = null;
    let bestD = 9;
    for (const conn of this.circuit.connections) {
      const a = this.pos.get(conn.sourceId);
      const b = this.pos.get(conn.targetId);
      if (!a || !b) continue;
      const d = distToSegment(mx, my, a.x, a.y, b.x, b.y);
      if (d < bestD) { bestD = d; bestC = conn; }
    }
    this.selection = { neuronId: null, connectionId: bestC ? bestC.id : null };
    this.canvas.dispatchEvent(new CustomEvent('brain-select', { detail: { ...this.selection } }));
  }

  render(dt: number): void {
    this.t += dt;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // layer labels
    ctx.font = '10px monospace';
    ctx.fillStyle = '#5b6b8c';
    ctx.fillText('INPUTS', 8, H * 0.16 - 22);
    ctx.fillText('INTERNEURONS', 8, H * 0.52 - 52);
    ctx.fillText('MOTORS', 8, H * 0.86 - 26);

    // connections
    for (const conn of this.circuit.connections) {
      const a = this.pos.get(conn.sourceId);
      const b = this.pos.get(conn.targetId);
      if (!a || !b) continue;
      const src = this.circuit.neurons.get(conn.sourceId);
      const srcAct = src && src.enabled ? src.activity : 0;
      const excit = conn.weight >= 0;
      const mag = Math.min(1, Math.abs(conn.weight) / 2);
      const selected = this.selection.connectionId === conn.id;
      ctx.strokeStyle = excit
        ? `rgba(74,222,128,${0.15 + 0.65 * Math.max(mag, srcAct)})`
        : `rgba(248,113,113,${0.15 + 0.65 * Math.max(mag, srcAct)})`;
      ctx.lineWidth = selected ? 4 : 1 + 2.5 * mag * (0.4 + 0.6 * srcAct);
      if (!excit) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      // slight curve
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(mx + 6, my, b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // activity pulse
      if (srcAct > 0.35) {
        const k = (this.t * 1.5 + (a.x + a.y) * 0.01) % 1;
        const px = a.x + (b.x - a.x) * k;
        const py = a.y + (b.y - a.y) * k;
        ctx.fillStyle = excit ? '#4ade80' : '#f87171';
        ctx.beginPath();
        ctx.arc(px, py, 2 + 2 * srcAct, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // neurons
    for (const n of this.circuit.neurons.values()) {
      const p = this.pos.get(n.id);
      if (!p) continue;
      const act = n.enabled ? n.activity : 0;
      const r = 11 + act * 7;
      const selected = this.selection.neuronId === n.id;
      // glow
      const color = n.layer === 'sensory' ? '34,211,238' : n.layer === 'motor' ? '251,191,36' : '74,222,128';
      const grad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r + 10);
      grad.addColorStop(0, `rgba(${color},${n.enabled ? 0.35 + 0.6 * act : 0.05})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = n.enabled ? `rgba(${color},${0.35 + 0.65 * act})` : '#2a3350';
      ctx.strokeStyle = selected ? '#ffffff' : `rgba(${color},0.9)`;
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!n.enabled) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 7, p.y - 7);
        ctx.lineTo(p.x + 7, p.y + 7);
        ctx.moveTo(p.x + 7, p.y - 7);
        ctx.lineTo(p.x - 7, p.y + 7);
        ctx.stroke();
      }
      ctx.fillStyle = '#dbe4ff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.id, p.x, p.y + r + 10);
    }
    ctx.textAlign = 'left';
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
