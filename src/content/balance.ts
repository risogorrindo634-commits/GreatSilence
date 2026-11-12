/**
 * 全部数值。除了注明“规格”的条目来自 docs/SLICE.md，其余都是假设，靠模拟对局和试玩来调。
 */
export const BALANCE = {
  start: {
    wakeDays: 90,
    energy: 100,
    authority: 50,
    support: 50,
  },

  /** 规格：SLICE 第 3 节。 */
  fate: {
    full: 100,
    timeFullYears: 1600,
    conspicuityFull: 100,
    delegationFullYears: 600,
    conspicuityPerArray: 8,
    conspicuityPerBeacon: 40,
    conspicuityPerProbe: 5,
    /** 一座设施建成后，要过这么多年才完全暴露：光要走到，对方要反应。期间它的显眼度从零线性涨到满。 */
    exposureYears: 80,
    /** 界面上的进度条分成这么多格。视图里只有格数，没有精确的数值。 */
    segments: 20,
  },

  travel: {
    /** 以光速为单位。 */
    baseSpeed: 0.1,
    maxSpeed: 0.9,
    energyPerLightYear: 3,
  },

  /** 亲自做的天数和交给 AI 的年数。规格：GDD 6.2。 */
  view: { days: 2 },
  /** 亲自调查的天数随异常而定，见 systems.ts。 */
  investigate: { years: 60 },
  /** 遗物：亲自去取的天数见 relics.ts；交给 AI 花这么多年，只得到这一份收获。 */
  salvage: { years: 20, aiShare: 0.5 },
  /** 每采一次，下一次减半，减到原来的四分之一为止。 */
  harvest: { days: 6, years: 20, repeatFactor: 0.5, floor: 0.25 },
  build: {
    days: 10,
    years: 40,
    energy: 30,
    maxPerSystem: 2,
    /** 一座标准阵列每个世界年的产出。 */
    outputPerYear: 0.15,
    /** 规格：点火按技巧给 0.7 到 1.5 倍，AI 固定 1 倍。 */
    skillMin: 0.7,
    skillMax: 1.5,
    ai: 1,
  },
  /** 规格：亲自 3 天，4% 到 45%；AI 固定 10%。 */
  slingshot: { days: 3, min: 0.04, max: 0.45, ai: 0.1 },
  /** 规格：亲自 4 天；AI 清晰度 0.4；干扰项要 0.5 以上才认得出。 */
  tune: { days: 4, min: 0.2, max: 1, ai: 0.4, naturalAt: 0.5, detailAt: 0.75 },
  probe: {
    energy: 25,
    /** 探测器的速度是舰队巡航速度的若干倍，所以推进科研也让它更快。 */
    speedFactor: 2,
    /** 任何真相下，探测器因故障在途中失联的概率。录事会把它明说。 */
    failureRate: 0.25,
    /** 猎手的局里，探测器总在离目标同一个距离上失联。这个距离每局不同，在这个范围里取，单位光年。 */
    silenceRadius: [1.5, 6],
  },
  wait: { maxYears: 200 },

  research: {
    /** 每一级的累计点数门槛。 */
    thresholds: [40, 100, 190, 310, 460],
    /** 每个世界年的算力：底数加上与能源收入成正比的部分。 */
    baseCompute: 0.3,
    computePerIncome: 0.8,
    /** 推进：各级的航速倍率，下标是级别。 */
    speed: [1, 1.25, 1.55, 1.9, 2.3, 2.8],
    /** 延寿：每一级增加的清醒日。 */
    longevityDays: 8,
    /** 前几级自动生效；之后的每一级是一次改造，要执政官点头，代价是权威。 */
    longevityFreeLevels: 3,
    augmentAuthority: 6,
    /** 采能：各级的阵列产出倍率。 */
    harvest: [1, 1.2, 1.45, 1.75, 2.1, 2.5],
    /** 宇宙规律：各项效果从第几级开始生效。 */
    /** 宇宙规律各级的效果。线索替代了原来的“标出异常”，见 SLICE 第 8 节。 */
    cosmology: {
      aiTuneAt: 1,
      aiTuneClarity: 0.55,
      investigateAt: 2,
      investigateDaysSaved: 3,
      probeReliableAt: 3,
      reliableFailureRate: 0.1,
      aiInvestigateAt: 4,
      aiInvestigateFactor: 0.5,
      eliminateAt: 5,
    },
  },

  authority: {
    /** 规格：明断要求权威不低于 40。 */
    threshold: 40,
    /** 亲自到场做一件事。 */
    perSelfAction: 1,
    /** 每次抵达一个星系，醒来露面。 */
    perArrival: 1,
    /** 放权：每交出这么多世界年，权威减 1。 */
    delegatedYearsPerPoint: 40,
    /** 长睡：每睡这么多世界年，权威减 1。 */
    sleepYearsPerPoint: 120,
    /** 连续冷眠超过这么多年之后，流失加快。亲自做任何一件事都会让计数归零。 */
    longSleepAfter: 250,
    longSleepYearsPerPoint: 40,
    /** 某一派支持度低于此值时，每次启航扣权威。 */
    lowSupport: 30,
    lowSupportPenalty: 4,
  },

  evidence: {
    signalSamples: 96,
    /** 清晰度为 0 时噪声的标准差；清晰度为 1 时只剩底噪。 */
    signalNoise: 0.9,
    signalNoiseFloor: 0.02,
    infraredSize: 24,
    infraredNoise: 0.03,
    ruinsSize: 9,
  },
} as const;
