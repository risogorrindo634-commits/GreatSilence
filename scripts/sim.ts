/**
 * 模拟对局：用几种固定的打法把三种真相各打一遍，看结局、命运和权威落在哪里。
 * 用来在真人试玩之前调 src/content/balance.ts 里的数值。
 *
 *   npm run sim
 */
import { COURT } from '../src/content/court';
import { SYSTEMS } from '../src/content/systems';
import type { SystemId } from '../src/content/systems';
import { TRUTHS, TRUTH_IDS } from '../src/content/truths';
import { can, createGame, fate, fateParts, reduce } from '../src/core/game';
import type { Action, GameState, Mode } from '../src/core/types';

interface Policy {
  name: string;
  /** 勘察、采集、建阵列交给谁。 */
  chores: Mode;
  /** 调查和调谐交给谁。 */
  evidence: Mode;
  /** 弹弓是否亲手做。 */
  slingshot: boolean;
  /** 每个能建的星系建几座阵列。 */
  arrays: number;
  court: 'wise' | 'sign' | 'veto';
  probe: boolean;
  route: SystemId[];
  /** 亲手操作的水平，0 到 1。 */
  skill: number;
}

const FULL: SystemId[] = ['g2', 'm7', 'p12', 'r3', 'j14'];
const SHORT: SystemId[] = ['g2', 'm7', 'r3', 'j14'];

const POLICIES: Policy[] = [
  { name: '亲力亲为', chores: 'self', evidence: 'self', slingshot: true, arrays: 1, court: 'wise', probe: false, route: FULL, skill: 0.7 },
  { name: '均衡', chores: 'ai', evidence: 'self', slingshot: false, arrays: 1, court: 'wise', probe: true, route: SHORT, skill: 0.7 },
  { name: '全部放权', chores: 'ai', evidence: 'ai', slingshot: false, arrays: 1, court: 'wise', probe: true, route: FULL, skill: 0.7 },
  { name: '大兴土木', chores: 'ai', evidence: 'self', slingshot: false, arrays: 2, court: 'wise', probe: true, route: FULL, skill: 0.7 },
  { name: '来者不拒', chores: 'ai', evidence: 'self', slingshot: false, arrays: 1, court: 'sign', probe: true, route: SHORT, skill: 0.7 },
  { name: '一概否决', chores: 'self', evidence: 'self', slingshot: true, arrays: 1, court: 'veto', probe: false, route: SHORT, skill: 0.7 },
];

function attempt(state: GameState, action: Action): GameState {
  return state.ending || can(state, action) ? state : reduce(state, action);
}

function stay(state: GameState, p: Policy): GameState {
  let s = state;
  const sys = SYSTEMS[s.location];

  if (s.pending) {
    const item = COURT[s.pending];
    const wise = item.trap.truth === s.truth ? 'veto' : 'sign';
    const decision = p.court === 'wise' ? wise : p.court;
    s = attempt(s, { type: 'rule', item: item.id, decision });
    if (s.pending) s = attempt(s, { type: 'rule', item: item.id, decision: 'veto' });
  }

  for (let i = 0; i < p.arrays; i++) {
    s = attempt(s, p.chores === 'self' ? { type: 'build', mode: 'self', skill: p.skill } : { type: 'build', mode: 'ai' });
  }

  const anomalous = sys.bodies.filter((b) => b.anomaly);
  if (anomalous.length > 0) {
    if (p.chores === 'ai') s = attempt(s, { type: 'survey', mode: 'ai' });
    for (const body of anomalous) {
      if (p.chores === 'self') s = attempt(s, { type: 'survey', mode: 'self', body: body.id });
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

function run(p: Policy, truth: (typeof TRUTH_IDS)[number]): GameState {
  let s = createGame(1, truth);
  s = stay(s, p);
  for (const to of p.route) {
    s = leave(s, p, to);
    s = stay(s, p);
  }
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

const pad = (text: string, width: number): string => {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return text + ' '.repeat(Math.max(0, width - w));
};

console.log(
  [pad('打法', 10), pad('真相', 6), pad('结局', 12), pad('纪年', 6), pad('命运', 6), pad('时间/显眼/放权/签字', 24), pad('权威', 6), pad('清醒日', 7), pad('能源', 6), '证据'].join(''),
);
for (const p of POLICIES) {
  for (const truth of TRUTH_IDS) {
    const s = run(p, truth);
    const parts = fateParts(s);
    const split = [parts.time, parts.conspicuity, parts.delegation, parts.signed].map((x) => x.toFixed(0)).join('/');
    console.log(
      [
        pad(p.name, 10),
        pad(TRUTHS[truth].name, 6),
        pad(ENDING_NAMES[s.ending?.id ?? ''] ?? '没打完', 12),
        pad(String(s.year), 6),
        pad(fate(s).toFixed(0), 6),
        pad(split, 24),
        pad(s.authority.toFixed(0), 6),
        pad(String(s.wakeDays), 7),
        pad(s.energy.toFixed(0), 6),
        Object.keys(s.evidence).length,
      ].join(''),
    );
  }
  console.log('');
}
