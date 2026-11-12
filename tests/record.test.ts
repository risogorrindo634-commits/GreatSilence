import { describe, expect, it } from 'vitest';
import { parseRecords, recordText } from '../src/app/record';
import type { GameRecord } from '../src/app/record';
import { createStore } from '../src/app/store';
import { publicView, replay } from '../src/core/game';
import type { Action } from '../src/core/types';

const OPENING: Action[] = [
  { type: 'view', body: 'home-1' },
  { type: 'survey', mode: 'ai' },
  { type: 'harvest', mode: 'self', body: 'home-3' },
];
const CONCLUDE: Action = { type: 'conclude', conclusion: 'hunter', response: 'silence' };

function finished(seed = 7): ReturnType<typeof createStore> {
  const store = createStore({ seed, resume: 'none', build: 'test' });
  for (const a of OPENING) store.dispatch(a);
  return store;
}

describe('对局记录', () => {
  it('中途复制出来的记录不带真相和答案', () => {
    const store = finished();
    const record = store.record();
    expect(record.truth).toBeNull();
    expect(record.ending).toBeNull();
    expect(record.answers).toBeNull();
    expect(record.actions).toHaveLength(OPENING.length);
    expect(record.times).toHaveLength(OPENING.length);
    expect(recordText(store.view(), record)).not.toMatch(/真相|入梦|猎手|黑球/);
  });

  it('结局之后的记录带着真相、结局和答案，用时不再增长', () => {
    const store = finished();
    store.dispatch(CONCLUDE);
    store.answer({ again: 'yes', unfair: '探测器"太贵"\n第二行' });
    const record = store.record();
    expect(record.truth).toBe(store.view().ending!.truth);
    expect(record.ending).toBe(store.view().ending!.id);
    expect(record.answers).toEqual({ again: 'yes', unfair: '探测器"太贵"\n第二行', reasoning: '' });
    expect(record.times).toHaveLength(OPENING.length + 1);
    for (let i = 1; i < record.times.length; i++) expect(record.times[i]!).toBeGreaterThanOrEqual(record.times[i - 1]!);
    expect(record.elapsed).toBe(record.times.at(-1));
  });

  it('复制出来的文字读得回去，重放得到同一个结局', () => {
    const store = finished();
    store.dispatch(CONCLUDE);
    store.answer({ reasoning: '看了遗迹。{"kind":"great-silence-record" 这句是玩家写的' });
    const text = recordText(store.view(), store.record());
    const [back] = parseRecords(text);
    expect(back).toEqual(store.record());
    const state = replay(back!.seed, back!.truth ?? undefined, back!.actions);
    expect(state.ending?.id).toBe(back!.ending);
    expect(publicView(state).ending).toEqual(store.view().ending);
  });

  it('夹在聊天记录里、被插进换行、几条拼在一起，都读得出来', () => {
    const a = finished(7);
    a.dispatch(CONCLUDE);
    const b = finished(8);
    const textA = recordText(a.view(), a.record());
    const textB = recordText(b.view(), b.record());
    // 聊天软件把长行折开。
    const wrapped = textB.replace(/(.{7})/g, '$1\n');
    const chat = `小王 14:02\n打完了，记录如下\n${textA}\n\n小李 15:30\n玩到一半有事\n${wrapped}\n谢谢！`;
    const records = parseRecords(chat);
    expect(records.map((r: GameRecord) => r.seed)).toEqual([7, 8]);
    expect(records[1]!.actions).toEqual(OPENING);
  });

  it('不完整的记录跳过，不报错', () => {
    const store = finished();
    const text = recordText(store.view(), store.record());
    expect(parseRecords(text.slice(0, text.length - 10))).toEqual([]);
    expect(parseRecords('没有记录')).toEqual([]);
  });
});
