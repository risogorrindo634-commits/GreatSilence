/**
 * 线索：远征的主线。每一条只说去哪里看、那里有什么，不说它意味着什么。
 * 出发时档案里有三条，另外两条在途中由 AI 注意到。规格：SLICE 第 8 节。
 */
import type { SystemId } from './systems';

export type LeadId = 'ruins' | 'signal' | 'probe' | 'pulsar' | 'infrared';

export interface LeadDef {
  id: LeadId;
  /** 取得之后归入哪一条证据。 */
  evidence: 'ruins' | 'signal' | 'probe' | 'pulsar' | 'infrared';
  /** 线索在哪个星系、哪个天体；K-41 去不了，是 null。 */
  system: SystemId | null;
  body: string | null;
  title: string;
  /** 要做的事，用在“下一步”里。 */
  task: string;
  /** 那里有什么。录事的口吻，只陈述事实。 */
  text: string;
  /** 走过几个星系之后才出现。0 表示出发时就在档案里。 */
  revealAfter: number;
  /** 途中出现时，简报里的那一句，要把线索说完整。 */
  found?: string;
}

/** 开场时档案里唯一确定的事。 */
export const ARCHIVE =
  '档案里只有一件确定的事：四万年前，K-41 方向传来过一段信号，持续四百年，然后中断。此后再没有收到任何文明的消息。';

export const LEADS: Record<LeadId, LeadDef> = {
  ruins: {
    id: 'ruins',
    evidence: 'ruins',
    system: 'm7',
    body: 'm7-1',
    title: '人造结构',
    task: '调查眼球世界上空的人造结构',
    text: '晨昏的眼球世界上空有一处人造结构的雷达回波，不是我们的。',
    revealAfter: 0,
  },
  signal: {
    id: 'signal',
    evidence: 'signal',
    system: 'r3',
    body: 'r3-1',
    title: '旧信号',
    task: '把旧信号调出来',
    text: '故乡只收到过 K-41 那段信号的残片。无光没有恒星，背景最暗，在那里能把它完整地调出来。',
    revealAfter: 0,
  },
  probe: {
    id: 'probe',
    evidence: 'probe',
    system: null,
    body: null,
    title: 'K-41 本身',
    task: '发射一艘探测器去 K-41',
    text: 'K-41 太远，舰队到不了，只能派探测器高速掠过。在哪一站发射都行，离得越近，到得越早。',
    revealAfter: 0,
  },
  pulsar: {
    id: 'pulsar',
    evidence: 'pulsar',
    system: 'p12',
    body: 'p12-1',
    title: '周期信号',
    task: '调谐灯塔的周期信号',
    text: '灯塔方向有一个极规律的周期信号。AI 判断不了它是不是人造的。',
    revealAfter: 1,
    found: '离开故乡之后，AI 在灯塔方向收到一个极规律的周期信号，判断不了它是不是人造的。新的线索：周期信号。',
  },
  infrared: {
    id: 'infrared',
    evidence: 'infrared',
    system: 'j14',
    body: 'j14-2',
    title: '红外窗口',
    task: '在冰卫星上做一次红外观测',
    text: '巨环的冰卫星背对行星的一面挡住了恒星的光，从那里能拍到 K-41 一带的红外图像。',
    revealAfter: 2,
    found: '途中，AI 算出巨环的冰卫星背对行星的一面是观测 K-41 的红外窗口。新的线索：红外窗口。',
  },
};

export const LEAD_IDS: readonly LeadId[] = ['ruins', 'signal', 'probe', 'pulsar', 'infrared'];
