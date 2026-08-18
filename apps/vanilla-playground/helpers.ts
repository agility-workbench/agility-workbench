export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatDate(date: Date | string | number): string {
  const value = date instanceof Date ? date : new Date(date);
  const dayName = value.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = String(value.getDate()).padStart(2, "0");
  const monthName = value.toLocaleDateString("en-US", { month: "short" });
  const year = value.getFullYear();

  return `${dayName}, ${dayNum} ${monthName}, ${year}`;
}

/**
 * Deterministic PRNG. Every demo that fabricates data uses it so reloads (and screenshots, and
 * bug reports) show the same rows. The React demos each carry a private copy; here it is shared.
 */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks from `values` with the supplied PRNG. */
export function picker(rand: () => number) {
  return <T,>(values: readonly T[]): T => values[Math.floor(rand() * values.length)];
}
