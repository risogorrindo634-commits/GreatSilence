import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COURT, COURT_IDS } from '../src/content/court';
import { SYSTEMS } from '../src/content/systems';
import { RESPONSE_IDS, TRUTHS } from '../src/content/truths';
import type { TruthId } from '../src/content/truths';
import { observe } from '../src/core/evidence';
import { augmentsAvailable, can, computePerYear, createGame, fate, judge, publicView, reduce, replay } from '../src/core/game';
import type { Action, EndingId, EvidenceState, GameState, ProbeState } from '../src/core/types';
import { ALL_TRUTHS, B, allKeys, carefulRoute, deepFreeze, everyEnding, goTo, play, randomWalk, rich } from './helpers';

const SEED = 20261111;

/** 一段与真相无关的开局：建阵列，看风景，飞到双日。 */
const OPENING: Action[] = [
  { type: 'view', body: 'home-2' },
  { type: 'build', mode: 'self', skill: 0.5 },
  { type: 'research', allocation: { propulsion: 3, longevity: 1, harvest: 1, cosmology: 1 } },
  { type: 'slingshot', skill: 0.7 },
  { type: 'depart', to: 'g2' },
];

describe('确定性', () => {
  it('同一个种子和操作序列得到完全相同的状态', () => {
    for (const truth of ALL_TRUTHS) {
      const a = carefulRoute(createGame(SEED, truth));
      const b = carefulRoute(createGame(SEED, truth));
      expect(a).toEqual(b);
    }
  });

  it('重放操作序列得到同一个状态', () => {
    const actions: Action[] = [];
    const walked = randomWalk(createGame(7), 99, 200, (_before, action) => actions.push(action));
    expect(replay(7, undefined, actions)).toEqual(walked);
  });

  it('真相由种子决定，三种都会出现', () => {
    const seen = new Set<TruthId>();
    for (let seed = 1; seed <= 60; seed++) {
      seen.add(createGame(seed).truth);
      expect(createGame(seed).truth).toBe(createGame(seed).truth);
    }
    expect(seen.size).toBe(3);
  });

  it('状态可以存成 JSON 再读回来，之后的结果不变', () => {
    const mid = play(createGame(SEED, 'hunter'), ...OPENING);
    const loaded = JSON.parse(JSON.stringify(mid)) as GameState;
    expect(loaded).toEqual(mid);
    const next: Action = { type: 'rule', item: 'beacon', decision: 'veto' };
    expect(reduce(loaded, next)).toEqual(reduce(mid, next));
  });

  it('reduce 不修改传入的状态', () => {
    const start = deepFreeze(createGame(SEED, 'dream'));
    const snapshot = JSON.stringify(start);
    const end = randomWalk(start, 5, 120, (before) => deepFreeze(before));
    expect(JSON.stringify(start)).toBe(snapshot);
    expect(end).not.toBe(start);
  });

  it('日志按年份排列', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const years = randomWalk(createGame(seed), seed * 17, 300).log.map((e) => e.year);
      expect(years).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it('不合法的操作被拒绝，原因与 can 一致', () => {
    const s = createGame(SEED);
    const bad: Action = { type: 'depart', to: 'home' };
    expect(can(s, bad)).toBe('舰队已经在这里。');
    expect(() => reduce(s, bad)).toThrow('舰队已经在这里。');
  });
});

describe('视图不泄密', () => {
  it('开局时三种真相的视图完全相同', () => {
    const views = ALL_TRUTHS.map((t) => publicView(createGame(SEED, t)));
    expect(views[1]).toEqual(views[0]);
    expect(views[2]).toEqual(views[0]);
  });

  it('做完与真相无关的操作后，视图只在命运的格数上不同', () => {
    const states = ALL_TRUTHS.map((t) => play(createGame(SEED, t), ...OPENING));
    expect(new Set(states.map((s) => fate(s))).size).toBe(3);
    const rest = states.map((s) => ({ ...publicView(s), fateLevel: 0 }));
    expect(rest[1]).toEqual(rest[0]);
    expect(rest[2]).toEqual(rest[0]);
  });

  it('命运在视图里只有格数：建一座阵列、发一艘探测器的当下，三种真相的视图完全相同', () => {
    const views = ALL_TRUTHS.map((t) => publicView(play(createGame(SEED, t), { type: 'build', mode: 'self', skill: 0.5 }, { type: 'probe' })));
    expect(views[0]!.fateLevel).toBe(0);
    expect(views[1]).toEqual(views[0]);
    expect(views[2]).toEqual(views[0]);
  });

  it('在途的探测器：视图里只有预计的年份，看不出它会不会失联', () => {
    for (const truth of ALL_TRUTHS) {
      const s = play(createGame(SEED, truth), { type: 'probe' });
      const seen = publicView(s).probes[0]!;
      expect(Object.keys(seen).sort()).toEqual(['etaYear', 'from', 'launchedYear', 'reported']);
      expect(seen.etaYear).toBe(play(createGame(SEED, 'dream'), { type: 'probe' }).probes[0]!.etaYear);
    }
  });

  it('结局之前的视图里没有真相、种子和随机数状态', () => {
    for (const truth of ALL_TRUTHS) {
      let s = createGame(SEED, truth);
      s = randomWalk(s, 11, 60, (_b, _a, after) => {
        if (after.ending) return;
        const view = publicView(after);
        const keys = allKeys(view);
        expect(view.ending).toBeNull();
        for (const forbidden of ['truth', 'seed', 'rng', 'weights', 'trap', 'fate', 'silenceRadius']) expect(keys.has(forbidden)).toBe(false);
      });
    }
  });

  it('干扰项在视图里和真正的信号用同一个标记', () => {
    let s = play(rich(createGame(SEED)), { type: 'depart', to: 'p12' }, { type: 'survey', mode: 'ai' });
    const anomalies = publicView(s).bodies.map((b) => b.anomaly);
    expect(anomalies).toContain('signal');
    expect(JSON.stringify(publicView(s).bodies)).not.toContain('pulsar');
    s = play(s, { type: 'tune', mode: 'ai', body: 'p12-1' });
    const seen = publicView(s).evidence[0]!;
    expect(seen.kind === 'signal' && seen.natural).toBeNull();
  });

  it('结局时揭开真相', () => {
    for (const truth of ALL_TRUTHS) {
      const end = play(createGame(SEED, truth), { type: 'conclude', conclusion: 'dream', response: 'ban' });
      expect(publicView(end).ending?.truth).toBe(truth);
    }
  });
});

describe('证据可区分', () => {
  const full: EvidenceState = {
    signal: { clarity: 1, seed: 1, year: 0 },
    infrared: { fine: true, seed: 2, year: 0 },
    ruins: { fine: true, seed: 3, year: 0 },
  };
  /** 去掉年份，只留下玩家读到的内容。 */
  const content = (truth: TruthId, evidence: EvidenceState): Record<string, string> =>
    Object.fromEntries(observe(truth, evidence).map((o) => [o.id, JSON.stringify(o)]));

  it('任意两种真相之间，旧信号、红外、遗迹三类细的证据全部不同', () => {
    for (const a of ALL_TRUTHS) {
      for (const b of ALL_TRUTHS) {
        if (a >= b) continue;
        const ca = content(a, full);
        const cb = content(b, full);
        const differing = Object.keys(ca).filter((k) => ca[k] !== cb[k]);
        expect(differing.sort()).toEqual(['infrared', 'ruins', 'signal']);
      }
    }
  });

  it('同一种真相下证据前后一致：换一个噪声种子，事实不变', () => {
    for (const truth of ALL_TRUTHS) {
      const again: EvidenceState = { ...full, signal: { clarity: 1, seed: 77, year: 0 }, ruins: { fine: true, seed: 78, year: 0 } };
      const facts = (e: EvidenceState): string[][] => observe(truth, e).map((o) => o.facts);
      expect(facts(again)).toEqual(facts(full));
    }
  });

  it('交给 AI 的粗略结果只能把入梦和另外两种分开', () => {
    const coarse: EvidenceState = { infrared: { fine: false, seed: 2, year: 0 }, ruins: { fine: false, seed: 3, year: 0 } };
    expect(content('hunter', coarse)).toEqual(content('blackball', coarse));
    expect(content('dream', coarse).infrared).not.toBe(content('hunter', coarse).infrared);
    expect(content('dream', coarse).ruins).not.toBe(content('hunter', coarse).ruins);
    for (const o of observe('hunter', coarse)) {
      if (o.kind === 'infrared') expect(o.grid).toBeNull();
      if (o.kind === 'ruins') expect(o.cells).toBeNull();
    }
  });

  it('旧信号的关键细节要清晰度够高才读得出', () => {
    const at = (clarity: number): string[] => observe('blackball', { signal: { clarity, seed: 1, year: 0 } })[0]!.facts;
    expect(at(B.tune.detailAt - 0.01)).not.toContain(TRUTHS.blackball.evidence.signal.detail);
    expect(at(B.tune.detailAt)).toContain(TRUTHS.blackball.evidence.signal.detail);
  });

  it('干扰项要清晰度 0.5 以上才认得出是自然现象，而且与真相无关', () => {
    const at = (truth: TruthId, clarity: number) => observe(truth, { pulsar: { clarity, seed: 9, year: 0 } })[0]!;
    const natural = (clarity: number): boolean | null => {
      const o = at('dream', clarity);
      return o.kind === 'signal' ? o.natural : null;
    };
    expect(natural(B.tune.ai)).toBeNull();
    expect(natural(0.5)).toBe(true);
    expect(at('hunter', 0.8)).toEqual(at('blackball', 0.8));
  });
});

describe('两种时间', () => {
  /** 到晨昏，让 AI 勘察过，手里有足够的能源。 */
  const base = (): GameState => {
    const s = goTo(goTo(play(createGame(SEED, 'hunter'), { type: 'build', mode: 'self', skill: 0.5 }), 'g2'), 'm7');
    return play(s, { type: 'survey', mode: 'ai' });
  };

  const pairs: [string, Action, Action][] = [
    ['调查', { type: 'investigate', mode: 'self', body: 'm7-1' }, { type: 'investigate', mode: 'ai', body: 'm7-1' }],
    ['采集', { type: 'harvest', mode: 'self', body: 'm7-2' }, { type: 'harvest', mode: 'ai', body: 'm7-2' }],
    ['建阵列', { type: 'build', mode: 'self', skill: 0.5 }, { type: 'build', mode: 'ai' }],
  ];

  for (const [name, self, ai] of pairs) {
    it(`${name}：亲自做只花清醒日，交给 AI 只花世界年`, () => {
      const s = base();
      const a = reduce(s, self);
      expect(a.year).toBe(s.year);
      expect(a.wakeDays).toBeLessThan(s.wakeDays);
      expect(a.delegatedYears).toBe(s.delegatedYears);

      const b = reduce(s, ai);
      expect(b.wakeDays).toBe(s.wakeDays);
      expect(b.year).toBeGreaterThan(s.year);
      expect(b.delegatedYears - s.delegatedYears).toBe(b.year - s.year);
    });
  }

  it('勘察：亲自勘察一个天体，AI 勘察整个星系', () => {
    const s = goTo(createGame(SEED, 'hunter'), 'm7');
    const a = reduce(s, { type: 'survey', mode: 'self', body: 'm7-1' });
    expect([a.year - s.year, s.wakeDays - a.wakeDays]).toEqual([0, B.survey.days]);
    expect(SYSTEMS.m7.bodies.map((b) => a.bodies[b.id]!.surveyed)).toEqual([true, false, false]);

    const b = reduce(s, { type: 'survey', mode: 'ai' });
    expect([b.year - s.year, s.wakeDays - b.wakeDays]).toEqual([B.survey.years, 0]);
    expect(SYSTEMS.m7.bodies.every((body) => b.bodies[body.id]!.surveyed)).toBe(true);
  });

  it('观景只能亲自去', () => {
    const s = createGame(SEED);
    const a = reduce(s, { type: 'view', body: 'home-3' });
    expect([a.year, s.wakeDays - a.wakeDays]).toEqual([0, B.view.days]);
  });

  it('巡航和等待花世界年，但不算放权', () => {
    const s = createGame(SEED);
    const a = play(s, { type: 'wait', years: 40 }, { type: 'depart', to: 'g2' });
    expect(a.year).toBeGreaterThan(40);
    expect(a.wakeDays).toBe(s.wakeDays);
    expect(a.delegatedYears).toBe(0);
    expect(a.sleptYears).toBe(a.year);
  });
});

describe('命运的驱动', () => {
  const pct = (value: number, full: number): number => (100 * value) / full;

  it('时间：只让世界过去若干年，命运按时间权重上涨', () => {
    for (const truth of ALL_TRUTHS) {
      const s = play(createGame(SEED, truth), { type: 'wait', years: 160 });
      expect(fate(s)).toBeCloseTo(TRUTHS[truth].weights.time * pct(160, B.fate.timeFullYears), 6);
    }
  });

  it('显眼度延迟显现：建成的当下命运不变，过了暴露期才按权重算满', () => {
    const E = B.fate.exposureYears;
    for (const truth of ALL_TRUTHS) {
      const w = TRUTHS[truth].weights;
      const built = play(createGame(SEED, truth), { type: 'build', mode: 'self', skill: 0.5 });
      expect(fate(built)).toBe(0);
      const half = play(built, { type: 'wait', years: E / 2 });
      expect(fate(half)).toBeCloseTo(w.time * pct(E / 2, B.fate.timeFullYears) + (w.conspicuity * B.fate.conspicuityPerArray) / 2, 6);
      const full = play(half, { type: 'wait', years: E / 2 }, { type: 'wait', years: 40 });
      expect(fate(full)).toBeCloseTo(w.time * pct(E + 40, B.fate.timeFullYears) + w.conspicuity * B.fate.conspicuityPerArray, 6);
    }
  });

  it('放权度：交给 AI 做事，命运按时间和放权度两个权重上涨', () => {
    for (const truth of ALL_TRUTHS) {
      const w = TRUTHS[truth].weights;
      const s = play(createGame(SEED, truth), { type: 'harvest', mode: 'ai', body: 'home-1' });
      const expected = w.time * pct(B.harvest.years, B.fate.timeFullYears) + w.delegation * pct(B.harvest.years, B.fate.delegationFullYears);
      expect(fate(s)).toBeCloseTo(expected, 6);
    }
  });

  it('每个驱动各有一种真相最怕它', () => {
    const after = (truth: TruthId, ...actions: Action[]): number => fate(play(createGame(SEED, truth), ...actions));
    const most = (...actions: Action[]): TruthId => [...ALL_TRUTHS].sort((a, b) => after(b, ...actions) - after(a, ...actions))[0]!;
    expect(most({ type: 'wait', years: 100 })).toBe('blackball');
    expect(most({ type: 'build', mode: 'self', skill: 0.5 }, { type: 'probe' }, { type: 'wait', years: 100 })).toBe('hunter');
    // 同样是过去 60 年：交给 AI 做事和冷眠等待，差别只在放权度。
    const delegated = (t: TruthId): number =>
      after(t, { type: 'harvest', mode: 'ai', body: 'home-1' }, { type: 'harvest', mode: 'ai', body: 'home-1' }, { type: 'harvest', mode: 'ai', body: 'home-1' }) -
      after(t, { type: 'wait', years: 60 });
    expect(delegated('dream')).toBeGreaterThan(0);
    expect(delegated('hunter')).toBeCloseTo(0, 6);
    expect(delegated('blackball')).toBeCloseTo(0, 6);
  });

  it('命运只增不减，并且封顶在 100', () => {
    for (const truth of ALL_TRUTHS) {
      randomWalk(createGame(3, truth), 21, 300, (before, _action, after) => {
        expect(fate(after)).toBeGreaterThanOrEqual(fate(before) - 1e-9);
        expect(fate(after)).toBeLessThanOrEqual(100);
      });
    }
  });
});

describe('朝堂', () => {
  /** 带着足够的能源第一次抵达某个星系，停在待决事项前。 */
  const arriveAt = (truth: TruthId, item: (typeof COURT_IDS)[number]): GameState => {
    const s = reduce(rich(createGame(SEED, truth)), { type: 'depart', to: COURT[item].system });
    expect(s.pending).toBe(item);
    return s;
  };

  it('第一次抵达时提出事项；有待决事项时不能启航', () => {
    const s = arriveAt('dream', 'beacon');
    expect(can(s, { type: 'depart', to: 'home' })).toBe('有待决事项时不能启航。');
    const ruled = reduce(s, { type: 'rule', item: 'beacon', decision: 'veto' });
    expect(ruled.pending).toBeNull();
    expect(can(ruled, { type: 'depart', to: 'home' })).toBeNull();
    // 回来时不会再提一次。
    const back = play(ruled, { type: 'depart', to: 'home' }, { type: 'depart', to: 'g2' });
    expect(back.pending).toBeNull();
  });

  it('信标：签字和否决的效果与规格一致', () => {
    const s = arriveAt('dream', 'beacon');
    const signed = reduce(s, { type: 'rule', item: 'beacon', decision: 'sign' });
    expect(signed.beaconYears).toEqual([signed.year]);
    expect(publicView(signed).beacons).toBe(1);
    expect(signed.energy).toBeCloseTo(s.energy - 60, 6);
    expect(signed.support.outward).toBe(s.support.outward + 15);
    expect(signed.authority).toBe(s.authority);

    const vetoed = reduce(s, { type: 'rule', item: 'beacon', decision: 'veto' });
    expect(vetoed.beaconYears).toEqual([]);
    expect(vetoed.support.outward).toBe(s.support.outward - 15);
    expect(vetoed.authority).toBeCloseTo(s.authority + 3, 6);
  });

  it('万象：签字后科研速度降为七成', () => {
    const s = arriveAt('hunter', 'wanxiang');
    const signed = reduce(s, { type: 'rule', item: 'wanxiang', decision: 'sign' });
    expect(computePerYear(signed)).toBeCloseTo(computePerYear(s) * 0.7, 6);
    expect(signed.support.inward).toBe(s.support.inward + 15);
  });

  it('日冕：签字后四条科研线各加 80 点', () => {
    const s = arriveAt('dream', 'corona');
    const signed = reduce(s, { type: 'rule', item: 'corona', decision: 'sign' });
    for (const line of ['propulsion', 'longevity', 'harvest', 'cosmology'] as const) {
      expect(signed.research.points[line]).toBeCloseTo(s.research.points[line] + 80, 6);
    }
    expect(signed.support.outward).toBe(s.support.outward + 10);
  });

  it('每一件事在恰好一种真相下是陷阱', () => {
    for (const item of COURT_IDS) {
      // 信标的害处要过了暴露期才显现，所以裁决之后再等一百年来比。
      const harm = (truth: TruthId): number => {
        const s = arriveAt(truth, item);
        const later = (decision: 'sign' | 'veto'): number => {
          const ruled = reduce(s, { type: 'rule', item, decision });
          // 签下陷阱可能当场就让命运降临，那就不用再等了。
          return fate(ruled.ending ? ruled : reduce(ruled, { type: 'wait', years: 100 }));
        };
        return later('sign') - later('veto');
      };
      const trapped = ALL_TRUTHS.filter((t) => harm(t) >= 20);
      expect(trapped).toEqual([COURT[item].trap.truth]);
    }
  });

  it('支持度过低的一派各行其是：每次启航扣权威', () => {
    let s = arriveAt('dream', 'beacon');
    s = reduce(s, { type: 'rule', item: 'beacon', decision: 'veto' });
    s = play(s, { type: 'wait', years: 150 });
    s = reduce(s, { type: 'depart', to: 'j14' });
    s = reduce(s, { type: 'rule', item: 'corona', decision: 'veto' });
    expect(s.support.outward).toBeLessThan(B.authority.lowSupport);
    const calm = { ...s, support: { ...s.support, outward: 50 } };
    const diff = reduce(calm, { type: 'depart', to: 'r3' }).authority - reduce(s, { type: 'depart', to: 'r3' }).authority;
    expect(diff).toBeCloseTo(B.authority.lowSupportPenalty, 6);
  });
});

describe('科研与航行', () => {
  it('算力按份额分给四条线，升级后生效', () => {
    let s = play(createGame(SEED), { type: 'research', allocation: { propulsion: 1, longevity: 0, harvest: 0, cosmology: 0 } });
    const slow = publicView(s).systems.find((x) => x.id === 'g2')!.travel!.years;
    s = play(s, { type: 'wait', years: 200 });
    const view = publicView(s);
    expect(view.research.find((l) => l.id === 'propulsion')!.level).toBeGreaterThan(0);
    expect(view.research.find((l) => l.id === 'longevity')!.points).toBe(0);
    expect(view.systems.find((x) => x.id === 'g2')!.travel!.years).toBeLessThan(slow);
  });

  it('延寿每升一级增加清醒日', () => {
    const s = play(
      createGame(SEED),
      { type: 'research', allocation: { propulsion: 0, longevity: 1, harvest: 0, cosmology: 0 } },
      { type: 'wait', years: 200 },
    );
    expect(publicView(s).research.find((l) => l.id === 'longevity')!.level).toBe(1);
    expect(s.wakeDays).toBe(B.start.wakeDays + B.research.longevityDays);
  });

  it('宇宙规律：一级标出本星系的异常，五级排除一种错误的解释', () => {
    const all: Action = { type: 'research', allocation: { propulsion: 0, longevity: 0, harvest: 0, cosmology: 1 } };
    let s = play(rich(createGame(SEED, 'hunter')), all, { type: 'wait', years: 200 }, { type: 'depart', to: 'm7' });
    expect(publicView(s).bodies.find((b) => b.id === 'm7-1')!.anomaly).toBe('ruins');
    while (!s.eliminated && !s.ending) s = play(s, { type: 'wait', years: 100 });
    expect(s.eliminated).not.toBeNull();
    expect(s.eliminated).not.toBe('hunter');
  });

  it('弹弓：亲手做得好比 AI 快，在脉冲星旁效果乘 1.5', () => {
    const s = createGame(SEED);
    const years = (x: GameState): number => publicView(x).systems.find((v) => v.id === 'g2')!.travel!.years;
    const good = reduce(s, { type: 'slingshot', skill: 1 });
    const poor = reduce(s, { type: 'slingshot', skill: 0 });
    expect(good.slingshot).toBeCloseTo(B.slingshot.max, 6);
    expect(poor.slingshot).toBeCloseTo(B.slingshot.min, 6);
    expect(years(good)).toBeLessThan(years(s));
    expect(years(poor)).toBeGreaterThan(years(s));

    const atPulsar = reduce(reduce(rich(s), { type: 'depart', to: 'p12' }), { type: 'slingshot', skill: 1 });
    expect(atPulsar.slingshot).toBeCloseTo(B.slingshot.max * 1.5, 6);
  });

  it('抵达脉冲星扣 3 个清醒日；无光没有恒星，不能建阵列', () => {
    // 路上不研究延寿，清醒日的变化就只来自辐射。
    const s = play(rich(createGame(SEED)), { type: 'research', allocation: { propulsion: 1, longevity: 0, harvest: 0, cosmology: 0 } });
    expect(s.wakeDays - reduce(s, { type: 'depart', to: 'p12' }).wakeDays).toBe(3);
    const dark = reduce({ ...s, energy: 500 }, { type: 'depart', to: 'r3' });
    expect(can(dark, { type: 'build', mode: 'ai' })).toBe('这里没有恒星，不能建阵列。');
  });

  it('双日的阵列产出翻倍；点火的技巧决定产出', () => {
    const home = play(createGame(SEED), { type: 'build', mode: 'ai' });
    const twin = play(goTo(createGame(SEED, 'dream'), 'g2'), { type: 'build', mode: 'ai' });
    expect(publicView(twin).incomePerYear).toBeCloseTo(publicView(home).incomePerYear * 2, 6);
    const best = play(createGame(SEED), { type: 'build', mode: 'self', skill: 1 });
    const worst = play(createGame(SEED), { type: 'build', mode: 'self', skill: 0 });
    expect(best.arrays[0]!.quality).toBe(B.build.skillMax);
    expect(worst.arrays[0]!.quality).toBe(B.build.skillMin);
  });

  it('延寿：前三级自动生效，第四、五级是改造，要执政官点头，代价是权威', () => {
    let s = play(createGame(SEED, 'hunter'), { type: 'research', allocation: { propulsion: 0, longevity: 1, harvest: 0, cosmology: 0 } });
    expect(can(s, { type: 'augment' })).toBe('还没有可以接受的改造。');
    while (publicView(s).research.find((l) => l.id === 'longevity')!.level < 4) s = play(s, { type: 'wait', years: 100 });
    // 第四级到了，但清醒日只加了前三级的。
    expect(s.wakeDays).toBe(B.start.wakeDays + 3 * B.research.longevityDays);
    expect(augmentsAvailable(s)).toBe(1);
    expect(publicView(s).augments).toMatchObject({ accepted: 0, available: 1 });

    const after = reduce(s, { type: 'augment' });
    expect(after.wakeDays).toBe(s.wakeDays + B.research.longevityDays);
    expect(after.authority).toBeCloseTo(s.authority - B.research.augmentAuthority, 6);
    expect(can(after, { type: 'augment' })).toBe('还没有可以接受的改造。');
  });
});

describe('探测器', () => {
  /** 发射一艘，等到有消息为止。 */
  const launchAndWait = (s: GameState): GameState => {
    let next = reduce(s, { type: 'probe' });
    const probe = next.probes[next.probes.length - 1]!;
    while (next.year < probe.reportYear) next = reduce(next, { type: 'wait', years: Math.min(200, probe.reportYear - next.year) });
    return next;
  };
  const energized = (seed: number, truth: TruthId): GameState => ({ ...createGame(seed, truth), energy: 1000 });

  it('有消息之前不是证据；消息不会晚于预计的年份', () => {
    for (const truth of ALL_TRUTHS) {
      const s = play(createGame(SEED, truth), { type: 'probe' });
      const probe = s.probes[0]!;
      expect(s.evidence.probe).toBeUndefined();
      expect(publicView(s).evidence).toEqual([]);
      expect(probe.reportYear).toBeLessThanOrEqual(probe.etaYear);
      const done = launchAndWait(createGame(SEED, truth));
      expect(done.evidence.probe).toEqual({ year: probe.reportYear });
    }
  });

  it('猎手：每一艘都在离 K-41 同一个距离上没了声音，从哪里发射都一样', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = energized(seed, 'hunter');
      s = launchAndWait(launchAndWait(s));
      s = launchAndWait(reduce(s, { type: 'depart', to: 'g2' }));
      const lost = s.probes.map((p) => p.lostAt);
      expect(lost).toEqual([s.silenceRadius, s.silenceRadius, s.silenceRadius]);
      expect(s.silenceRadius).toBeGreaterThanOrEqual(B.probe.silenceRadius[0]);
      expect(s.silenceRadius).toBeLessThanOrEqual(B.probe.silenceRadius[1]);
    }
    // 这个距离每局不同，所以单看一次失联的位置认不出猎手。
    expect(new Set(Array.from({ length: 20 }, (_, i) => createGame(i + 1, 'hunter').silenceRadius)).size).toBeGreaterThan(10);
  });

  it('入梦和黑球：探测器分不开它们；约四分之一因故障失联，位置随机', () => {
    let lost = 0;
    const places = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      const dream = launchAndWait(createGame(seed, 'dream'));
      const blackball = launchAndWait(createGame(seed, 'blackball'));
      const seen = (s: GameState) => publicView(s).evidence.find((o) => o.id === 'probe');
      expect(seen(blackball)).toEqual(seen(dream));
      const at = dream.probes[0]!.lostAt;
      if (at !== null) {
        lost++;
        places.add(at);
      }
    }
    expect(lost / 400).toBeGreaterThan(B.probe.failureRate - 0.07);
    expect(lost / 400).toBeLessThan(B.probe.failureRate + 0.07);
    expect(places.size).toBeGreaterThan(50);
  });

  it('一次故障失联和猎手的掐断，写出来是同一种话', () => {
    const facts = (s: GameState): string => {
      const o = publicView(s).evidence.find((e) => e.id === 'probe')!;
      return o.facts[0]!.replace(/[0-9.]+ 光年/, 'X 光年');
    };
    let failed: GameState | null = null;
    for (let seed = 1; seed <= 60 && !failed; seed++) {
      const s = launchAndWait(createGame(seed, 'dream'));
      if (s.probes[0]!.lostAt !== null) failed = s;
    }
    expect(failed).not.toBeNull();
    expect(facts(failed!)).toBe(facts(launchAndWait(createGame(failed!.seed, 'hunter'))));
  });

  it('多艘探测器的消息都留在同一条证据里', () => {
    const s = launchAndWait(launchAndWait(energized(SEED, 'hunter')));
    const o = publicView(s).evidence.find((e) => e.id === 'probe')!;
    expect(o.kind === 'probe' && o.reports.map((r) => r.lostAt)).toEqual([s.silenceRadius, s.silenceRadius]);
    const state: ProbeState[] = s.probes;
    expect(state.every((p) => p.reported)).toBe(true);
  });
});

