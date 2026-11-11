/**
 * 状态仓库。完整的状态（包括真相）关在这个模块里，界面的其余部分只拿得到视图。
 */
import { can, cost, createGame, publicView, reduce } from '../core/game';
import type { Action, Cost, GameState, PublicView, TruthId } from '../core/types';

const SAVE_KEY = 'great-silence-save-v1';

/** 每个操作之后的命运，结局时用来画曲线。 */
export interface FatePoint {
  year: number;
  fate: number;
  /** 这一步是什么操作。 */
  type: Action['type'];
}

interface SaveFile {
  state: GameState;
  actions: Action[];
  history: FatePoint[];
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
  history(): readonly FatePoint[];
  /** 种子加操作序列，足以重放整局。 */
  record(): { seed: number; actions: readonly Action[] };
}

function load(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    return file.state?.version === 1 && Array.isArray(file.actions) ? file : null;
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

export function createStore(seed: number, truth?: TruthId, resume = true): Store {
  const saved = resume ? load() : null;
  let state = saved?.state ?? createGame(seed, truth);
  let actions: Action[] = saved?.actions ?? [];
  let history: FatePoint[] = saved?.history ?? [];
  let view = publicView(state);
  let previous: PublicView | null = null;
  const listeners: (() => void)[] = [];

  const commit = (): void => {
    view = publicView(state);
    save({ state, actions, history });
    for (const listener of listeners) listener();
  };

  return {
    view: () => view,
    previous: () => previous,
    can: (action) => can(state, action),
    cost: (action) => cost(state, action),
    dispatch(action) {
      previous = view;
      state = reduce(state, action);
      actions.push(action);
      history.push({ year: state.year, fate: publicView(state).fate, type: action.type });
      commit();
    },
    subscribe(listener) {
      listeners.push(listener);
    },
    newGame(nextSeed = Date.now() % 2147483647, nextTruth) {
      state = createGame(nextSeed, nextTruth);
      actions = [];
      history = [];
      previous = null;
      commit();
    },
    history: () => history,
    record: () => ({ seed: state.seed, actions }),
  };
}
