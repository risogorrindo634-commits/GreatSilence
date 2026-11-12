import type { CourtId, FactionId } from '../content/court';
import type { LeadId } from '../content/leads';
import type { AnomalyKind, BodyKind, StarKind, SystemId } from '../content/systems';
import type { ResponseId, TruthId } from '../content/truths';

export type { CourtId, FactionId, LeadId, SystemId, TruthId, ResponseId };

export type Mode = 'self' | 'ai';
export type LineId = 'propulsion' | 'longevity' | 'harvest' | 'cosmology';
export const LINE_IDS: readonly LineId[] = ['propulsion', 'longevity', 'harvest', 'cosmology'];

/** 证据的编号，也是推理板的行。pulsar 是干扰项。 */
export type EvidenceId = 'signal' | 'infrared' | 'ruins' | 'probe' | 'pulsar';
export const EVIDENCE_IDS: readonly EvidenceId[] = ['signal', 'infrared', 'ruins', 'probe', 'pulsar'];

export type Mark = 'support' | 'against' | 'unknown';

export type EndingId = 'clear' | 'powerless' | 'lucky' | 'failed' | 'undecided' | 'sleep';

/** 一处天体上玩家留下的痕迹。 */
export interface BodyState {
  viewed: boolean;
  /** 线索指到这里之后才知道这里有异常。 */
  anomalyKnown: boolean;
  /** 已经采集过几次。 */
  harvested: number;
  name: string | null;
}

export interface ArrayState {
  system: SystemId;
  /** 点火的质量，0.7 到 1.5。 */
  quality: number;
  /** 建成的年份。显眼度从这一年起慢慢涨上来。 */
  year: number;
}

export interface ProbeState {
  from: SystemId;
  launchedYear: number;
  /** 出发时到 K-41 的距离，光年。 */
  distance: number;
  /** 一切顺利的话，哪一年有回音。发射时玩家只知道这个。 */
  etaYear: number;
  /** 实际哪一年有消息：失联的会更早。 */
  reportYear: number;
  /** 在离 K-41 多远处失联；null 表示顺利掠过。发射时就定了，回报之前不进视图。 */
  lostAt: number | null;
  reported: boolean;
}

/** 旧信号和干扰项：记下调谐的清晰度。seed 决定噪声。 */
export interface TunedEvidence {
  clarity: number;
  seed: number;
  year: number;
}

/** 红外和遗迹：记下结果是粗的还是细的。 */
export interface SurveyedEvidence {
  fine: boolean;
  seed: number;
  year: number;
}

export interface EvidenceState {
  signal?: TunedEvidence;
  pulsar?: TunedEvidence;
  infrared?: SurveyedEvidence;
  ruins?: SurveyedEvidence;
  /** 至少有一艘探测器有了消息；year 是最近一次。具体内容在 probes 里。 */
  probe?: { year: number };
}

/** 编年记录。只记事实，措辞交给文书层。 */
export type LogEvent =
  | { t: 'start' }
  | { t: 'arrive'; system: SystemId; from: SystemId; years: number; speed: number; first: boolean }
  | { t: 'radiation'; days: number }
  | { t: 'view'; body: string }
  | { t: 'name'; body: string; name: string }
  | { t: 'lead'; lead: LeadId }
  | { t: 'investigate'; mode: Mode; body: string; evidence: EvidenceId }
  | { t: 'tune'; mode: Mode; body: string; evidence: EvidenceId; clarity: number }
  | { t: 'harvest'; mode: Mode; body: string; energy: number }
  | { t: 'build'; mode: Mode; system: SystemId; quality: number }
  | { t: 'slingshot'; boost: number }
  | { t: 'probe'; from: SystemId; etaYear: number }
  | { t: 'probeReport'; lost: boolean }
  | { t: 'augment'; step: number }
  | { t: 'wait'; years: number }
  | { t: 'court'; item: CourtId }
  | { t: 'rule'; item: CourtId; decision: 'sign' | 'veto' }
  | { t: 'level'; line: LineId; level: number }
  | { t: 'eliminate'; ruledOut: TruthId }
  | { t: 'conclude'; conclusion: TruthId; response: ResponseId }
  | { t: 'end'; ending: EndingId };

