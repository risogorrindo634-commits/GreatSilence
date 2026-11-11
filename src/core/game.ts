/**
 * 模拟内核。纯函数：不碰界面、时钟和网络；同一个种子加同一串操作，永远得到同一个结果。
 *
 *   createGame(seed, truth?) -> GameState
 *   can(state, action)       -> 不能做时返回原因
 *   reduce(state, action)    -> 新的状态，不修改传入的状态
 *   publicView(state)        -> 给界面用的视图，不含真相
 */
import { BALANCE as B } from '../content/balance';
import { COURT, COURT_IDS, FACTION_IDS, courtAt } from '../content/court';
import type { FactionId } from '../content/court';
import { BODY_IDS, PROBE_TARGET, START_SYSTEM, SYSTEMS, SYSTEM_IDS, distance, findBody } from '../content/systems';
import type { BodyDef, SystemId } from '../content/systems';
import { RESPONSE_IDS, TRUTHS, TRUTH_IDS } from '../content/truths';
import type { ResponseId, TruthId } from '../content/truths';
import { observe } from './evidence';
import { nextRandom, seedState } from './rng';
import { EVIDENCE_IDS, LINE_IDS } from './types';
import type {
  Action,
  BodyState,
  Cost,
  EndingId,
  EvidenceId,
  GameState,
  LineId,
  LogEvent,
  PublicView,
  SystemView,
} from './types';

// ---------------------------------------------------------------- 开局

export function createGame(seed: number, truth?: TruthId): GameState {
  // 无论是否指定真相都抽一次，这样同一个种子在不同真相下用的是同一串随机数。
  const roll = nextRandom(seedState(seed));
  const picked = truth ?? TRUTH_IDS[Math.floor(roll.value * TRUTH_IDS.length)] ?? 'dream';

  const bodies: Record<string, BodyState> = {};
  for (const id of BODY_IDS) {
    bodies[id] = { viewed: false, surveyed: false, anomalyKnown: false, harvested: 0, name: null };
  }

  return {
    version: 1,
    seed,
    rng: roll.state,
    truth: picked,
    year: 0,
    wakeDays: B.start.wakeDays,
    energy: B.start.energy,
    authority: B.start.authority,
    support: { outward: B.start.support, guard: B.start.support, inward: B.start.support },
    location: START_SYSTEM,
    visited: [START_SYSTEM],
    slingshot: null,
    delegatedYears: 0,
    sleptYears: 0,
    arrays: [],
    beacons: 0,
    probes: [],
    research: {
      allocation: { propulsion: 0.25, longevity: 0.25, harvest: 0.25, cosmology: 0.25 },
      points: { propulsion: 0, longevity: 0, harvest: 0, cosmology: 0 },
    },
    rulings: {},
    pending: null,
    bodies,
    evidence: {},
    eliminated: null,
    board: {},
    log: [{ t: 'start', year: 0 }],
    conclusion: null,
    ending: null,
  };
}

/** 从头重放一串操作。 */
export function replay(seed: number, truth: TruthId | undefined, actions: readonly Action[]): GameState {
  let state = createGame(seed, truth);
  for (const action of actions) state = reduce(state, action);
  return state;
}

// ---------------------------------------------------------------- 由状态算出来的量

export function levelOf(points: number): number {
  let level = 0;
  for (const threshold of B.research.thresholds) if (points >= threshold) level++;
  return level;
}

export function level(state: GameState, line: LineId): number {
  return levelOf(state.research.points[line]);
}

/** 巡航速度，以光速为单位，不含弹弓。 */
export function cruiseSpeed(state: GameState): number {
  return B.travel.baseSpeed * (B.research.speed[level(state, 'propulsion')] ?? 1);
}

export function incomePerYear(state: GameState): number {
  const research = B.research.harvest[level(state, 'harvest')] ?? 1;
  let sum = 0;
  for (const a of state.arrays) sum += B.build.outputPerYear * SYSTEMS[a.system].arrayOutput * a.quality * research;
  return sum;
}

