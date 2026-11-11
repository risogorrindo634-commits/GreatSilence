/**
 * 各个画面的内容。这里只拼 HTML，不改状态；按钮上带着要执行的操作，由 app.ts 统一处理。
 */
import { BALANCE as B } from '../content/balance';
import { COURT, COURT_IDS, FACTIONS, FACTION_IDS } from '../content/court';
import type { CourtDef } from '../content/court';
import { SYSTEMS } from '../content/systems';
import type { SystemId } from '../content/systems';
import { RESPONSES, RESPONSE_IDS, TRUTHS, TRUTH_IDS } from '../content/truths';
import type { ResponseId, TruthId } from '../content/truths';
import type { Action, BodyView, EvidenceId, Observation, PublicView } from '../core/types';
import {
  ANOMALY_NAMES,
  ENDING_NAMES,
  EVIDENCE_NAMES,
  EVIDENCE_SOURCES,
  LINE_EFFECTS,
  LINE_NAMES,
  costLabel,
  escapeHtml,
  num,
  speedLabel,
} from './labels';
import type { Scribe } from './scribe';
import type { Store } from './store';

export type Tab = 'system' | 'map' | 'research' | 'court' | 'board' | 'record';

export interface UiState {
  tab: Tab;
  body: string | null;
  dest: SystemId | null;
  conclusion: TruthId | null;
  response: ResponseId | null;
  /** 玩家已经在“推理”里看过几条证据，用来在标签上提示有新的。 */
  seenEvidence: number;
  /** 打开过“科研”页，引导就不再催。 */
  sawResearch: boolean;
}

export interface Ctx {
  store: Store;
  scribe: Scribe;
  ui: UiState;
}

type Game = 'slingshot' | 'tune' | 'ignite';

/** 一个带着操作的按钮。按钮上写明花的是哪一种时间、花多少；不能做时写明原因。 */
function act(ctx: Ctx, label: string, action: Action, opts: { tone?: 'self' | 'ai' | 'plain'; game?: Game; confirm?: string; gain?: string } = {}): string {
  const reason = ctx.store.can(action);
  const cost = costLabel(ctx.store.cost(action));
  const attrs = [
    `class="btn ${opts.tone ?? 'plain'}"`,
    `data-act="${escapeHtml(JSON.stringify(action))}"`,
    opts.game ? `data-game="${opts.game}"` : '',
    opts.confirm ? `data-confirm="${escapeHtml(opts.confirm)}"` : '',
    reason ? 'disabled' : '',
  ].join(' ');
  const detail = reason ? escapeHtml(reason) : `${cost}${opts.gain ? ` · ${opts.gain}` : ''}`;
  return `<button ${attrs}><span>${escapeHtml(label)}</span><small>${detail}</small></button>`;
}

function ui(label: string, name: string, arg = '', cls = 'btn plain'): string {
  return `<button class="${cls}" data-ui="${name}" data-arg="${escapeHtml(arg)}">${label}</button>`;
}

function meter(value: number, max: number, cls = '', mark?: number): string {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tick = mark === undefined ? '' : `<i class="tick" style="left:${(mark / max) * 100}%"></i>`;
  return `<div class="meter ${cls}"><b style="width:${pct.toFixed(1)}%"></b>${tick}</div>`;
}

// ---------------------------------------------------------------- 常驻读数与标签

export function header(view: PublicView): string {
  const here = view.systems.find((s) => s.current)!;
  return `
    <header class="top">
      <div class="fate">
        <label>同样的命运</label>
        ${meter(view.fate, 100, 'fate-bar')}
        <output>${num(view.fate)}</output>
      </div>
      <dl class="readings">
        <div><dt>纪年</dt><dd>第 ${view.year} 年</dd></div>
        <div><dt>能源</dt><dd>${num(view.energy)}</dd></div>
        <div><dt>航速</dt><dd>${speedLabel(view.speed)}</dd></div>
        <div><dt>清醒日</dt><dd>${view.wakeDays}</dd></div>
        <div><dt>位置</dt><dd>${here.name}</dd></div>
      </dl>
    </header>`;
}

