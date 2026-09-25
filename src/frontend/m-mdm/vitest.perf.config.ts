import { configDefaults, defineConfig } from "vitest/config";
import base, { PERF_TEST_FILES } from "./vitest.config";

// 부하 민감 성능 스위트 — vitest.config.ts 의 PERF_TEST_FILES 만 한 fork 에서 파일 순서대로 돌린다.
// 환경·setup·alias 는 기본 설정을 그대로 쓰고 include·exclude·실행 방식만 바꾼다(mergeConfig 는 배열을 이어 붙여 exclude 를 못 덮는다).
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: PERF_TEST_FILES,
    exclude: configDefaults.exclude,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
