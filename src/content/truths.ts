/**
 * 真相表。每一局选定其中一个，它决定所有证据，也决定每个决定的后果。
 * 文字是人写的：录事的口吻，只陈述可核查的事实，不解释含义。
 */

export type TruthId = 'dream' | 'hunter' | 'blackball';
export type ResponseId = 'covenant' | 'silence' | 'ban';

export const TRUTH_IDS: readonly TruthId[] = ['dream', 'hunter', 'blackball'];
export const RESPONSE_IDS: readonly ResponseId[] = ['covenant', 'silence', 'ban'];

/** 旧信号的功率曲线。横轴是整段记录，取 0 到 1。 */
export interface SignalDef {
  /** 起始和中断前的载波强度。 */
  from: number;
  to: number;
  /** 大于 1 时强度先慢后快地爬升。 */
  curve: number;
  /** 周期起伏的深度和个数。 */
  pulse: number;
  cycles: number;
  /** 从这里开始逐渐减弱；null 表示不减弱。 */
  fadeFrom: number | null;
  /** 信号在这里结束。 */
  cutAt: number;
  /** 把结束点移到最近的一个波峰上。 */
  cutOnPeak: boolean;
  /** 清晰度足够高时才读得出的那一句。 */
  detail: string;
}

/** 红外图。半径取 0 到 1。 */
export interface InfraredDef {
  /** 尘埃盘的内缘。 */
  discInner: number;
  /** 致密点源的亮度；0 表示没有。 */
  source: number;
  coarse: readonly string[];
  fine: readonly string[];
}

/** 遗迹的损毁分布。 */
export interface RuinsDef {
  damage: 'none' | 'uniform' | 'radial';
  coarse: readonly string[];
  fine: readonly string[];
}

export interface ProbeDef {
  /** 探测器是否总在离目标同一个距离上被掐断。 */
  silenced: boolean;
  /** 结局揭晓时的一句话。 */
  reveal: string;
}

export interface TruthDef {
  id: TruthId;
  name: string;
  /** 结局揭晓时的一句话。 */
  summary: string;
  /** 命运三个驱动的权重。规格：SLICE 第 3 节。 */
  weights: { time: number; conspicuity: number; delegation: number };
  /** 对的回应。 */
  response: ResponseId;
  /** 错的回应里，在这种真相下不造成损失的那些。 */
  harmless: readonly ResponseId[];
  evidence: {
    signal: SignalDef;
    infrared: InfraredDef;
    ruins: RuinsDef;
    probe: ProbeDef;
  };
}

