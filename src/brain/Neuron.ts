// Core neural data model. Future-compatible with FlyWire-derived circuits.
// Demo neurons are explicitly labelled "DEMO" — NOT biological data.

export type NeuronLayer = 'sensory' | 'inter' | 'motor';

export interface Neuron {
  id: string;
  name: string;
  layer: NeuronLayer;
  /** Current rate-based activity in [0,1] */
  activity: number;
  bias: number;
  /** Set by CircuitLoader; used in sigmoid */
  gain: number;
  enabled: boolean;
  /** True for real biology later; false for demo artificial neurons */
  biological: boolean;
  cellType?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  /** Optional future biological fields */
  synapseCount?: number;
  metadata?: Record<string, unknown>;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function createNeuron(
  id: string,
  name: string,
  layer: NeuronLayer,
  bias = 0,
  gain = 1.5
): Neuron {
  return { id, name, layer, activity: 0, bias, gain, enabled: true, biological: false };
}

export function createConnection(id: string, sourceId: string, targetId: string, weight: number): Connection {
  return { id, sourceId, targetId, weight };
}
