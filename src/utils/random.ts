/** Small seeded PRNG (mulberry32) so the demo scenario is reproducible. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
  };
}

/** Deterministic noise in [-1, 1] for a given key and time — used for smooth fluctuation. */
export function noise(key: number, t: number) {
  return (
    Math.sin(t * 0.071 + key * 1.7) * 0.5 +
    Math.sin(t * 0.193 + key * 3.1) * 0.3 +
    Math.sin(t * 0.017 + key * 0.37) * 0.2
  );
}
