export interface FlyState {
  x: number;
  z: number;
  y: number;
  heading: number; // radians; forward = (sin h, cos h) on XZ plane
  speed: number; // current forward speed units/s
  turnAmount: number; // last turn command -1..1
}

export interface FlyParams {
  baseSpeed: number;
  turnRate: number; // rad/s at full differential
  sensorRange: number;
  arenaHalf: number;
}

/**
 * Fly — movement is ONLY driven by motor outputs via applyMotor().
 * No hardcoded "if target left, turn left" anywhere: steering emerges from circuit.
 */
export class Fly {
  state: FlyState = { x: 0, z: 0, y: 1.0, heading: 0, speed: 0, turnAmount: 0 };
  params: FlyParams = { baseSpeed: 4.0, turnRate: 2.6, sensorRange: 40, arenaHalf: 22 };

  constructor(params?: Partial<FlyParams>) {
    if (params) this.params = { ...this.params, ...params };
  }

  reset(x: number, z: number, heading: number): void {
    this.state = { x, z, y: 1.0, heading, speed: 0, turnAmount: 0 };
  }

  /** turn in [-1,1] (positive = left), forward in [0,1]. dt seconds. */
  applyMotor(turn: number, forward: number, dt: number): void {
    const s = this.state;
    const clampedTurn = Math.max(-1, Math.min(1, turn));
    const clampedFwd = Math.max(0, Math.min(1, forward));
    s.heading += clampedTurn * this.params.turnRate * dt;
    const speed = clampedFwd * this.params.baseSpeed;
    s.speed = speed;
    s.turnAmount = clampedTurn;
    s.x += Math.sin(s.heading) * speed * dt;
    s.z += Math.cos(s.heading) * speed * dt;
    // world boundary: specular reflection of heading (forward = (sin h, cos h))
    const H = this.params.arenaHalf;
    if (s.x > H) { s.x = H; s.heading = -s.heading + 0.15; }
    if (s.x < -H) { s.x = -H; s.heading = -s.heading - 0.15; }
    if (s.z > H) { s.z = H; s.heading = Math.PI - s.heading + 0.15; }
    if (s.z < -H) { s.z = -H; s.heading = Math.PI - s.heading - 0.15; }
    // gentle hover bob handled by renderer
    s.y = 1.0;
  }

  distanceTo(tx: number, tz: number): number {
    return Math.hypot(tx - this.state.x, tz - this.state.z);
  }
}
