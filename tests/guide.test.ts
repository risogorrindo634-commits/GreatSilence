import { describe, expect, it } from 'vitest';
import { nextStep, nextTarget } from '../src/app/guide';
import { LEADS } from '../src/content/leads';
import { TRUTHS } from '../src/content/truths';
import { can, createGame, publicView, reduce } from '../src/core/game';
import type { Action, GameState } from '../src/core/types';
import { ALL_TRUTHS, rich } from './helpers';

/** 一个只照“下一步”做事的玩家：该补给就补给，该启航就启航，线索都交给 AI。 */
function follow(state: GameState, steps = 200): { state: GameState; said: string[] } {
  let s = state;
  const said: string[] = [];
  for (let i = 0; i < steps && !s.ending; i++) {
    const view = publicView(s);
    said.push(nextStep(view));
    const next = nextTarget(view);
    let action: Action | null = null;
    const richest = [...view.bodies].sort((a, b) => b.resource - a.resource)[0]!;
    const harvest: Action = { type: 'harvest', mode: 'ai', body: richest.id };
    switch (next.kind) {
      case 'court':
        action = { type: 'rule', item: view.pending!, decision: 'veto' };
        break;
      case 'here': {
        const def = LEADS[next.lead];
        action = def.evidence === 'signal' || def.evidence === 'pulsar' ? { type: 'tune', mode: 'ai', body: def.body! } : { type: 'investigate', mode: 'ai', body: def.body! };
        break;
      }
      case 'probe':
        action = next.short > 0 ? harvest : { type: 'probe' };
        break;
      case 'travel':
        action = next.short > 0 ? harvest : { type: 'depart', to: next.to };
        break;
      case 'wait':
        action = { type: 'wait', years: 50 };
        break;
      case 'refine':
      case 'conclude':
        action = { type: 'conclude', conclusion: s.truth, response: TRUTHS[s.truth].response };
        break;
      case 'none':
        break;
    }
    if (!action || can(s, action) !== null) break;
    s = reduce(s, action);
  }
  return { state: s, said };
}

describe('下一步', () => {
  it('开局指向最近的一条线索，能源不够时先说补给', () => {
    const view = publicView(createGame(1));
    expect(nextTarget(view)).toMatchObject({ kind: 'travel', to: 'm7', lead: 'ruins' });
    expect(nextStep(view)).toMatch(/去 M-7 晨昏.*还差 \d+：先补给/);
    expect(nextTarget(publicView(rich(createGame(1))))).toMatchObject({ kind: 'travel', short: 0 });
  });

  it('到了有线索的地方，就说这里有线索', () => {
    const s = reduce(rich(createGame(1)), { type: 'depart', to: 'm7' });
    const vetoed = s.pending ? reduce(s, { type: 'rule', item: s.pending, decision: 'veto' }) : s;
    expect(nextTarget(publicView(vetoed))).toEqual({ kind: 'here', lead: 'ruins' });
  });

  it('只照着下一步做，三种真相都能走完全程、取得每一条线索并下结论', () => {
    for (const truth of ALL_TRUTHS) {
      const { state, said } = follow(createGame(1, truth));
      expect(state.ending, truth).not.toBeNull();
      expect(state.conclusion, truth).not.toBeNull();
      expect(publicView(state).leads.map((l) => l.id).sort()).toEqual(['infrared', 'probe', 'pulsar', 'ruins', 'signal']);
      expect(publicView(state).leads.every((l) => l.status !== 'open'), truth).toBe(true);
      for (const line of said) expect(line).not.toMatch(/undefined|NaN/);
    }
  });

  it('三种真相下，同样的操作得到同样的下一步', () => {
    const runs = ALL_TRUTHS.map((t) => follow(createGame(3, t), 25).said);
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });
});
