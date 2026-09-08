// Simulation and SQLite transactions are synchronous. The scope never crosses an await.
let automaticDepth = 0;
export const automaticRouting = () => automaticDepth > 0;
export function withAutomaticRouting<T>(work: () => T): T {
  automaticDepth++;
  try {
    return work();
  } finally {
    automaticDepth--;
  }
}
