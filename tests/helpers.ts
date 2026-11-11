import { BALANCE as B } from '../src/content/balance';
import { COURT } from '../src/content/court';
import { SYSTEMS, SYSTEM_IDS } from '../src/content/systems';
import type { SystemId } from '../src/content/systems';
import { RESPONSE_IDS, TRUTHS, TRUTH_IDS } from '../src/content/truths';
import type { TruthId } from '../src/content/truths';
import { can, createGame, reduce } from '../src/core/game';
import { nextRandom, seedState } from '../src/core/rng';
import type { Action, GameState } from '../src/core/types';

/** 给足能源，用在与能源无关的测试里，免得被跃迁的花费挡住。 */
export function rich(state: GameState): GameState {
  return { ...state, energy: 1000 };
}

/** 六个结局各造一个出来。 */
export function everyEnding(seed: number): GameState[] {
  const conclude = (s: GameState, conclusion: TruthId, response: (typeof RESPONSE_IDS)[number]): GameState =>
    reduce(s, { type: 'conclude', conclusion, response });
  const delegate: Action = { type: 'harvest', mode: 'ai', body: 'home-3' };

  let powerless = createGame(seed, 'hunter');
  while (powerless.authority >= B.authority.threshold) powerless = reduce(powerless, delegate);

  let undecided = createGame(seed, 'dream');
  while (!undecided.ending) undecided = reduce(undecided, delegate);

  let sleep = createGame(seed, 'dream');
  while (!sleep.ending) {
    const body = SYSTEMS.home.bodies.find((b) => can(sleep, { type: 'harvest', mode: 'self', body: b.id }) === null);
    sleep = body ? reduce(sleep, { type: 'harvest', mode: 'self', body: body.id }) : reduce({ ...sleep, wakeDays: 2 }, { type: 'view', body: 'home-1' });
  }

  return [
    conclude(createGame(seed, 'hunter'), 'hunter', 'silence'),
    conclude(powerless, 'hunter', 'silence'),
    conclude(createGame(seed, 'hunter'), 'blackball', 'ban'),
    conclude(createGame(seed, 'hunter'), 'dream', 'covenant'),
    undecided,
    sleep,
  ];
}

/** 依次执行一串操作。 */
export function play(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => reduce(s, a), state);
}

/** 递归冻结，用来确认 reduce 不修改传入的状态。 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** 对象里出现过的所有键名。 */
export function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) allKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/** 处理掉待决事项：是陷阱就否决；不是陷阱而且签得起，就签。 */
export function ruleWisely(state: GameState): GameState {
  if (!state.pending) return state;
  const item = COURT[state.pending];
  const sign: Action = { type: 'rule', item: item.id, decision: 'sign' };
  const affordable = can(state, sign) === null && state.energy + (item.sign.energy ?? 0) >= 40;
  if (item.trap.truth !== state.truth && affordable) return reduce(state, sign);
  return reduce(state, { type: 'rule', item: item.id, decision: 'veto' });
}

/** 启航去下一站，并处理那里的待决事项。能源不够就先亲手采集。 */
export function goTo(state: GameState, to: SystemId): GameState {
  let s = state;
  for (let i = 0; i < 20 && can(s, { type: 'depart', to }) === '能源不够。'; i++) {
    const richest = [...SYSTEMS[s.location].bodies].sort((a, b) => s.bodies[a.id]!.harvested - s.bodies[b.id]!.harvested || b.resource - a.resource)[0]!;
    s = reduce(s, { type: 'harvest', mode: 'self', body: richest.id });
  }
  return ruleWisely(reduce(s, { type: 'depart', to }));
}

/**
 * 一条稳妥的路线：在故乡亲手建一座阵列，亲自取得遗迹、旧信号和红外三类证据，然后下对的结论。
 * 用来证明每种真相都走得到“明断”。
 */
export function carefulRoute(state: GameState): GameState {
  let s = state;
  s = play(s, { type: 'build', mode: 'self', skill: 0.8 });
  s = goTo(s, 'g2');
  s = goTo(s, 'm7');
  s = play(s, { type: 'survey', mode: 'self', body: 'm7-1' }, { type: 'investigate', mode: 'self', body: 'm7-1' });
  s = goTo(s, 'r3');
  s = play(s, { type: 'survey', mode: 'self', body: 'r3-1' }, { type: 'tune', mode: 'self', body: 'r3-1', skill: 0.9 });
  s = goTo(s, 'j14');
  s = play(s, { type: 'survey', mode: 'self', body: 'j14-2' }, { type: 'investigate', mode: 'self', body: 'j14-2' });
  return play(s, { type: 'conclude', conclusion: s.truth, response: TRUTHS[s.truth].response });
}

/** 当前状态下值得一试的全部操作，供随机游走用。 */
export function candidates(state: GameState): Action[] {
  const out: Action[] = [];
  for (const body of SYSTEMS[state.location].bodies) {
    out.push({ type: 'view', body: body.id });
    out.push({ type: 'name', body: body.id, name: '某处' });
    out.push({ type: 'survey', mode: 'self', body: body.id });
    out.push({ type: 'investigate', mode: 'self', body: body.id });
    out.push({ type: 'investigate', mode: 'ai', body: body.id });
    out.push({ type: 'tune', mode: 'self', body: body.id, skill: 0.6 });
    out.push({ type: 'tune', mode: 'ai', body: body.id });
    out.push({ type: 'harvest', mode: 'self', body: body.id });
    out.push({ type: 'harvest', mode: 'ai', body: body.id });
  }
  out.push({ type: 'survey', mode: 'ai' });
  out.push({ type: 'build', mode: 'self', skill: 0.5 });
  out.push({ type: 'build', mode: 'ai' });
  out.push({ type: 'slingshot', skill: 0.5 });
  out.push({ type: 'probe' });
  out.push({ type: 'augment' });
  out.push({ type: 'wait', years: 25 });
  out.push({ type: 'research', allocation: { propulsion: 2, longevity: 1, harvest: 1, cosmology: 3 } });
  for (const to of SYSTEM_IDS) out.push({ type: 'depart', to });
  if (state.pending) {
    out.push({ type: 'rule', item: state.pending, decision: 'sign' });
    out.push({ type: 'rule', item: state.pending, decision: 'veto' });
  }
  for (const truth of TRUTH_IDS) out.push({ type: 'mark', evidence: 'signal', truth, mark: 'support' });
  return out;
}

/** 自带状态的随机源，供测试和模拟对局用。 */
export function randomSource(seed: number): () => number {
  let state = seedState(seed);
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

/** 随机走到结局或走满步数。每一步都从合法的操作里随机选一个。 */
export function randomWalk(
  state: GameState,
  seed: number,
  steps: number,
  onStep?: (before: GameState, action: Action, after: GameState) => void,
): GameState {
  const random = randomSource(seed);
  let s = state;
  for (let i = 0; i < steps && !s.ending; i++) {
    const legal = candidates(s).filter((a) => can(s, a) === null);
    // 偶尔直接下结论，让各种结局都出现。
    if (random() < 0.01) {
      const conclusion = TRUTH_IDS[Math.floor(random() * TRUTH_IDS.length)]!;
      const response = RESPONSE_IDS[Math.floor(random() * RESPONSE_IDS.length)]!;
      legal.push({ type: 'conclude', conclusion, response });
    }
    const action = legal[Math.floor(random() * legal.length)];
    if (!action) break;
    const next = reduce(s, action);
    onStep?.(s, action, next);
    s = next;
  }
  return s;
}

export const ALL_TRUTHS: readonly TruthId[] = TRUTH_IDS;
export { B };
