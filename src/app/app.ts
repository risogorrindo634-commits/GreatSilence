/**
 * 界面的外壳：把视图画出来，把点击变成操作。
 * 每次状态变化都整页重画；画面很小，这样最简单。
 */
import { SYSTEMS, findBody } from '../content/systems';
import type { SystemId } from '../content/systems';
import type { ResponseId, TruthId } from '../content/truths';
import type { Action, LineId, PublicView } from '../core/types';
import { drawCruise, drawFateCurve, drawInfrared, drawMap, drawProbes, drawRuins, drawScene, drawSignal, drawSystem } from './draw';
import type { Hit } from './draw';
import { EVIDENCE_NAMES, escapeHtml, num } from './labels';
import { playIgnition, playSlingshot, playTuning } from './minigames';
import { boardScreen, courtScreen, endingScreen, header, mapScreen, recordScreen, researchScreen, systemScreen, tabs } from './screens';
import type { Ctx, Tab, UiState } from './screens';
import type { Scribe } from './scribe';
import type { Store } from './store';

const INTRO = [
  '你是未来文明里最后一位人类执政官。',
  '宇宙里本该到处是文明，却一片沉默。在同样的命运降临之前，带领一个由 AI 运转的文明弄清楚：它们都去哪了。',
  '任何事 AI 都能代劳。亲自做，花的是你的清醒日；交给 AI，花的是世界的时间。',
  '证据要你自己去看。看懂了，就下结论，并签署一项收不回的回应。',
];

