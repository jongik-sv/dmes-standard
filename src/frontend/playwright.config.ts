import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // 일회성 검증·스냅샷 스펙 보관소는 실행·컴파일 대상에서 뺀다(e2e/archive/README.md)
  testIgnore: ["**/archive/**"],
  fullyParallel: true,
  // 병렬 스펙이 동시에 admin 로그인하면 mcm SQLite 가 SQLITE_BUSY 로 500 을 낸다. 지금도 CLI --workers=1 로 돌리므로
  // 기본값으로 둔다(인자를 빠뜨려도 안전). CLI --workers 는 이 값을 덮어쓴다.
  workers: 1,
  timeout: 30_000,
  // 스펙의 단언은 10_000 을 따로 적지 않고 이 기본값을 쓴다. 더 긴 대기는 e2e/support/common.ts 의 T 상수를 쓴다.
  // actionTimeout·navigationTimeout 은 일부러 두지 않는다(무제한) — 두면 시간을 적지 않은 동작의 대기가 바뀐다.
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
    headless: true,
  },
});
