/**
 * 模拟对局：用几种固定的打法把三种真相各打一遍，看结局、命运和权威落在哪里。
 * 用来在真人试玩之前调 src/content/balance.ts 里的数值。
 *
 *   npm run sim
 */
import { COURT } from '../src/content/court';
import { BALANCE as B } from '../src/content/balance';
import { SYSTEMS, distance } from '../src/content/systems';
import type { SystemId } from '../src/content/systems';
import { TRUTHS, TRUTH_IDS } from '../src/content/truths';
import { nextTarget } from '../src/app/guide';
import { LEADS } from '../src/content/leads';
import { can, createGame, fate, fateParts, incomePerYear, level, publicView, reduce } from '../src/core/game';
import type { Action, GameState, Mode } from '../src/core/types';
import { pad } from './text';

interface Policy {
  name: string;
  /** 勘察、采集、建阵列交给谁。 */
  chores: Mode;
  /** 调查和调谐交给谁。 */
  evidence: Mode;
  /** 弹弓是否亲手做。 */
  slingshot: boolean;
  /** 每个能建的星系建几座阵列；need 表示算着剩下的路程，能源不够才建。 */
  arrays: number | 'need';
  court: 'wise' | 'sign' | 'veto';
  probe: boolean;
  /** guided：不按固定路线，照界面上的“下一步”走。 */
  route: SystemId[] | 'guided';
  /** 亲手操作的水平，0 到 1。 */
  skill: number;
}

const FULL: SystemId[] = ['g2', 'm7', 'p12', 'r3', 'j14'];
const SHORT: SystemId[] = ['g2', 'm7', 'r3', 'j14'];

const POLICIES: Policy[] = [
  { name: '跟着下一步', chores: 'ai', evidence: 'self', slingshot: false, arrays: 1, court: 'wise', probe: true, route: 'guided', skill: 0.7 },
  { name: '下一步全交AI', chores: 'ai', evidence: 'ai', slingshot: false, arrays: 1, court: 'wise', probe: true, route: 'guided', skill: 0.7 },
  { name: '稳妥', chores: 'ai', evidence: 'self', slingshot: false, arrays: 'need', court: 'wise', probe: true, route: SHORT, skill: 0.7 },
  { name: '稳妥但踩陷阱', chores: 'ai', evidence: 'self', slingshot: false, arrays: 'need', court: 'sign', probe: true, route: SHORT, skill: 0.7 },
  { name: '亲力亲为', chores: 'self', evidence: 'self', slingshot: true, arrays: 'need', court: 'wise', probe: false, route: FULL, skill: 0.7 },
  { name: '全部放权', chores: 'ai', evidence: 'ai', slingshot: false, arrays: 'need', court: 'wise', probe: true, route: FULL, skill: 0.7 },
  { name: '大兴土木', chores: 'ai', evidence: 'self', slingshot: false, arrays: 2, court: 'wise', probe: true, route: FULL, skill: 0.7 },
  { name: '不建阵列', chores: 'self', evidence: 'self', slingshot: true, arrays: 0, court: 'veto', probe: false, route: SHORT, skill: 0.7 },
];

function attempt(state: GameState, action: Action): GameState {
  return state.ending || can(state, action) ? state : reduce(state, action);
}

/** 剩下的路程还要多少能源，大约还要飞多少年。 */
function ahead(from: SystemId, rest: SystemId[], speed: number): { energy: number; years: number } {
  let energy = 0;
  let years = 0;
  let at = from;
  for (const to of rest) {
    const d = distance(SYSTEMS[at].pos, SYSTEMS[to].pos);
    energy += Math.ceil(d * B.travel.energyPerLightYear);
    years += d / speed;
    at = to;
  }
  return { energy, years };
}

function stay(state: GameState, p: Policy, rest: SystemId[]): GameState {
  let s = state;
  const sys = SYSTEMS[s.location];

  if (s.pending) {
    const item = COURT[s.pending];
    const wise = item.trap.truth === s.truth ? 'veto' : 'sign';
    const decision = p.court === 'wise' ? wise : p.court;
    s = attempt(s, { type: 'rule', item: item.id, decision });
    if (s.pending) s = attempt(s, { type: 'rule', item: item.id, decision: 'veto' });
  }

  const build: Action = p.chores === 'self' ? { type: 'build', mode: 'self', skill: p.skill } : { type: 'build', mode: 'ai' };
  if (p.arrays === 'need') {
    // 一个会算账的玩家：照现在的收入，剩下的路程够不够？不够就再建一座。
    for (let i = 0; i < B.build.maxPerSystem && rest.length > 0; i++) {
      const need = ahead(s.location, rest, 0.15);
      const have = s.energy + incomePerYear(s) * need.years * 0.5;
      if (have >= need.energy + 40) break;
      s = attempt(s, build);
    }
  } else {
    for (let i = 0; i < p.arrays; i++) s = attempt(s, build);
  }

  // 线索指到的天体才知道有异常；没出现的线索，这一站就看不到。
  const anomalous = sys.bodies.filter((b) => b.anomaly && s.bodies[b.id]!.anomalyKnown);
  if (anomalous.length > 0) {
    for (const body of anomalous) {
      if (body.anomaly === 'signal' || body.anomaly === 'pulsar') {
        s = attempt(s, p.evidence === 'self' ? { type: 'tune', mode: 'self', body: body.id, skill: p.skill } : { type: 'tune', mode: 'ai', body: body.id });
      } else {
        s = attempt(s, { type: 'investigate', mode: p.evidence, body: body.id });
      }
    }
  }

  if (p.probe && s.location === 'r3') s = attempt(s, { type: 'probe' });
  return s;
}

