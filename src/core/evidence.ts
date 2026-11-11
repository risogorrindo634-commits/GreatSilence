/**
 * 把真相表里的定义变成玩家看到的数据：波形、热图、损毁分布。
 * 只产出数据和可核查的事实，不产出解释。同样的输入永远得到同样的输出。
 */
import { BALANCE } from '../content/balance';
import { PROBE_FACTS, PULSAR_FACTS, SIGNAL_FACTS, TRUTHS } from '../content/truths';
import type { InfraredDef, RuinsDef, SignalDef, TruthId } from '../content/truths';
import { makeRandom } from './rng';
import type { EvidenceState, Observation, ProbeReport, ProbeState, RuinsCell } from './types';

const E = BALANCE.evidence;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function round(x: number, digits = 3): number {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}

function noiseLevel(clarity: number): number {
  return E.signalNoise * (1 - clarity) + E.signalNoiseFloor;
}

/** 信号在哪里结束。cutOnPeak 时移到不晚于 cutAt 的最后一个波峰。 */
export function signalCut(def: SignalDef): number {
  if (!def.cutOnPeak) return def.cutAt;
  const k = Math.floor(def.cutAt * def.cycles - 0.25);
  return (k + 0.25) / def.cycles + 0.5 / E.signalSamples;
}

export function signalSeries(def: SignalDef, clarity: number, seed: number): number[] {
  const random = makeRandom(seed);
  const cut = signalCut(def);
  const sd = noiseLevel(clarity);
  const out: number[] = [];
  for (let i = 0; i < E.signalSamples; i++) {
    const t = i / E.signalSamples;
    let level = 0;
    if (t < cut) {
      const carrier = def.from + (def.to - def.from) * (t / cut) ** def.curve;
      const pulse = 1 + def.pulse * Math.sin(2 * Math.PI * def.cycles * t);
      const fade = def.fadeFrom === null ? 1 : 1 - smoothstep(def.fadeFrom, cut, t);
      level = carrier * pulse * fade;
    }
    out.push(round(Math.max(0, level + sd * random.gauss())));
  }
  return out;
}

/** 干扰项：规律的窄脉冲，一直持续到记录结束。 */
export function pulsarSeries(clarity: number, seed: number): number[] {
  const random = makeRandom(seed);
  const sd = noiseLevel(clarity);
  const out: number[] = [];
  for (let i = 0; i < E.signalSamples; i++) {
    const phase = (i % 8) / 8;
    const level = phase < 0.25 ? 0.85 : 0.12;
    out.push(round(Math.max(0, level + sd * random.gauss())));
  }
  return out;
}

export function infraredGrid(def: InfraredDef, seed: number): number[][] {
  const random = makeRandom(seed);
  const n = E.infraredSize;
  const outer = 0.88;
  const grid: number[][] = [];
  for (let y = 0; y < n; y++) {
    const row: number[] = [];
    for (let x = 0; x < n; x++) {
      const px = ((x + 0.5) / n - 0.5) * 2;
      const py = ((y + 0.5) / n - 0.5) * 2;
      const r = Math.hypot(px, py);
      let v = 0.06;
      if (r >= def.discInner && r <= outer) v += 0.5 - 0.2 * ((r - def.discInner) / (outer - def.discInner));
      if (def.source > 0) {
        // 点源在尘埃盘之外的暗处，这样在图上认得出来。
        const d = Math.hypot(px - 0.8, py + 0.76);
        v += def.source * Math.exp(-(d * d) / (2 * 0.05 * 0.05));
      }
      row.push(round(Math.max(0, v + E.infraredNoise * random.gauss())));
    }
    grid.push(row);
  }
  return grid;
}

