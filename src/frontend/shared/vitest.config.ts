import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // 동시 게이트 과다 구독 방지 — 기본값(코어 수 − 1, 이 PC 9 fork)을 2로 낮춘다(4 → 2, 2026-10-02:
    // 여러 세션이 동시에 돌려 16GB PC 가 스왑에 빠졌다). VITEST_MAX_WORKERS 로 바꿀 수 있다(docs/dflow-team/perf-audit-report.md P7).
    // 테스트 총수는 변하지 않는다.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