export function tabs(ctx: Ctx): string {
  const view = ctx.store.view();
  const items: [Tab, string, boolean][] = [
    ['system', '星系', false],
    ['map', '星图', false],
    ['research', '科研', false],
    ['court', '朝堂', view.pending !== null],
    ['board', '推理', view.evidence.length > ctx.ui.seenEvidence],
    ['record', '记录', false],
  ];
  return `<nav class="tabs">${items
    .map(([id, label, dot]) => `<button data-ui="tab" data-arg="${id}" class="${ctx.ui.tab === id ? 'on' : ''}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`)
    .join('')}</nav>`;
}

/** 引导：一次只教一件事。 */
function hint(ctx: Ctx): string {
  const view = ctx.store.view();
  let text: string | null = null;
  if (view.pending) {
    if (ctx.ui.tab !== 'court') text = '朝堂上有一件事等你裁决。裁决之前不能启航。';
  } else if (view.systems.filter((s) => s.visited).length === 1 && view.year === 0) {
    const even = view.research.every((l) => Math.abs(l.share - 0.25) < 1e-6);
    if (view.album.length === 0) text = '先看一眼。在图上点一个天体，去看看它。观景花 2 个清醒日，这件事只有你能做。';
    else if (view.arrays === 0) text = '建第一座采能阵列。亲自点火花的是你的清醒日，交给 AI 花的是世界年。这是你一路上都要做的取舍。';
    else if (even && !ctx.ui.sawResearch) text = '去“科研”分配算力。路上的几十上百年里，AI 按你的分配做研究。';
    else text = '去“星图”选下一站，启航。';
  } else if (view.evidence.length > 0 && Object.keys(view.board).length === 0 && ctx.ui.tab !== 'board') {
    text = '你取得了证据。去“推理”自己看：系统只说这是什么数据，不说它意味着什么。';
  }
  return text ? `<p class="hint">${text}</p>` : '';
}

// ---------------------------------------------------------------- 星系

function bodyCard(ctx: Ctx, body: BodyView): string {
  const title = body.given ? `${escapeHtml(body.given)}<small>${body.name}</small>` : body.name;
  const rows: string[] = [];

  if (!body.viewed) {
    rows.push(`<div class="row"><h4>观景</h4><p>只有人会去做的事，AI 不能代劳。</p><div class="pair">${act(ctx, '去看一眼', { type: 'view', body: body.id }, { tone: 'self' })}</div></div>`);
  } else {
    rows.push(`<div class="row"><h4>观景</h4><p>${body.scene}</p><div class="pair">${ui('再看一次', 'scene', body.id)}</div></div>`);
  }

  if (!body.surveyed) {
    rows.push(
      `<div class="row"><h4>勘察</h4><p>查明这里的资源，以及有没有异常。</p><div class="pair">${act(ctx, '亲自勘察这里', { type: 'survey', mode: 'self', body: body.id }, { tone: 'self' })}${act(ctx, 'AI 勘察整个星系', { type: 'survey', mode: 'ai' }, { tone: 'ai' })}</div></div>`,
    );
  }

  if (body.anomaly === 'signal') {
    rows.push(
      `<div class="row anomaly"><h4>异常：${ANOMALY_NAMES.signal}</h4><p>把它从噪声里调出来。调得越准，读到的越清楚。</p><div class="pair">${act(ctx, '亲手调谐', { type: 'tune', mode: 'self', body: body.id, skill: 0 }, { tone: 'self', game: 'tune' })}${act(ctx, 'AI 调谐', { type: 'tune', mode: 'ai', body: body.id }, { tone: 'ai', gain: '结果较模糊' })}</div></div>`,
    );
  } else if (body.anomaly) {
    rows.push(
      `<div class="row anomaly"><h4>异常：${ANOMALY_NAMES[body.anomaly]}</h4><p>亲自调查得到细的结果。交给 AI 只得到粗的。</p><div class="pair">${act(ctx, '亲自调查', { type: 'investigate', mode: 'self', body: body.id }, { tone: 'self' })}${act(ctx, '交给 AI', { type: 'investigate', mode: 'ai', body: body.id }, { tone: 'ai', gain: '结果较粗' })}</div></div>`,
    );
  }

  const gain = body.resource === null ? '能源未知' : `+${body.resource} 能源`;
  rows.push(
    `<div class="row"><h4>采集</h4><p>${body.resource === null ? '勘察之后才知道这里有多少。' : `这一次能得到 ${body.resource} 能源。每采一次，下一次减半。`}</p><div class="pair">${act(ctx, '亲自采集', { type: 'harvest', mode: 'self', body: body.id }, { tone: 'self', gain })}${act(ctx, '交给 AI', { type: 'harvest', mode: 'ai', body: body.id }, { tone: 'ai', gain })}</div></div>`,
  );

  return `<section class="card"><h3>${title}</h3>${rows.join('')}</section>`;
}

export function systemScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const here = view.systems.find((s) => s.current)!;
  const body = view.bodies.find((b) => b.id === ctx.ui.body) ?? null;
  const probeYears = ctx.store.can({ type: 'probe' }) === null ? '发射之后要等回音' : '';

  const systemActions = `
    <section class="card">
      <h3>${here.code === here.name ? here.name : `${here.code} ${here.name}`}<small>${here.starLabel}</small></h3>
      <p>${here.role}</p>
      <div class="row">
        <h4>采能阵列 <small>这里已有 ${here.arrays} 座，最多 ${B.build.maxPerSystem} 座；每年收入 ${num(view.incomePerYear, 2)}</small></h4>
        <div class="pair">
          ${act(ctx, '亲手点火', { type: 'build', mode: 'self', skill: 0 }, { tone: 'self', game: 'ignite' })}
          ${act(ctx, '交给 AI', { type: 'build', mode: 'ai' }, { tone: 'ai' })}
        </div>
      </div>
      <div class="row">
        <h4>探测器 <small>派往 K-41，旧信号的来源</small></h4>
        <div class="pair">${act(ctx, '发射探测器', { type: 'probe' }, { gain: probeYears })}</div>
        ${view.probes.filter((p) => !p.reported).map((p) => `<p class="note">在途：预计第 ${p.reportYear} 年有回音。</p>`).join('')}
      </div>
      <div class="row">
        <h4>冷眠等待 <small>世界照常运转，你不花清醒日</small></h4>
        <div class="pair">
          ${act(ctx, '等 10 年', { type: 'wait', years: 10 }, { tone: 'ai' })}
          ${act(ctx, '等 50 年', { type: 'wait', years: 50 }, { tone: 'ai' })}
        </div>
      </div>
    </section>`;

  return `
    ${hint(ctx)}
    <canvas class="view" data-draw="system"></canvas>
    <div class="chips">${view.bodies
      .map((b) => `<button data-ui="body" data-arg="${b.id}" class="${b.id === ctx.ui.body ? 'on' : ''} ${b.anomaly ? 'flag' : ''}">${escapeHtml(b.given ?? b.name)}</button>`)
      .join('')}</div>
    <p class="caption">点一个天体。黄色表示那里有已知的异常。</p>
    ${body ? bodyCard(ctx, body) : ''}
    ${systemActions}`;
}

// ---------------------------------------------------------------- 星图

export function mapScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const dest = view.systems.find((s) => s.id === ctx.ui.dest && !s.current) ?? null;
  let card = '<p class="caption">点一颗恒星，看去那里要花什么。</p>';

  if (dest?.travel) {
    const t = dest.travel;
    const sling =
      view.slingshot === null
        ? `<p class="note">弹弓还没做。启航时 AI 会按保守方案做，加速 ${Math.round(B.slingshot.ai * SYSTEMS[view.location].slingshot * 100)}%。</p>
           <div class="pair">${act(ctx, '亲手做弹弓', { type: 'slingshot', skill: 0 }, { tone: 'self', game: 'slingshot' })}</div>`
        : `<p class="note">弹弓已就绪：下一程加速 ${Math.round(view.slingshot * 100)}%。</p>`;
    card = `
      <section class="card">
        <h3>${dest.code === dest.name ? dest.name : `${dest.code} ${dest.name}`}<small>${dest.starLabel}${dest.visited ? ' · 去过' : ''}</small></h3>
        <p>${dest.role}</p>
        <dl class="facts">
          <div><dt>距离</dt><dd>${t.distance} 光年</dd></div>
          <div><dt>航速</dt><dd>${speedLabel(t.speed)}</dd></div>
          <div><dt>路上</dt><dd>${t.years} 年</dd></div>
          <div><dt>耗能</dt><dd>${t.energy}</dd></div>
        </dl>
        <div class="row">${sling}</div>
        <div class="row"><div class="pair">${act(ctx, '启航', { type: 'depart', to: dest.id }, { tone: 'ai' })}</div></div>
      </section>`;
  }

  return `
    ${hint(ctx)}
    <canvas class="view map" data-draw="map"></canvas>
    <div class="chips">${view.systems
      .filter((s) => !s.current)
      .map((s) => `<button data-ui="dest" data-arg="${s.id}" class="${s.id === ctx.ui.dest ? 'on' : ''} ${s.anomalyHint ? 'flag' : ''}">${s.code === s.name ? s.name : `${s.code} ${s.name}`}</button>`)
      .join('')}</div>
    ${view.research.find((l) => l.id === 'cosmology')!.level >= B.research.cosmology.markMapAt ? '<p class="caption">黄色方块：宇宙规律研究标出那里有值得调查的东西。</p>' : ''}
    ${card}`;
}

// ---------------------------------------------------------------- 科研

export function researchScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const lines = view.research
    .map((line) => {
      const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < line.level ? 'on' : ''}"></i>`).join('');
      const prev = line.level === 0 ? 0 : (B.research.thresholds[line.level - 1] ?? 0);
      const progress = line.next === null ? '<p class="note">已到最高级。</p>' : `${meter(line.points - prev, line.next - prev)}<p class="note">${num(line.points)} / ${line.next} 点</p>`;
      return `
        <section class="card line">
          <h3>${LINE_NAMES[line.id]}<small class="pips">${pips}</small></h3>
          <p>${LINE_EFFECTS[line.id]}</p>
          ${progress}
          <label class="share">算力份额 <output>${Math.round(line.share * 100)}%</output>
            <input type="range" min="0" max="100" step="5" value="${Math.round(line.share * 100)}" data-share="${line.id}" />
          </label>
        </section>`;
    })
    .join('');

  return `
    ${hint(ctx)}
    <section class="card">
      <h3>算力<small>每个世界年 ${num(view.computePerYear, 2)} 点</small></h3>
      <p>科研由整个 AI 文明在世界年里完成：巡航、等待、交给 AI 做事的时候都在进行。算力随能源收入增长，你决定它怎么分。</p>
    </section>
    ${lines}`;
}