function leave(state: GameState, p: Policy, to: SystemId): GameState {
  let s = state;
  let guard = 0;
  // 能源不够就采集，直到够为止。
  while (!s.ending && can(s, { type: 'depart', to }) === '能源不够。' && guard++ < 30) {
    const richest = [...SYSTEMS[s.location].bodies].sort((a, b) => b.resource / 2 ** s.bodies[b.id]!.harvested - a.resource / 2 ** s.bodies[a.id]!.harvested)[0]!;
    s = attempt(s, { type: 'harvest', mode: p.chores, body: richest.id });
  }
  if (p.slingshot) s = attempt(s, { type: 'slingshot', skill: p.skill });
  return attempt(s, { type: 'depart', to });
}

/** 照“下一步”走：每到一个能建阵列的星系建一座，线索按打法亲自做或交给 AI，能源不够就采集。 */
function runGuided(p: Policy, truth: (typeof TRUTH_IDS)[number]): GameState {
  let s = createGame(1, truth);
  const built = new Set<SystemId>();
  const build: Action = p.chores === 'self' ? { type: 'build', mode: 'self', skill: p.skill } : { type: 'build', mode: 'ai' };
  for (let i = 0; i < 300 && !s.ending; i++) {
    if (!built.has(s.location) && !s.pending) {
      built.add(s.location);
      if (SYSTEMS[s.location].arrayOutput >= 1) for (let k = 0; k < (p.arrays === 'need' ? 1 : p.arrays); k++) s = attempt(s, build);
    }
    const view = publicView(s);
    const next = nextTarget(view);
    const richest = [...view.bodies].sort((a, b) => b.resource - a.resource)[0]!;
    const harvest: Action = { type: 'harvest', mode: p.chores, body: richest.id };
    let action: Action | null = null;
    switch (next.kind) {
      case 'court': {
        const item = COURT[view.pending!];
        const wise = item.trap.truth === s.truth ? 'veto' : 'sign';
        action = { type: 'rule', item: item.id, decision: p.court === 'wise' ? wise : p.court };
        if (can(s, action)) action = { type: 'rule', item: item.id, decision: 'veto' };
        break;
      }
      case 'here': {
        const body = LEADS[next.lead].body!;
        const signal = LEADS[next.lead].evidence === 'signal' || LEADS[next.lead].evidence === 'pulsar';
        if (signal) action = p.evidence === 'self' ? { type: 'tune', mode: 'self', body, skill: p.skill } : { type: 'tune', mode: 'ai', body };
        else action = { type: 'investigate', mode: p.evidence, body };
        break;
      }
      case 'probe':
        action = next.short > 0 ? harvest : p.probe ? { type: 'probe' } : null;
        break;
      case 'travel':
        if (next.short > 0) action = harvest;
        else {
          if (p.slingshot) s = attempt(s, { type: 'slingshot', skill: p.skill });
          action = { type: 'depart', to: next.to };
        }
        break;
      case 'wait':
        action = { type: 'wait', years: 50 };
        break;
      default:
        action = null;
    }
    if (!action) break;
    const after = attempt(s, action);
    if (after === s) break;
    s = after;
  }
  return attempt(s, { type: 'conclude', conclusion: truth, response: TRUTHS[truth].response });
}

function run(p: Policy, truth: (typeof TRUTH_IDS)[number]): GameState {
  if (p.route === 'guided') return runGuided(p, truth);
  const route = p.route;
  let s = createGame(1, truth);
  s = stay(s, p, route);
  route.forEach((to, i) => {
    s = leave(s, p, to);
    s = stay(s, p, route.slice(i + 1));
  });
  // 假定这位玩家读对了证据。
  return attempt(s, { type: 'conclude', conclusion: truth, response: TRUTHS[truth].response });
}

const ENDING_NAMES: Record<string, string> = {
  clear: '明断',
  powerless: '知而不能行',
  lucky: '侥幸',
  failed: '失察',
  undecided: '未决',
  sleep: '长眠',
};

console.log(
  [pad('打法', 14), pad('真相', 6), pad('结局', 12), pad('纪年', 6), pad('命运', 6), pad('时间/显眼/放权/签字', 22), pad('权威', 6), pad('清醒日', 7), pad('能源', 6), pad('阵列', 5), pad('采集', 5), pad('科研', 9), '证据'].join(''),
);
for (const p of POLICIES) {
  for (const truth of TRUTH_IDS) {
    const s = run(p, truth);
    const parts = fateParts(s);
    const split = [parts.time, parts.conspicuity, parts.delegation, parts.signed].map((x) => x.toFixed(0)).join('/');
    const harvests = s.log.filter((e) => e.t === 'harvest').length;
    const research = (['propulsion', 'longevity', 'harvest', 'cosmology'] as const).map((l) => level(s, l)).join('/');
    console.log(
      [
        pad(p.name, 14),
        pad(TRUTHS[truth].name, 6),
        pad(ENDING_NAMES[s.ending?.id ?? ''] ?? '没打完', 12),
        pad(String(s.year), 6),
        pad(fate(s).toFixed(0), 6),
        pad(split, 22),
        pad(s.authority.toFixed(0), 6),
        pad(String(s.wakeDays), 7),
        pad(s.energy.toFixed(0), 6),
        pad(String(s.arrays.length), 5),
        pad(String(harvests), 5),
        pad(research, 9),
        Object.keys(s.evidence).length,
      ].join(''),
    );
  }
  console.log('');
}
