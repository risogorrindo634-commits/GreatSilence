import type { CourtId, LogEntry, PublicView } from '../core/types';

/**
 * 文书：把事实写成文字。界面只认这个接口。
 * 灰盒阶段由 ai/templates.ts 的模板实现，以后可以换成模型，模板留作兜底。
 * 它只拿得到视图，所以写不出真相。
 */
export interface Scribe {
  /** 航行日志里的一行。 */
  logLine(entry: LogEntry): string;
  /** 抵达时的简报：从日志的第 since 条起，这一程发生了什么。 */
  briefing(view: PublicView, since: number): string[];
  /** 一件待决事项：录事的事实，和各方的说法。 */
  courtReports(item: CourtId, view: PublicView): { speaker: string; role: string; text: string }[];
  /** 结局时史官的定论。 */
  verdict(view: PublicView): string[];
}
