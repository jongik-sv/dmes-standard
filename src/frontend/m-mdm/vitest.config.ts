import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// 경과 시간(wall-clock)을 단언하는 부하 민감 테스트. 병렬 스위트의 다른 fork 와 CPU 를 다투면 기준(100ms·200ms·5s 타임아웃)을
// 넘겨 흔들리므로(docs/dflow-team/perf-audit-report.md P3) 여기서는 빼고, vitest.perf.config.ts 가 한 fork 에서 순서대로 돌린다.
// 두 스위트는 test 스크립트(scripts/test.mjs)가 차례로 모두 돌리므로 테스트 총수와 기준은 그대로다.
export const PERF_TEST_FILES = [
  "tests/evalex-perf.test.ts",
  "tests/dme/ruleEdit/sections-render.test.ts",
  "tests/dmc/codeCateEdit/transfer.test.ts",
];

// TSK-01-03 U9 — 셸 렌더 테스트. 기본 환경은 node 이고 렌더 테스트 파일만 머리 주석으로 happy-dom 을 쓴다
// (shared vitest 선례). vitest 는 tsconfig 의 jsx·paths 를 따르지 않으므로 둘 다 여기에 적는다.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...PERF_TEST_FILES],
    setupFiles: ["tests/setup.ts"],
  },
});
