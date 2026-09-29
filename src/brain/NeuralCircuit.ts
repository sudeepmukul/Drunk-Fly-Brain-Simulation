import type { Connection, Neuron } from './Neuron';

/** Abstraction so the fly + visualization never care whether the circuit is artificial or biological. */
export interface NeuralCircuit {
  readonly neurons: Map<string, Neuron>;
  readonly connections: Connection[];
  getNeuron(id: string): Neuron | undefined;
  outgoing(fromId: string): Connection[];
  incoming(toId: string): Connection[];
}

/** Generic loader interface. MVP uses DemoCircuitLoader; later FlyWireCircuitLoader. */
export interface CircuitLoader {
  load(): NeuralCircuit;
}

export class BasicCircuit implements NeuralCircuit {
  neurons = new Map<string, Neuron>();
  connections: Connection[] = [];

  getNeuron(id: string): Neuron | undefined {
    return this.neurons.get(id);
  }
  outgoing(fromId: string): Connection[] {
    return this.connections.filter((c) => c.sourceId === fromId);
  }
  incoming(toId: string): Connection[] {
    return this.connections.filter((c) => c.targetId === toId);
  }
}
