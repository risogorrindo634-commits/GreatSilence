/**
 * 三派，和三件需要签字的事。规格：SLICE 第 5 节。
 * 每一件在恰好一种真相下是陷阱。
 */
import type { SystemId } from './systems';
import type { TruthId } from './truths';

export type FactionId = 'outward' | 'guard' | 'inward';
export const FACTION_IDS: readonly FactionId[] = ['outward', 'guard', 'inward'];

export const FACTIONS: Record<FactionId, { name: string; chief: string; stance: string }> = {
  outward: { name: '远望派', chief: '启明', stance: '向外：发信标，派探测器，造更大的仪器。' },
  guard: { name: '守成派', chief: '巡夜', stance: '藏起来：拆掉发射器，抹去一切可见的痕迹。' },
  inward: { name: '内省派', chief: '归藏', stance: '向内：把资源投入“万象”。' },
};

export type CourtId = 'beacon' | 'wanxiang' | 'corona';
export const COURT_IDS: readonly CourtId[] = ['beacon', 'wanxiang', 'corona'];

export interface CourtDef {
  id: CourtId;
  /** 第一次抵达这个星系时提出。 */
  system: SystemId;
  proposer: FactionId | 'scientists';
  proposerName: string;
  title: string;
  ask: string;
  sign: {
    /** 建成的信标数。 */
    beacons?: number;
    /** 能源的变化，负数是花费。 */
    energy?: number;
    /** 科研速度永久乘以这个数。 */
    researchRate?: number;
    /** 四条科研线各加这么多点。 */
    researchPoints?: number;
    support?: Partial<Record<FactionId, number>>;
  };
  veto: {
    support?: Partial<Record<FactionId, number>>;
    authority: number;
  };
  /** 在这种真相下签字是陷阱。fate 是直接加到命运上的量；信标的害处走显眼度，这里是 0。 */
  trap: { truth: TruthId; fate: number };
}

export const COURT: Record<CourtId, CourtDef> = {
  beacon: {
    id: 'beacon',
    system: 'g2',
    proposer: 'outward',
    proposerName: '远望派',
    title: '在双日建信标',
    ask: '借两颗恒星的功率，向全天发出一声招呼。',
    sign: { beacons: 1, energy: -60, support: { outward: 15 } },
    veto: { support: { outward: -15 }, authority: 3 },
    trap: { truth: 'hunter', fate: 0 },
  },
  wanxiang: {
    id: 'wanxiang',
    system: 'm7',
    proposer: 'inward',
    proposerName: '内省派',
    title: '把三成算力永久划给“万象”',
    ask: '把三成算力永久划给“万象”。科研速度降为七成。',
    sign: { researchRate: 0.7, support: { inward: 15 } },
    veto: { support: { inward: -15 }, authority: 3 },
    trap: { truth: 'dream', fate: 25 },
  },
  corona: {
    id: 'corona',
    system: 'j14',
    proposer: 'scientists',
    proposerName: 'AI 科学家',
    title: '批准“日冕”升级实验',
    ask: '把实验装置的能量提高一档。预计四条科研线都会有一次跃升。',
    sign: { researchPoints: 80, support: { outward: 10 } },
    veto: { support: { outward: -10 }, authority: 3 },
    trap: { truth: 'blackball', fate: 60 },
  },
};

/** 某个星系第一次抵达时提出的事项。 */
export function courtAt(system: SystemId): CourtDef | undefined {
  return COURT_IDS.map((id) => COURT[id]).find((c) => c.system === system);
}
