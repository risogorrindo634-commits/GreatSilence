import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** 版本号写进对局记录，汇总试玩时用来确认规则对得上。 */
function buildId(): string {
  try {
    const git = (args: string): string => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return git('rev-parse --short HEAD') + (git('status --porcelain') ? '+' : '');
  } catch {
    return 'dev';
  }
}

// base 用相对路径，这样构建出的静态站点放在任何子目录下都能打开。
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildId()) },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
