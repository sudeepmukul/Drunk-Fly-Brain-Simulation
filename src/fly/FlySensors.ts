export interface SensorReading {
  left: number;
  center: number;
  right: number;
}

export const SENSOR_OFFSETS = {
  left: (40 * Math.PI) / 180,
  center: 0,
  right: (-40 * Math.PI) / 180
};

/**
 * Virtual vision sensors. Each measures target visibility in its cone:
 * value = max(0, cos(angleDiff))^2 * distanceFalloff, normalized to [0,1].
 */
export function computeSensors(
  flyX: number,
  flyZ: number,
  heading: number,
  targetX: number,
  targetZ: number,
  sensorRange = 40
): SensorReading {
  const dx = targetX - flyX;
  const dz = targetZ - flyZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { left: 1, center: 1, right: 1 };
  const bearing = Math.atan2(dx, dz); // heading convention: forward = (sin h, cos h)
  const falloff = clamp01(1 - dist / sensorRange);
  // sharpen with exponent so only roughly-facing sensors fire
  const sample = (offset: number): number => {
    let diff = normalizeAngle(bearing - (heading + offset));
    const dir = Math.max(0, Math.cos(diff));
    return Math.pow(dir, 1.5) * (0.25 + 0.75 * falloff);
  };
  return {
    left: clamp01(sample(SENSOR_OFFSETS.left)),
    center: clamp01(sample(SENSOR_OFFSETS.center)),
    right: clamp01(sample(SENSOR_OFFSETS.right))
  };
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