// ---------------------------------------------------------------- 朝堂

function effects(def: CourtDef, decision: 'sign' | 'veto'): string {
  const parts: string[] = [];
  const support = decision === 'sign' ? def.sign.support : def.veto.support;
  if (decision === 'sign') {
    if (def.sign.beacons) parts.push('建成一座信标');
    if (def.sign.energy) parts.push(`花 ${-def.sign.energy} 能源`);
    if (def.sign.researchRate) parts.push(`科研速度永久降为 ${Math.round(def.sign.researchRate * 10)} 成`);
    if (def.sign.researchPoints) parts.push(`四条科研线各前进 ${def.sign.researchPoints} 点`);
  } else {
    parts.push('权威小幅上升');
  }
  for (const f of FACTION_IDS) {
    const delta = support?.[f];
    if (delta) parts.push(`${FACTIONS[f].name}的支持${delta > 0 ? '上升' : '下降'}`);
  }
  return `${parts.join('；')}。`;
}

export function courtScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const standing = `
    <section class="card">
      <h3>你的权威<small>${num(view.authority)}</small></h3>
      ${meter(view.authority, 100, '', B.authority.threshold)}
      <p class="note">到场、亲自做事、否决，权威上升；长睡和放权，权威下降。低于 ${B.authority.threshold} 时，你签下的回应没有人执行。</p>
      ${FACTION_IDS.map(
        (f) => `<div class="faction"><span>${FACTIONS[f].name}<small>${FACTIONS[f].chief}</small></span>${meter(view.support[f], 100, 'thin', B.authority.lowSupport)}<output>${num(view.support[f])}</output></div>`,
      ).join('')}
      <p class="note">一派的支持低于 ${B.authority.lowSupport} 时会各行其是，每次启航都折损你的权威。</p>
    </section>`;

  let pending = '<section class="card"><h3>没有待决的事</h3><p>需要你签字的事，会在抵达某些星系时提出。</p></section>';
  if (view.pending) {
    const def = COURT[view.pending];
    const reports = ctx.scribe
      .courtReports(def.id, view)
      .map((r) => `<blockquote><cite>${r.speaker}<small>${r.role}</small></cite>${escapeHtml(r.text)}</blockquote>`)
      .join('');
    pending = `
      <section class="card pending">
        <h3>${def.title}<small>${def.proposerName}提请</small></h3>
        <p>${def.ask}</p>
        ${reports}
        <div class="row"><h4>签字</h4><p>${effects(def, 'sign')}这一步收不回。</p>
          <div class="pair">${act(ctx, '签字', { type: 'rule', item: def.id, decision: 'sign' }, { confirm: `签署“${def.title}”。这一步收不回。` })}</div></div>
        <div class="row"><h4>否决</h4><p>${effects(def, 'veto')}</p>
          <div class="pair">${act(ctx, '否决', { type: 'rule', item: def.id, decision: 'veto' })}</div></div>
      </section>`;
  }

  const past = COURT_IDS.filter((id) => view.rulings[id])
    .map((id) => `<li>${COURT[id].title}：<b>${view.rulings[id] === 'sign' ? '已签署' : '已否决'}</b></li>`)
    .join('');

  return `${hint(ctx)}${pending}${standing}${past ? `<section class="card"><h3>已裁决</h3><ul class="plain">${past}</ul></section>` : ''}`;
}

