import path from "node:path";
import { defineConfig } from "vitest/config";

// m-mdm vitest.config.ts 와 같은 틀(@ = src). 기본 환경은 node, 렌더 시험 파일만 머리 주석으로 happy-dom.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});
