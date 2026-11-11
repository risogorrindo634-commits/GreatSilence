import type { StarKind } from '../content/systems';
import type { Cost, EndingId, EvidenceId, LineId } from '../core/types';

export const LINE_NAMES: Record<LineId, string> = {
  propulsion: '推进',
  longevity: '延寿',
  harvest: '采能',
  cosmology: '宇宙规律',
};

export const LINE_EFFECTS: Record<LineId, string> = {
  propulsion: '提高航速。探测器也跟着变快。',
  longevity: '每一级多 8 个清醒日。前三级自动生效；第四、五级是改造，要你点头，代价是权威。',
  harvest: '提高阵列的产出。',
  cosmology: '一级：进入星系就标出异常。二级：星图上标出哪里有异常。三级：AI 调谐更清楚。四级：亲自调查少花 3 天。五级：排除一种错误的解释。',
};

export const ENDING_NAMES: Record<EndingId, string> = {
  clear: '明断',
  powerless: '知而不能行',
  lucky: '侥幸',
  failed: '失察',
  undecided: '未决',
  sleep: '长眠',
};

export const EVIDENCE_NAMES: Record<EvidenceId, string> = {
  signal: '旧信号',
  infrared: '红外',
  ruins: '遗迹',
  probe: '探测器',
  pulsar: '周期信号',
};

export const EVIDENCE_SOURCES: Record<EvidenceId, string> = {
  signal: '来自 K-41，在无光收到',
  infrared: '在巨环的冰卫星上拍摄',
  ruins: '晨昏的眼球世界',
  probe: '派往 K-41，高速掠过',
  pulsar: '在灯塔收到',
};

export const ANOMALY_NAMES: Record<'signal' | 'ruins' | 'infrared', string> = {
  signal: '一个信号',
  ruins: '人造结构',
  infrared: '适合红外观测的窗口',
};

export const STAR_COLORS: Record<StarKind, string> = {
  yellow: '#ffd98a',
  binary: '#ffcf7d',
  red: '#ff7350',
  pulsar: '#d6e8ff',
  none: '#000000',
  orange: '#ffb26b',
};

export function num(x: number, digits = 0): string {
  return x.toFixed(digits);
}

export function speedLabel(c: number): string {
  return `${c.toFixed(2)}c`;
}

/** 一个操作花什么：标明是哪一种时间。 */
export function costLabel(c: Cost): string {
  const parts: string[] = [];
  if (c.days > 0) parts.push(`${c.days} 清醒日`);
  if (c.years > 0) parts.push(`${c.years} 世界年`);
  if (c.energy > 0) parts.push(`${c.energy} 能源`);
  return parts.length > 0 ? parts.join(' · ') : '不花时间';
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}
