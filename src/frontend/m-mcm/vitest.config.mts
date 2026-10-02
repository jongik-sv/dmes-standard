import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * m-mcm 단위 시험 — 화면 폴더의 순수 함수와 api 변환만 시험한다(렌더 시험 없음, 브라우저 확인은 별도).
 * `@/` 별칭은 tsconfig paths 와 같게 패키지 루트로 푼다. 정규식이라 `@dk-oasis/*` 는 건드리지 않는다.
 * include 를 좁혀 scripts/*.test.mjs(node:test)를 잡지 않는다. lib/ 의 순수 모듈 시험(*.test.ts)은 잡는다.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts", "page-components/**/*.test.ts", "widget-types/**/*.test.ts"],
  },
});
