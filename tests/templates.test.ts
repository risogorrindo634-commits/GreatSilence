import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateScribe as scribe } from '../src/ai/templates';
import { COURT_IDS } from '../src/content/court';
import { TRUTHS } from '../src/content/truths';
import { createGame, publicView, reduce } from '../src/core/game';
import type { LogEntry } from '../src/core/types';
import { ALL_TRUTHS, carefulRoute, everyEnding, randomWalk } from './helpers';

/** 收集各种打法留下的日志，尽量覆盖所有事件。 */
function logs(): LogEntry[] {
  const out: LogEntry[] = [];
  for (const truth of ALL_TRUTHS) out.push(...carefulRoute(createGame(1, truth)).log);
  for (let seed = 1; seed <= 40; seed++) out.push(...randomWalk(createGame(seed), seed * 13, 300).log);
  return out;
}

describe('文书模板', () => {
  it('每一种日志事件都写得出一句完整的话', () => {
    const all = logs();
    const kinds = new Set(all.map((e) => e.t));
    for (const kind of ['start', 'arrive', 'radiation', 'view', 'name', 'lead', 'investigate', 'tune', 'harvest', 'build', 'slingshot', 'probe', 'probeReport', 'wait', 'court', 'rule', 'level', 'conclude', 'end']) {
      expect(kinds.has(kind as LogEntry['t']), kind).toBe(true);
    }
    for (const entry of all) {
      const line = scribe.logLine(entry);
      expect(line.length).toBeGreaterThan(3);
      expect(line).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it('延寿改造写得出换掉了什么', () => {
    for (const step of [1, 2]) {
      const line = scribe.logLine({ t: 'augment', step, year: 500 });
      expect(line).toMatch(/改造：.+。释钥庭/);
    }
  });

  it('朝堂：录事先陈述事实，各方的说法里没有真相', () => {
    const names = ALL_TRUTHS.map((t) => TRUTHS[t].name);
    for (const truth of ALL_TRUTHS) {
      const view = publicView(createGame(1, truth));
      for (const item of COURT_IDS) {
        const reports = scribe.courtReports(item, view);
        expect(reports[0]!.speaker).toBe('录事');
        expect(reports.length).toBeGreaterThanOrEqual(4);
        for (const r of reports) for (const name of names) expect(r.text).not.toContain(name);
      }
    }
  });

  it('朝堂的说法与真相无关：三种真相下一字不差', () => {
    const text = (truth: (typeof ALL_TRUTHS)[number]): string =>
      JSON.stringify(COURT_IDS.map((item) => scribe.courtReports(item, publicView(createGame(1, truth)))));
    expect(text('hunter')).toBe(text('dream'));
    expect(text('blackball')).toBe(text('dream'));
  });

  it('简报从指定的日志位置写起，并以录事的一句收尾', () => {
    const before = createGame(1, 'dream');
    const after = reduce(before, { type: 'depart', to: 'g2' });
    const lines = scribe.briefing(publicView(after), before.log.length);
    expect(lines.some((l) => l.includes('抵达'))).toBe(true);
    expect(lines.some((l) => l.includes('你被唤醒'))).toBe(false);
    expect(lines[lines.length - 1]).toMatch(/^录事：/);
  });

  it('每个结局都有史官的定论，各不相同；没有结局时什么都不写', () => {
    expect(scribe.verdict(publicView(createGame(1)))).toEqual([]);
    const first = everyEnding(1).map((s) => {
      const lines = scribe.verdict(publicView(s));
      expect(lines.length).toBeGreaterThanOrEqual(3);
      for (const line of lines) expect(line).not.toMatch(/undefined|NaN/);
      return lines[0]!;
    });
    expect(new Set(first).size).toBe(6);
  });
});

describe('分层：界面与文书', () => {
  const imports = (dir: string): string[] =>
    readdirSync(join('src', dir))
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => [...readFileSync(join('src', dir, f), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!));

  it('app 不引用 ai：文书的实现由入口注入', () => {
    for (const path of imports('app')) expect(path.includes('/ai/')).toBe(false);
  });

  it('ai 只拿得到视图和日志的类型，不引用内核的实现', () => {
    for (const path of imports('ai')) {
      expect(['../app/scribe', '../core/types'].includes(path) || path.startsWith('../content/')).toBe(true);
    }
  });
});
