import { BasicCircuit, type CircuitLoader } from '../../brain/NeuralCircuit';
import { createConnection, createNeuron } from '../../brain/Neuron';

/**
 * DemoCircuitLoader — small artificial Braitenberg-style steering circuit.
 * All neurons are DEMO neurons (not biological, not FlyWire).
 *
 * Layers: 3 sensory -> 6 interneurons -> 2 motors.
 * Wiring logic: LEFT sensor excites left path -> LEFT_MOTOR,
 * RIGHT sensor excites right path -> RIGHT_MOTOR, CENTER excites both,
 * with mutual cross-inhibition to sharpen turning.
 */
export class DemoCircuitLoader implements CircuitLoader {
  load(): BasicCircuit {
    const c = new BasicCircuit();

    const defs: Array<[string, string, 'sensory' | 'inter' | 'motor', number]> = [
      ['S_L', 'LEFT_SENSOR (DEMO)', 'sensory', 0],
      ['S_C', 'CENTER_SENSOR (DEMO)', 'sensory', 0],
      ['S_R', 'RIGHT_SENSOR (DEMO)', 'sensory', 0],
      ['I0', 'I0 aggregate-left (DEMO)', 'inter', -1.0],
      ['I1', 'I1 aggregate-right (DEMO)', 'inter', -1.0],
      ['I2', 'I2 center-drive (DEMO)', 'inter', -1.0],
      ['I3', 'I3 left-diff (DEMO)', 'inter', -1.0],
      ['I4', 'I4 right-diff (DEMO)', 'inter', -1.0],
      ['I5', 'I5 forward-mix (DEMO)', 'inter', -1.0],
      // Motor biases slightly asymmetric: with no stimulus the fly drifts
      // gently (search behavior) instead of flying fast and blind.
      ['M_L', 'LEFT_MOTOR (DEMO)', 'motor', -2.2],
      ['M_R', 'RIGHT_MOTOR (DEMO)', 'motor', -2.1]
    ];
    for (const [id, name, layer, bias] of defs) {
      c.neurons.set(id, createNeuron(id, name, layer, bias, 1.6));
    }

    const w: Array<[string, string, number]> = [
      // sensory -> inter
      ['S_L', 'I0', 3.0],
      ['S_C', 'I0', 1.2],
      ['S_R', 'I0', -1.0],
      ['S_R', 'I1', 3.0],
      ['S_C', 'I1', 1.2],
      ['S_L', 'I1', -1.0],
      ['S_C', 'I2', 3.4],
      ['S_L', 'I2', 0.8],
      ['S_R', 'I2', 0.8],
      ['S_L', 'I3', 2.4],
      ['S_R', 'I3', -2.0],
      ['S_R', 'I4', 2.4],
      ['S_L', 'I4', -2.0],
      ['S_C', 'I5', 2.0],
      ['S_L', 'I5', 1.0],
      ['S_R', 'I5', 1.0],
      // inter -> motor
      ['I0', 'M_L', 3.0],
      ['I3', 'M_L', 1.6],
      ['I2', 'M_L', 1.2],
      ['I1', 'M_L', -1.2],
      ['I1', 'M_R', 3.0],
      ['I4', 'M_R', 1.6],
      ['I2', 'M_R', 1.2],
      ['I0', 'M_R', -1.2],
      ['I5', 'M_L', 0.8],
      ['I5', 'M_R', 0.8]
    ];
    w.forEach(([s, t, weight], i) => {
      c.connections.push(createConnection(`C${i}`, s, t, weight));
    });

    return c;
  }
}
