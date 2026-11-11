import { defineConfig } from 'vitest/config';

// base 用相对路径，这样构建出的静态站点放在任何子目录下都能打开。
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