function sceneSeed(body: string): number {
  let h = 2166136261;
  for (const ch of body) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function startApp(root: HTMLElement, store: Store, scribe: Scribe): void {
  const ui: UiState = { tab: 'system', body: null, dest: null, conclusion: null, response: null, seenEvidence: 0, sawResearch: false };
  const ctx: Ctx = { store, scribe, ui };
  let systemHits: Hit[] = [];
  let mapHits: Hit[] = [];
  let delta = '';
  let frame = 0;

  // ------------------------------------------------------------ 弹出层

  function modal(html: string, cls = ''): HTMLElement {
    const el = document.createElement('div');
    el.className = `modal ${cls}`;
    el.innerHTML = `<div class="sheet">${html}</div>`;
    document.body.appendChild(el);
    return el;
  }

  function confirm(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      const el = modal(`<p>${escapeHtml(text)}</p><div class="pair"><button class="btn plain" data-no><span>再想想</span></button><button class="btn danger" data-yes><span>确认</span></button></div>`);
      const close = (ok: boolean): void => {
        el.remove();
        resolve(ok);
      };
      el.querySelector('[data-yes]')!.addEventListener('click', () => close(true));
      el.querySelector('[data-no]')!.addEventListener('click', () => close(false));
    });
  }

  function showIntro(): void {
    const el = modal(`<p class="eyebrow">大沉默</p>${INTRO.map((l) => `<p>${l}</p>`).join('')}<div class="pair"><button class="btn self"><span>醒来</span></button></div>`);
    el.querySelector('button')!.addEventListener('click', () => el.remove());
  }

  function showScene(bodyId: string): void {
    const found = findBody(bodyId);
    if (!found) return;
    const view = store.view();
    const given = view.album.find((a) => a.body === bodyId)?.given ?? null;
    const sys = SYSTEMS[found.system];
    const wonder = found.body.wonder ? `<p class="note"><b>${found.body.wonder.name}</b>　依据：${found.body.wonder.basis}</p>` : '';
    const el = modal(
      `<canvas class="scene"></canvas>
       <h3>${escapeHtml(given ?? found.body.name)}<small>${sys.code} · ${sys.starLabel}</small></h3>
       <p>${found.body.scene}</p>${wonder}
       <label class="naming">给它起个名字<input type="text" maxlength="12" value="${escapeHtml(given ?? '')}" placeholder="${found.body.name}" /></label>
       <div class="pair"><button class="btn plain" data-name><span>命名</span><small>名字留在星图上</small></button><button class="btn self" data-close><span>存进相册</span></button></div>`,
      'scene-modal',
    );
    drawScene(el.querySelector('canvas')!, {
      kind: found.body.kind,
      star: sys.star,
      seed: sceneSeed(bodyId),
      caption: `${sys.code} / ${found.body.name} / 第 ${view.year} 年传回`,
    });
    const input = el.querySelector('input')!;
    el.querySelector('[data-close]')!.addEventListener('click', () => el.remove());
    el.querySelector('[data-name]')!.addEventListener('click', () => {
      const action: Action = { type: 'name', body: bodyId, name: input.value };
      if (store.can(action) === null) {
        store.dispatch(action);
        el.remove();
      } else {
        input.focus();
      }
    });
  }

  /** 巡航的快进画面，然后是抵达的简报。 */
  function showCruise(before: PublicView, since: number): void {
    const view = store.view();
    const leg = view.log.slice(since).find((e) => e.t === 'arrive');
    const speed = leg && leg.t === 'arrive' ? leg.speed : view.speed;
    const el = modal(`<canvas class="scene"></canvas><p class="year"></p><div class="brief"></div>`, 'cruise');
    const canvas = el.querySelector('canvas')!;
    const year = el.querySelector<HTMLElement>('.year')!;
    const start = performance.now();
    const duration = 3200;

    const tick = (now: number): void => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / duration);
      drawCruise(canvas, speed, (now - start) / 1000);
      year.textContent = `冷眠中 · 远征第 ${Math.round(before.year + (view.year - before.year) * t)} 年 · ${speed.toFixed(2)}c`;
      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }
      const lines = scribe.briefing(view, since);
      el.querySelector('.brief')!.innerHTML = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<div class="pair"><button class="btn self"><span>醒来</span></button></div>`;
      el.querySelector('button')!.addEventListener('click', () => el.remove());
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ 状态变化的提示

  function describeDelta(before: PublicView, after: PublicView, action: Action): string {
    if (action.type === 'mark' || action.type === 'name' || action.type === 'research') return '';
    const parts: string[] = [];
    const signed = (x: number, digits = 0): string => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;
    if (after.year > before.year) parts.push(`<b class="ai">世界过去了 ${after.year - before.year} 年</b>`);
    if (after.wakeDays !== before.wakeDays) parts.push(`<b class="self">清醒日 ${signed(after.wakeDays - before.wakeDays)}</b>`);
    if (Math.abs(after.energy - before.energy) >= 0.5) parts.push(`能源 ${signed(after.energy - before.energy)}`);
    if (Math.abs(after.authority - before.authority) >= 0.05) parts.push(`权威 ${signed(after.authority - before.authority, 1)}`);
    // 命运只报格数，不报数值。
    if (after.fateLevel > before.fateLevel) parts.push(`<b class="fate-up">同样的命运近了 ${after.fateLevel - before.fateLevel} 格</b>`);
    const had = new Map(before.evidence.map((o) => [o.id, JSON.stringify(o.facts)]));
    for (const o of after.evidence) {
      if (!had.has(o.id)) parts.push(`取得证据：${EVIDENCE_NAMES[o.id]}`);
      else if (had.get(o.id) !== JSON.stringify(o.facts)) parts.push(`证据更清楚了：${EVIDENCE_NAMES[o.id]}`);
    }
    return parts.join(' · ');
  }

  // ------------------------------------------------------------ 执行操作

  async function perform(action: Action, button: HTMLElement): Promise<void> {
    if (store.can(action) !== null) return;

    if (button.dataset.confirm && !(await confirm(button.dataset.confirm))) return;

    let final = action;
    const game = button.dataset.game;
    if (game) {
      const skill = await (game === 'slingshot' ? playSlingshot() : game === 'tune' ? playTuning() : playIgnition());
      if (skill === null) return;
      if (action.type === 'slingshot') final = { ...action, skill };
      else if (action.type === 'tune' && action.mode === 'self') final = { ...action, skill };
      else if (action.type === 'build' && action.mode === 'self') final = { ...action, skill };
      if (store.can(final) !== null) return;
    }

    const before = store.view();
    const since = before.log.length;
    delta = '';
    store.dispatch(final);
    const after = store.view();
    delta = describeDelta(before, after, final);

    if (final.type === 'depart') {
      ui.tab = 'system';
      ui.body = null;
      ui.dest = null;
      render();
      window.scrollTo(0, 0);
      showCruise(before, since);
      return;
    }
    if (final.type === 'view') showScene(final.body);
    render();
  }

  // ------------------------------------------------------------ 重画

  function paint(): void {
    const view = store.view();
    cancelAnimationFrame(frame);
    for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-draw]')) {
      const kind = canvas.dataset.draw;
      if (kind === 'system') {
        const loop = (now: number): void => {
          if (!canvas.isConnected) return;
          systemHits = drawSystem(canvas, store.view(), ui.body, now / 4000);
          frame = requestAnimationFrame(loop);
        };
        loop(performance.now());
      } else if (kind === 'map') {
        mapHits = drawMap(canvas, view, ui.dest);
      } else if (kind === 'evidence') {
        const o = view.evidence.find((e) => e.id === canvas.dataset.id);
        if (o?.kind === 'signal') drawSignal(canvas, o.series);
        else if (o?.kind === 'infrared' && o.grid) drawInfrared(canvas, o.grid);
        else if (o?.kind === 'ruins' && o.cells) drawRuins(canvas, o.cells);
        else if (o?.kind === 'probe') drawProbes(canvas, o.reports);
      } else if (kind === 'thumb') {
        const found = findBody(canvas.dataset.id ?? '');
        if (found) drawScene(canvas, { kind: found.body.kind, star: SYSTEMS[found.system].star, seed: sceneSeed(found.body.id), caption: '' });
      } else if (kind === 'fate') {
        drawFateCurve(canvas, store.history());
      }
    }
  }

  function render(): void {
    const view = store.view();
    if (view.ending) {
      root.innerHTML = `${header(view)}<main class="end">${endingScreen(ctx)}</main>`;
      paint();
      return;
    }
    if (ui.tab === 'board') ui.seenEvidence = view.evidence.length;
    if (ui.tab === 'research') ui.sawResearch = true;
    const screens: Record<Tab, () => string> = {
      system: () => systemScreen(ctx),
      map: () => mapScreen(ctx),
      research: () => researchScreen(ctx),
      court: () => courtScreen(ctx),
      board: () => boardScreen(ctx),
      record: () => recordScreen(ctx),
    };
    const legend = '<p class="legend"><i class="self"></i>花你的清醒日 <i class="ai"></i>花世界的时间</p>';
    root.innerHTML = `${header(view)}${delta ? `<p class="delta">${delta}</p>` : legend}<main>${screens[ui.tab]()}</main>${tabs(ctx)}`;
    paint();
  }

  // ------------------------------------------------------------ 事件

  function pick(hits: Hit[], canvas: HTMLCanvasElement, e: MouseEvent): string | null {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Hit | null = null;
    for (const hit of hits) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d <= hit.r && (!best || d < Math.hypot(best.x - x, best.y - y))) best = hit;
    }
    return best?.id ?? null;
  }

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const canvas = target.closest<HTMLCanvasElement>('canvas[data-draw]');
    if (canvas?.dataset.draw === 'system') {
      ui.body = pick(systemHits, canvas, e) ?? ui.body;
      render();
      return;
    }
    if (canvas?.dataset.draw === 'map') {
      const id = pick(mapHits, canvas, e) as SystemId | null;
      if (id) ui.dest = id;
      render();
      return;
    }

    const actor = target.closest<HTMLElement>('[data-act]');
    if (actor?.dataset.act) {
      void perform(JSON.parse(actor.dataset.act) as Action, actor);
      return;
    }

    const control = target.closest<HTMLElement>('[data-ui]');
    if (!control) return;
    const arg = control.dataset.arg ?? '';
    switch (control.dataset.ui) {
      case 'tab':
        ui.tab = arg as Tab;
        delta = '';
        render();
        window.scrollTo(0, 0);
        break;
      case 'scene':
        showScene(arg);
        break;
      case 'body':
        ui.body = arg;
        render();
        break;
      case 'dest':
        ui.dest = arg as SystemId;
        render();
        break;
      case 'conclusion':
        ui.conclusion = arg as TruthId;
        render();
        break;
      case 'response':
        ui.response = arg as ResponseId;
        render();
        break;
      case 'copy': {
        const summary = root.querySelector('#summary')?.textContent ?? '';
        void navigator.clipboard?.writeText(`${summary}\n${JSON.stringify(store.record())}`);
        control.textContent = '已复制';
        break;
      }
      case 'restart':
        void confirm(store.view().ending ? '开始新的一局。' : '放弃这一局，重新开始。进度不会保留。').then((ok) => {
          if (!ok) return;
          Object.assign(ui, { tab: 'system', body: null, dest: null, conclusion: null, response: null, seenEvidence: 0, sawResearch: false });
          delta = '';
          store.newGame();
          render();
          window.scrollTo(0, 0);
          showIntro();
        });
        break;
    }
  });

  // 科研的份额：松手时才提交，拖动时只更新旁边的数字。
  root.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset.share) return;
    const out = input.closest('label')?.querySelector('output');
    if (out) out.textContent = `${num(Number(input.value))}%`;
  });
  root.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset.share) return;
    const allocation = {} as Record<LineId, number>;
    for (const el of root.querySelectorAll<HTMLInputElement>('input[data-share]')) allocation[el.dataset.share as LineId] = Number(el.value);
    const action: Action = { type: 'research', allocation };
    if (store.can(action) === null) store.dispatch(action);
    render();
  });

  window.addEventListener('resize', () => paint());

  render();
  if (store.view().log.length === 1) showIntro();
}
