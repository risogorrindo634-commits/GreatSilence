/**
 * 入口：把内核、文书和界面接在一起。
 * 界面不直接引用文书的实现，所以以后把模板换成模型，只改这里。
 */
import { templateScribe } from './ai/templates';
import { startApp } from './app/app';
import { createStore } from './app/store';
import './app/style.css';
import { TRUTH_IDS } from './content/truths';
import type { TruthId } from './content/truths';

// 调试用：?seed=123 指定种子，?truth=hunter 指定真相，?new 丢掉存档重开。
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const truthParam = params.get('truth') as TruthId | null;
const fresh = params.has('new') || params.has('seed') || params.has('truth');

const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now() % 2147483647;
const truth = truthParam && TRUTH_IDS.includes(truthParam) ? truthParam : undefined;

startApp(document.getElementById('app')!, createStore(seed, truth, !fresh), templateScribe);
