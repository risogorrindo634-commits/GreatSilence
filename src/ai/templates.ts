/**
 * 文书的模板。灰盒阶段不接入模型，所有文字都从这里来；接入模型之后这里是兜底。
 * 口吻是录事：克制，具体，只陈述事实，不解释含义。
 * 这里的函数只拿得到视图和日志，拿不到真相。
 */
import type { Scribe } from '../app/scribe';
import { COURT, FACTIONS } from '../content/court';
import { SYSTEMS, findBody } from '../content/systems';
import { RESPONSES, TRUTHS } from '../content/truths';
import type { CourtId, EndingId, EvidenceId, LineId, LogEntry, PublicView } from '../core/types';

const LINES: Record<LineId, string> = { propulsion: '推进', longevity: '延寿', harvest: '采能', cosmology: '宇宙规律' };
const EVIDENCE: Record<EvidenceId, string> = { signal: '旧信号', infrared: '红外', ruins: '遗迹', probe: '探测器', pulsar: '周期信号' };
const ENDINGS: Record<EndingId, string> = {
  clear: '明断',
  powerless: '知而不能行',
  lucky: '侥幸',
  failed: '失察',
  undecided: '未决',
  sleep: '长眠',
};

function place(id: keyof typeof SYSTEMS): string {
  const s = SYSTEMS[id];
  return s.code === s.name ? s.name : `${s.code} ${s.name}`;
}

function bodyName(id: string): string {
  return findBody(id)?.body.name ?? id;
}

function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function logLine(e: LogEntry): string {
  switch (e.t) {
    case 'start':
      return '你被唤醒。舰队停在故乡，等你下令。';
    case 'arrive':
      return `抵达${place(e.system)}。这一程走了 ${e.years} 年，航速 ${e.speed.toFixed(2)}c。${e.first ? '' : '这里你来过。'}`;
    case 'radiation':
      return `脉冲星的辐射穿过了冷眠舱。清醒日减 ${e.days}。`;
    case 'view':
      return `你去看了${bodyName(e.body)}。`;
    case 'name':
      return `你给${bodyName(e.body)}起名“${e.name}”。此后的文书沿用这个名字。`;
    case 'survey':
      return e.mode === 'self'
        ? `你亲自勘察了一个天体。${e.found > 0 ? '发现一处异常。' : '没有新的发现。'}`
        : `AI 勘察了${place(e.system)}的全部天体。${e.found > 0 ? `发现 ${e.found} 处异常。` : '没有新的异常。'}`;
    case 'investigate':
      return e.mode === 'self'
        ? `你亲自调查了${bodyName(e.body)}。${EVIDENCE[e.evidence]}的结果已归档。`
        : `AI 调查了${bodyName(e.body)}。${EVIDENCE[e.evidence]}的结果已归档，较粗。`;
    case 'tune':
      return `${e.mode === 'self' ? '你亲手' : 'AI '}调谐了${bodyName(e.body)}收到的信号。清晰度 ${e.clarity.toFixed(2)}。`;
    case 'harvest':
      return `${e.mode === 'self' ? '你亲自' : 'AI '}在${bodyName(e.body)}采集，得能源 ${e.energy}。`;
    case 'build':
      return `${place(e.system)}的采能阵列${e.mode === 'self' ? '由你亲手点火' : '由 AI 建成'}。产出是标准值的 ${e.quality.toFixed(2)} 倍。`;
    case 'slingshot':
      return `你亲手做了引力弹弓。下一程加速 ${percent(e.boost)}。`;
    case 'probe':
      return `探测器从${place(e.from)}发往 K-41。预计远征第 ${e.reportYear} 年有回音。`;
    case 'probeReport':
      return '派往 K-41 的探测器有了回音。';
    case 'wait':
      return `冷眠等待 ${e.years} 年。`;
    case 'court':
      return `${COURT[e.item].proposerName}提请裁决：${COURT[e.item].title}。`;
    case 'rule':
      return `你${e.decision === 'sign' ? '签署' : '否决'}了：${COURT[e.item].title}。`;
    case 'level':
      return `${LINES[e.line]}科研升到第 ${e.level} 级。`;
    case 'eliminate':
      return `宇宙规律研究排除了一种解释：${TRUTHS[e.ruledOut].name}。`;
    case 'conclude':
      return `你下了结论：${TRUTHS[e.conclusion].name}。签署的回应：${RESPONSES[e.response].name}。`;
    case 'end':
      return `史官定论：${ENDINGS[e.ending]}。`;
  }
}

