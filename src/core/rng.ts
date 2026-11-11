/**
 * 由种子驱动的随机数。状态是一个 32 位整数，可以直接存进存档。
 * 算法是 mulberry32。
 */

export function seedState(seed: number): number {
  return (Math.floor(seed) >>> 0) || 0x9e3779b9;
}

/** 返回 0 到 1 之间的一个数，以及新的状态。 */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** 一个自带状态的随机源，用来生成证据的噪声。种子相同，序列相同。 */
export function makeRandom(seed: number): { uniform(): number; gauss(): number } {
  let state = seedState(seed);
  const uniform = (): number => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
  const gauss = (): number => {
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { uniform, gauss };
}
