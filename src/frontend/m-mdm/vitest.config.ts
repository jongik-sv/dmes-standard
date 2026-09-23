import path from "node:path";
import { defineConfig } from "vitest/config";

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
    setupFiles: ["tests/setup.ts"],
  },
});