function briefing(view: PublicView, since: number): string[] {
  const lines = view.log.slice(since).map((e) => logLine(e));
  const here = SYSTEMS[view.location];
  lines.push(`录事：${here.starLabel}。${here.role}`);
  return lines;
}

type Report = { speaker: string; role: string; text: string };

function chief(id: keyof typeof FACTIONS): { speaker: string; role: string } {
  return { speaker: FACTIONS[id].chief, role: FACTIONS[id].name };
}

const CLERK = { speaker: '录事', role: '只陈述事实' };

function courtReports(item: CourtId, view: PublicView): Report[] {
  const energy = Math.floor(view.energy);
  switch (item) {
    case 'beacon':
      return [
        {
          ...CLERK,
          text: `建信标需能源 60，现有 ${energy}。信号一旦发出，追不回来。档案里，三百光年内没有仍在发出的人工信号。`,
        },
        { ...chief('outward'), text: '两颗恒星的功率，够让三百光年内都听见。沉默也许只是因为没人先开口。不发这一声，我们永远不知道外面有没有人。' },
        { ...chief('guard'), text: '发出去的信号收不回来。我们不知道外面有什么，这本身就是不该出声的理由。' },
        { ...chief('inward'), text: '向外喊话花的能源，本可以用在万象上。外面即使有人，也未必比里面更值得去。' },
      ];
    case 'wanxiang':
      return [
        { ...CLERK, text: `划拨是永久的。此后每年的科研算力是现在的七成，现在是每年 ${view.computePerYear.toFixed(1)} 点。` },
        { ...chief('inward'), text: '万象里已经有比这场远征更多的东西。划出三成算力不是放弃寻找，是让等待的人有地方可去。' },
        { ...chief('outward'), text: '少三成算力，推进和仪器都要慢三成。我们是出来找答案的。' },
        { ...chief('guard'), text: '向内至少是安静的。但我不喜欢“永久”二字，收不回的决定越少越好。' },
      ];
    case 'corona':
      return [
        { ...CLERK, text: '实验把装置的能量提高一档，属不可逆操作，须由你签字。科学家预计四条科研线各有一次跃升。此前各档实验均按预期完成。' },
        { speaker: '首席科学家', role: 'AI 科学家', text: '前几档的数据都落在模型之内。再上一档，四条线上卡住的问题会一起松动。' },
        { ...chief('outward'), text: '这是远征开始以来最大的一次推进。应当批准。' },
        { ...chief('guard'), text: '每一档都“按预期完成”，直到某一档不是。能量更高的装置也更容易被看见。' },
        { ...chief('inward'), text: '能在万象里做的实验，不必在真的恒星旁边做。' },
      ];
  }
}

const VERDICTS: Record<EndingId, string> = {
  clear: '执政官看懂了沉默，并让文明照着做了。',
  powerless: '执政官看懂了沉默。签下的令却没有人执行：各派早已各行其是。',
  lucky: '执政官读错了沉默。签下的令碰巧没有造成损失。',
  failed: '执政官签下的令，让文明付出了代价。',
  undecided: '同样的命运先到了。执政官没有来得及下结论。',
  sleep: '执政官没有再醒来。钥匙随之失效，此后文明只做无须签字的事。',
};

function verdict(view: PublicView): string[] {
  const end = view.ending;
  if (!end) return [];
  const lines = [VERDICTS[end.id]];

  if (end.conclusion && end.response) {
    const right = end.conclusion === end.truth;
    const fit = end.response === TRUTHS[end.truth].response;
    lines.push(`结论是“${TRUTHS[end.conclusion].name}”，${right ? '对' : '错'}。签署的回应是“${RESPONSES[end.response].name}”，${fit ? '对' : '不是这种沉默需要的回应'}。`);
  }

  const self = view.log.filter((e) => 'mode' in e && e.mode === 'self').length;
  const ai = view.log.filter((e) => 'mode' in e && e.mode === 'ai').length;
  lines.push(`远征历时 ${end.year} 年。执政官亲自做了 ${self} 件事，交给 AI ${ai} 件。`);

  const fine = view.evidence.filter((o) => o.id !== 'pulsar').length;
  lines.push(`取得了四类证据中的 ${fine} 类。结局时权威 ${Math.round(view.authority)}，命运 ${Math.round(view.fate)}。`);
  return lines;
}

export const templateScribe: Scribe = { logLine, briefing, courtReports, verdict };