describe('权威', () => {
  it('每次抵达露面，权威小幅上升', () => {
    const s = { ...createGame(SEED), energy: 1000 };
    const t = publicView(s).systems.find((x) => x.id === 'g2')!.travel!;
    const arrived = reduce(s, { type: 'depart', to: 'g2' });
    expect(arrived.authority).toBeCloseTo(s.authority - t.years / B.authority.sleepYearsPerPoint + B.authority.perArrival, 2);
  });

  it('连续冷眠超过一定年数，权威流失加快；亲自做一件事就重新计数', () => {
    const A = B.authority;
    const start = createGame(SEED);
    const nap: Action = { type: 'wait', years: 200 };
    const straight = play(start, nap, nap, nap);
    const gentle = A.longSleepAfter / A.sleepYearsPerPoint;
    const fast = (600 - A.longSleepAfter) / A.longSleepYearsPerPoint;
    expect(start.authority - straight.authority).toBeCloseTo(gentle + fast, 1);

    // 中间醒来看一眼风景，就不算连续。
    const broken = play(start, nap, { type: 'view', body: 'home-1' }, nap, { type: 'view', body: 'home-2' }, nap);
    expect(start.authority - broken.authority).toBeCloseTo(600 / A.sleepYearsPerPoint, 1);
    expect(broken.sleepStreak).toBe(200);
  });
});

