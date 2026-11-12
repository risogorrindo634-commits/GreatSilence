/**
 * 引导：从视图算出“下一步”和每条线索的进展。只读视图，不碰状态，也不解释证据的含义。
 * 模拟对局（scripts/sim.ts）也按这里的“下一步”走，用来检验引导能把一局带到底。
 */
import { BALANCE as B } from '../content/balance';
import { LEADS } from '../content/leads';
import { RELICS } from '../content/relics';
import { PROBE_TARGET, SYSTEMS, distance } from '../content/systems';
import type { SystemId } from '../content/systems';
import type { LeadId, LeadView, PublicView, RelicId } from '../core/types';

/** 离 K-41 这么近，就建议在这里发射探测器。 */
const PROBE_NEAR = 25;

export function placeName(id: SystemId): string {
  const s = SYSTEMS[id];
  return s.code === s.name ? s.name : `${s.code} ${s.name}`;
}

/** 中文和西文、数字之间留一个空格：“在 M-7 晨昏”，“在故乡”。 */
export function gap(text: string): string {
  return /^[A-Za-z0-9]/.test(text) ? ` ${text}` : text;
}

export type Next =
  | { kind: 'court' }
  | { kind: 'here'; lead: LeadId }
  | { kind: 'relic'; relic: RelicId }
  | { kind: 'detour'; to: SystemId; relic: RelicId; energy: number; target: SystemId; short: number }
  | { kind: 'probe'; distance: number; short: number }
  | { kind: 'travel'; to: SystemId; lead: LeadId; energy: number; short: number }
  | { kind: 'wait'; year: number }
  | { kind: 'refine'; lead: LeadId }
  | { kind: 'conclude' }
  | { kind: 'none' };

export function nextTarget(view: PublicView): Next {
  if (view.ending) return { kind: 'none' };
  if (view.pending) return { kind: 'court' };

  const open = view.leads.filter((l) => l.status === 'open');
  const here = open.find((l) => LEADS[l.id].system === view.location);
  if (here) return { kind: 'here', lead: here.id };
  const relic = view.relics.find((r) => !r.taken && RELICS[r.id].system === view.location);
  if (relic) return { kind: 'relic', relic: relic.id };

  const toK41 = distance(SYSTEMS[view.location].pos, PROBE_TARGET.pos);
  const probeOpen = open.some((l) => l.id === 'probe');
  const targets = view.systems
    .filter((s) => !s.current && s.lead === 'open' && s.travel)
    .sort((a, b) => a.travel!.distance - b.travel!.distance);

  if (probeOpen && (targets.length === 0 || toK41 <= PROBE_NEAR)) {
    return { kind: 'probe', distance: toK41, short: Math.max(0, Math.ceil(B.probe.energy - view.energy)) };
  }
  const to = targets[0];
  if (to) {
    const lead = open.find((l) => LEADS[l.id].system === to.id)!;
    const short = Math.max(0, Math.ceil(to.travel!.energy - view.energy));
    // 能源不够时，如果有一处知道的能源储备去得了，建议先绕过去。
    if (short > 0) {
      const cache = view.relics
        .filter((r) => !r.taken && RELICS[r.id].reward.energy)
        .map((r) => ({ r, sys: view.systems.find((s) => s.id === RELICS[r.id].system)! }))
        .filter(({ sys }) => !sys.current && sys.travel && sys.travel.energy <= view.energy)
        .sort((a, b) => a.sys.travel!.distance - b.sys.travel!.distance)[0];
      if (cache) return { kind: 'detour', to: cache.sys.id, relic: cache.r.id, energy: cache.sys.travel!.energy, target: to.id, short };
    }
    return { kind: 'travel', to: to.id, lead: lead.id, energy: to.travel!.energy, short };
  }

  const flying = view.probes.filter((p) => !p.reported);
  if (flying.length > 0) return { kind: 'wait', year: Math.min(...flying.map((p) => p.etaYear)) };
  const partial = view.leads.find((l) => l.status === 'partial');
  if (partial) return { kind: 'refine', lead: partial.id };
  return { kind: 'conclude' };
}

/** 读数栏下面那一行。 */
export function nextStep(view: PublicView): string {
  const next = nextTarget(view);
  switch (next.kind) {
    case 'none':
      return '';
    case 'court':
      return '朝堂上有一件事等你裁决。裁决之前不能启航。';
    case 'here':
      return `这里有线索“${LEADS[next.lead].title}”：${LEADS[next.lead].task}。`;
    case 'relic':
      return `这里有遗物“${RELICS[next.relic].title}”。亲自去取能读到完整的记录。`;
    case 'detour':
      return `能源不够直接去${gap(placeName(next.target))}（还差 ${next.short}）。${placeName(next.to)}有“${RELICS[next.relic].title}”，路上只要 ${next.energy} 能源，可以先去那里补充。`;
    case 'probe':
      return next.short > 0
        ? `发射一艘探测器去 K-41。要 ${B.probe.energy} 能源，还差 ${next.short}：先补给。`
        : `发射一艘探测器去 K-41，这里离它 ${next.distance} 光年。`;
    case 'travel': {
      const where = `去${gap(placeName(next.to))}，那里有线索“${LEADS[next.lead].title}”。`;
      return next.short > 0 ? `${where}路上要 ${next.energy} 能源，还差 ${next.short}：先补给。` : `${where}在“星图”里选它，然后启航。`;
    }
    case 'wait':
      return `线索都去过了。探测器还在路上，一切顺利的话第 ${next.year} 年有回音。可以冷眠等它，也可以先去“推理”下结论。`;
    case 'refine':
      return `线索都去过了。可以去“推理”下结论，也可以回去把“${LEADS[next.lead].title}”看得更细。`;
    case 'conclude':
      return '线索都已取得。去“推理”把它们拼起来，下结论。';
  }
}

/** 一条线索现在的情况，写在线索列表里。 */
export function leadNote(view: PublicView, lead: LeadView): string {
  const def = LEADS[lead.id];
  if (lead.status === 'done') return '已取得，在“推理”里。';
  const where = def.system ? `在${gap(placeName(def.system))}。` : '';
  switch (def.evidence) {
    case 'ruins':
    case 'infrared':
      return lead.status === 'open' ? where : 'AI 看过，结果较粗。亲自调查能看得更细。';
    case 'signal':
    case 'pulsar': {
      if (lead.status === 'open') return where;
      const seen = view.evidence.find((o) => o.id === def.evidence);
      const clarity = seen && seen.kind === 'signal' ? seen.clarity.toFixed(2) : '?';
      return def.evidence === 'signal' ? `清晰度 ${clarity}。调得更准，能读到更多。` : `清晰度 ${clarity}，还分辨不出它的来历。`;
    }
    case 'probe': {
      if (view.probes.length === 0) return '还没有派出探测器。';
      const reported = view.probes.filter((p) => p.reported).length;
      const flying = view.probes.filter((p) => !p.reported);
      const parts: string[] = [];
      if (reported > 0) parts.push(`已有 ${reported} 艘的消息。`);
      if (flying.length > 0) parts.push(`${flying.length} 艘在路上，一切顺利的话第 ${Math.min(...flying.map((p) => p.etaYear))} 年有回音。`);
      return parts.join('');
    }
  }
}
