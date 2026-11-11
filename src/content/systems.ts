/**
 * 六个手工设计的星系，以及只能派探测器去的 K-41。规格：SLICE 第 4 节。
 * 风景的描述和依据取自 docs/WONDERS.md。
 */

export type SystemId = 'home' | 'g2' | 'm7' | 'p12' | 'r3' | 'j14';
export type StarKind = 'yellow' | 'binary' | 'red' | 'pulsar' | 'none' | 'orange';
export type BodyKind = 'rocky' | 'ocean' | 'gas' | 'ringed' | 'lava' | 'eyeball' | 'rogue' | 'ice';
/** pulsar 是干扰项：看起来像信号，其实是自然天体。 */
export type AnomalyKind = 'signal' | 'pulsar' | 'ruins' | 'infrared';

export interface WonderDef {
  name: string;
  /** 天文学依据，以及它属于哪一档：已观测、理论、推断。 */
  basis: string;
}

export interface BodyDef {
  id: string;
  name: string;
  kind: BodyKind;
  /** 一次采集能得到的能源。 */
  resource: number;
  /** 观景时看到的。 */
  scene: string;
  wonder?: WonderDef;
  anomaly?: AnomalyKind;
  /** 亲自调查这处异常要花的清醒日。 */
  investigateDays?: number;
}

export interface SystemDef {
  id: SystemId;
  code: string;
  name: string;
  star: StarKind;
  starLabel: string;
  /** 星图上的位置，单位光年。 */
  pos: readonly [number, number];
  /** 阵列在这里的产出倍率。0 表示不能建。 */
  arrayOutput: number;
  /** 弹弓效果的倍率。 */
  slingshot: number;
  /** 每次抵达扣掉的清醒日。 */
  arrivalDays: number;
  /** 这一站的作用，写给引导和日志用。 */
  role: string;
  bodies: readonly BodyDef[];
}

