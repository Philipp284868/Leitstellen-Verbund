/** Analytic, tick-independent longitudinal motion. Distances m, time s, velocity m/s. */
export type Coordinate = { x: number; y: number };
export type MotionLeg = {
  from: Coordinate;
  to: Coordinate;
  meters: number;
  limit: number;
  edge: string;
  waitSeconds?: number;
};
export type MotionPhase = Omit<MotionLeg, "waitSeconds"> & {
  start: number;
  duration: number;
  velocity: number;
  acceleration: number;
  offset: number;
  traveled: number;
};
export const constantSeconds = (meters: number, kmh: number) => {
  if (
    !Number.isFinite(meters) ||
    meters < 0 ||
    !Number.isFinite(kmh) ||
    kmh <= 0
  )
    throw Error("Ungültige Strecke oder Geschwindigkeit.");
  return meters / (kmh / 3.6);
};
export function motionProfile(
  input: MotionLeg[],
  acceleration = 1.2,
  braking = 2,
  initialKmh = 0,
) {
  if (
    input.some(
      (l) =>
        !Number.isFinite(l.meters) ||
        l.meters < 0 ||
        !Number.isFinite(l.limit) ||
        l.limit <= 0 ||
        !Number.isFinite(l.waitSeconds ?? 0) ||
        (l.waitSeconds ?? 0) < 0,
    )
  )
    throw Error("Ungültiger Streckenabschnitt.");
  if (
    ![acceleration, braking, initialKmh].every(Number.isFinite) ||
    initialKmh < 0
  )
    throw Error("Ungültiges Fahrzeugprofil.");
  const legs = input.filter((l) => l.meters > 1e-7);
  if (
    legs.some(
      (l) =>
        !Number.isFinite(l.limit) || l.limit <= 0 || !Number.isFinite(l.meters),
    )
  )
    throw Error("Nicht befahrbarer Streckenabschnitt.");
  if (!(acceleration > 0 && braking > 0))
    throw Error("Ungültiges Fahrzeugprofil.");
  const boundary = Array.from({ length: legs.length + 1 }, (_, i) =>
    i === legs.length || (legs[i]?.waitSeconds ?? 0) > 0
      ? 0
      : i === 0
        ? Math.max(0, initialKmh / 3.6)
        : Math.min(legs[i - 1].limit, legs[i].limit) / 3.6,
  );
  for (let i = legs.length - 1; i >= 0; i--)
    boundary[i] = Math.min(
      boundary[i],
      Math.sqrt(boundary[i + 1] ** 2 + 2 * braking * legs[i].meters),
      legs[i].limit / 3.6,
    );
  for (let i = 0; i < legs.length; i++)
    boundary[i + 1] = Math.min(
      boundary[i + 1],
      Math.sqrt(boundary[i] ** 2 + 2 * acceleration * legs[i].meters),
    );
  const phases: MotionPhase[] = [];
  let start = 0,
    traveled = 0;
  for (let i = 0; i < legs.length; i++) {
    const { waitSeconds = 0, ...l } = legs[i],
      a = boundary[i],
      b = boundary[i + 1];
    if (waitSeconds > 0) {
      phases.push({
        ...l,
        start,
        duration: waitSeconds,
        velocity: 0,
        acceleration: 0,
        offset: 0,
        traveled,
      });
      start += waitSeconds;
    }
    const peak = Math.min(
      l.limit / 3.6,
      Math.sqrt(
        (2 * acceleration * braking * l.meters +
          braking * a * a +
          acceleration * b * b) /
          (acceleration + braking),
      ),
    );
    const up = Math.max(0, (peak * peak - a * a) / (2 * acceleration)),
      down = Math.max(0, (peak * peak - b * b) / (2 * braking));
    let offset = 0;
    for (const [distance, velocity, change] of [
      [up, a, acceleration],
      [Math.max(0, l.meters - up - down), peak, 0],
      [down, peak, -braking],
    ]) {
      if (distance < 1e-7) continue;
      const duration =
        change === 0
          ? distance / velocity
          : (Math.sqrt(
              Math.max(0, velocity * velocity + 2 * change * distance),
            ) -
              velocity) /
            change;
      phases.push({
        ...l,
        start,
        duration,
        velocity,
        acceleration: change,
        offset,
        traveled,
      });
      start += duration;
      offset += distance;
      traveled += distance;
    }
  }
  return { phases, seconds: start, meters: traveled };
}
export function motionAt(phases: MotionPhase[], elapsed: number) {
  if (!phases.length) return null;
  let lo = 0,
    hi = phases.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (phases[mid].start + phases[mid].duration < elapsed) lo = mid + 1;
    else hi = mid;
  }
  const p = phases[lo],
    t = Math.max(0, Math.min(p.duration, elapsed - p.start));
  const distance = p.velocity * t + (p.acceleration * t * t) / 2;
  const fraction = Math.max(0, Math.min(1, (p.offset + distance) / p.meters));
  return {
    position: {
      x: p.from.x + (p.to.x - p.from.x) * fraction,
      y: p.from.y + (p.to.y - p.from.y) * fraction,
    },
    kmh: elapsed < 0 ? 0 : Math.max(0, p.velocity + p.acceleration * t) * 3.6,
    limit: p.limit,
    meters: p.traveled + distance,
    edge: p.edge,
  };
}
