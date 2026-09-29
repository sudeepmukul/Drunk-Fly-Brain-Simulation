import type { NeuralCircuit } from '../brain/NeuralCircuit';
import { motorToMovement, NeuralSimulator, type PerturbationSettings } from '../brain/NeuralSimulator';
import { Fly } from './Fly';
import { computeSensors, type SensorReading } from './FlySensors';

export interface MotorConfig {
  turnGain: number;
  forwardBase: number;
  forwardGain: number;
}

export interface ControllerStep {
  sensors: SensorReading;
  motors: { left: number; right: number };
  movement: { turn: number; forward: number };
}

/** FlyController wires sensors -> circuit -> motors -> fly. */
export class FlyController {
  motorConfig: MotorConfig = { turnGain: 1.0, forwardBase: 0.35, forwardGain: 0.65 };

  constructor(
    public fly: Fly,
    public circuit: NeuralCircuit,
    public sim: NeuralSimulator
  ) {}

  step(targetX: number, targetZ: number, pert: PerturbationSettings, dt: number): ControllerStep {
    const s = this.fly.state;
    const sensors = computeSensors(s.x, s.z, s.heading, targetX, targetZ, this.fly.params.sensorRange);
    this.sim.step({ S_L: sensors.left, S_C: sensors.center, S_R: sensors.right }, pert, dt);
    const motors = this.sim.readMotors(pert, dt);
    const movement = motorToMovement(motors.left, motors.right, this.motorConfig);
    // Feeding slowdown: scale forward speed (never steering) when very close
    // to the target so the fly settles instead of overshooting at full speed.
    const dist = Math.hypot(targetX - s.x, targetZ - s.z);
    const arrival = dist < 4 ? 0.2 + 0.8 * (dist / 4) : 1;
    this.fly.applyMotor(movement.turn, movement.forward * arrival, dt);
    return { sensors, motors, movement };
  }
}