export const TRUTHS: Record<TruthId, TruthDef> = {
  dream: {
    id: 'dream',
    name: '入梦',
    summary: '它们都转向了内部的虚拟世界，还活着，只是不再关心外面。',
    weights: { time: 0.35, conspicuity: 0, delegation: 0.65 },
    response: 'covenant',
    harmless: ['ban'],
    evidence: {
      signal: {
        from: 0.8,
        to: 0.8,
        curve: 1,
        pulse: 0.25,
        cycles: 6,
        fadeFrom: 0.3,
        cutAt: 0.8,
        cutOnPeak: false,
        detail: '最后一段的内容是同一组关停序列，一遍遍重复，间隔越来越长。',
      },
      infrared: {
        discInner: 0.2,
        source: 0.6,
        coarse: ['致密点源：检出 1 个。', '分辨率不足，未能成像。'],
        fine: ['致密点源 1 个，在尘埃盘之外，比背景高 0.4 开，角径不可分辨。', '尘埃盘内缘 0.9 天文单位。'],
      },
      ruins: {
        damage: 'none',
        coarse: ['结构完整。', '无活动，无应答。'],
        fine: [
          '结构完整。舱门闭锁，能源封存，先后顺序与一次有计划的关停一致。',
          '对接口的指示灯仍亮着，内容是“请稍候”。按电源衰减推算，已亮了约四万年。',
          '呼叫七次，无应答。',
        ],
      },
      probe: { silenced: false, reveal: '探测器掠过 K-41，没有人理会它。失联的那些只是故障。' },
    },
  },

  hunter: {
    id: 'hunter',
    name: '猎手',
    summary: '有东西让暴露自己的文明闭嘴。',
    weights: { time: 0.1, conspicuity: 0.9, delegation: 0 },
    response: 'silence',
    harmless: ['ban'],
    evidence: {
      signal: {
        from: 0.55,
        to: 0.62,
        curve: 1,
        pulse: 0.45,
        cycles: 6,
        fadeFrom: null,
        cutAt: 0.72,
        cutOnPeak: true,
        detail: '中断落在一帧的中间：帧头完整，载荷只收到一半。',
      },
      infrared: {
        discInner: 0.2,
        source: 0,
        coarse: ['致密点源：未检出。', '分辨率不足，未能成像。'],
        fine: ['视场内无点源。', '尘埃盘内缘 0.9 天文单位。'],
      },
      ruins: {
        damage: 'uniform',
        coarse: ['结构损毁。', '无活动，无应答。'],
        fine: ['轨道上只剩残骸。各段的断口朝着同一个方向。', '熔痕的深度处处相同。', '未发现内部爆炸的痕迹。'],
      },
      probe: { silenced: true, reveal: '每一艘探测器都在离 K-41 同一个距离上被掐断。' },
    },
  },

  blackball: {
    id: 'blackball',
    name: '黑球',
    summary: '有一项发现，每个文明走到那一步都会做，做了就毁灭。',
    weights: { time: 0.8, conspicuity: 0.2, delegation: 0 },
    response: 'ban',
    harmless: ['silence'],
    evidence: {
      signal: {
        from: 0.22,
        to: 1,
        curve: 2,
        pulse: 0.1,
        cycles: 6,
        fadeFrom: null,
        cutAt: 0.72,
        cutOnPeak: false,
        detail: '末段各帧里有同一个数值字段，逐帧增大。最后一帧的值是首帧的四十倍。',
      },
      infrared: {
        discInner: 0.52,
        source: 0,
        coarse: ['致密点源：未检出。', '分辨率不足，未能成像。'],
        fine: ['视场内无点源。', '尘埃盘内缘 4.6 天文单位。0.9 到 4.6 天文单位之间没有尘埃，也没有小天体。'],
      },
      ruins: {
        damage: 'radial',
        coarse: ['结构损毁。', '无活动，无应答。'],
        fine: [
          '内侧烧净，外侧完好。损毁程度随到中心的距离递减。',
          '中心在最大的一座实验设施。',
          '取回的最后一份实验日志，最后一行是：“能量再提高一档。”',
        ],
      },
      probe: { silenced: false, reveal: '探测器掠过 K-41，那里已经没有人了。失联的那些只是故障。' },
    },
  },
};

export interface ResponseDef {
  id: ResponseId;
  name: string;
  text: string;
}

/** 规格：SLICE 第 7 节。 */
export const RESPONSES: Record<ResponseId, ResponseDef> = {
  covenant: { id: 'covenant', name: '立约', text: '向内必须是清醒的选择，文明永远保留一支向外的力量。' },
  silence: { id: 'silence', name: '静默', text: '永久静默，拆除一切显眼的设施。' },
  ban: { id: 'ban', name: '封禁', text: '永久封禁那一条研究路线。' },
};

/** 所有真相共有的旧信号事实。 */
export const SIGNAL_FACTS: readonly string[] = ['来源：K-41 方向。', '记录跨度四百年，此后无信号。'];

/**
 * 探测器是高速掠过：它刹不住车，几小时就穿过整个星系，带不回可用的影像。
 * 所以它的证据只有一条：它到了没有；没到的话，是在哪里没了声音。{x} 会换成距离。
 */
export const PROBE_FACTS = {
  rate: '录事：按工程估计，这样的航程上每四艘探测器约有一艘因故障失联。',
  arrived: '掠过 K-41。呼叫无应答。探测器未受任何干预。相对速度太高，没有可用的影像。',
  lost: '在距 K-41 {x} 光年处停止回传。此前的遥测一切正常。',
};

/** 干扰项：脉冲星。清晰度不够时只有前一组。 */
export const PULSAR_FACTS = {
  base: ['周期 6.2 毫秒，仍在持续。'] as readonly string[],
  natural: ['周期稳定到十三位小数，并以恒定的速率变长。宽频，无调制。', '录事：与一颗自转减速的中子星相符，是自然天体。'] as readonly string[],
};