describe('可通关', () => {
  for (const truth of ALL_TRUTHS) {
    it(`${TRUTHS[truth].name}：有一条走到“明断”的路线`, () => {
      const end = carefulRoute(createGame(SEED, truth));
      expect(end.ending?.id).toBe('clear');
      expect(fate(end)).toBeLessThan(100);
      expect(end.wakeDays).toBeGreaterThan(0);
    });
  }
});

describe('结局表', () => {
  const end = (s: GameState, conclusion: TruthId, response: (typeof RESPONSE_IDS)[number]): EndingId =>
    reduce(s, { type: 'conclude', conclusion, response }).ending!.id;

  it('明断：结论对，回应对，权威不低于 40', () => {
    expect(end(createGame(SEED, 'hunter'), 'hunter', 'silence')).toBe('clear');
  });

  it('知而不能行：结论对，回应对，权威低于 40', () => {
    let s = createGame(SEED, 'hunter');
    while (s.authority >= B.authority.threshold) s = reduce(s, { type: 'harvest', mode: 'ai', body: 'home-3' });
    expect(end(s, 'hunter', 'silence')).toBe('powerless');
  });

  it('侥幸：结论错，但回应在真实的真相下无害', () => {
    expect(end(createGame(SEED, 'hunter'), 'blackball', 'ban')).toBe('lucky');
    expect(end(createGame(SEED, 'hunter'), 'dream', 'silence')).toBe('lucky');
  });

  it('失察：其余情况', () => {
    expect(end(createGame(SEED, 'hunter'), 'dream', 'covenant')).toBe('failed');
    expect(end(createGame(SEED, 'hunter'), 'hunter', 'covenant')).toBe('failed');
  });

  it('未决：命运满 100', () => {
    let s = createGame(SEED, 'dream');
    while (!s.ending) s = reduce(s, { type: 'harvest', mode: 'ai', body: 'home-3' });
    expect(s.ending.id).toBe('undecided');
    expect(fate(s)).toBe(100);
  });

  it('长眠：清醒日用完', () => {
    let s = createGame(SEED, 'dream');
    const tour: Action[] = [];
    for (const sys of Object.values(SYSTEMS)) for (const b of sys.bodies) tour.push({ type: 'harvest', mode: 'self', body: b.id });
    while (!s.ending) {
      const next = tour.find((a) => can(s, a) === null) ?? ({ type: 'view', body: 'home-1' } as Action);
      if (can(s, next)) s = { ...s, wakeDays: 2 };
      s = reduce(s, next);
    }
    expect(s.ending.id).toBe('sleep');
    expect(s.wakeDays).toBe(0);
  });

  it('六个结局都走得到', () => {
    expect(everyEnding(SEED).map((s) => s.ending?.id)).toEqual(['clear', 'powerless', 'lucky', 'failed', 'undecided', 'sleep']);
  });

  it('回应的对错：每种真相下恰好一种回应是对的，其余的有害或无害', () => {
    const table: Record<TruthId, Record<string, 'right' | 'harmless' | 'harmful'>> = {
      dream: { covenant: 'right', silence: 'harmful', ban: 'harmless' },
      hunter: { covenant: 'harmful', silence: 'right', ban: 'harmless' },
      blackball: { covenant: 'harmful', silence: 'harmless', ban: 'right' },
    };
    for (const truth of ALL_TRUTHS) {
      const wrong = ALL_TRUTHS.find((t) => t !== truth)!;
      for (const response of RESPONSE_IDS) {
        const kind = table[truth][response];
        expect(judge(truth, truth, response, 100)).toBe(kind === 'right' ? 'clear' : 'failed');
        expect(judge(truth, wrong, response, 100)).toBe(kind === 'harmful' ? 'failed' : 'lucky');
      }
    }
  });
});

