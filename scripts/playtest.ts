/**
 * 汇总试玩：把收回来的对局记录重放一遍，对照 M1 的验收标准（GDD 第 14 节）。
 *
 *   npm run playtest                   读 playtest/ 目录下所有的文件
 *   npm run playtest -- a.txt 某目录    读指定的文件或目录
 *   npm run playtest -- --seeds        列出每种真相可用的种子，给试玩者分配
 *
 * 一个文件里可以有任意多条记录，夹在聊天记录里也行。做法见 docs/PLAYTEST.md。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { COURT, COURT_IDS } from '../src/content/court';
import { RELICS } from '../src/content/relics';
import { findBody, SYSTEMS } from '../src/content/systems';
import { RESPONSES, TRUTHS, TRUTH_IDS } from '../src/content/truths';
import type { TruthId } from '../src/content/truths';
import { createGame, fate, reduce } from '../src/core/game';
import type { Action, EvidenceId, GameState, Mark } from '../src/core/types';
import { ENDING_NAMES, EVIDENCE_NAMES } from '../src/app/labels';
import { AGAIN_NAMES, IDLE_CAP_SECONDS, minutes, parseRecords } from '../src/app/record';
import type { GameRecord } from '../src/app/record';
import { table } from './text';

// M1 的验收标准。
const TESTERS = 5;
const AGAIN_AT_LEAST = 3;
const ACCURACY: [number, number] = [0.4, 0.7];
const MINUTES: [number, number] = [45, 60];

const ACTION_NAMES: Record<Action['type'], string> = {
  view: '看风景',
  name: '命名',
  investigate: '调查',
  salvage: '取遗物',
  tune: '调谐',
  harvest: '采集',
  build: '建阵列',
  slingshot: '弹弓',
  probe: '发探测器',
  augment: '改造',
  wait: '等待',
  rule: '签字',
  research: '分配科研',
  depart: '启程',
  mark: '推理板',
  conclude: '下结论',
};

const MARK_NAMES: Record<Mark, string> = { support: '支持', against: '反对', unknown: '清空' };

function describe(action: Action): string {
  const parts = [ACTION_NAMES[action.type]];
  if ('mode' in action) parts.push(action.mode === 'self' ? '亲自' : 'AI');
  if ('body' in action) parts.push(findBody(action.body)?.body.name ?? action.body);
  if (action.type === 'depart') parts.push(`去${SYSTEMS[action.to].name}`);
  if (action.type === 'salvage') parts.push(RELICS[action.relic].title);
  if (action.type === 'rule') parts.push(`${COURT[action.item].title}：${action.decision === 'sign' ? '签' : '否'}`);
  if (action.type === 'wait') parts.push(`${action.years} 年`);
  if (action.type === 'mark') parts.push(`${EVIDENCE_NAMES[action.evidence]}→${TRUTHS[action.truth].name}：${MARK_NAMES[action.mark]}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- 读记录

function files(paths: string[]): string[] {
  return paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => !f.startsWith('.'))
          .sort()
          .map((f) => join(p, f))
          .filter((f) => statSync(f).isFile())
      : [p],
  );
}

interface Played {
  label: string;
  record: GameRecord;
  state: GameState | null;
  /** 每一步之前的纪年。 */
  years: number[];
  problems: string[];
}

