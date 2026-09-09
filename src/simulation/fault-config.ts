/** Bounded gameplay interruptions in simulation seconds, not real workshop estimates. */
export const FAULT_SECONDS = {
  engine: 120,
  tire: 60,
  technical: 60,
  radio: 30,
  equipment: 45,
  energy: 45,
  accident: 150,
} as const;
export const FAULT_RECOVERY_GRACE = 300;
