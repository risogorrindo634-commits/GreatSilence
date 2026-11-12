/**
 * 状态仓库。完整的状态（包括真相）关在这个模块里，界面的其余部分只拿得到视图。
 * 它也替试玩记下用时和结局后的三个问题；这些不进内核，不影响重放。
 */
import { can, cost, createGame, fateParts, publicView, reduce } from '../core/game';
import type { Action, Cost, GameState, PublicView, TruthId } from '../core/types';
import { IDLE_CAP_SECONDS, NO_ANSWERS, RECORD_KIND } from './record';
import type { Answers, GameRecord } from './record';

const SAVE_KEY = 'great-silence-save-v3';

const IDLE_CAP_MS = IDLE_CAP_SECONDS * 1000;

/** 每个操作之后命运里各项各占多少，结局时用来画图。结局之前界面拿不到。 */
export interface FatePoint {
  year: number;
  time: number;
  conspicuity: number;
  delegation: number;
  signed: number;
}

interface SaveFile {
  state: GameState;
  actions: Action[];
  history: FatePoint[];
  // 以下几项是后加的，旧存档里没有。
  times?: number[];
  activeMs?: number;
  answers?: Answers;
  build?: string;
}

export interface StoreOptions {
  seed: number;
  truth?: TruthId;
  /**
   * any：有存档就接着玩。same：存档的种子（和指定的真相）对得上才接着玩，
   * 用在试玩链接带着 ?seed= 的时候，免得刷新一下就重开。none：丢掉存档。
   */
  resume: 'any' | 'same' | 'none';
  /** 构建版本，写进对局记录。 */
  build: string;
}

export interface Store {
  view(): PublicView;
  /** 上一个操作之前的视图，用来显示变化。 */
  previous(): PublicView | null;
  can(action: Action): string | null;
  cost(action: Action): Cost;
  dispatch(action: Action): void;
  subscribe(listener: () => void): void;
  newGame(seed?: number, truth?: TruthId): void;
  /** 结局之前是空的。 */
  history(): readonly FatePoint[];
  /** 对局记录。种子加操作序列足以重放整局；真相和答案只在结局之后才有。 */
  record(): GameRecord;
  answers(): Answers;
  /** 记下答案。不通知界面重画，免得打字时输入框被换掉。 */
  answer(patch: Partial<Answers>): void;
}

function load(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    return file.state?.version === 3 && Array.isArray(file.actions) ? file : null;
  } catch {
    return null;
  }
}

function save(file: SaveFile): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    // 存不了就不存，游戏照常进行。
  }
}

function pick(options: StoreOptions): SaveFile | null {
  if (options.resume === 'none') return null;
  const saved = load();
  if (!saved || options.resume === 'any') return saved;
  const same = saved.state.seed === options.seed && (!options.truth || saved.state.truth === options.truth);
  return same ? saved : null;
}

export function createStore(options: StoreOptions): Store {
  const saved = pick(options);
  let state = saved?.state ?? createGame(options.seed, options.truth);
  let actions: Action[] = saved?.actions ?? [];
  let history: FatePoint[] = saved?.history ?? [];
  let times: number[] = saved?.times ?? actions.map(() => 0);
  let activeMs = saved?.activeMs ?? 0;
  let answers: Answers = { ...NO_ANSWERS, ...saved?.answers };
  // 一局打到一半换了版本，两个都记下，汇总时会提醒重放可能不准。
  let build = saved?.build && saved.build !== options.build ? `${saved.build}→${options.build}` : options.build;
  let view = publicView(state);
  let previous: PublicView | null = null;
  const listeners: (() => void)[] = [];

  // ------------------------------------------------------------ 用时

  const now = (): number => performance.now();
  let lastTick = now();
  let visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';

  /** 把上次以来的时间记进用时：页面在后台的时间不算，结局之后不算，一次最多算 IDLE_CAP_SECONDS。 */
  const tick = (): void => {
    const t = now();
    if (visible && !state.ending) activeMs += Math.min(Math.max(0, t - lastTick), IDLE_CAP_MS);
    lastTick = t;
  };

  const persist = (): void => save({ state, actions, history, times, activeMs, answers, build });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      tick();
      visible = document.visibilityState !== 'hidden';
      if (!visible) persist();
    });
  }

  const commit = (): void => {
    view = publicView(state);
    persist();
    for (const listener of listeners) listener();
  };

  return {
    view: () => view,
    previous: () => previous,
    can: (action) => can(state, action),
    cost: (action) => cost(state, action),
    dispatch(action) {
      tick();
      previous = view;
      state = reduce(state, action);
      actions.push(action);
      times.push(Math.round(activeMs / 1000));
      history.push({ year: state.year, ...fateParts(state) });
      commit();
    },
    subscribe(listener) {
      listeners.push(listener);
    },
    newGame(nextSeed = Date.now() % 2147483647, nextTruth) {
      state = createGame(nextSeed, nextTruth);
      actions = [];
      history = [];
      times = [];
      activeMs = 0;
      lastTick = now();
      answers = { ...NO_ANSWERS };
      build = options.build;
      previous = null;
      commit();
    },
    // 命运的精确数值会泄露真相，结局之后才交出去。
    history: () => (state.ending ? history : []),
    record() {
      tick();
      return {
        kind: RECORD_KIND,
        v: 1,
        build,
        seed: state.seed,
        truth: state.ending ? state.truth : null,
        ending: state.ending?.id ?? null,
        actions: [...actions],
        times: [...times],
        elapsed: Math.round(activeMs / 1000),
        answers: state.ending ? { ...answers } : null,
      };
    },
    answers: () => answers,
    answer(patch) {
      answers = { ...answers, ...patch };
      persist();
    },
  };
}
