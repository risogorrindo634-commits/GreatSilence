/** 命令行脚本共用的排版：中文字符按两格宽对齐。 */

export function width(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return w;
}

export function pad(text: string, cols: number): string {
  return text + ' '.repeat(Math.max(0, cols - width(text)));
}

/** 每一列取最宽的那一格再加两格空。 */
export function table(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...rows.map((r) => width(r[i] ?? ''))) + 2);
  return rows.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : pad(cell, widths[i]!))).join('')).join('\n');
}