export type LogEntry = LogEvent & { year: number };

/**
 * 完整的状态。可以直接转成 JSON 存档。
 * 真相在这里，界面拿不到这个对象，只拿得到 PublicView。
 */
export interface GameState {
  version: 3;
  seed: number;
  rng: number;
  truth: TruthId;
  /** 猎手的局里探测器失联的距离。每局都抽，别的真相下用不上。 */
  silenceRadius: number;

  /** 远征开始以来的世界年。 */
  year: number;
  wakeDays: number;
  energy: number;
  authority: number;
  support: Record<FactionId, number>;

  location: SystemId;
  visited: SystemId[];
  /** 已经出现的线索，按出现的先后。 */
  leads: LeadId[];
  /** 为下一程准备好的弹弓加速；null 表示还没做，启航时由 AI 按保守方案做。 */
  slingshot: number | null;

  /** 交给 AI 做事花掉的世界年，不含巡航和等待。 */
  delegatedYears: number;
  /** 在冷眠里度过的世界年：巡航和等待。 */
  sleptYears: number;
  /** 连续冷眠了多少年。亲自做任何一件事就归零。 */
  sleepStreak: number;

  arrays: ArrayState[];
  /** 每座信标建成的年份。 */
  beaconYears: number[];
  probes: ProbeState[];

  research: {
    allocation: Record<LineId, number>;
    points: Record<LineId, number>;
  };
  /** 已经接受了几次延寿改造。 */
  augments: number;

  rulings: Partial<Record<CourtId, 'sign' | 'veto'>>;
  pending: CourtId | null;

  bodies: Record<string, BodyState>;
  evidence: EvidenceState;
  /** 宇宙规律科研替玩家排除的一种解释。 */
  eliminated: TruthId | null;
  /** 推理板。键是“证据:真相”。 */
  board: Record<string, Mark>;

  log: LogEntry[];

  conclusion: { truth: TruthId; response: ResponseId } | null;
  ending: { id: EndingId; year: number } | null;
}

export type Action =
  | { type: 'view'; body: string }
  | { type: 'name'; body: string; name: string }
  | { type: 'investigate'; mode: Mode; body: string }
  /** skill 是界面里小操作的成绩，0 到 1。 */
  | { type: 'tune'; mode: 'self'; body: string; skill: number }
  | { type: 'tune'; mode: 'ai'; body: string }
  | { type: 'harvest'; mode: Mode; body: string }
  | { type: 'build'; mode: 'self'; skill: number }
  | { type: 'build'; mode: 'ai' }
  | { type: 'slingshot'; skill: number }
  | { type: 'probe' }
  /** 接受一次延寿改造：延寿科研到第四、五级后才有。 */
  | { type: 'augment' }
  | { type: 'wait'; years: number }
  | { type: 'rule'; item: CourtId; decision: 'sign' | 'veto' }
  | { type: 'research'; allocation: Record<LineId, number> }
  | { type: 'depart'; to: SystemId }
  | { type: 'mark'; evidence: EvidenceId; truth: TruthId; mark: Mark }
  | { type: 'conclude'; conclusion: TruthId; response: ResponseId };

/** 一个操作要花什么。 */
export interface Cost {
  days: number;
  years: number;
  energy: number;
}

// ---------------------------------------------------------------- 给界面的视图

export interface SignalObservation {
  id: 'signal' | 'pulsar';
  kind: 'signal';
  year: number;
  clarity: number;
  /** 功率随时间的采样。 */
  series: number[];
  facts: string[];
  /** 只对干扰项有意义：true 表示已认出是自然现象，null 表示还认不出。 */
  natural: boolean | null;
}

export interface InfraredObservation {
  id: 'infrared';
  kind: 'infrared';
  year: number;
  fine: boolean;
  /** 热图。粗略结果没有成像。 */
  grid: number[][] | null;
  facts: string[];
}

export interface RuinsCell {
  /** 损毁程度，0 到 1。 */
  damage: number;
  /** 断口的朝向，弧度；没有断口时是 null。 */
  dir: number | null;
}

