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

// ?seed=123 指定种子（试玩时用它分配真相），?truth=hunter 指定真相（调试用，会写在地址栏里），
// ?new 丢掉存档重开。读完就从地址栏去掉，这样刷新页面会接着玩，不会重开。
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const truthParam = params.get('truth') as TruthId | null;
const pinned = Number.isFinite(seedParam) && seedParam > 0;

const seed = pinned ? seedParam : Date.now() % 2147483647;
const truth = truthParam && TRUTH_IDS.includes(truthParam) ? truthParam : undefined;
const resume = params.has('new') ? 'none' : pinned || truth ? 'same' : 'any';
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

startApp(document.getElementById('app')!, createStore({ seed, truth, resume, build: __BUILD__ }), templateScribe);
