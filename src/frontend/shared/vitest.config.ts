import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // 동시 게이트 과다 구독 방지 — 기본값(코어 수 − 1, 이 PC 9 fork)을 4로 낮춘다. 게이트는 VITEST_MAX_WORKERS 로 더 줄일 수 있다
    // (docs/dflow-team/perf-audit-report.md P7). 테스트 총수는 변하지 않는다.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