export const SYSTEMS: Record<SystemId, SystemDef> = {
  home: {
    id: 'home',
    code: '故乡',
    name: '故乡',
    star: 'yellow',
    starLabel: '黄矮星',
    pos: [0, 0],
    arrayOutput: 1,
    slingshot: 1,
    arrivalDays: 0,
    role: '出发的地方。',
    bodies: [
      { id: 'home-1', name: '岩石世界', kind: 'rocky', resource: 20, scene: '没有大气。旧矿坑的边缘还很锐利。' },
      { id: 'home-2', name: '海洋世界', kind: 'ocean', resource: 10, scene: '云层下面是海。人类离席之前住在这里。' },
      { id: 'home-3', name: '带环的气态巨行星', kind: 'ringed', resource: 40, scene: '环的影子落在云顶上，像一道刻痕。' },
    ],
  },

  g2: {
    id: 'g2',
    code: 'G-2',
    name: '双日',
    star: 'binary',
    starLabel: '双星',
    pos: [20, 7],
    arrayOutput: 2,
    slingshot: 1,
    arrivalDays: 0,
    role: '能源站：阵列在这里的产出翻倍。',
    bodies: [
      {
        id: 'g2-1',
        name: '熔岩世界',
        kind: 'lava',
        resource: 45,
        scene: '夜半球是一片发光的岩浆海。',
        wonder: {
          name: '熔岩世界',
          basis: '55 Cancri e 这类贴着恒星的超级地球，温度足以熔化岩石。行星已观测，表面状态是推断。',
        },
      },
      {
        id: 'g2-2',
        name: '气态巨行星',
        kind: 'gas',
        resource: 35,
        scene: '两个太阳先后落下，万物有两道影子。',
        wonder: { name: '双日世界', basis: '环绕双星的行星已被发现，如 Kepler-16b。已观测。' },
      },
    ],
  },

  m7: {
    id: 'm7',
    code: 'M-7',
    name: '晨昏',
    star: 'red',
    starLabel: '红矮星',
    pos: [36, -13],
    arrayOutput: 0.6,
    slingshot: 1,
    arrivalDays: 0,
    role: '一颗永远一面朝着恒星的行星。',
    bodies: [
      {
        id: 'm7-1',
        name: '眼球世界',
        kind: 'eyeball',
        resource: 15,
        scene: '永远一面朝着恒星：正午点是沙漠，背面是冰原，中间一圈细长的晨昏线。',
        wonder: { name: '眼球世界', basis: '红矮星近旁的行星容易被潮汐锁定。理论。' },
        anomaly: 'ruins',
        investigateDays: 12,
      },
      { id: 'm7-2', name: '内侧岩石世界', kind: 'rocky', resource: 25, scene: '红色的光下，岩石没有别的颜色。' },
      { id: 'm7-3', name: '外侧岩石世界', kind: 'rocky', resource: 20, scene: '恒星在这里只是一个暗红的小圆点。' },
    ],
  },

  p12: {
    id: 'p12',
    code: 'P-12',
    name: '灯塔',
    star: 'pulsar',
    starLabel: '脉冲星',
    pos: [50, 13],
    arrayOutput: 0.8,
    slingshot: 1.5,
    arrivalDays: 3,
    role: '一颗死去的恒星。辐射对舰队有害，引力弹弓在这里效果更好。',
    bodies: [
      {
        id: 'p12-1',
        name: '内侧岩石世界',
        kind: 'rocky',
        resource: 30,
        scene: '一颗死去的恒星，光束每秒扫过几十次。',
        wonder: { name: '脉冲星行星', basis: '最早被发现的系外行星就绕着脉冲星 PSR B1257+12。已观测。' },
        anomaly: 'pulsar',
      },
      { id: 'p12-2', name: '外侧岩石世界', kind: 'rocky', resource: 25, scene: '地表被辐射烤成了玻璃。' },
    ],
  },

  r3: {
    id: 'r3',
    code: 'R-3',
    name: '无光',
    star: 'none',
    starLabel: '没有恒星',
    pos: [70, -7],
    arrayOutput: 0,
    slingshot: 1,
    arrivalDays: 0,
    role: '没有恒星，不能建阵列。这里最黑，聆听最灵敏。',
    bodies: [
      {
        id: 'r3-1',
        name: '流浪行星',
        kind: 'rogue',
        resource: 30,
        scene: '没有太阳，只有自身的余热和头顶完整的银河。',
        wonder: { name: '流浪行星', basis: '不绕任何恒星的行星已有多个候选体。已观测到候选。' },
        anomaly: 'signal',
      },
    ],
  },

  j14: {
    id: 'j14',
    code: 'J-14',
    name: '巨环',
    star: 'orange',
    starLabel: '橙矮星',
    pos: [87, 17],
    arrayOutput: 0.8,
    slingshot: 1,
    arrivalDays: 0,
    role: '一颗带巨环的气态巨行星，和它的冰卫星。',
    bodies: [
      {
        id: 'j14-1',
        name: '带巨环的气态巨行星',
        kind: 'ringed',
        resource: 50,
        scene: '比土星环大得多的环系，从行星上看占去半个天空。',
        wonder: { name: '巨环', basis: 'J1407b 的掩星记录被解释为一个巨大的环系。推断。' },
      },
      {
        id: 'j14-2',
        name: '冰卫星',
        kind: 'ice',
        resource: 20,
        scene: '冰壳的裂缝里喷出水汽，在阳光里结成一道弧。',
        wonder: { name: '冰下海洋', basis: '土卫二的喷流被探测器直接观测到，木卫二也有冰下海洋的强证据。已观测。' },
        anomaly: 'infrared',
        investigateDays: 8,
      },
    ],
  },
};

export const SYSTEM_IDS: readonly SystemId[] = ['home', 'g2', 'm7', 'p12', 'r3', 'j14'];
export const START_SYSTEM: SystemId = 'home';

/** 旧信号的来源。只能派探测器去。离无光最近。 */
export const PROBE_TARGET = { code: 'K-41', pos: [78, -20] as readonly [number, number] };

const BODY_INDEX = new Map<string, { body: BodyDef; system: SystemId }>();
for (const id of SYSTEM_IDS) {
  for (const body of SYSTEMS[id].bodies) BODY_INDEX.set(body.id, { body, system: id });
}

export function findBody(id: string): { body: BodyDef; system: SystemId } | undefined {
  return BODY_INDEX.get(id);
}

export const BODY_IDS: readonly string[] = [...BODY_INDEX.keys()];

export function distance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 10) / 10;
}