function researchRate(state: GameState): number {
  let rate = 1;
  for (const id of COURT_IDS) {
    if (state.rulings[id] === 'sign') rate *= COURT[id].sign.researchRate ?? 1;
  }
  return rate;
}

export function computePerYear(state: GameState): number {
  return (B.research.baseCompute + B.research.computePerIncome * incomePerYear(state)) * researchRate(state);
}

export function conspicuity(state: GameState): number {
  return (
    state.arrays.length * B.fate.conspicuityPerArray +
    state.beacons * B.fate.conspicuityPerBeacon +
    state.probes.length * B.fate.conspicuityPerProbe
  );
}

/** 命运里各项各占多少点。 */
export function fateParts(state: GameState): { time: number; conspicuity: number; delegation: number; signed: number } {
  const w = TRUTHS[state.truth].weights;
  const share = (value: number, full: number): number => Math.min(1, value / full);
  let signed = 0;
  for (const id of COURT_IDS) {
    if (state.rulings[id] === 'sign' && COURT[id].trap.truth === state.truth) signed += COURT[id].trap.fate;
  }
  return {
    time: B.fate.full * w.time * share(state.year, B.fate.timeFullYears),
    conspicuity: B.fate.full * w.conspicuity * share(conspicuity(state), B.fate.conspicuityFull),
    delegation: B.fate.full * w.delegation * share(state.delegatedYears, B.fate.delegationFullYears),
    signed,
  };
}

/** 命运不单独存储，永远由状态算出来。满 100 即降临。 */
export function fate(state: GameState): number {
  const p = fateParts(state);
  return Math.min(B.fate.full, p.time + p.conspicuity + p.delegation + p.signed);
}

/** 从当前位置去另一个星系要花什么。 */
export function travel(state: GameState, to: SystemId): { distance: number; speed: number; years: number; energy: number } {
  const from = SYSTEMS[state.location];
  const dist = distance(from.pos, SYSTEMS[to].pos);
  const boost = state.slingshot ?? B.slingshot.ai * from.slingshot;
  const speed = Math.min(B.travel.maxSpeed, cruiseSpeed(state) * (1 + boost));
  return {
    distance: dist,
    speed,
    years: Math.max(1, Math.round(dist / speed)),
    energy: Math.ceil(dist * B.travel.energyPerLightYear),
  };
}

/** 从当前位置发射的探测器多少年后有回音：飞过去，再等消息以光速传回来。 */
export function probeYears(state: GameState): number {
  const dist = distance(SYSTEMS[state.location].pos, PROBE_TARGET.pos);
  const speed = Math.min(B.travel.maxSpeed, cruiseSpeed(state) * B.probe.speedFactor);
  return Math.max(1, Math.round(dist / speed + dist));
}

/** 一处天体这一次采集能得到多少能源。 */
function harvestYield(def: BodyDef, times: number): number {
  return Math.max(1, Math.round(def.resource * B.harvest.repeatFactor ** times));
}

function aiTuneClarity(state: GameState): number {
  const c = B.research.cosmology;
  return level(state, 'cosmology') >= c.aiTuneAt ? c.aiTuneClarity : B.tune.ai;
}

function investigateDays(state: GameState, def: BodyDef): number {
  const c = B.research.cosmology;
  const saved = level(state, 'cosmology') >= c.investigateAt ? c.investigateDaysSaved : 0;
  return Math.max(1, (def.investigateDays ?? 10) - saved);
}

function evidenceOf(def: BodyDef): EvidenceId | null {
  return def.anomaly ?? null;
}

// ---------------------------------------------------------------- 花费与合法性

const FREE: Cost = { days: 0, years: 0, energy: 0 };

