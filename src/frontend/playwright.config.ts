import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // 병렬 스펙이 동시에 admin 로그인하면 mcm SQLite 가 SQLITE_BUSY 로 500 을 낸다. 지금도 CLI --workers=1 로 돌리므로
  // 기본값으로 둔다(인자를 빠뜨려도 안전). CLI --workers 는 이 값을 덮어쓴다.
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
    headless: true,
  },
});
