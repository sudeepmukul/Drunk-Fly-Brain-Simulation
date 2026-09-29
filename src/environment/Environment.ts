export interface ResetPose {
  flyX: number;
  flyZ: number;
  heading: number;
  targetX: number;
  targetZ: number;
}

/** Deterministic reset poses so experiments are repeatable. */
export const DEFAULT_POSE: ResetPose = {
  flyX: -12,
  flyZ: -12,
  heading: Math.PI / 4,
  targetX: 10,
  targetZ: 8
};

export class Environment {
  targetX = DEFAULT_POSE.targetX;
  targetZ = DEFAULT_POSE.targetZ;
  reached = false;

  reset(p: ResetPose = DEFAULT_POSE): void {
    this.targetX = p.targetX;
    this.targetZ = p.targetZ;
    this.reached = false;
  }
}