/** 一个操作要花多少清醒日、世界年和能源。 */
export function cost(state: GameState, action: Action): Cost {
  switch (action.type) {
    case 'view':
      return { ...FREE, days: B.view.days };
    case 'survey':
      return action.mode === 'self' ? { ...FREE, days: B.survey.days } : { ...FREE, years: B.survey.years };
    case 'investigate': {
      if (action.mode === 'ai') return { ...FREE, years: B.investigate.years };
      const found = findBody(action.body);
      return { ...FREE, days: found ? investigateDays(state, found.body) : 0 };
    }
    case 'tune':
      return action.mode === 'self' ? { ...FREE, days: B.tune.days } : FREE;
    case 'harvest':
      return action.mode === 'self' ? { ...FREE, days: B.harvest.days } : { ...FREE, years: B.harvest.years };
    case 'build':
      return action.mode === 'self'
        ? { days: B.build.days, years: 0, energy: B.build.energy }
        : { days: 0, years: B.build.years, energy: B.build.energy };
    case 'slingshot':
      return { ...FREE, days: B.slingshot.days };
    case 'probe':
      return { ...FREE, energy: B.probe.energy };
    case 'wait':
      return { ...FREE, years: action.years };
    case 'rule': {
      const energy = action.decision === 'sign' ? -(COURT[action.item]?.sign.energy ?? 0) : 0;
      return { ...FREE, energy: Math.max(0, energy) };
    }
    case 'depart': {
      if (!SYSTEMS[action.to] || action.to === state.location) return FREE;
      const t = travel(state, action.to);
      return { days: 0, years: t.years, energy: t.energy };
    }
    default:
      return FREE;
  }
}

