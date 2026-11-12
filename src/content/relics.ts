/**
 * 遗物：沿途空着的天体上可以捡的东西。每一件是一小段故事，外加一点补给。
 *
 * 遗物的文字在三种真相下完全一样，所以它们不是证据，也不会让推理变容易或变难；
 * 它们讲的是沉默之前的事：那个文明到过哪里，我们自己的人类是怎么一个个离席的。
 * 亲自去取，读到完整的记录，拿到全部补给；交给 AI，只得到一句概要和一半补给。
 * 文字是初稿，口吻是录事：只陈述可核查的事实，不解释含义。
 */
import type { SystemId } from './systems';

export type RelicId = 'archive' | 'depot' | 'miner' | 'relay' | 'observatory';

export interface RelicDef {
  id: RelicId;
  system: SystemId;
  body: string;
  title: string;
  /** 知道它在那里时的一句话。 */
  seen: string;
  /** 交给 AI 取回时的概要。 */
  coarse: string;
  /** 亲自去取时读到的完整记录。 */
  fine: readonly string[];
  /** 亲自去取要花的清醒日。 */
  days: number;
  /** 亲自去取的收获；交给 AI 只有一半。 */
  reward: { energy?: number; research?: { line: 'propulsion' | 'longevity' | 'harvest' | 'cosmology'; points: number } };
  /** archive：出发时档案里就有；arrival：到了那个星系才发现。 */
  known: 'archive' | 'arrival';
}

export const RELICS: Record<RelicId, RelicDef> = {
  archive: {
    id: 'archive',
    system: 'home',
    body: 'home-2',
    title: '离席者的档案馆',
    seen: '海洋世界的浅海里，人类的档案馆还在供电。',
    coarse: 'AI 取回了档案馆的目录：九十一亿份个人档案，每一份的最后一条都是“出于本人意愿”。附带的医学记录已转给延寿研究。',
    fine: [
      '九十一亿份个人档案。每一份的最后一条都是同一句话：出于本人意愿。',
      '最后一份的日期，是你冷眠的前一天。姓名栏空着。',
      '档案里的医学记录已转给延寿研究。',
    ],
    days: 3,
    reward: { research: { line: 'longevity', points: 40 } },
    known: 'arrival',
  },
  depot: {
    id: 'depot',
    system: 'g2',
    body: 'g2-2',
    title: '别人的储能站',
    seen: '双日的气态巨行星轨道上有一座储能站，不是我们造的，还有回波。',
    coarse: 'AI 接上了储能站，取出其中的能源。它的结构和晨昏的人造结构是同一种做法。',
    fine: [
      '储能站的舱壁上刻着一排计数，看起来是充能的次数，一共四千一百零六次。',
      '最后一次充能之后，没有人来取过。',
      '它的结构和晨昏的人造结构是同一种做法。储备几乎是满的。',
    ],
    days: 4,
    reward: { energy: 40 },
    known: 'archive',
  },
  miner: {
    id: 'miner',
    system: 'm7',
    body: 'm7-2',
    title: '停着的采矿船',
    seen: '内侧岩石世界的轨道上停着一艘采矿船，呼叫无应答。',
    coarse: 'AI 抽出了采矿船剩下的燃料。舱内无人。',
    fine: [
      '舱内无人，也没有打斗或泄漏的痕迹。',
      '日志的最后一条是一次例行的返航通知：“货舱已满，返回 K-41。”',
      '引擎从没有点火。燃料还剩大半。',
    ],
    days: 3,
    reward: { energy: 25 },
    known: 'arrival',
  },
  relay: {
    id: 'relay',
    system: 'm7',
    body: 'm7-3',
    title: '一座中继站',
    seen: '外侧岩石世界上有一座朝着 K-41 的天线，还在缓慢地转动。',
    coarse: 'AI 拆下了中继站的电源。它曾经转发 K-41 方向的信号。',
    fine: [
      '它是一座中继站，曾把 K-41 的信号接力转发出去。',
      '信号中断之后，它又照常转发了三百年。转发的内容是空白。',
      '电源还剩一些，可以拆下来用。',
    ],
    days: 3,
    reward: { energy: 15 },
    known: 'arrival',
  },
  observatory: {
    id: 'observatory',
    system: 'p12',
    body: 'p12-2',
    title: '烤焦的观测站',
    seen: '外侧岩石世界上有一座观测站，外壳被脉冲星的辐射烤成了玻璃。',
    coarse: 'AI 取回了观测站的存储，其中是对这颗脉冲星的长期记录，已转给宇宙规律研究。',
    fine: [
      '观测站属于那个文明。它对着这颗脉冲星记录了两百年。',
      '记录的开头，他们给这个周期信号起过一个名字，后来划掉了，旁边注着：自然天体。',
      '记录已转给宇宙规律研究。',
    ],
    days: 4,
    reward: { research: { line: 'cosmology', points: 60 } },
    known: 'arrival',
  },
};

export const RELIC_IDS: readonly RelicId[] = ['archive', 'depot', 'miner', 'relay', 'observatory'];