export interface RuinsObservation {
  id: 'ruins';
  kind: 'ruins';
  year: number;
  fine: boolean;
  /** 损毁分布图。粗略结果没有。 */
  cells: RuinsCell[][] | null;
  facts: string[];
}

/** 一艘有了消息的探测器。 */
export interface ProbeReport {
  from: SystemId;
  launchedYear: number;
  reportYear: number;
  /** 出发时到 K-41 的距离，光年。 */
  distance: number;
  /** 在离 K-41 多远处停止回传；null 表示顺利掠过。 */
  lostAt: number | null;
}

export interface ProbeObservation {
  id: 'probe';
  kind: 'probe';
  year: number;
  reports: ProbeReport[];
  facts: string[];
}

export type Observation = SignalObservation | InfraredObservation | RuinsObservation | ProbeObservation;

export interface BodyView {
  id: string;
  name: string;
  kind: BodyKind;
  scene: string;
  wonder: { name: string; basis: string } | null;
  viewed: boolean;
  /** 玩家起的名字。 */
  given: string | null;
  /** 这一次采集能得到的能源。 */
  resource: number;
  /** 已知的异常。signal 包括真正的信号和干扰项，界面分不出来。 */
  anomaly: 'signal' | 'ruins' | 'infrared' | null;
  harvested: number;
}

export interface SystemView {
  id: SystemId;
  code: string;
  name: string;
  star: StarKind;
  starLabel: string;
  pos: readonly [number, number];
  role: string;
  visited: boolean;
  current: boolean;
  canBuild: boolean;
  arrays: number;
  /** 这里的线索进展到哪一步；这里没有已出现的线索是 null。 */
  lead: LeadStatus | null;
  /** 从当前位置去那里要花什么；当前所在的星系是 null。 */
  travel: { distance: number; speed: number; years: number; energy: number } | null;
}

/** open：还没去；partial：有了结果，但还能更清楚，或者探测器还在路上；done：取得了。 */
export type LeadStatus = 'open' | 'partial' | 'done';

export interface LeadView {
  id: LeadId;
  status: LeadStatus;
}

export interface LineView {
  id: LineId;
  level: number;
  points: number;
  /** 下一级的门槛；满级是 null。 */
  next: number | null;
  share: number;
}

export interface EndingView {
  id: EndingId;
  year: number;
  truth: TruthId;
  conclusion: TruthId | null;
  response: ResponseId | null;
  /** 命运的精确数值，以及各项各占多少。结局之前界面只看得到格数。 */
  fate: { total: number; time: number; conspicuity: number; delegation: number; signed: number };
  weights: { time: number; conspicuity: number; delegation: number };
}

/** 界面能看到的一切。没有真相，直到结局。 */
export interface PublicView {
  year: number;
  wakeDays: number;
  energy: number;
  authority: number;
  /** 命运的进度条亮了几格，一共几格。精确的数值不进视图：它的涨落会泄露真相。 */
  fateLevel: number;
  fateSegments: number;
  /** 当前的巡航速度，以光速为单位，不含弹弓。 */
  speed: number;
  support: Record<FactionId, number>;

  location: SystemId;
  systems: SystemView[];
  bodies: BodyView[];
  /** 为下一程准备的弹弓加速；null 表示启航时由 AI 来做。 */
  slingshot: number | null;

  incomePerYear: number;
  computePerYear: number;
  research: LineView[];
  /** 延寿改造：已经接受了几次，现在还能接受几次，每次的得失。 */
  augments: { accepted: number; available: number; days: number; authority: number };

  arrays: number;
  beacons: number;
  /** etaYear 是一切顺利时有回音的年份；实际的消息可能更早。 */
  probes: { from: SystemId; launchedYear: number; etaYear: number; reported: boolean }[];

  pending: CourtId | null;
  rulings: Partial<Record<CourtId, 'sign' | 'veto'>>;

  /** 已经出现的线索。文字在 content/leads.ts。 */
  leads: LeadView[];
  evidence: Observation[];
  eliminated: TruthId | null;
  board: Record<string, Mark>;

  album: { body: string; name: string; given: string | null; system: SystemId }[];
  log: LogEntry[];

  ending: EndingView | null;
}

/** 所有天体的种类，供绘制用。 */
export type { AnomalyKind, BodyKind, StarKind };