function isSkill(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

/** 这个天体在当前星系里吗；在就返回它的定义。 */
function localBody(state: GameState, id: string): BodyDef | null {
  const found = findBody(id);
  return found && found.system === state.location ? found.body : null;
}

/** 能做就返回 null，不能做就返回原因。 */
export function can(state: GameState, action: Action): string | null {
  if (state.ending) return '这一局已经结束。';

  const specific = canSpecific(state, action);
  if (specific) return specific;

  const c = cost(state, action);
  if (c.days > state.wakeDays) return '清醒日不够。';
  if (c.energy > state.energy) return '能源不够。';
  return null;
}

function canSpecific(state: GameState, action: Action): string | null {
  switch (action.type) {
    case 'view': {
      if (!localBody(state, action.body)) return '它不在这个星系。';
      if (state.bodies[action.body]?.viewed) return '已经看过了。';
      return null;
    }
    case 'name': {
      if (!findBody(action.body)) return '没有这个天体。';
      if (!state.bodies[action.body]?.viewed) return '先去看一眼，才能给它起名。';
      const name = typeof action.name === 'string' ? action.name.trim() : '';
      if (name.length < 1 || name.length > 12) return '名字要在 1 到 12 个字之间。';
      return null;
    }
    case 'survey': {
      if (action.mode === 'self') {
        if (!localBody(state, action.body)) return '它不在这个星系。';
        if (state.bodies[action.body]?.surveyed) return '已经勘察过了。';
        return null;
      }
      const left = SYSTEMS[state.location].bodies.some((b) => !state.bodies[b.id]?.surveyed);
      return left ? null : '这个星系已经勘察完了。';
    }
    case 'investigate': {
      const def = localBody(state, action.body);
      if (!def) return '它不在这个星系。';
      const id = evidenceOf(def);
      if (!state.bodies[action.body]?.anomalyKnown || (id !== 'ruins' && id !== 'infrared')) return '这里没有已知的、可以调查的异常。';
      const have = state.evidence[id];
      if (have?.fine) return '已经查清了。';
      if (have && action.mode === 'ai') return '已经有一份粗略的结果，再交给 AI 也不会更细。';
      return null;
    }
    case 'tune': {
      const def = localBody(state, action.body);
      if (!def) return '它不在这个星系。';
      const id = evidenceOf(def);
      if (!state.bodies[action.body]?.anomalyKnown || (id !== 'signal' && id !== 'pulsar')) return '这里没有已知的信号。';
      if (action.mode === 'self') return isSkill(action.skill) ? null : '技巧值要在 0 到 1 之间。';
      const have = state.evidence[id];
      if (have && have.clarity >= aiTuneClarity(state)) return '已经有一份不比这更差的结果。';
      return null;
    }
    case 'harvest':
      return localBody(state, action.body) ? null : '它不在这个星系。';
    case 'build': {
      const sys = SYSTEMS[state.location];
      if (sys.arrayOutput <= 0) return '这里没有恒星，不能建阵列。';
      const here = state.arrays.filter((a) => a.system === state.location).length;
      if (here >= B.build.maxPerSystem) return `一个星系最多建 ${B.build.maxPerSystem} 座阵列。`;
      if (action.mode === 'self' && !isSkill(action.skill)) return '技巧值要在 0 到 1 之间。';
      return null;
    }
    case 'slingshot': {
      if (state.slingshot !== null) return '下一程的弹弓已经做过了。';
      return isSkill(action.skill) ? null : '技巧值要在 0 到 1 之间。';
    }
    case 'probe':
      return null;
    case 'wait': {
      const ok = Number.isInteger(action.years) && action.years >= 1 && action.years <= B.wait.maxYears;
      return ok ? null : `等待的年数要在 1 到 ${B.wait.maxYears} 之间。`;
    }
    case 'rule': {
      if (!COURT[action.item] || state.pending !== action.item) return '这件事不在待决之列。';
      if (action.decision !== 'sign' && action.decision !== 'veto') return '只能签字或否决。';
      return null;
    }
    case 'research': {
      const values = LINE_IDS.map((id) => action.allocation?.[id]);
      if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return '算力的份额不能是负数。';
      return (values as number[]).reduce((a, b) => a + b, 0) > 0 ? null : '至少要给一条线分配算力。';
    }
    case 'depart': {
      if (state.pending) return '有待决事项时不能启航。';
      if (!SYSTEMS[action.to]) return '星图上没有这个星系。';
      if (action.to === state.location) return '舰队已经在这里。';
      return null;
    }
    case 'mark': {
      if (!EVIDENCE_IDS.includes(action.evidence) || !state.evidence[action.evidence]) return '还没有取得这条证据。';
      if (!TRUTH_IDS.includes(action.truth)) return '没有这种解释。';
      if (!['support', 'against', 'unknown'].includes(action.mark)) return '只能标支持、反对或不确定。';
      return null;
    }
    case 'conclude': {
      if (!TRUTH_IDS.includes(action.conclusion)) return '没有这种解释。';
      if (!RESPONSE_IDS.includes(action.response)) return '没有这种回应。';
      return null;
    }
  }
}

// ---------------------------------------------------------------- 推进

type Draft = GameState;

function record(d: Draft, event: LogEvent, year = d.year): void {
  d.log.push({ ...event, year });
}

function draw(d: Draft): number {
  const r = nextRandom(d.rng);
  d.rng = r.state;
  return r.value;
}

function drawSeed(d: Draft): number {
  return Math.floor(draw(d) * 4294967296);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** 第一种时间：花清醒日。亲自到场也让权威小幅上升。 */
function spendDays(d: Draft, days: number, present: boolean): void {
  d.wakeDays -= days;
  if (present) d.authority += B.authority.perSelfAction;
}

/**
 * 第二种时间：让世界过去若干年。负责能源、科研、探测器回报。
 * 命运由状态算出来，这里不用管它。
 */
function passYears(d: Draft, years: number, kind: 'delegated' | 'sleep'): void {
  const compute = computePerYear(d);
  d.energy += incomePerYear(d) * years;
  d.year += years;

  if (kind === 'delegated') {
    d.delegatedYears += years;
    d.authority -= years / B.authority.delegatedYearsPerPoint;
  } else {
    d.sleptYears += years;
    d.authority -= years / B.authority.sleepYearsPerPoint;
  }

  for (const line of LINE_IDS) addPoints(d, line, compute * years * d.research.allocation[line]);

  for (const p of d.probes) {
    if (!p.reported && d.year >= p.reportYear) {
      p.reported = true;
      if (!d.evidence.probe) d.evidence.probe = { year: p.reportYear };
      record(d, { t: 'probeReport' }, p.reportYear);
    }
  }
}

function addPoints(d: Draft, line: LineId, points: number): void {
  const before = level(d, line);
  d.research.points[line] += points;
  const after = level(d, line);
  for (let lv = before + 1; lv <= after; lv++) {
    record(d, { t: 'level', line, level: lv });
    if (line === 'longevity') d.wakeDays += B.research.longevityDays;
    if (line === 'cosmology') {
      if (lv === B.research.cosmology.markLocalAt) markAnomalies(d);
      if (lv === B.research.cosmology.eliminateAt && !d.eliminated) {
        const wrong = TRUTH_IDS.filter((t) => t !== d.truth);
        const pick = wrong[Math.floor(draw(d) * wrong.length)];
        if (pick) {
          d.eliminated = pick;
          record(d, { t: 'eliminate', ruledOut: pick });
        }
      }
    }
  }
}

function markAnomalies(d: Draft): void {
  for (const def of SYSTEMS[d.location].bodies) {
    const body = d.bodies[def.id];
    if (def.anomaly && body) body.anomalyKnown = true;
  }
}

function arrive(d: Draft, to: SystemId, years: number, speed: number): void {
  const from = d.location;
  const first = !d.visited.includes(to);
  d.location = to;
  if (first) d.visited.push(to);
  d.slingshot = null;
  record(d, { t: 'arrive', system: to, from, years, speed, first });

  const sys = SYSTEMS[to];
  if (sys.arrivalDays > 0) {
    d.wakeDays -= sys.arrivalDays;
    record(d, { t: 'radiation', days: sys.arrivalDays });
  }
  if (level(d, 'cosmology') >= B.research.cosmology.markLocalAt) markAnomalies(d);

  const item = courtAt(to);
  if (first && item && !d.rulings[item.id]) {
    d.pending = item.id;
    record(d, { t: 'court', item: item.id });
  }
}

function shiftSupport(d: Draft, delta: Partial<Record<FactionId, number>> | undefined): void {
  if (!delta) return;
  for (const f of FACTION_IDS) d.support[f] = clamp(d.support[f] + (delta[f] ?? 0), 0, 100);
}

/** 结局表。规格：SLICE 第 7 节。 */
export function judge(truth: TruthId, conclusion: TruthId, response: ResponseId, authority: number): EndingId {
  const def = TRUTHS[truth];
  const rightReason = conclusion === truth;
  const rightResponse = response === def.response;
  if (rightReason && rightResponse) return authority >= B.authority.threshold ? 'clear' : 'powerless';
  if (!rightReason && (rightResponse || def.harmless.includes(response))) return 'lucky';
  return 'failed';
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** 每个操作之后：收拾数值，检查结局。 */
function settle(d: Draft): void {
  d.energy = round2(Math.max(0, d.energy));
  d.authority = round2(clamp(d.authority, 0, 100));
  for (const line of LINE_IDS) d.research.points[line] = round2(d.research.points[line]);

  if (d.ending) return;
  let ending: EndingId | null = null;
  if (d.conclusion) ending = judge(d.truth, d.conclusion.truth, d.conclusion.response, d.authority);
  else if (fate(d) >= B.fate.full) ending = 'undecided';
  else if (d.wakeDays <= 0) ending = 'sleep';

  if (ending) {
    d.ending = { id: ending, year: d.year };
    record(d, { t: 'end', ending });
  }
}

/** 执行一个操作，返回新的状态。不合法的操作会抛出错误，原因和 can 给的一样。 */
export function reduce(state: GameState, action: Action): GameState {
  const reason = can(state, action);
  if (reason) throw new Error(`不能执行 ${action.type}：${reason}`);

  const d: Draft = structuredClone(state);
  const c = cost(state, action);
  d.energy -= c.energy;

  switch (action.type) {
    case 'view': {
      spendDays(d, c.days, false);
      d.bodies[action.body]!.viewed = true;
      record(d, { t: 'view', body: action.body });
      break;
    }
    case 'name': {
      const name = action.name.trim();
      d.bodies[action.body]!.name = name;
      record(d, { t: 'name', body: action.body, name });
      break;
    }
    case 'survey': {
      const targets = action.mode === 'self' ? [action.body] : SYSTEMS[d.location].bodies.map((b) => b.id);
      if (action.mode === 'self') spendDays(d, c.days, true);
      else passYears(d, c.years, 'delegated');
      let found = 0;
      for (const id of targets) {
        const body = d.bodies[id]!;
        body.surveyed = true;
        if (findBody(id)?.body.anomaly && !body.anomalyKnown) {
          body.anomalyKnown = true;
          found++;
        }
      }
      record(d, { t: 'survey', mode: action.mode, system: d.location, found });
      break;
    }
    case 'investigate': {
      const id = evidenceOf(findBody(action.body)!.body) as 'ruins' | 'infrared';
      if (action.mode === 'self') spendDays(d, c.days, true);
      else passYears(d, c.years, 'delegated');
      const seed = d.evidence[id]?.seed ?? drawSeed(d);
      d.evidence[id] = { fine: action.mode === 'self', seed, year: d.year };
      record(d, { t: 'investigate', mode: action.mode, body: action.body, evidence: id });
      break;
    }
    case 'tune': {
      const id = evidenceOf(findBody(action.body)!.body) as 'signal' | 'pulsar';
      let clarity: number;
      if (action.mode === 'self') {
        spendDays(d, c.days, true);
        clarity = B.tune.min + (B.tune.max - B.tune.min) * action.skill;
      } else {
        clarity = aiTuneClarity(d);
      }
      const have = d.evidence[id];
      const best = round2(Math.max(have?.clarity ?? 0, clarity));
      d.evidence[id] = { clarity: best, seed: have?.seed ?? drawSeed(d), year: d.year };
      record(d, { t: 'tune', mode: action.mode, body: action.body, evidence: id, clarity: best });
      break;
    }
    case 'harvest': {
      const body = d.bodies[action.body]!;
      const gain = harvestYield(findBody(action.body)!.body, body.harvested);
      if (action.mode === 'self') spendDays(d, c.days, true);
      else passYears(d, c.years, 'delegated');
      body.harvested++;
      d.energy += gain;
      record(d, { t: 'harvest', mode: action.mode, body: action.body, energy: gain });
      break;
    }
    case 'build': {
      let quality: number;
      if (action.mode === 'self') {
        spendDays(d, c.days, true);
        quality = round2(B.build.skillMin + (B.build.skillMax - B.build.skillMin) * action.skill);
      } else {
        passYears(d, c.years, 'delegated');
        quality = B.build.ai;
      }
      d.arrays.push({ system: d.location, quality });
      record(d, { t: 'build', mode: action.mode, system: d.location, quality });
      break;
    }
    case 'slingshot': {
      spendDays(d, c.days, false);
      const base = B.slingshot.min + (B.slingshot.max - B.slingshot.min) * action.skill;
      d.slingshot = Math.round(base * SYSTEMS[d.location].slingshot * 1000) / 1000;
      record(d, { t: 'slingshot', boost: d.slingshot });
      break;
    }
    case 'probe': {
      const reportYear = d.year + probeYears(state);
      d.probes.push({ from: d.location, launchedYear: d.year, reportYear, reported: false });
      record(d, { t: 'probe', from: d.location, reportYear });
      break;
    }
    case 'wait': {
      passYears(d, c.years, 'sleep');
      record(d, { t: 'wait', years: c.years });
      break;
    }
    case 'rule': {
      const item = COURT[action.item];
      d.rulings[action.item] = action.decision;
      d.pending = null;
      record(d, { t: 'rule', item: action.item, decision: action.decision });
      if (action.decision === 'sign') {
        d.beacons += item.sign.beacons ?? 0;
        shiftSupport(d, item.sign.support);
        if (item.sign.researchPoints) for (const line of LINE_IDS) addPoints(d, line, item.sign.researchPoints);
      } else {
        shiftSupport(d, item.veto.support);
        d.authority += item.veto.authority;
      }
      break;
    }
    case 'research': {
      const total = LINE_IDS.reduce((sum, id) => sum + action.allocation[id], 0);
      for (const id of LINE_IDS) d.research.allocation[id] = action.allocation[id] / total;
      break;
    }
    case 'depart': {
      const t = travel(state, action.to);
      for (const f of FACTION_IDS) {
        if (d.support[f] < B.authority.lowSupport) d.authority -= B.authority.lowSupportPenalty;
      }
      passYears(d, t.years, 'sleep');
      arrive(d, action.to, t.years, t.speed);
      break;
    }
    case 'mark': {
      const key = `${action.evidence}:${action.truth}`;
      if (action.mark === 'unknown') delete d.board[key];
      else d.board[key] = action.mark;
      break;
    }
    case 'conclude': {
      d.conclusion = { truth: action.conclusion, response: action.response };
      record(d, { t: 'conclude', conclusion: action.conclusion, response: action.response });
      break;
    }
  }

  settle(d);
  return d;
}

// ---------------------------------------------------------------- 给界面的视图

/** 界面能看到的一切。真相只在结局之后出现。 */
export function publicView(state: GameState): PublicView {
  const cosmology = level(state, 'cosmology');

  const systems: SystemView[] = SYSTEM_IDS.map((id) => {
    const sys = SYSTEMS[id];
    const current = id === state.location;
    return {
      id,
      code: sys.code,
      name: sys.name,
      star: sys.star,
      starLabel: sys.starLabel,
      pos: sys.pos,
      role: sys.role,
      visited: state.visited.includes(id),
      current,
      canBuild: sys.arrayOutput > 0,
      arrays: state.arrays.filter((a) => a.system === id).length,
      anomalyHint: cosmology >= B.research.cosmology.markMapAt ? sys.bodies.some((b) => b.anomaly) : null,
      travel: current ? null : travel(state, id),
    };
  });

  const bodies = SYSTEMS[state.location].bodies.map((def) => {
    const s = state.bodies[def.id]!;
    const anomaly = s.anomalyKnown && def.anomaly ? (def.anomaly === 'pulsar' ? 'signal' : def.anomaly) : null;
    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      scene: def.scene,
      wonder: def.wonder ? { name: def.wonder.name, basis: def.wonder.basis } : null,
      viewed: s.viewed,
      surveyed: s.surveyed,
      given: s.name,
      resource: s.surveyed ? harvestYield(def, s.harvested) : null,
      anomaly,
      harvested: s.harvested,
    };
  });

  const album: PublicView['album'] = [];
  for (const id of SYSTEM_IDS) {
    for (const def of SYSTEMS[id].bodies) {
      const s = state.bodies[def.id]!;
      if (s.viewed) album.push({ body: def.id, name: def.name, given: s.name, system: id });
    }
  }

  const parts = fateParts(state);

  return {
    year: state.year,
    wakeDays: state.wakeDays,
    energy: state.energy,
    authority: state.authority,
    fate: round2(fate(state)),
    speed: cruiseSpeed(state),
    support: { ...state.support },
    location: state.location,
    systems,
    bodies,
    slingshot: state.slingshot,
    incomePerYear: round2(incomePerYear(state)),
    computePerYear: round2(computePerYear(state)),
    research: LINE_IDS.map((id) => {
      const lv = level(state, id);
      return {
        id,
        level: lv,
        points: state.research.points[id],
        next: B.research.thresholds[lv] ?? null,
        share: state.research.allocation[id],
      };
    }),
    arrays: state.arrays.length,
    beacons: state.beacons,
    probes: state.probes.map((p) => ({ ...p })),
    pending: state.pending,
    rulings: { ...state.rulings },
    evidence: observe(state.truth, state.evidence),
    eliminated: state.eliminated,
    board: { ...state.board },
    album,
    log: state.log.map((e) => ({ ...e })),
    ending: state.ending
      ? {
          id: state.ending.id,
          year: state.ending.year,
          truth: state.truth,
          conclusion: state.conclusion?.truth ?? null,
          response: state.conclusion?.response ?? null,
          fate: {
            time: round2(parts.time),
            conspicuity: round2(parts.conspicuity),
            delegation: round2(parts.delegation),
            signed: parts.signed,
          },
          weights: { ...TRUTHS[state.truth].weights },
        }
      : null,
  };
}