function head(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

function replayRecord(label: string, record: GameRecord, current: string): Played {
  const problems: string[] = [];
  const builds = record.build.split('→').map((b) => b.replace(/\+$/, ''));
  if (builds.length > 1) problems.push(`这一局打到一半换了版本（${record.build}），重放可能不准。`);
  else if (builds[0] !== current) problems.push(`记录来自 ${record.build} 版，当前是 ${current} 版；规则改过的话，先 git checkout ${builds[0]} 再汇总。`);

  let state = createGame(record.seed, record.truth ?? undefined);
  const years: number[] = [];
  for (const [i, action] of record.actions.entries()) {
    years.push(state.year);
    try {
      state = reduce(state, action);
    } catch (error) {
      problems.push(`第 ${i + 1} 步（${describe(action)}）重放失败：${(error as Error).message}`);
      return { label, record, state: null, years, problems };
    }
  }
  if (record.ending && state.ending?.id !== record.ending) {
    problems.push(`重放出的结局是“${state.ending ? ENDING_NAMES[state.ending.id] : '没打完'}”，记录里是“${ENDING_NAMES[record.ending]}”。`);
  }
  return { label, record, state, years, problems };
}

// ---------------------------------------------------------------- 每一局的读数

function evidenceLine(s: GameState): string {
  const e = s.evidence;
  const out: string[] = [];
  if (e.signal) out.push(`信号${e.signal.clarity.toFixed(2)}`);
  if (e.pulsar) out.push(`脉冲${e.pulsar.clarity.toFixed(2)}`);
  if (e.infrared) out.push(`红外${e.infrared.fine ? '细' : '粗'}`);
  if (e.ruins) out.push(`遗迹${e.ruins.fine ? '细' : '粗'}`);
  const probes = s.probes.filter((p) => p.reported).length;
  if (probes > 0) out.push(`探测器${probes}`);
  return out.join(' ') || '无';
}

function handsLine(actions: readonly Action[]): string {
  let self = 0;
  let ai = 0;
  const skills: number[] = [];
  for (const a of actions) {
    if ('mode' in a) {
      if (a.mode === 'self') self++;
      else ai++;
    }
    if (a.type === 'slingshot') self++;
    if ('skill' in a) skills.push(a.skill);
  }
  const avg = skills.length > 0 ? ` 手${(skills.reduce((x, y) => x + y, 0) / skills.length).toFixed(2)}` : '';
  return `${self}/${ai}${avg}`;
}

function courtLine(s: GameState): string {
  const out = COURT_IDS.flatMap((id) => {
    const r = s.rulings[id];
    if (!r) return [];
    const trap = COURT[id].trap.truth === s.truth;
    return [`${SYSTEMS[COURT[id].system].name}${r === 'sign' ? '签' : '否'}${trap ? '!' : ''}`];
  });
  return out.join(' ') || '—';
}

/** 推理板上最后留下的标记。 */
function boardLine(s: GameState): string {
  const out = Object.entries(s.board)
    .filter(([, m]) => m !== 'unknown')
    .map(([key, m]) => {
      const [evidence, truth] = key.split(':') as [EvidenceId, TruthId];
      return `${EVIDENCE_NAMES[evidence]}${m === 'support' ? '支持' : '反对'}${TRUTHS[truth].name}`;
    });
  return out.join('，') || '没有用';
}

/** 两次操作之间停得最久的几处，和停完之后做了什么。 */
function pauses(p: Played, count = 3): string[] {
  const { times, actions } = p.record;
  const gaps = actions.map((action, i) => ({ i, action, gap: (times[i] ?? 0) - (i > 0 ? (times[i - 1] ?? 0) : 0) }));
  return gaps
    .sort((a, b) => b.gap - a.gap)
    .slice(0, count)
    .filter((g) => g.gap >= 60)
    .map((g) => {
      const long = g.gap >= IDLE_CAP_SECONDS - 1 ? `${minutes(IDLE_CAP_SECONDS)}以上（多半走开了）` : minutes(g.gap);
      return `停了 ${long}（第 ${p.years[g.i] ?? '?'} 年，第 ${g.i + 1} 步之前），然后：${describe(g.action)}`;
    });
}

// ---------------------------------------------------------------- 汇总

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const mark = (ok: boolean): string => (ok ? '达到' : '没达到');

function report(played: Played[]): void {
  const rows: string[][] = [['记录', '真相', '结论', '回应', '结局', '用时', '步数', '纪年', '命运', '权威', '证据', '亲自/AI', '签字', '再玩']];
  for (const p of played) {
    const s = p.state;
    const answers = p.record.answers;
    if (!s) {
      rows.push([p.label, '重放失败']);
      continue;
    }
    const c = s.conclusion;
    rows.push([
      p.label,
      TRUTHS[s.truth].name,
      c ? `${TRUTHS[c.truth].name}${c.truth === s.truth ? '✓' : '✗'}` : '—',
      c ? `${RESPONSES[c.response].name}${c.response === TRUTHS[s.truth].response ? '✓' : '✗'}` : '—',
      s.ending ? ENDING_NAMES[s.ending.id] : '没打完',
      minutes(p.record.elapsed),
      String(p.record.actions.length),
      String(s.year),
      fate(s).toFixed(0),
      s.authority.toFixed(0),
      evidenceLine(s),
      handsLine(p.record.actions),
      courtLine(s),
      answers?.again ? AGAIN_NAMES[answers.again] : '—',
    ]);
  }
  console.log(table(rows));
  console.log('\n证据：信号和脉冲后面是清晰度，红外和遗迹分粗细，探测器是有消息的艘数。');
  console.log('亲自/AI：两种方式各做了几件事；手是小操作的平均成绩。签字后面带 ! 的是这种真相下的陷阱。\n');

  const ok = played.filter((p) => p.state);
  const finished = ok.filter((p) => p.state!.ending);
  const right = finished.filter((p) => p.state!.conclusion?.truth === p.state!.truth);
  const concluded = finished.filter((p) => p.state!.conclusion);
  const again = finished.map((p) => p.record.answers?.again ?? null);
  const yes = again.filter((a) => a === 'yes').length;
  const times = finished.map((p) => p.record.elapsed / 60);
  const accuracy = finished.length > 0 ? right.length / finished.length : 0;

  console.log('M1 验收（GDD 第 14 节）');
  console.log(`  打完一局：${finished.length} 份，要 ${TESTERS} 位。${mark(finished.length >= TESTERS)}。同一个人交了几份要自己去掉。`);
  console.log(
    `  愿意再玩：${yes} 位，要至少 ${AGAIN_AT_LEAST} 位。${mark(yes >= AGAIN_AT_LEAST)}。` +
      `（想 ${yes} · 说不准 ${again.filter((a) => a === 'maybe').length} · 不想 ${again.filter((a) => a === 'no').length} · 没答 ${again.filter((a) => a === null).length}）`,
  );
  console.log(
    `  推理正确率：${right.length} / ${finished.length} = ${pct(accuracy)}，要在 ${pct(ACCURACY[0])} 到 ${pct(ACCURACY[1])} 之间。` +
      `${finished.length > 0 ? mark(accuracy >= ACCURACY[0] && accuracy <= ACCURACY[1]) : '还没有打完的局'}。` +
      `没下结论的 ${finished.length - concluded.length} 局算错。`,
  );
  if (times.length > 0) {
    console.log(`  用时：中位数 ${median(times).toFixed(0)} 分钟，最短 ${Math.min(...times).toFixed(0)}，最长 ${Math.max(...times).toFixed(0)}；切片的目标是 ${MINUTES[0]} 到 ${MINUTES[1]} 分钟。`);
  }
  const byTruth = TRUTH_IDS.map((t) => {
    const games = finished.filter((p) => p.state!.truth === t);
    return `${TRUTHS[t].name} ${games.filter((p) => p.state!.conclusion?.truth === t).length}/${games.length}`;
  });
  console.log(`  按真相：${byTruth.join(' · ')}`);
  const unfinished = ok.length - finished.length;
  if (unfinished > 0) console.log(`  没打完的记录 ${unfinished} 份：问一下停在哪里、为什么。`);

  for (const p of played) {
    console.log(`\n—— ${p.label}${p.state ? `（${TRUTHS[p.state.truth].name}，${p.state.ending ? ENDING_NAMES[p.state.ending.id] : '没打完'}）` : ''}`);
    for (const problem of p.problems) console.log(`  注意：${problem}`);
    if (p.state) {
      for (const line of pauses(p)) console.log(`  ${line}`);
      console.log(`  推理板：${boardLine(p.state)}`);
    }
    const a = p.record.answers;
    if (a) {
      console.log(`  不讲道理的地方：${a.unfair.trim() || '（没写）'}`);
      console.log(`  ${p.state?.conclusion ? '怎么推出来的' : '现在会怎么选'}：${a.reasoning.trim() || '（没写）'}`);
    }
  }
}

// ---------------------------------------------------------------- 分配种子

function seeds(perTruth = 4): void {
  const found: Record<TruthId, number[]> = { dream: [], hunter: [], blackball: [] };
  for (let seed = 1; TRUTH_IDS.some((t) => found[t].length < perTruth); seed++) {
    const t = createGame(seed).truth;
    if (found[t].length < perTruth) found[t].push(seed);
  }
  console.log('每种真相可用的种子。试玩链接后面加 ?seed=种子，例如 …/GreatSilence/?seed=' + found.dream[0] + '\n');
  for (const t of TRUTH_IDS) console.log(`  ${TRUTHS[t].name}：${found[t].join('、')}`);
  console.log('\n不要用 ?truth=，它会写在地址栏里。种子和真相的对应只取决于开局的第一个随机数，改 balance.ts 里的数值不会改变它。');
}

// ---------------------------------------------------------------- 入口

const args = process.argv.slice(2);
if (args.includes('--seeds')) {
  seeds();
} else {
  const paths = args.length > 0 ? args : ['playtest'];
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.log(`找不到：${missing.join('、')}。把收回来的对局记录存进 playtest/ 目录，或者把文件路径写在命令后面。`);
    process.exit(1);
  }
  const current = head();
  const played: Played[] = [];
  // 同一局可能既复制了文字又存了文件，只算一次。
  const seen = new Map<string, string>();
  let duplicates = 0;
  for (const file of files(paths)) {
    const records = parseRecords(readFileSync(file, 'utf8'));
    records.forEach((r, i) => {
      const label = records.length > 1 ? `${basename(file)}#${i + 1}` : basename(file);
      const key = JSON.stringify([r.seed, r.actions, r.answers]);
      const first = seen.get(key);
      if (first) {
        console.log(`${label} 和 ${first} 是同一局，只算一次。`);
        duplicates++;
        return;
      }
      seen.set(key, label);
      played.push(replayRecord(label, r, current));
    });
  }
  if (duplicates > 0) console.log('');
  if (played.length === 0) {
    console.log('没有找到对局记录。记录是一行摘要加一行以 {"kind":"great-silence-record" 开头的文字。');
    process.exit(1);
  }
  report(played);
}
