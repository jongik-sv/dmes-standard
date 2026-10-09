import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * m-analog 단위 시험 — 화면 폴더의 순수 함수만 시험한다(렌더 시험 없음, 브라우저 확인은 별도).
 * `@/` 별칭은 tsconfig paths 와 같게 src 로 푼다. 시험 파일은 tests/ 아래에 두며 패키지 빌드(tsup)에는 들어가지 않는다.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