describe('不会卡死', () => {
  it('随机操作不会把状态弄坏，也总有下一步可走', () => {
    const endings = new Set<EndingId>();
    for (let seed = 1; seed <= 150; seed++) {
      const end = randomWalk(createGame(seed), seed * 31, 400, (_before, _action, after) => {
        expect(Number.isFinite(after.energy) && after.energy >= 0).toBe(true);
        expect(after.authority).toBeGreaterThanOrEqual(0);
        expect(after.authority).toBeLessThanOrEqual(100);
        expect(JSON.stringify(after)).not.toContain('null,null');
        if (!after.ending) {
          // 只要还没结局，总可以让 AI 去采集来换能源，或者下结论。
          expect(can(after, { type: 'harvest', mode: 'ai', body: SYSTEMS[after.location].bodies[0]!.id })).toBeNull();
          expect(can(after, { type: 'conclude', conclusion: 'dream', response: 'ban' })).toBeNull();
        }
      });
      if (end.ending) endings.add(end.ending.id);
    }
    expect(endings.size).toBeGreaterThanOrEqual(4);
  });

  it('能源见底时，靠采集总能攒够去最近一站的能源', () => {
    // 无光只有一个天体，又不能建阵列，是最容易困住的地方。
    let s: GameState = { ...createGame(SEED, 'hunter'), location: 'r3', visited: ['home', 'r3'], energy: 0 };
    let harvests = 0;
    while (can(s, { type: 'depart', to: 'j14' }) && harvests++ < 20) s = reduce(s, { type: 'harvest', mode: 'self', body: 'r3-1' });
    expect(can(s, { type: 'depart', to: 'j14' })).toBeNull();
    expect(harvests).toBeLessThanOrEqual(12);
  });
});

describe('分层', () => {
  const imports = (dir: string): string[] =>
    readdirSync(join('src', dir))
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => [...readFileSync(join('src', dir, f), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!));

  it('content 不引用别的层', () => {
    for (const path of imports('content')) expect(path.startsWith('./')).toBe(true);
  });

  it('core 只引用 content 和自己，不引用 app 和 ai', () => {
    for (const path of imports('core')) expect(path.startsWith('./') || path.startsWith('../content/')).toBe(true);
  });
});
