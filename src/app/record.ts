/**
 * 对局记录：试玩者打完一局后复制出来、发回给组织试玩的人的那段文字。
 *
 * 第一行是给人看的摘要，第二行是一个 JSON 对象。种子加操作序列足以重放整局，
 * 所以记录里不存状态。用时和三个问题的答案不影响重放，只用来汇总。
 * scripts/playtest.ts 用这里的 parseRecords 把收回来的文字读回去。
 */
import { RESPONSES, TRUTHS } from '../content/truths';
import type { TruthId } from '../content/truths';
import type { Action, EndingId, PublicView } from '../core/types';
import { ENDING_NAMES, num } from './labels';

export const RECORD_KIND = 'great-silence-record';

/** 两次操作之间最多算这么久。再长多半是走开了。 */
export const IDLE_CAP_SECONDS = 10 * 60;

export type Again = 'yes' | 'maybe' | 'no';

export interface Answers {
  /** 还想再玩一局吗？ */
  again: Again | null;
  /** 哪里觉得不讲道理？ */
  unfair: string;
  /** 怎么推出结论的；没有下结论的局里，是现在会怎么选、为什么。 */
  reasoning: string;
}

export const NO_ANSWERS: Answers = { again: null, unfair: '', reasoning: '' };

export const AGAIN_NAMES: Record<Again, string> = { yes: '想', maybe: '说不准', no: '不想' };

export interface GameRecord {
  kind: typeof RECORD_KIND;
  v: 1;
  /** 构建版本（提交号）。规则改了，旧记录就重放不出原来的结果。 */
  build: string;
  seed: number;
  /** 结局之后才有，免得中途复制出来的记录泄底。 */
  truth: TruthId | null;
  ending: EndingId | null;
  actions: Action[];
  /** 每个操作发生时已经玩了多少秒。只算页面在前台的时间，两次操作之间最多算 IDLE_CAP_SECONDS。 */
  times: number[];
  /** 复制时一共玩了多少秒。 */
  elapsed: number;
  answers: Answers | null;
}

export function minutes(seconds: number): string {
  return `${Math.max(0, Math.round(seconds / 60))} 分钟`;
}

/** 摘要那一行。结局之前只有不泄底的内容。 */
export function recordSummary(view: PublicView, record: GameRecord): string {
  const end = view.ending;
  const parts = [`种子 ${record.seed}`];
  if (end) {
    parts.push(
      `真相 ${TRUTHS[end.truth].name}`,
      `结论 ${end.conclusion ? TRUTHS[end.conclusion].name : '无'}`,
      `回应 ${end.response ? RESPONSES[end.response].name : '无'}`,
      `结局 ${ENDING_NAMES[end.id]}`,
      `第 ${end.year} 年`,
      `命运 ${num(end.fate.total)}`,
    );
  } else {
    parts.push('没有打完', `第 ${view.year} 年`);
  }
  parts.push(`权威 ${num(view.authority)}`, `清醒日 ${view.wakeDays}`, `操作 ${record.actions.length} 步`, `用时 ${minutes(record.elapsed)}`);
  if (record.answers?.again) parts.push(`再玩 ${AGAIN_NAMES[record.answers.again]}`);
  return parts.join(' · ');
}

export function recordText(view: PublicView, record: GameRecord): string {
  return `${recordSummary(view, record)}\n${JSON.stringify(record)}`;
}

/**
 * 从一段文字里找出所有的对局记录。文字可以是聊天记录、邮件或者几条记录拼在一起；
 * 粘贴时被插进 JSON 里的换行会被去掉（记录里合法的换行都已转义，不会是裸的）。
 */
export function parseRecords(text: string): GameRecord[] {
  const out: GameRecord[] = [];
  // kind 是第一个键，所以记录总是以这几个字开头。
  const marker = `{"kind":"${RECORD_KIND}"`;
  const flat = text.replace(/[\r\n]+/g, '');
  let from = 0;
  for (;;) {
    const start = flat.indexOf(marker, from);
    if (start < 0) break;
    from = start + marker.length;
    const json = extractObject(flat, start);
    if (json === null) continue;
    try {
      const value = JSON.parse(json) as GameRecord;
      if (value.kind === RECORD_KIND && Number.isFinite(value.seed) && Array.isArray(value.actions)) out.push(value);
    } catch {
      // 不完整的记录跳过。
    }
  }
  return out;
}

/** 从 start 处的左花括号起，取出配对的整个对象。 */
function extractObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