// ---------------------------------------------------------------- 推理

function evidenceCard(o: Observation): string {
  const quality =
    o.kind === 'signal' ? `清晰度 ${o.clarity.toFixed(2)}` : o.kind === 'probe' ? (o.status === 'arrived' ? '已抵达' : '失联') : o.fine ? '细' : '粗';
  let figure = '';
  if (o.kind === 'signal') figure = `<canvas class="chart" data-draw="evidence" data-id="${o.id}"></canvas>`;
  else if (o.kind === 'infrared') figure = o.grid ? `<canvas class="chart square" data-draw="evidence" data-id="infrared"></canvas><p class="caption">K-41 周围的红外图。十字是恒星的位置，它的光已扣除。</p>` : '';
  else if (o.kind === 'ruins') figure = o.cells ? `<canvas class="chart square" data-draw="evidence" data-id="ruins"></canvas><p class="caption">损毁分布：越亮损毁越重，短线是断口的朝向。</p>` : '';
  return `
    <section class="card evidence">
      <h3>${EVIDENCE_NAMES[o.id]}<small>${EVIDENCE_SOURCES[o.id]} · 第 ${o.year} 年 · ${quality}</small></h3>
      ${figure}
      <ul class="plain facts-list">${o.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    </section>`;
}

export function boardScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const have = new Map(view.evidence.map((o) => [o.id, o]));
  const real: EvidenceId[] = ['signal', 'infrared', 'ruins', 'probe'];
  const missing = real.filter((id) => !have.has(id));

  const cards = view.evidence.map(evidenceCard).join('');
  const todo = missing.length
    ? `<p class="caption">还没有取得：${missing.map((id) => `${EVIDENCE_NAMES[id]}（${EVIDENCE_SOURCES[id]}）`).join('，')}。</p>`
    : '';

  const head = TRUTH_IDS.map((t) => `<th class="${view.eliminated === t ? 'out' : ''}">${TRUTHS[t].name}</th>`).join('');
  const rows = view.evidence
    .map((o) => {
      const cells = TRUTH_IDS.map((t) => {
        const mark = view.board[`${o.id}:${t}`] ?? 'unknown';
        const next = mark === 'unknown' ? 'support' : mark === 'support' ? 'against' : 'unknown';
        const symbol = mark === 'support' ? '支持' : mark === 'against' ? '反对' : '·';
        const action: Action = { type: 'mark', evidence: o.id, truth: t, mark: next };
        return `<td><button class="mark ${mark}" data-act="${escapeHtml(JSON.stringify(action))}">${symbol}</button></td>`;
      }).join('');
      return `<tr><th>${EVIDENCE_NAMES[o.id]}</th>${cells}</tr>`;
    })
    .join('');

  const table = view.evidence.length
    ? `<table class="board"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
       <p class="caption">点格子，标注这条证据支持还是反对这种解释。系统不代填。</p>`
    : '<p>还没有证据。证据要到各个星系去取，或者派探测器。</p>';

  const theories = TRUTH_IDS.map(
    (t) => `<li class="${view.eliminated === t ? 'out' : ''}"><b>${TRUTHS[t].name}</b>：${TRUTHS[t].summary}${view.eliminated === t ? '（宇宙规律研究已排除）' : ''}</li>`,
  ).join('');

  const pick = (kind: 'conclusion' | 'response', id: string, label: string, text: string, on: boolean): string =>
    `<button class="choice ${on ? 'on' : ''}" data-ui="${kind}" data-arg="${id}"><b>${label}</b><span>${text}</span></button>`;

  const ready = ctx.ui.conclusion && ctx.ui.response;
  const concludeAction: Action | null = ready ? { type: 'conclude', conclusion: ctx.ui.conclusion!, response: ctx.ui.response! } : null;
  const conclude = `
    <section class="card conclude">
      <h3>下结论<small>这一步结束远征，收不回</small></h3>
      <h4>第一步：沉默的原因是哪一种</h4>
      <div class="choices">${TRUTH_IDS.map((t) => pick('conclusion', t, TRUTHS[t].name, TRUTHS[t].summary, ctx.ui.conclusion === t)).join('')}</div>
      <h4>第二步：签署一项回应</h4>
      <div class="choices">${RESPONSE_IDS.map((r) => pick('response', r, RESPONSES[r].name, RESPONSES[r].text, ctx.ui.response === r)).join('')}</div>
      <p class="note">只说对原因不够，回应也要对，还要有足够的权威把它推行下去。你现在的权威是 ${num(view.authority)}。</p>
      <div class="pair">${
        concludeAction
          ? act(ctx, '签署', concludeAction, { confirm: `结论：${TRUTHS[ctx.ui.conclusion!].name}。回应：${RESPONSES[ctx.ui.response!].name}。签下之后远征结束。` })
          : '<button class="btn plain" disabled><span>签署</span><small>先选结论和回应</small></button>'
      }</div>
    </section>`;

  return `
    ${hint(ctx)}
    <section class="card"><h3>三种解释</h3><ul class="plain">${theories}</ul></section>
    ${cards}${todo}
    <section class="card"><h3>推理板</h3>${table}</section>
    ${conclude}`;
}