export function ruinsCells(def: RuinsDef, seed: number): RuinsCell[][] {
  const random = makeRandom(seed);
  const n = E.ruinsSize;
  // 这些随机量与真相无关，三种真相用的是同一组，只是用法不同。
  const angle = random.uniform() * 2 * Math.PI;
  const cx = 2 + Math.floor(random.uniform() * (n - 4));
  const cy = 2 + Math.floor(random.uniform() * (n - 4));
  const cells: RuinsCell[][] = [];
  for (let y = 0; y < n; y++) {
    const row: RuinsCell[] = [];
    for (let x = 0; x < n; x++) {
      const jitter = random.gauss();
      const wobble = random.gauss();
      let damage = 0;
      let dir: number | null = null;
      if (def.damage === 'none') {
        damage = Math.abs(jitter) * 0.02;
      } else if (def.damage === 'uniform') {
        damage = 0.8 + jitter * 0.03;
        dir = angle + wobble * 0.05;
      } else {
        const dist = Math.hypot(x - cx, y - cy);
        damage = 1.05 - dist * 0.24 + jitter * 0.03;
        if (damage > 0.12 && dist > 0) dir = Math.atan2(y - cy, x - cx) + wobble * 0.05;
      }
      damage = Math.min(1, Math.max(0, damage));
      row.push({ damage: round(damage), dir: dir === null ? null : round(dir) });
    }
    cells.push(row);
  }
  return cells;
}

/** 已经有了消息的探测器。没有消息的不在其中，它们的结局还不能让玩家知道。 */
export function probeReports(probes: readonly ProbeState[]): ProbeReport[] {
  return probes
    .filter((p) => p.reported)
    .map((p) => ({ from: p.from, launchedYear: p.launchedYear, reportYear: p.reportYear, distance: p.distance, lostAt: p.lostAt }))
    .sort((a, b) => a.reportYear - b.reportYear);
}

/** 把已经取得的证据变成给玩家看的观测。 */
export function observe(truth: TruthId, evidence: EvidenceState, probes: readonly ProbeState[] = []): Observation[] {
  const def = TRUTHS[truth].evidence;
  const out: Observation[] = [];

  if (evidence.signal) {
    const { clarity, seed, year } = evidence.signal;
    const facts = [...SIGNAL_FACTS];
    if (clarity >= BALANCE.tune.detailAt) facts.push(def.signal.detail);
    out.push({
      id: 'signal',
      kind: 'signal',
      year,
      clarity,
      series: signalSeries(def.signal, clarity, seed),
      facts,
      natural: null,
    });
  }

  if (evidence.pulsar) {
    const { clarity, seed, year } = evidence.pulsar;
    const natural = clarity >= BALANCE.tune.naturalAt;
    out.push({
      id: 'pulsar',
      kind: 'signal',
      year,
      clarity,
      series: pulsarSeries(clarity, seed),
      facts: natural ? [...PULSAR_FACTS.base, ...PULSAR_FACTS.natural] : [...PULSAR_FACTS.base],
      natural: natural ? true : null,
    });
  }

  if (evidence.infrared) {
    const { fine, seed, year } = evidence.infrared;
    out.push({
      id: 'infrared',
      kind: 'infrared',
      year,
      fine,
      grid: fine ? infraredGrid(def.infrared, seed) : null,
      facts: [...(fine ? def.infrared.fine : def.infrared.coarse)],
    });
  }

  if (evidence.ruins) {
    const { fine, seed, year } = evidence.ruins;
    out.push({
      id: 'ruins',
      kind: 'ruins',
      year,
      fine,
      cells: fine ? ruinsCells(def.ruins, seed) : null,
      facts: [...(fine ? def.ruins.fine : def.ruins.coarse)],
    });
  }

  const reports = probeReports(probes);
  if (evidence.probe && reports.length > 0) {
    // 探测器只回答“到了没有，在哪里没了声音”。同样的结果在三种真相下写法完全一样。
    const facts = reports.map((r, i) => {
      const what = r.lostAt === null ? PROBE_FACTS.arrived : PROBE_FACTS.lost.replace('{x}', r.lostAt.toFixed(1));
      return `第 ${i + 1} 艘（第 ${r.launchedYear} 年发射）：${what}`;
    });
    out.push({ id: 'probe', kind: 'probe', year: evidence.probe.year, reports, facts: [...facts, PROBE_FACTS.rate] });
  }

  return out;
}