// ---------------------------------------------------------------- 记录

export function recordScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const album = view.album.length
    ? `<div class="album">${view.album
        .map(
          (a) => `<button class="shot" data-ui="scene" data-arg="${a.body}"><canvas data-draw="thumb" data-id="${a.body}"></canvas><span>${escapeHtml(a.given ?? a.name)}</span></button>`,
        )
        .join('')}</div>`
    : '<p>还没有存下风景。去看一个天体，它就会留在这里。</p>';

  const log = [...view.log]
    .reverse()
    .map((e) => `<li><time>第 ${e.year} 年</time>${escapeHtml(ctx.scribe.logLine(e))}</li>`)
    .join('');

  return `
    <section class="card"><h3>相册<small>${view.album.length} 处</small></h3>${album}</section>
    <section class="card"><h3>航行日志</h3><ol class="log">${log}</ol></section>
    <section class="card"><h3>这一局</h3><div class="pair">${ui('放弃这一局，重新开始', 'restart')}</div></section>`;
}

// ---------------------------------------------------------------- 结局

export function endingScreen(ctx: Ctx): string {
  const view = ctx.store.view();
  const end = view.ending!;
  const truth = TRUTHS[end.truth];
  const verdict = ctx.scribe.verdict(view).map((l) => `<p>${escapeHtml(l)}</p>`).join('');

  const drivers: [string, number, number | null][] = [
    ['时间：世界过去了多少年', end.fate.time, end.weights.time],
    ['显眼度：阵列、信标、探测器', end.fate.conspicuity, end.weights.conspicuity],
    ['放权度：交给 AI 做了多少年的事', end.fate.delegation, end.weights.delegation],
    ['签字的后果', end.fate.signed, null],
  ];
  const driverRows = drivers
    .map(([label, value, weight]) => `<div class="faction"><span>${label}${weight === null ? '' : `<small>权重 ${Math.round(weight * 100)}%</small>`}</span>${meter(value, 100, 'thin')}<output>${num(value)}</output></div>`)
    .join('');

  const court = COURT_IDS.map((id) => {
    const def = COURT[id];
    const ruling = view.rulings[id];
    const trap = def.trap.truth === end.truth;
    const mine = ruling === 'sign' ? '你签了' : ruling === 'veto' ? '你否决了' : '你没有遇到';
    return `<li>${def.title}：${mine}。${trap ? '<b>在这种真相下它是陷阱。</b>' : `它在“${TRUTHS[def.trap.truth].name}”的局里才是陷阱。`}</li>`;
  }).join('');

  const got = new Set(view.evidence.map((o) => o.id));
  const table: [EvidenceId, string, readonly string[]][] = [
    ['signal', '旧信号', [truth.evidence.signal.detail]],
    ['infrared', '红外', truth.evidence.infrared.fine],
    ['ruins', '遗迹', truth.evidence.ruins.fine],
    ['probe', '探测器', truth.evidence.probe.facts],
  ];
  const evidence = table
    .map(([id, name, facts]) => `<li><b>${name}</b>${got.has(id) ? '' : '（你没有取得）'}：${facts.map(escapeHtml).join('')}</li>`)
    .join('');

  const record = ctx.store.record();
  const summary = [
    `种子 ${record.seed}`,
    `真相 ${truth.name}`,
    `结论 ${end.conclusion ? TRUTHS[end.conclusion].name : '无'}`,
    `回应 ${end.response ? RESPONSES[end.response].name : '无'}`,
    `结局 ${ENDING_NAMES[end.id]}`,
    `第 ${end.year} 年`,
    `命运 ${num(view.fate)}`,
    `权威 ${num(view.authority)}`,
    `清醒日 ${view.wakeDays}`,
    `操作 ${record.actions.length} 步`,
  ].join(' · ');

  return `
    <section class="card ending ${end.id}">
      <p class="eyebrow">史官定论</p>
      <h2>${ENDING_NAMES[end.id]}</h2>
      ${verdict}
    </section>
    <section class="card">
      <h3>真相：${truth.name}</h3>
      <p>${truth.summary}</p>
      <p>对的回应是“${RESPONSES[truth.response].name}”：${RESPONSES[truth.response].text}</p>
    </section>
    <section class="card">
      <h3>命运是怎么涨起来的<small>结局时 ${num(view.fate)}</small></h3>
      <p>进度条背后有三个驱动，不同的真相给它们不同的权重。</p>
      ${driverRows}
      <canvas class="chart" data-draw="fate"></canvas>
      <p class="caption">加粗的线段是命运上涨的时候。<span class="k sleep">灰</span>冷眠 <span class="k delegate">青</span>交给 AI <span class="k build">黄</span>建设与探测器 <span class="k rule">红</span>签字</p>
    </section>
    <section class="card"><h3>三件需要签字的事</h3><ul class="plain">${court}</ul></section>
    <section class="card"><h3>这种真相留下的证据</h3><ul class="plain">${evidence}</ul></section>
    <section class="card">
      <h3>对局记录</h3>
      <p class="mono" id="summary">${summary}</p>
      <div class="pair">${ui('复制对局记录', 'copy')}${ui('再来一局', 'restart')}</div>
    </section>`;
}
